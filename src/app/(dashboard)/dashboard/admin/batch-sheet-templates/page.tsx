export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { TemplateListClient } from "./TemplateListClient";

export default async function BatchSheetTemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const templates = await prisma.batchSheetTemplate.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      ingredients: true,
      packaging: true,
      createdAt: true,
    },
  });

  const rows = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    isActive: t.isActive,
    ingredientCount: Array.isArray(t.ingredients) ? (t.ingredients as unknown[]).length : 0,
    packagingCount: Array.isArray(t.packaging) ? (t.packaging as unknown[]).length : 0,
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Batch Sheet Templates</h1>
          <p className="page-subtitle">Manage production templates for batch sheet forms</p>
        </div>
        <Link href="/dashboard/admin/batch-sheet-templates/new" className="btn-primary gap-2 text-sm px-5 py-2.5">
          <span className="text-lg leading-none">+</span> New Template
        </Link>
      </div>
      <TemplateListClient templates={rows} />
    </div>
  );
}
