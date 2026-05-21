"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const UNITS = ["g", "kg", "oz", "lbs", "ml", "L", "tsp", "tbsp", "cup"] as const;

const DEFAULT_CHECKLIST = [
  "Calibration Verification completed",
  "CCP Temperature Verification completed",
  "Net Weight Compliance completed",
  "Visual Inspection completed",
  "Batch Sheet completed",
  "Final Visual Inspection from Production Manager completed",
];

type Ingredient = { id: string; name: string; quantity_per_bowl: number; unit: string };
type Packaging = { id: string; name: string; units_per_n_flatbreads: number };
type CcpSettings = { min_temp_f: number; min_weight_oz: number; max_weight_oz: number };

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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  label,
  title,
  isOpen,
  isComplete,
  onToggle,
  children,
}: {
  label: string;
  title: string;
  isOpen: boolean;
  isComplete: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 bg-[#D64D4D] text-white rounded-full text-xs font-bold flex items-center justify-center shrink-0">
            {label}
          </span>
          <span className="font-semibold text-gray-900 text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-gray-200" />
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-gray-400 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>
      <div
        style={{
          maxHeight: isOpen ? "2000px" : "0",
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div className="border-t border-gray-100 p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gray-900 text-white rounded-lg shadow-xl px-5 py-3.5">
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      <span className="text-sm font-mono">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-1 text-gray-400 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TemplateForm({ initialData, mode }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({
    A: true,
    B: false,
    C: false,
    D: false,
    E: false,
    F: false,
    G: false,
  });

  const dragIdx = useRef<number | null>(null);

  const [form, setForm] = useState<TemplateData>(() => {
    if (initialData) {
      return {
        name: initialData.name,
        description: initialData.description ?? "",
        isActive: initialData.isActive,
        ovensAvailable: [...(initialData.ovensAvailable ?? [])],
        calibrationWeights: (
          initialData.calibrationWeights as unknown as { label: string }[]
        ).map((w) => w.label),
        ccpSettings: { ...(initialData.ccpSettings as CcpSettings) },
        ingredients: initialData.ingredients.map((i) => ({ ...i })),
        packaging: initialData.packaging.map((p) => ({ ...p })),
        releaseChecklistItems: [...(initialData.releaseChecklistItems ?? [])],
      };
    }
    return {
      name: "",
      description: "",
      isActive: true,
      ovensAvailable: [],
      calibrationWeights: [],
      ccpSettings: { min_temp_f: 190, min_weight_oz: 3.5, max_weight_oz: 4.2 },
      ingredients: [],
      packaging: [],
      releaseChecklistItems: [...DEFAULT_CHECKLIST],
    };
  });

  // Auto-dismiss toast after 3000ms
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function sf(patch: Partial<TemplateData>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function toggleSection(key: string) {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }

  function openSection(key: string) {
    setOpen((o) => ({ ...o, [key]: true }));
  }

  function clearError(key: string) {
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  // ─── Ovens ───────────────────────────────────────────────────────────────────

  function addOven() {
    sf({ ovensAvailable: [...form.ovensAvailable, ""] });
  }
  function removeOven(i: number) {
    sf({ ovensAvailable: form.ovensAvailable.filter((_, j) => j !== i) });
  }
  function updateOven(i: number, v: string) {
    const a = [...form.ovensAvailable];
    a[i] = v;
    sf({ ovensAvailable: a });
  }

  // ─── Calibration weights ──────────────────────────────────────────────────────

  function addWeight() {
    sf({ calibrationWeights: [...form.calibrationWeights, ""] });
  }
  function removeWeight(i: number) {
    sf({ calibrationWeights: form.calibrationWeights.filter((_, j) => j !== i) });
  }
  function updateWeight(i: number, v: string) {
    const a = [...form.calibrationWeights];
    a[i] = v;
    sf({ calibrationWeights: a });
  }

  // ─── Ingredients ─────────────────────────────────────────────────────────────

  function addIngredient() {
    sf({
      ingredients: [
        ...form.ingredients,
        { id: uid(), name: "", quantity_per_bowl: 0, unit: "kg" },
      ],
    });
    clearError("ingredients");
  }
  function removeIngredient(id: string) {
    sf({ ingredients: form.ingredients.filter((i) => i.id !== id) });
  }
  function updateIngredient(
    id: string,
    field: keyof Ingredient,
    val: string | number
  ) {
    sf({
      ingredients: form.ingredients.map((i) =>
        i.id === id ? { ...i, [field]: val } : i
      ),
    });
    clearError("ingredients");
  }

  // ─── Packaging ────────────────────────────────────────────────────────────────

  function addPackaging() {
    sf({
      packaging: [
        ...form.packaging,
        { id: uid(), name: "", units_per_n_flatbreads: 1 },
      ],
    });
  }
  function removePackaging(id: string) {
    sf({ packaging: form.packaging.filter((p) => p.id !== id) });
  }
  function updatePackaging(
    id: string,
    field: keyof Packaging,
    val: string | number
  ) {
    sf({
      packaging: form.packaging.map((p) =>
        p.id === id ? { ...p, [field]: val } : p
      ),
    });
  }

  // ─── Checklist ────────────────────────────────────────────────────────────────

  function addChecklist() {
    sf({ releaseChecklistItems: [...form.releaseChecklistItems, ""] });
    clearError("checklist");
  }
  function removeChecklist(i: number) {
    sf({
      releaseChecklistItems: form.releaseChecklistItems.filter(
        (_, j) => j !== i
      ),
    });
  }
  function updateChecklist(i: number, v: string) {
    const a = [...form.releaseChecklistItems];
    a[i] = v;
    sf({ releaseChecklistItems: a });
    clearError("checklist");
  }

  // ─── CCP ─────────────────────────────────────────────────────────────────────

  function updateCcp(field: keyof CcpSettings, val: number) {
    sf({ ccpSettings: { ...form.ccpSettings, [field]: val } });
    if (field === "min_temp_f") clearError("ccpMinTemp");
    if (field === "min_weight_oz") clearError("ccpMinWeight");
    if (field === "max_weight_oz") clearError("ccpMaxWeight");
  }

  // ─── Drag-and-drop (ingredients) ─────────────────────────────────────────────

  function onDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const items = [...form.ingredients];
    const [moved] = items.splice(dragIdx.current, 1);
    items.splice(idx, 0, moved);
    dragIdx.current = idx;
    sf({ ingredients: items });
  }

  function onDragEnd() {
    dragIdx.current = null;
  }

  // ─── Section completion ───────────────────────────────────────────────────────

  const ccp = form.ccpSettings;
  const sectionComplete: Record<string, boolean> = {
    A: form.name.trim().length > 0,
    B: true,
    C: true,
    D:
      ccp.min_temp_f > 0 &&
      ccp.min_weight_oz > 0 &&
      ccp.max_weight_oz > ccp.min_weight_oz,
    E:
      form.ingredients.length > 0 &&
      form.ingredients.every(
        (i) => i.name.trim() !== "" && i.quantity_per_bowl > 0
      ),
    F: true,
    G:
      form.releaseChecklistItems.length > 0 &&
      form.releaseChecklistItems.every((s) => s.trim() !== ""),
  };

  // ─── Validation ───────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!form.name.trim()) {
      errs.name = "Template name is required.";
    }
    if (form.ingredients.length === 0) {
      errs.ingredients = "At least one ingredient is required.";
    } else if (
      form.ingredients.some(
        (i) => !i.name.trim() || i.quantity_per_bowl <= 0
      )
    ) {
      errs.ingredients =
        "All ingredients must have a name and quantity > 0.";
    }
    if (ccp.min_temp_f <= 0) {
      errs.ccpMinTemp = "Must be greater than 0.";
    }
    if (ccp.min_weight_oz <= 0) {
      errs.ccpMinWeight = "Must be greater than 0.";
    }
    if (ccp.max_weight_oz <= ccp.min_weight_oz) {
      errs.ccpMaxWeight = "Must be greater than min weight.";
    }

    setErrors(errs);

    if (errs.name) openSection("A");
    if (errs.ccpMinTemp || errs.ccpMinWeight || errs.ccpMaxWeight) openSection("D");
    if (errs.ingredients) openSection("E");

    return Object.keys(errs).length === 0;
  }

  // ─── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave(asDraft = false) {
    if (!validate()) return;
    setSaving(true);
    clearError("submit");

    const payload = {
      ...form,
      isActive: asDraft ? false : form.isActive,
      calibrationWeights: form.calibrationWeights
        .filter((w) => w.trim())
        .map((label) => ({ label })),
    };

    try {
      const url =
        mode === "new"
          ? "/api/batch-sheet-templates"
          : `/api/batch-sheet-templates/${initialData!.id}`;
      const method = mode === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }
      setToast(asDraft ? "Saved as draft." : "Template saved!");
      setTimeout(() => {
        router.push("/dashboard/admin/batch-sheet-templates");
      }, 1200);
    } catch (err: unknown) {
      setErrors((e) => ({
        ...e,
        submit: err instanceof Error ? err.message : "Save failed.",
      }));
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 max-w-4xl">
      {/* Section A — Template Info */}
      <Section
        label="A"
        title="Template Info"
        isOpen={open.A}
        isComplete={sectionComplete.A}
        onToggle={() => toggleSection("A")}
      >
        <div className="space-y-4">
          <div>
            <label className="label">Template Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => {
                sf({ name: e.target.value });
                clearError("name");
              }}
              placeholder='e.g. Flatbread 18"'
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name}</p>
            )}
          </div>
          <div>
            <label className="label">Product Description</label>
            <textarea
              className="input resize-none"
              rows={4}
              value={form.description}
              onChange={(e) => sf({ description: e.target.value })}
              placeholder="Short description of this product (optional)"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => sf({ isActive: !form.isActive })}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                form.isActive ? "bg-[#D64D4D]" : "bg-gray-200"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  form.isActive ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
            <span className="text-sm text-gray-700">
              {form.isActive
                ? "Active — appears in supervisor batch sheet form"
                : "Inactive — hidden from supervisors"}
            </span>
          </div>
        </div>
      </Section>

      {/* Section B — Ovens Available */}
      <Section
        label="B"
        title="Ovens Available"
        isOpen={open.B}
        isComplete={sectionComplete.B}
        onToggle={() => toggleSection("B")}
      >
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addOven}
              className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Oven
            </button>
          </div>
          {form.ovensAvailable.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">
              No ovens added. Click Add Oven.
            </p>
          ) : (
            <div className="space-y-2">
              {form.ovensAvailable.map((oven, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={oven}
                    placeholder="e.g. Oven 06"
                    onChange={(e) => updateOven(i, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeOven(i)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Section C — Scale Calibration Weights */}
      <Section
        label="C"
        title="Scale Calibration Weights"
        isOpen={open.C}
        isComplete={sectionComplete.C}
        onToggle={() => toggleSection("C")}
      >
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addWeight}
              className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Weight
            </button>
          </div>
          {form.calibrationWeights.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">
              No weights added. Click Add Weight.
            </p>
          ) : (
            <div className="space-y-2">
              {form.calibrationWeights.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={w}
                    placeholder="e.g. 100g"
                    onChange={(e) => updateWeight(i, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeWeight(i)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Section D — CCP Settings */}
      <Section
        label="D"
        title="CCP Settings"
        isOpen={open.D}
        isComplete={sectionComplete.D}
        onToggle={() => toggleSection("D")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Min Internal Temp (°F)</label>
            <input
              type="number"
              className="input"
              step="0.1"
              value={form.ccpSettings.min_temp_f}
              onChange={(e) =>
                updateCcp("min_temp_f", parseFloat(e.target.value) || 0)
              }
            />
            {errors.ccpMinTemp && (
              <p className="mt-1 text-xs text-red-500">{errors.ccpMinTemp}</p>
            )}
          </div>
          <div>
            <label className="label">Min Finished Weight (oz)</label>
            <input
              type="number"
              className="input"
              step="0.01"
              value={form.ccpSettings.min_weight_oz}
              onChange={(e) =>
                updateCcp("min_weight_oz", parseFloat(e.target.value) || 0)
              }
            />
            {errors.ccpMinWeight && (
              <p className="mt-1 text-xs text-red-500">{errors.ccpMinWeight}</p>
            )}
          </div>
          <div>
            <label className="label">Max Finished Weight (oz)</label>
            <input
              type="number"
              className="input"
              step="0.01"
              value={form.ccpSettings.max_weight_oz}
              onChange={(e) =>
                updateCcp("max_weight_oz", parseFloat(e.target.value) || 0)
              }
            />
            {errors.ccpMaxWeight && (
              <p className="mt-1 text-xs text-red-500">{errors.ccpMaxWeight}</p>
            )}
          </div>
        </div>
      </Section>

      {/* Section E — Ingredients */}
      <Section
        label="E"
        title="Ingredients"
        isOpen={open.E}
        isComplete={sectionComplete.E}
        onToggle={() => toggleSection("E")}
      >
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addIngredient}
              className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Ingredient
            </button>
          </div>
          {form.ingredients.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">
              No ingredients added yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="w-6 py-2" />
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">
                      Ingredient Name
                    </th>
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-28">
                      Qty per Bowl
                    </th>
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-24">
                      Unit
                    </th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {form.ingredients.map((ing, idx) => (
                    <tr
                      key={ing.id}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDragEnd={onDragEnd}
                      className={cn(
                        dragIdx.current === idx && "opacity-50"
                      )}
                    >
                      <td className="py-1.5 pr-1">
                        <GripVertical className="w-4 h-4 text-gray-300 cursor-grab" />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          className="input"
                          value={ing.name}
                          placeholder="Ingredient name"
                          onChange={(e) =>
                            updateIngredient(ing.id, "name", e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          type="number"
                          className="input"
                          step="0.001"
                          min="0"
                          value={ing.quantity_per_bowl}
                          onChange={(e) =>
                            updateIngredient(
                              ing.id,
                              "quantity_per_bowl",
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <select
                          className="input"
                          value={ing.unit}
                          onChange={(e) =>
                            updateIngredient(ing.id, "unit", e.target.value)
                          }
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => removeIngredient(ing.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {errors.ingredients && (
            <p className="text-xs text-red-500">{errors.ingredients}</p>
          )}
        </div>
      </Section>

      {/* Section F — Packaging Materials */}
      <Section
        label="F"
        title="Packaging Materials"
        isOpen={open.F}
        isComplete={sectionComplete.F}
        onToggle={() => toggleSection("F")}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 font-mono">
              e.g. Parchment Paper used every 4 flatbreads
            </p>
            <button
              type="button"
              onClick={addPackaging}
              className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Material
            </button>
          </div>
          {form.packaging.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">
              No packaging materials added yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">
                      Material Name
                    </th>
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-40">
                      Used every N units
                    </th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {form.packaging.map((pkg) => (
                    <tr key={pkg.id}>
                      <td className="py-1.5 pr-3">
                        <input
                          className="input"
                          value={pkg.name}
                          placeholder="e.g. Parchment Paper"
                          onChange={(e) =>
                            updatePackaging(pkg.id, "name", e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          type="number"
                          className="input"
                          min="1"
                          step="1"
                          value={pkg.units_per_n_flatbreads}
                          onChange={(e) =>
                            updatePackaging(
                              pkg.id,
                              "units_per_n_flatbreads",
                              parseInt(e.target.value) || 1
                            )
                          }
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => removePackaging(pkg.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        >
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
      </Section>

      {/* Section G — Release Checklist Items */}
      <Section
        label="G"
        title="Release Checklist Items"
        isOpen={open.G}
        isComplete={sectionComplete.G}
        onToggle={() => toggleSection("G")}
      >
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addChecklist}
              className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </button>
          </div>
          {form.releaseChecklistItems.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">
              No checklist items added yet.
            </p>
          ) : (
            <div className="space-y-2">
              {form.releaseChecklistItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={item}
                    placeholder="Checklist item label"
                    onChange={(e) => updateChecklist(i, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeChecklist(i)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="btn-primary px-6"
        >
          {saving ? "Saving…" : "Save Template"}
        </button>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving}
          className="btn-secondary"
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={() =>
            router.push("/dashboard/admin/batch-sheet-templates")
          }
          disabled={saving}
          className="btn-secondary"
        >
          Cancel
        </button>
        {errors.submit && (
          <p className="text-sm text-red-600 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            {errors.submit}
          </p>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
