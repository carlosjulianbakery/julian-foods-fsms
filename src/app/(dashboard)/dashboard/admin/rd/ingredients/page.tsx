export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
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
      costPerUnit: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const serialized = ingredients.map((i) => ({
    ...i,
    costPerUnit: i.costPerUnit ? Number(i.costPerUnit) : null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">R&D Ingredients Registry</h1>
          <p className="page-subtitle">Manage ingredients and packaging materials used in R&D formulations</p>
        </div>
      </div>
      <IngredientsClient ingredients={serialized} userId={userId} />
    </div>
  );
}
