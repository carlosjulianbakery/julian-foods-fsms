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
    presentations: t.packaging as {
      presentation_id: string;
      presentation_name: string;
      materials: { id: string; name: string; qty_per_bowl: number; food_contact: boolean }[];
    }[],
    ccpChecks: t.ccpSettings as {
      id: string; type: string; custom_name?: string; num_readings: number; num_sessions: number;
      min_value: number | null; max_value: number | null; unit: string | null;
    }[],
    ccpNumSessions: t.ccpNumSessions,
    ccpRequireTimestamp: t.ccpRequireTimestamp,
    endOfProductionFields: t.endOfProductionFields as {
      id: string; label: string; field_type: string; required: boolean; order: number;
    }[],
    ovensAvailable: t.ovensAvailable as string[],
    calibrationWeights: t.calibrationWeights as { label: string }[],
    releaseChecklistItems: t.releaseChecklistItems as string[],
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">Edit Template</h1>
        <p className="page-subtitle">{t.name}</p>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TemplateForm mode="edit" initialData={initialData as any} />
    </div>
  );
}
