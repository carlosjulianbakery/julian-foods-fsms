import { prisma } from "@/lib/prisma";

export type RecipeItem = {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
};

export type SupplierExposureItem = {
  supplierId: string;
  supplierName: string;
  materialName: string;
  supplierStatus: string;
};

export type ComputedProductFields = {
  allergenProfile: string[];
  isOrganic: boolean;
  isGlutenFree: boolean;
  supplierExposure: SupplierExposureItem[];
};

/**
 * Compute derived fields from a recipe — runs server-side on every save.
 */
export async function computeProductFields(recipe: RecipeItem[]): Promise<ComputedProductFields> {
  const materialIds = recipe.map((r) => r.materialId).filter(Boolean);

  if (materialIds.length === 0) {
    return { allergenProfile: [], isOrganic: false, isGlutenFree: false, supplierExposure: [] };
  }

  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    include: {
      suppliers: {
        include: { supplier: { select: { id: true, name: true, status: true } } },
      },
    },
  });

  // allergenProfile: union of all allergen arrays from allergen materials
  const allergenSet = new Set<string>();
  for (const m of materials) {
    if (m.isAllergen && Array.isArray(m.allergens)) {
      (m.allergens as string[]).forEach((a) => allergenSet.add(a));
    }
  }
  const allergenProfile = Array.from(allergenSet);

  // isOrganic: all materials organic AND recipe non-empty
  const isOrganic = recipe.length > 0 && materials.length > 0 && materials.every((m) => m.isOrganic);

  // isGlutenFree: all materials GF AND recipe non-empty
  const isGlutenFree = recipe.length > 0 && materials.length > 0 && materials.every((m) => m.isGlutenFree);

  // supplierExposure: unique (supplier, material) combinations
  const supplierMap = new Map<string, SupplierExposureItem>();
  for (const m of materials) {
    const recipeItem = recipe.find((r) => r.materialId === m.id);
    for (const link of m.suppliers) {
      const key = link.supplier.id + "-" + m.id;
      supplierMap.set(key, {
        supplierId: link.supplier.id,
        supplierName: link.supplier.name,
        materialName: recipeItem?.materialName || m.name,
        supplierStatus: link.supplier.status,
      });
    }
  }

  return {
    allergenProfile,
    isOrganic,
    isGlutenFree,
    supplierExposure: Array.from(supplierMap.values()),
  };
}
