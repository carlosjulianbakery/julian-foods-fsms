"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";


const CATEGORIES = [
  "PreMix Powder",
  "Bread",
  "ProGranola",
  "Protein Bar",
  "Crackers",
  "Protein Powder",
  "Sweetener",
] as const;

const UNITS = ["g", "kg", "oz", "lbs", "ml", "L", "tsp", "tbsp", "cup"] as const;

export type RecipeItem = {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
};

type Supplier = { id: string; name: string; status: string };
type Material = {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  isOrganic: boolean;
  isAllergen: boolean;
  allergens: string[] | null;
  isGlutenFree: boolean;
  suppliers: { supplier: Supplier }[];
};

export type ProductInitial = {
  id?: string;
  name?: string;
  category?: string | null;
  productCode?: string | null;
  description?: string | null;
  isActive?: boolean;
  recipe?: RecipeItem[];
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function statusBadgeClass(s: string) {
  if (s === "APPROVED") return "bg-green-50 text-green-700";
  if (s === "EXPIRED") return "bg-red-50 text-red-700";
  if (s === "EXPIRING_SOON") return "bg-amber-50 text-amber-700";
  if (s === "PENDING") return "bg-yellow-50 text-yellow-700";
  return "bg-gray-100 text-gray-500";
}

export function ProductForm({ mode, initial }: { mode: "new" | "edit"; initial?: ProductInitial }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    category: initial?.category ?? "",
    productCode: initial?.productCode ?? "",
    description: initial?.description ?? "",
    isActive: initial?.isActive ?? true,
  });

  const [recipe, setRecipe] = useState<RecipeItem[]>(initial?.recipe ?? []);

  useEffect(() => {
    fetch("/api/supplier-management/materials")
      .then((r) => r.json())
      .then((data) => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const materialById = useMemo(() => {
    const map = new Map<string, Material>();
    materials.forEach((m) => map.set(m.id, m));
    return map;
  }, [materials]);

  // ── Live preview ────────────────────────────────────────────────────────────
  const selectedMaterials = recipe
    .map((r) => materialById.get(r.materialId))
    .filter((m): m is Material => !!m);

  const previewAllergens = useMemo(() => {
    const set = new Set<string>();
    selectedMaterials.forEach((m) => {
      if (m.isAllergen && Array.isArray(m.allergens)) {
        m.allergens.forEach((a) => set.add(a));
      }
    });
    return Array.from(set);
  }, [selectedMaterials]);

  const previewIsOrganic =
    selectedMaterials.length > 0 && selectedMaterials.every((m) => m.isOrganic);
  const previewIsGF =
    selectedMaterials.length > 0 && selectedMaterials.every((m) => m.isGlutenFree);

  // ── Recipe handlers ─────────────────────────────────────────────────────────
  function addIngredient() {
    setRecipe((r) => [...r, { id: uid(), materialId: "", materialName: "", quantity: 0, unit: "g" }]);
  }
  function removeIngredient(id: string) {
    setRecipe((r) => r.filter((i) => i.id !== id));
  }
  function updateIngredient(id: string, patch: Partial<RecipeItem>) {
    setRecipe((r) => r.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function onMaterialPick(id: string, materialId: string) {
    const m = materialById.get(materialId);
    if (!m) {
      updateIngredient(id, { materialId: "", materialName: "" });
      return;
    }
    updateIngredient(id, {
      materialId: m.id,
      materialName: m.name,
      unit: m.unit ?? "g",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const url = mode === "new" ? "/api/products" : `/api/products/${initial?.id}`;
      const method = mode === "new" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          name: form.name,
          category: form.category || null,
          productCode: form.productCode || null,
          description: form.description || null,
          isActive: form.isActive,
          recipe,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
      }
      if (mode === "edit") {
        setToast("Product saved. Allergen profile updated.");
        setTimeout(() => router.push("/supplier-management/products"), 1100);
      } else {
        router.push("/supplier-management/products");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // ── Supplier exposure preview ───────────────────────────────────────────────
  const supplierExposureRows = useMemo(() => {
    const rows: Array<{ materialName: string; supplier: Supplier }> = [];
    selectedMaterials.forEach((m) => {
      m.suppliers.forEach((s) => rows.push({ materialName: m.name, supplier: s.supplier }));
    });
    return rows;
  }, [selectedMaterials]);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <Link
          href="/supplier-management/products"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-mono"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Products
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Section A — Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-mono font-semibold text-gray-500 uppercase tracking-wider">Product Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Name <span className="text-red-500">*</span></label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder='e.g. PROGRANOLA — CINNAMON'
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">— Select —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Product Code</label>
              <input
                className="input"
                value={form.productCode}
                onChange={(e) => setForm({ ...form, productCode: e.target.value })}
                placeholder="OPTIONAL"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea
                className="input"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Section B — Recipe */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono font-semibold text-gray-500 uppercase tracking-wider">Recipe</h2>
            <button type="button" onClick={addIngredient} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Ingredient
            </button>
          </div>

          {recipe.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">No ingredients added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Material</th>
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-24">Tags</th>
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-28">Quantity</th>
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-24">Unit</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recipe.map((ing) => {
                    const m = materialById.get(ing.materialId);
                    return (
                      <tr key={ing.id}>
                        <td className="py-1.5 pr-3">
                          <select
                            className="input"
                            value={ing.materialId}
                            onChange={(e) => onMaterialPick(ing.id, e.target.value)}
                          >
                            <option value="">— Select material —</option>
                            {materials.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {m?.isAllergen && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] px-1 py-0.5 rounded">Allergen</span>
                            )}
                            {m?.isOrganic && (
                              <span className="bg-green-100 text-green-800 text-[10px] px-1 py-0.5 rounded">Organic</span>
                            )}
                            {m?.isGlutenFree && (
                              <span className="bg-blue-100 text-blue-800 text-[10px] px-1 py-0.5 rounded">GF</span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            className="input"
                            value={ing.quantity}
                            onChange={(e) => updateIngredient(ing.id, { quantity: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <select
                            className="input"
                            value={ing.unit}
                            onChange={(e) => updateIngredient(ing.id, { unit: e.target.value })}
                          >
                            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5">
                          <button
                            type="button"
                            onClick={() => removeIngredient(ing.id)}
                            className="p-1 text-gray-300 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Live preview */}
          <div className="mt-4 rounded-md bg-gray-50 border border-gray-200 p-3 text-xs text-gray-700 space-y-1">
            <p className="font-mono font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Computed Profile (preview)</p>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-mono text-gray-500">Allergens:</span>
              {previewAllergens.length === 0 ? (
                <span className="text-gray-400">None</span>
              ) : (
                previewAllergens.map((a) => (
                  <span key={a} className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full">{a}</span>
                ))
              )}
            </div>
            <div className="flex gap-3">
              <span>
                {previewIsOrganic ? (
                  <span className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded-full">ORGANIC</span>
                ) : (
                  <span className="text-gray-400">Not all organic</span>
                )}
              </span>
              <span>
                {previewIsGF ? (
                  <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full">GLUTEN FREE</span>
                ) : (
                  <span className="text-gray-400">Not all GF</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Section C — Supplier Exposure */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-mono font-semibold text-gray-500 uppercase tracking-wider">Supplier Exposure (preview)</h2>
          {supplierExposureRows.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">Select materials with linked suppliers to see exposure.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Material</th>
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Supplier</th>
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {supplierExposureRows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 text-gray-800">{r.materialName}</td>
                    <td className="py-1.5 pr-3 text-gray-700">{r.supplier.name}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadgeClass(r.supplier.status)}`}>
                        {r.supplier.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/supplier-management/products" className="btn-secondary">Cancel</Link>
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60 flex items-center gap-1.5">
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                {mode === "new" ? "Create Product" : "Save Changes"}
              </>
            )}
          </button>
        </div>
      </form>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
