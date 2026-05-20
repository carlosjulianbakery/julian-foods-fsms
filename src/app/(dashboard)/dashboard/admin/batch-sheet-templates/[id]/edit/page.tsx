export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TemplateForm } from "../../TemplateForm";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const t = await prisma.batchSheetTemplate.findUnique({ where: { id: params.id } });
  if (!t) notFound();

  const initialData = {
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    isActive: t.isActive,
    ingredients: t.ingredients as { id: string; name: string; quantity_per_bowl: number; unit: string }[],
    packaging: t.packaging as { id: string; name: string; units_per_n_flatbreads: number }[],
    ovensAvailable: t.ovensAvailable as string[],
    calibrationWeights: t.calibrationWeights as { label: string }[],
    ccpSettings: t.ccpSettings as { min_temp_f: number; min_weight_oz: number; max_weight_oz: number },
    releaseChecklistItems: t.releaseChecklistItems as string[],
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">Edit Template</h1>
        <p className="page-subtitle">{t.name}</p>
      </div>
      <TemplateForm mode="edit" initialData={initialData} />
    </div>
  );
}
