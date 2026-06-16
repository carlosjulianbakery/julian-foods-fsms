export const dynamic = "force-dynamic";
import { unstable_noStore as noStore } from "next/cache";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TemplateForm } from "../../TemplateForm";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  // Explicitly opt out of ALL Next.js caching so every visit fetches the latest DB data.
  noStore();
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const t = await prisma.batchSheetTemplate.findUnique({ where: { id: params.id } });
  if (!t) notFound();

  const initialData = {
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    productCode: t.productCode ?? null,
    isActive: t.isActive,
    ingredients: t.ingredients as { id: string; name: string; quantity_per_bowl: number; unit: string }[],
    // presentations carries per-presentation unit config (primary_unit_name etc.) in the JSONB
    presentations: t.packaging as {
      presentation_id: string;
      presentation_name: string;
      materials: { id: string; name: string; qty_per_bowl: number; food_contact: boolean }[];
      primary_unit_name?: string;
      has_internal_units?: boolean;
      internal_unit_name?: string;
      internal_units_per_primary?: number | null;
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
    // Section G — Allergen Declaration
    declaredAllergens: (t.declaredAllergens ?? []) as string[],
    hasExpirationDate: t.hasExpirationDate,
    // Linked product (Section A)
    productId: t.productId ?? null,
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
