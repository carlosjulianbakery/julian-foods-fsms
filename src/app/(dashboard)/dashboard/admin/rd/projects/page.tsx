export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProjectsClient } from "./ProjectsClient";

export default async function RdProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") redirect("/dashboard");

  const projects = await prisma.rdProject.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      productType: true,
      status: true,
      startedDate: true,
      targetLaunchDate: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { iterations: true } },
      createdBy: { select: { name: true } },
    },
  });

  const serialized = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    productType: p.productType,
    status: p.status,
    startedDate: p.startedDate.toISOString(),
    targetLaunchDate: p.targetLaunchDate ? p.targetLaunchDate.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    iterationCount: p._count.iterations,
    createdByName: p.createdBy.name ?? null,
  }));

  const counts = {
    active: serialized.filter((p) => !["closed_launched", "closed_discontinued"].includes(p.status)).length,
    inDevelopment: serialized.filter((p) => p.status === "in_development").length,
    testing: serialized.filter((p) => p.status === "testing").length,
    pendingApproval: serialized.filter((p) => p.status === "pending_approval").length,
    launched: serialized.filter((p) => p.status === "closed_launched").length,
    discontinued: serialized.filter((p) => p.status === "closed_discontinued").length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#F5F0E8" }}>
            R&amp;D Projects
          </h1>
          <p className="text-sm mt-1" style={{ color: "#A89880" }}>
            Track product development from concept to launch
          </p>
        </div>
        <Link
          href="/dashboard/admin/rd/ingredients"
          className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 rd-nav-btn"
          style={{
            border: "1px solid #3D3427",
            color: "#A89880",
            backgroundColor: "transparent",
          }}
        >
          R&amp;D Ingredients
        </Link>
      </div>
      <ProjectsClient projects={serialized} counts={counts} />
    </div>
  );
}
