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
      collaborators: true,
      status: true,
      startedDate: true,
      targetLaunchDate: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { iterations: true } },
      createdBy: { select: { name: true } },
      iterations: {
        orderBy: { iterationNumber: "desc" },
        select: {
          evaluations: { select: { ratingOverall: true } },
        },
      },
    },
  });

  const serialized = projects.map((p) => {
    const latestSensoryAvg = (() => {
      for (const iter of p.iterations) {
        const scores = iter.evaluations
          .map((e) => e.ratingOverall)
          .filter((s): s is number => s !== null);
        if (scores.length) return scores.reduce((a, b) => a + b, 0) / scores.length;
      }
      return null;
    })();
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      productType: p.productType,
      collaborators: p.collaborators as { name: string; email: string | null }[] | null ?? null,
      status: p.status,
      startedDate: p.startedDate.toISOString(),
      targetLaunchDate: p.targetLaunchDate ? p.targetLaunchDate.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      iterationCount: p._count.iterations,
      createdByName: p.createdBy.name ?? null,
      latestSensoryAvg,
    };
  });

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
          <h1 style={{ fontSize: "3.5rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.2, paddingBottom: 8, overflow: "visible", background: "linear-gradient(135deg, #D97706 0%, #F59E0B 40%, #F97316 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            R&amp;D Projects
          </h1>
          <p className="text-sm mt-1" style={{ color: "#A89880" }}>
            Track product development from concept to launch
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/dashboard/admin/rd/nutrition-library"
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 rd-nav-btn"
            style={{
              border: "1px solid #E8DDD0",
              color: "#6B5F50",
              backgroundColor: "transparent",
            }}
          >
            Nutrition Library
          </Link>
          <Link
            href="/dashboard/admin/rd/ingredients"
            className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 rd-nav-btn"
            style={{
              border: "1px solid #E8DDD0",
              color: "#6B5F50",
              backgroundColor: "transparent",
            }}
          >
            R&amp;D Ingredients
          </Link>
        </div>
      </div>
      <ProjectsClient projects={serialized} counts={counts} />
    </div>
  );
}
