import { prisma } from "@/lib/prisma";

export type RecipeItem = {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
};

export type PresentationItem = {
  id: string;
  name: string;
  upc?: string;
  packaging_materials: Array<{
    id: string;
    material_id: string;
    material_name: string;
    food_contact: boolean;
  }>;
};

export type SupplierExposureItem = {
  supplierId: string;
  supplierName: string;
  materialName: string;
  supplierStatus: string;
  materialType: "ingredient" | "packaging";
  presentationName: string | null;
  foodContact: boolean | null;
};

export type ComputedProductFields = {
  allergenProfile: string[];
  isOrganic: boolean;
  isGlutenFree: boolean;
  supplierExposure: SupplierExposureItem[];
};

/**
 * Compute derived fields from a recipe and optional presentations — runs server-side on every save.
 */
export async function computeProductFields(
  recipe: RecipeItem[],
  presentations: PresentationItem[] = [],
): Promise<ComputedProductFields> {
  const ingredientMaterialIds = recipe.map((r) => r.materialId).filter(Boolean);
  const pkgMaterialIds = Array.from(
    new Set(
      presentations.flatMap((p) => p.packaging_materials.map((m) => m.material_id)).filter(Boolean),
    ),
  );
  const allMaterialIds = Array.from(new Set([...ingredientMaterialIds, ...pkgMaterialIds]));

  if (allMaterialIds.length === 0) {
    return { allergenProfile: [], isOrganic: false, isGlutenFree: false, supplierExposure: [] };
  }

  const materials = await prisma.material.findMany({
    where: { id: { in: allMaterialIds } },
    include: {
      suppliers: {
        include: { supplier: { select: { id: true, name: true, status: true } } },
      },
    },
  });

  // allergenProfile, isOrganic, isGlutenFree — based on ingredient materials only
  const ingredientMaterials = materials.filter((m) => ingredientMaterialIds.includes(m.id));
  const allergenSet = new Set<string>();
  for (const m of ingredientMaterials) {
    if (m.isAllergen && Array.isArray(m.allergens)) {
      (m.allergens as string[]).forEach((a) => allergenSet.add(a));
    }
  }
  const allergenProfile = Array.from(allergenSet);
  const isOrganic = recipe.length > 0 && ingredientMaterials.length > 0 && ingredientMaterials.every((m) => m.isOrganic);
  const isGlutenFree = recipe.length > 0 && ingredientMaterials.length > 0 && ingredientMaterials.every((m) => m.isGlutenFree);

  // supplierExposure: ingredient suppliers first, then packaging suppliers
  const supplierMap = new Map<string, SupplierExposureItem>();

  // Ingredient suppliers
  for (const m of ingredientMaterials) {
    const recipeItem = recipe.find((r) => r.materialId === m.id);
    for (const link of m.suppliers) {
      const key = `ing-${link.supplier.id}-${m.id}`;
      supplierMap.set(key, {
        supplierId: link.supplier.id,
        supplierName: link.supplier.name,
        materialName: m.name,
        supplierStatus: link.supplier.status,
        materialType: "ingredient",
        presentationName: null,
        foodContact: null,
      });
    }
  }

  // Packaging suppliers
  const matById = new Map(materials.map((m) => [m.id, m]));
  for (const pres of presentations) {
    for (const pkgMat of pres.packaging_materials) {
      const m = matById.get(pkgMat.material_id);
      if (!m) continue;
      for (const link of m.suppliers) {
        const key = `pkg-${link.supplier.id}-${m.id}-${pres.id}`;
        supplierMap.set(key, {
          supplierId: link.supplier.id,
          supplierName: link.supplier.name,
          materialName: m.name,
          supplierStatus: link.supplier.status,
          materialType: "packaging",
          presentationName: pres.name,
          foodContact: pkgMat.food_contact,
        });
      }
    }
  }

  return {
    allergenProfile,
    isOrganic,
    isGlutenFree,
    supplierExposure: Array.from(supplierMap.values()),
  };
}
