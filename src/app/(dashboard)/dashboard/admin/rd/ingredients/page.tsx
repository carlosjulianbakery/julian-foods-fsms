export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IngredientsClient } from "./IngredientsClient";

export default async function RdIngredientsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") redirect("/dashboard");

  const ingredients = await prisma.rdIngredient.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      unit: true,
      supplierSource: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const serialized = ingredients.map((i) => ({
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest"
          style={{ background: "#F59E0B15", border: "1px solid #F59E0B40", color: "#F59E0B" }}
        >
          🧪 R&D Lab
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#F5F0E8" }}>
            R&D Ingredients
          </h1>
          <p className="text-sm mt-1" style={{ color: "#A89880" }}>
            Manage ingredients and packaging materials used in R&D formulations
          </p>
        </div>
        <Link
          href="/dashboard/admin/rd/projects"
          className="text-sm transition-colors rd-back-link"
          style={{ color: "#6B5F50" }}
        >
          ← Back to Projects
        </Link>
      </div>
      <IngredientsClient ingredients={serialized} userId={userId} />
    </div>
  );
}
