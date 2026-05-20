"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

const UNITS = ["g", "kg", "oz", "lbs", "ml", "L", "tsp", "tbsp", "cup"] as const;

type Ingredient   = { id: string; name: string; quantity_per_bowl: number; unit: string };
type Packaging    = { id: string; name: string; units_per_n_flatbreads: number };
type CcpSettings  = { min_temp_f: number; min_weight_oz: number; max_weight_oz: number };

export type TemplateData = {
  name: string;
  description: string;
  isActive: boolean;
  ovensAvailable: string[];
  calibrationWeights: string[];
  ccpSettings: CcpSettings;
  ingredients: Ingredient[];
  packaging: Packaging[];
  releaseChecklistItems: string[];
};

interface Props {
  initialData?: TemplateData & { id: string };
  mode: "new" | "edit";
}

function uid() { return Math.random().toString(36).slice(2, 10); }

const DEFAULT: TemplateData = {
  name: "",
  description: "",
  isActive: true,
  ovensAvailable: [],
  calibrationWeights: [],
  ccpSettings: { min_temp_f: 190, min_weight_oz: 3.5, max_weight_oz: 4.2 },
  ingredients: [],
  packaging: [],
  releaseChecklistItems: [],
};

export function TemplateForm({ initialData, mode }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<TemplateData>(() =>
    initialData
      ? {
          name: initialData.name,
          description: initialData.description ?? "",
          isActive: initialData.isActive,
          ovensAvailable: [...(initialData.ovensAvailable ?? [])],
          calibrationWeights: (initialData.calibrationWeights as { label: string }[]).map((w) => w.label),
          ccpSettings: { ...(initialData.ccpSettings as CcpSettings) },
          ingredients: initialData.ingredients.map((i) => ({ ...i })),
          packaging: initialData.packaging.map((p) => ({ ...p })),
          releaseChecklistItems: [...(initialData.releaseChecklistItems ?? [])],
        }
      : { ...DEFAULT }
  );

  // ─── setters ───────────────────────────────────────────────────────────────

  const set = <K extends keyof TemplateData>(k: K, v: TemplateData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function addOven()      { set("ovensAvailable",        [...form.ovensAvailable, ""]);        }
  function removeOven(i: number) { set("ovensAvailable", form.ovensAvailable.filter((_, j) => j !== i)); }
  function updateOven(i: number, v: string) {
    const a = [...form.ovensAvailable]; a[i] = v; set("ovensAvailable", a);
  }

  function addWeight()    { set("calibrationWeights",    [...form.calibrationWeights, ""]);    }
  function removeWeight(i: number) { set("calibrationWeights", form.calibrationWeights.filter((_, j) => j !== i)); }
  function updateWeight(i: number, v: string) {
    const a = [...form.calibrationWeights]; a[i] = v; set("calibrationWeights", a);
  }

  function addIngredient() {
    set("ingredients", [...form.ingredients, { id: uid(), name: "", quantity_per_bowl: 0, unit: "kg" }]);
  }
  function removeIngredient(id: string) { set("ingredients", form.ingredients.filter((i) => i.id !== id)); }
  function updateIngredient(id: string, field: keyof Ingredient, val: string | number) {
    set("ingredients", form.ingredients.map((i) => i.id === id ? { ...i, [field]: val } : i));
  }

  function addPackaging() {
    set("packaging", [...form.packaging, { id: uid(), name: "", units_per_n_flatbreads: 1 }]);
  }
  function removePackaging(id: string) { set("packaging", form.packaging.filter((p) => p.id !== id)); }
  function updatePackaging(id: string, field: keyof Packaging, val: string | number) {
    set("packaging", form.packaging.map((p) => p.id === id ? { ...p, [field]: val } : p));
  }

  function addChecklist()   { set("releaseChecklistItems", [...form.releaseChecklistItems, ""]); }
  function removeChecklist(i: number) { set("releaseChecklistItems", form.releaseChecklistItems.filter((_, j) => j !== i)); }
  function updateChecklist(i: number, v: string) {
    const a = [...form.releaseChecklistItems]; a[i] = v; set("releaseChecklistItems", a);
  }

  // ─── submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) { setError("Template name is required."); return; }
    setSaving(true);

    const payload = {
      ...form,
      calibrationWeights: form.calibrationWeights.map((label) => ({ label })),
    };

    try {
      const url  = mode === "new" ? "/api/batch-sheet-templates" : `/api/batch-sheet-templates/${initialData!.id}`;
      const method = mode === "new" ? "POST" : "PATCH";
      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      router.push("/dashboard/admin/batch-sheet-templates");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">

      {/* Template Info */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wider font-mono">Template Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Template Name</label>
            <input className="input" required value={form.name}
              onChange={(e) => set("name", e.target.value)} placeholder='e.g. Flatbread 18"' />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description (optional)</label>
            <input className="input" value={form.description}
              onChange={(e) => set("description", e.target.value)} placeholder="Short description of this product" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="isActive" checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              className="w-4 h-4 accent-brand-600" />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active (appears in batch sheet form)</label>
          </div>
        </div>
      </div>

      {/* Ovens */}
      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wider font-mono">Ovens Available</h2>
          <button type="button" onClick={addOven} className="btn-secondary text-xs px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Oven
          </button>
        </div>
        {form.ovensAvailable.length === 0 && (
          <p className="text-xs text-gray-400 font-mono">No ovens added yet.</p>
        )}
        <div className="space-y-2">
          {form.ovensAvailable.map((oven, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input flex-1" value={oven} placeholder="e.g. Oven 06"
                onChange={(e) => updateOven(i, e.target.value)} />
              <button type="button" onClick={() => removeOven(i)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Calibration Weights */}
      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wider font-mono">Scale Calibration Weights</h2>
          <button type="button" onClick={addWeight} className="btn-secondary text-xs px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Weight
          </button>
        </div>
        {form.calibrationWeights.length === 0 && (
          <p className="text-xs text-gray-400 font-mono">No weights added yet.</p>
        )}
        <div className="space-y-2">
          {form.calibrationWeights.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input flex-1" value={w} placeholder="e.g. 100g"
                onChange={(e) => updateWeight(i, e.target.value)} />
              <button type="button" onClick={() => removeWeight(i)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* CCP Settings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wider font-mono">CCP Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Min Internal Temp (°F)</label>
            <input type="number" className="input" step="0.1"
              value={form.ccpSettings.min_temp_f}
              onChange={(e) => set("ccpSettings", { ...form.ccpSettings, min_temp_f: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label">Min Weight (oz)</label>
            <input type="number" className="input" step="0.01"
              value={form.ccpSettings.min_weight_oz}
              onChange={(e) => set("ccpSettings", { ...form.ccpSettings, min_weight_oz: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label">Max Weight (oz)</label>
            <input type="number" className="input" step="0.01"
              value={form.ccpSettings.max_weight_oz}
              onChange={(e) => set("ccpSettings", { ...form.ccpSettings, max_weight_oz: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wider font-mono">Ingredients</h2>
          <button type="button" onClick={addIngredient} className="btn-secondary text-xs px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Ingredient
          </button>
        </div>
        {form.ingredients.length === 0 && (
          <p className="text-xs text-gray-400 font-mono">No ingredients added yet.</p>
        )}
        {form.ingredients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Ingredient Name</th>
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-28">Qty / Bowl</th>
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-24">Unit</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {form.ingredients.map((ing) => (
                  <tr key={ing.id}>
                    <td className="py-1.5 pr-3">
                      <input className="input" value={ing.name} placeholder="Ingredient name"
                        onChange={(e) => updateIngredient(ing.id, "name", e.target.value)} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" className="input" step="0.001" min="0" value={ing.quantity_per_bowl}
                        onChange={(e) => updateIngredient(ing.id, "quantity_per_bowl", parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <select className="input" value={ing.unit}
                        onChange={(e) => updateIngredient(ing.id, "unit", e.target.value)}>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5">
                      <button type="button" onClick={() => removeIngredient(ing.id)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Packaging */}
      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wider font-mono">Packaging Materials</h2>
          <button type="button" onClick={addPackaging} className="btn-secondary text-xs px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Material
          </button>
        </div>
        {form.packaging.length === 0 && (
          <p className="text-xs text-gray-400 font-mono">No packaging materials added yet.</p>
        )}
        {form.packaging.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Material Name</th>
                  <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-40">Used every N flatbreads</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {form.packaging.map((pkg) => (
                  <tr key={pkg.id}>
                    <td className="py-1.5 pr-3">
                      <input className="input" value={pkg.name} placeholder="e.g. Parchment Paper"
                        onChange={(e) => updatePackaging(pkg.id, "name", e.target.value)} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" className="input" min="1" step="1" value={pkg.units_per_n_flatbreads}
                        onChange={(e) => updatePackaging(pkg.id, "units_per_n_flatbreads", parseInt(e.target.value) || 1)} />
                    </td>
                    <td className="py-1.5">
                      <button type="button" onClick={() => removePackaging(pkg.id)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Release Checklist */}
      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wider font-mono">Release Checklist Items</h2>
          <button type="button" onClick={addChecklist} className="btn-secondary text-xs px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Item
          </button>
        </div>
        {form.releaseChecklistItems.length === 0 && (
          <p className="text-xs text-gray-400 font-mono">No checklist items added yet.</p>
        )}
        <div className="space-y-2">
          {form.releaseChecklistItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input flex-1" value={item} placeholder="Checklist item label"
                onChange={(e) => updateChecklist(i, e.target.value)} />
              <button type="button" onClick={() => removeChecklist(i)}
                className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving…" : mode === "new" ? "Create Template" : "Save Changes"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
