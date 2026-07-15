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
          className="inline-flex items-center rounded-full font-bold uppercase tracking-widest"
          style={{ padding: "8px 20px", fontSize: "0.85rem", background: "#FEF3C7", border: "1.5px solid #F59E0B", color: "#D97706", animation: "labPulse 3s ease-in-out infinite" }}
        >
          🧪 R&D Lab
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 style={{ fontSize: "3.5rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.2, paddingBottom: 8, overflow: "visible", background: "linear-gradient(135deg, #D97706 0%, #F59E0B 40%, #F97316 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            R&D Ingredients
          </h1>
          <p className="text-sm mt-1" style={{ color: "#A89880" }}>
            Manage ingredients and packaging materials used in R&D formulations
          </p>
        </div>
        <Link
          href="/dashboard/admin/rd/projects"
          className="rd-back-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "1.5px solid #E8DDD0", backgroundColor: "#FFFFFF", color: "#6B5F50", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none", boxShadow: "0 2px 8px rgba(107,95,80,0.1)", transition: "all 0.2s ease" }}
        >
          ← R&D Projects
        </Link>
      </div>
      <IngredientsClient ingredients={serialized} userId={userId} />
    </div>
  );
}
