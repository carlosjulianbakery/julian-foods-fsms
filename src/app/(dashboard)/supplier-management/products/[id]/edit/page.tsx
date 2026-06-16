"use client";

import { useEffect, useState } from "react";
import { ProductForm, type ProductInitial } from "../../ProductForm";

export default function EditProductPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<ProductInitial | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/products/${params.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        // Transform presentations from API snake_case → form camelCase
        const presentations = Array.isArray(d.presentations)
          ? d.presentations.map((p: {
              id: string;
              name: string;
              upc: string;
              primary_unit_name?: string | null;
              has_internal_units?: boolean;
              internal_unit_name?: string | null;
              internal_units_per_primary?: number | null;
              packaging_materials?: Array<{
                id: string;
                material_id: string;
                material_name: string;
                food_contact: boolean;
              }>;
            }) => ({
              id: p.id,
              name: p.name,
              upc: p.upc ?? "",
              primaryUnitName: p.primary_unit_name ?? "",
              hasInternalUnits: p.has_internal_units ?? false,
              internalUnitName: p.internal_unit_name ?? "",
              internalUnitsPerPrimary: p.internal_units_per_primary ?? null,
              packagingMaterials: Array.isArray(p.packaging_materials)
                ? p.packaging_materials.map((m) => ({
                    id: m.id,
                    materialId: m.material_id,
                    materialName: m.material_name,
                    foodContact: m.food_contact,
                  }))
                : [],
            }))
          : [];
        setData({
          id: d.id,
          name: d.name,
          category: d.category,
          productCode: d.productCode,
          description: d.description,
          isActive: d.isActive,
          shelfLifeMonths: d.shelfLifeMonths ?? null,
          isWipMaterial: d.isWipMaterial ?? false,
          recipe: Array.isArray(d.recipe)
            ? [...d.recipe].sort((a: { order?: number }, b: { order?: number }) =>
                (a.order ?? 0) - (b.order ?? 0)
              )
            : [],
          presentations,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [params.id]);

  if (error) return <div className="card p-6 text-sm text-red-600">{error}</div>;
  if (!data) {
    return (
      <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  return <ProductForm mode="edit" initial={data} />;
}
