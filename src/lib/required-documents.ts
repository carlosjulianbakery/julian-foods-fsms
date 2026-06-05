import { prisma } from "@/lib/prisma";
import { filterApplicableRequirements, getTriggerLabel, type MaterialAttrs } from "./document-trigger";

export type RequiredDoc = {
  id: string;
  name: string;
  requirementType: string;
  isRequired: boolean;
  isSystemLocked: boolean;
  triggerType: string | null;
  triggerCondition: string | null;
  triggerLabel: string;
  sortOrder: number;
};

/** Returns applicable requirements for a supplier, based on their materials. */
export async function getRequiredDocuments(supplierId: string): Promise<RequiredDoc[]> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      materials: {
        include: {
          material: {
            select: {
              isOrganic: true,
              isAllergen: true,
              isGlutenFree: true,
              hasSpecialRisk: true,
              specialRiskTypes: true,
            },
          },
        },
      },
    },
  });

  const allRequirements = await prisma.documentRequirement.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const matAttrs: MaterialAttrs[] = supplier
    ? supplier.materials.map((link) => link.material as MaterialAttrs)
    : [];

  const applicable = filterApplicableRequirements(
    allRequirements.map((r) => ({
      ...r,
      isSystemLocked: r.isSystemLocked,
      triggerType: r.triggerType,
      triggerCondition: r.triggerCondition,
    })),
    matAttrs
  );

  return applicable
    .map((r) => ({
      id: r.id,
      name: r.name,
      requirementType: r.requirementType,
      isRequired: r.isRequired,
      isSystemLocked: r.isSystemLocked,
      triggerType: r.triggerType,
      triggerCondition: r.triggerCondition,
      triggerLabel: getTriggerLabel(r.triggerType, r.triggerCondition),
      sortOrder: r.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Sync version for use when you already have the data. */
export function computeRequiredDocsFromData(
  materials: MaterialAttrs[],
  allRequirements: RequiredDoc[]
): RequiredDoc[] {
  return filterApplicableRequirements(allRequirements, materials).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}
