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

const ALLERGEN_OPTIONS = [
  "Egg",
  "Peanut",
  "Milk (Whey, Cheese)",
  "Sesame",
  "Tree Nut (Coconut, Almond)",
  "None",
] as const;

/** Normalize legacy unit aliases so old templates display and save correctly. */
function normalizeUnit(u: string): string {
  const aliases: Record<string, string> = {
    lb: "lbs",
    gram: "g",
    grams: "g",
    kilogram: "kg",
    kilograms: "kg",
    ounce: "oz",
    ounces: "oz",
    litre: "L",
    liter: "L",
    litres: "L",
    liters: "L",
  };
  const normalised = aliases[u.toLowerCase().trim()];
  return normalised ?? u;
}

const DEFAULT_CHECKLIST = [
  "Calibration Verification completed",
  "CCP Temperature Verification completed",
  "Net Weight Compliance completed",
  "Visual Inspection completed",
  "Batch Sheet completed",
  "Final Visual Inspection from Production Manager completed",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Ingredient = { id: string; name: string; quantity_per_bowl: number; unit: string };

type CcpCheck = {
  id: string;
  type: "temperature" | "weight" | "visual" | "custom";
  custom_name?: string;
  num_readings: number;
  num_sessions: number;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
};

type PresentationMaterial = { id: string; name: string; qty_per_bowl: number; food_contact: boolean };
type Presentation = {
  presentation_id: string;
  presentation_name: string;
  materials: PresentationMaterial[];
  // Per-presentation unit setup (optional — blank means no unit tracking for this presentation)
  primary_unit_name?: string;
  has_internal_units?: boolean;
  internal_unit_name?: string;
  internal_units_per_primary?: number | null;
};

// New EopField type (replaces old EopFieldKey string union)
type EopField = {
  id: string;
  label: string;
  field_type: "text" | "number" | "yes_no" | "checkbox" | "date" | "textarea";
  required: boolean;
  order: number;
};

// Keep old type for backward compat reference
type EopFieldKey =
  | "total_boxes"
  | "extra_bags"
  | "yield_per_bowl"
  | "waste"
  | "bake_date"
  | "prod_hours"
  | "packaging_review"
  | "quality_check";

export type TemplateData = {
  name: string;
  description: string;
  isActive: boolean;
  ovensAvailable: string[];
  calibrationWeights: string[];
  ccpChecks: CcpCheck[];
  ccpRequireTimestamp: boolean;
  presentations: Presentation[];
  endOfProductionFields: EopField[];
  releaseChecklistItems: string[];
  // Allergen declaration (Section G)
  declaredAllergens: string[];
  // Whether the product has a set expiration date (Section A)
  hasExpirationDate: boolean;
};

interface Props {
  initialData?: Partial<TemplateData> & {
    id?: string;
    // Legacy fields for backward compat
    ccpSettings?: unknown;
    packaging?: unknown;
    ingredients?: Ingredient[];
    calibrationWeights?: unknown;
    endOfProductionFields?: unknown;
  };
  mode: "new" | "edit";
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function convertOldCcpToNew(oldCcp: unknown, globalNumSessions?: number): CcpCheck[] {
  const o = oldCcp as { min_temp_f?: number; min_weight_oz?: number; max_weight_oz?: number };
  const ns = globalNumSessions ?? 1;
  return [
    {
      id: uid(), type: "temperature",
      num_readings: 2, num_sessions: ns, min_value: o.min_temp_f ?? 190, max_value: null, unit: "°F",
    },
    {
      id: uid(), type: "weight",
      num_readings: 2, num_sessions: ns, min_value: o.min_weight_oz ?? 3.5, max_value: o.max_weight_oz ?? 4.2, unit: "oz",
    },
    {
      id: uid(), type: "visual",
      num_readings: 1, num_sessions: ns, min_value: null, max_value: null, unit: null,
    },
  ];
}

// ─── Default EOP fields for new templates ─────────────────────────────────────

function makeDefaultEopFields(): EopField[] {
  const defs: Array<{ label: string; field_type: EopField["field_type"]; required: boolean }> = [
    // Note: "Total Boxes Made", "Extra Bags / Pouches Made", and "Yield per Bowl" removed —
    // these are now handled by the structured Primary Unit Setup in Section G.
    { label: "Waste",                       field_type: "text",     required: false },
    { label: "Bake Date",                   field_type: "date",     required: false },
    { label: "Production Hours",            field_type: "number",   required: false },
    { label: "Product Labeled As",          field_type: "text",     required: true },
    { label: "Lot on Package",              field_type: "text",     required: true },
    { label: "Expiration Date on Package",  field_type: "date",     required: true },
    { label: "Packaging Reviewer",          field_type: "text",     required: true },
    { label: "Packaging Comments",          field_type: "textarea", required: false },
    { label: "Color",                       field_type: "text",     required: false },
    { label: "Shape",                       field_type: "text",     required: false },
    { label: "Smell",                       field_type: "text",     required: false },
    { label: "Taste",                       field_type: "text",     required: false },
    { label: "Overall Quality",             field_type: "text",     required: false },
    { label: "Quality Comments",            field_type: "textarea", required: false },
  ];
  return defs.map((d, i) => ({ id: uid(), order: i, ...d }));
}

// ─── Convert old EopFieldKey[] to EopField[] ──────────────────────────────────

function convertOldEopToNew(oldKeys: EopFieldKey[]): EopField[] {
  const result: EopField[] = [];
  let order = 0;

  const simpleMap: Partial<Record<EopFieldKey, { label: string; field_type: EopField["field_type"]; required: boolean }>> = {
    total_boxes:    { label: "Total Boxes Made",          field_type: "number", required: true },
    extra_bags:     { label: "Extra Bags / Pouches Made", field_type: "number", required: false },
    yield_per_bowl: { label: "Yield per Bowl",            field_type: "number", required: false },
    waste:          { label: "Waste",                     field_type: "text",   required: false },
    bake_date:      { label: "Bake Date",                 field_type: "date",   required: false },
    prod_hours:     { label: "Production Hours",          field_type: "number", required: false },
  };

  for (const key of oldKeys) {
    if (key === "packaging_review") {
      const pkgFields: Array<{ label: string; field_type: EopField["field_type"]; required: boolean }> = [
        { label: "Product Labeled As",         field_type: "text",     required: true },
        { label: "Lot on Package",             field_type: "text",     required: true },
        { label: "Expiration Date on Package", field_type: "date",     required: true },
        { label: "Packaging Reviewer",         field_type: "text",     required: true },
        { label: "Packaging Comments",         field_type: "textarea", required: false },
      ];
      for (const f of pkgFields) {
        result.push({ id: uid(), order: order++, ...f });
      }
    } else if (key === "quality_check") {
      const qualFields: Array<{ label: string; field_type: EopField["field_type"]; required: boolean }> = [
        { label: "Color",           field_type: "text",     required: false },
        { label: "Shape",           field_type: "text",     required: false },
        { label: "Smell",           field_type: "text",     required: false },
        { label: "Taste",           field_type: "text",     required: false },
        { label: "Overall Quality", field_type: "text",     required: false },
        { label: "Quality Comments",field_type: "textarea", required: false },
      ];
      for (const f of qualFields) {
        result.push({ id: uid(), order: order++, ...f });
      }
    } else if (simpleMap[key]) {
      const def = simpleMap[key]!;
      result.push({ id: uid(), order: order++, ...def });
    }
  }

  return result;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  label, title, isOpen, isComplete, onToggle, children,
}: {
  label: string; title: string; isOpen: boolean; isComplete: boolean;
  onToggle: () => void; children: React.ReactNode;
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
          maxHeight: isOpen ? "3000px" : "0",
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
      <button type="button" onClick={onClose} className="ml-1 text-gray-400 hover:text-white transition-colors">
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
    A: true, B: false, C: false, D: false, E: false, F: false, G: false, H: false,
  });

  const dragIdx = useRef<number | null>(null);
  const eopDragIdx = useRef<number | null>(null);

  const [form, setForm] = useState<TemplateData>(() => {
    if (initialData) {
      // Parse legacy or new ccpChecks
      let ccpChecks: CcpCheck[] = [];
      if (Array.isArray((initialData as { ccpChecks?: unknown }).ccpChecks)) {
        const raw = (initialData as { ccpChecks: CcpCheck[] }).ccpChecks;
        // Migrate: add num_sessions if missing (from old global ccpNumSessions)
        const globalNs = (initialData as { ccpNumSessions?: number }).ccpNumSessions ?? 1;
        ccpChecks = raw.map((c) => ({ ...c, num_sessions: c.num_sessions ?? globalNs }));
      } else if ((initialData as { ccpSettings?: unknown }).ccpSettings) {
        const globalNs = (initialData as { ccpNumSessions?: number }).ccpNumSessions ?? 1;
        ccpChecks = convertOldCcpToNew((initialData as { ccpSettings: unknown }).ccpSettings, globalNs);
      }

      // Parse legacy or new presentations
      let presentations: Presentation[] = [];
      if (Array.isArray((initialData as { presentations?: unknown }).presentations)) {
        const pres = (initialData as { presentations: unknown[] }).presentations;
        if (pres.length > 0 && (pres[0] as Record<string, unknown>).presentation_id) {
          presentations = pres as Presentation[];
        } else if (pres.length > 0) {
          // Legacy flat packaging array
          presentations = [{
            presentation_id: uid(),
            presentation_name: "Standard Presentation",
            materials: (pres as Array<Record<string, unknown>>).map((p) => ({
              id:           p.id as string ?? uid(),
              name:         p.name as string ?? "",
              qty_per_bowl: (p.qty_per_bowl ?? p.units_per_n_flatbreads ?? 1) as number,
              food_contact: (p.food_contact ?? true) as boolean,
            })),
          }];
        }
      } else if (Array.isArray((initialData as { packaging?: unknown }).packaging)) {
        const pkg = (initialData as { packaging: Array<Record<string, unknown>> }).packaging;
        if (pkg.length > 0) {
          if ((pkg[0] as Record<string, unknown>).presentation_id) {
            presentations = pkg as unknown as Presentation[];
          } else {
            presentations = [{
              presentation_id: uid(),
              presentation_name: "Standard Presentation",
              materials: pkg.map((p) => ({
                id:           p.id as string ?? uid(),
                name:         p.name as string ?? "",
                qty_per_bowl: (p.qty_per_bowl ?? p.units_per_n_flatbreads ?? 1) as number,
                food_contact: (p.food_contact ?? true) as boolean,
              })),
            }];
          }
        }
      }

      // Parse EOP fields — detect new format (array of objects with field_type key) vs old string array
      const rawEop = initialData.endOfProductionFields;
      let endOfProductionFields: EopField[];
      if (Array.isArray(rawEop)) {
        if (rawEop.length === 0) {
          // Explicitly empty — template was saved with no EOP fields; preserve that
          endOfProductionFields = [];
        } else {
          const first = rawEop[0] as unknown;
          if (typeof first === "object" && first !== null && "field_type" in (first as object)) {
            // New format — use as-is
            endOfProductionFields = rawEop as EopField[];
          } else if (typeof first === "string") {
            // Old format — convert
            endOfProductionFields = convertOldEopToNew(rawEop as unknown as EopFieldKey[]);
          } else {
            endOfProductionFields = makeDefaultEopFields();
          }
        }
      } else {
        // null or undefined — new template or pre-feature template; seed with defaults
        endOfProductionFields = makeDefaultEopFields();
      }

      const rawWeights = initialData.calibrationWeights;
      let calibrationWeights: string[] = [];
      if (Array.isArray(rawWeights)) {
        calibrationWeights = (rawWeights as Array<string | { label: string }>).map((w) =>
          typeof w === "string" ? w : w.label
        );
      }

      const id = initialData as { ccpRequireTimestamp?: boolean; declaredAllergens?: unknown; hasExpirationDate?: boolean };
      const rawAllergens = id.declaredAllergens;
      const declaredAllergens = Array.isArray(rawAllergens) ? (rawAllergens as string[]) : [];
      return {
        name:                initialData.name ?? "",
        description:         initialData.description ?? "",
        isActive:            initialData.isActive ?? true,
        ovensAvailable:      [...((initialData.ovensAvailable ?? []) as string[])],
        calibrationWeights,
        ccpChecks,
        ccpRequireTimestamp: id.ccpRequireTimestamp ?? false,
        presentations,
        endOfProductionFields,
        releaseChecklistItems: [...((initialData.releaseChecklistItems ?? []) as string[])],
        declaredAllergens,
        hasExpirationDate:   id.hasExpirationDate ?? true,
      };
    }

    return {
      name: "", description: "", isActive: true,
      ovensAvailable: [], calibrationWeights: [],
      ccpChecks: [], ccpRequireTimestamp: false,
      presentations: [],
      endOfProductionFields: makeDefaultEopFields(),
      releaseChecklistItems: [...DEFAULT_CHECKLIST],
      declaredAllergens: [],
      hasExpirationDate: true,
    };
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function sf(patch: Partial<TemplateData>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function toggleSection(key: string) { setOpen((o) => ({ ...o, [key]: !o[key] })); }
  function openSection(key: string)   { setOpen((o) => ({ ...o, [key]: true })); }

  function clearError(key: string) {
    setErrors((e) => { const next = { ...e }; delete next[key]; return next; });
  }

  // ─── Ovens ───────────────────────────────────────────────────────────────────

  function addOven()               { sf({ ovensAvailable: [...form.ovensAvailable, ""] }); }
  function removeOven(i: number)   { sf({ ovensAvailable: form.ovensAvailable.filter((_, j) => j !== i) }); }
  function updateOven(i: number, v: string) {
    const a = [...form.ovensAvailable]; a[i] = v; sf({ ovensAvailable: a });
  }

  // ─── Calibration weights ──────────────────────────────────────────────────────

  function addWeight()             { sf({ calibrationWeights: [...form.calibrationWeights, ""] }); }
  function removeWeight(i: number) { sf({ calibrationWeights: form.calibrationWeights.filter((_, j) => j !== i) }); }
  function updateWeight(i: number, v: string) {
    const a = [...form.calibrationWeights]; a[i] = v; sf({ calibrationWeights: a });
  }

  // ─── Ingredients ─────────────────────────────────────────────────────────────

  const [ingredients, setIngredients] = useState<Ingredient[]>(() => {
    if (initialData?.ingredients) {
      return (initialData.ingredients as Ingredient[]).map((i) => ({
        ...i,
        unit: normalizeUnit(i.unit ?? "g"),
      }));
    }
    return [];
  });

  function addIngredient() {
    const next = [...ingredients, { id: uid(), name: "", quantity_per_bowl: 0, unit: "kg" }];
    setIngredients(next);
    clearError("ingredients");
  }
  function removeIngredient(id: string) { setIngredients(ingredients.filter((i) => i.id !== id)); }
  function updateIngredient(id: string, field: keyof Ingredient, val: string | number) {
    setIngredients(ingredients.map((i) => i.id === id ? { ...i, [field]: val } : i));
    clearError("ingredients");
  }

  // ─── CCP Checks ──────────────────────────────────────────────────────────────

  function addCcpCheck() {
    const newCheck: CcpCheck = {
      id: uid(), type: "temperature",
      num_readings: 2, num_sessions: 1, min_value: 190, max_value: null, unit: "°F",
    };
    sf({ ccpChecks: [...form.ccpChecks, newCheck] });
  }

  function removeCcpCheck(id: string) {
    sf({ ccpChecks: form.ccpChecks.filter((c) => c.id !== id) });
  }

  function updateCcpCheck(id: string, patch: Partial<CcpCheck>) {
    sf({
      ccpChecks: form.ccpChecks.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...patch };
        // Auto-set defaults when type changes
        if (patch.type) {
          if (patch.type === "temperature") {
            updated.unit      = "°F";
            updated.min_value = updated.min_value ?? 190;
            updated.max_value = null;
            updated.custom_name = undefined;
          } else if (patch.type === "weight") {
            // Preserve existing unit if already a weight unit, else default oz
            const validWeightUnits = ["oz", "g", "lb"];
            if (!validWeightUnits.includes(updated.unit ?? "")) updated.unit = "oz";
            updated.min_value = updated.min_value ?? 3.5;
            updated.max_value = updated.max_value ?? 4.2;
            updated.custom_name = undefined;
          } else if (patch.type === "visual") {
            updated.unit      = null;
            updated.min_value = null;
            updated.max_value = null;
            updated.custom_name = undefined;
          } else if (patch.type === "custom") {
            updated.unit      = null;
            updated.min_value = null;
            updated.max_value = null;
            if (updated.custom_name === undefined) updated.custom_name = "";
          }
        }
        return updated;
      }),
    });
  }

  // ─── Presentations ────────────────────────────────────────────────────────────

  function addPresentation() {
    const newPres: Presentation = {
      presentation_id:   uid(),
      presentation_name: form.presentations.length === 0 ? "Standard Presentation" : "",
      materials:         [],
    };
    sf({ presentations: [...form.presentations, newPres] });
  }

  function removePresentation(pid: string) {
    sf({ presentations: form.presentations.filter((p) => p.presentation_id !== pid) });
  }

  function updatePresentationName(pid: string, name: string) {
    sf({
      presentations: form.presentations.map((p) =>
        p.presentation_id === pid ? { ...p, presentation_name: name } : p
      ),
    });
  }

  function updatePresentationUnit(
    pid: string,
    field: "primary_unit_name" | "has_internal_units" | "internal_unit_name" | "internal_units_per_primary",
    value: string | boolean | number | null
  ) {
    sf({
      presentations: form.presentations.map((p) =>
        p.presentation_id === pid ? { ...p, [field]: value } : p
      ),
    });
  }

  function addMaterial(pid: string) {
    sf({
      presentations: form.presentations.map((p) => {
        if (p.presentation_id !== pid) return p;
        return {
          ...p,
          materials: [...p.materials, { id: uid(), name: "", qty_per_bowl: 1, food_contact: true }],
        };
      }),
    });
  }

  function removeMaterial(pid: string, mid: string) {
    sf({
      presentations: form.presentations.map((p) => {
        if (p.presentation_id !== pid) return p;
        return { ...p, materials: p.materials.filter((m) => m.id !== mid) };
      }),
    });
  }

  function updateMaterial(pid: string, mid: string, field: keyof PresentationMaterial, val: string | number | boolean) {
    sf({
      presentations: form.presentations.map((p) => {
        if (p.presentation_id !== pid) return p;
        return {
          ...p,
          materials: p.materials.map((m) =>
            m.id === mid ? { ...m, [field]: val } : m
          ),
        };
      }),
    });
  }

  // ─── EOP Fields (dynamic) ─────────────────────────────────────────────────────

  function addEopField() {
    const newField: EopField = {
      id: uid(),
      label: "",
      field_type: "text",
      required: false,
      order: form.endOfProductionFields.length,
    };
    sf({ endOfProductionFields: [...form.endOfProductionFields, newField] });
  }

  function removeEopField(id: string) {
    const updated = form.endOfProductionFields
      .filter((f) => f.id !== id)
      .map((f, i) => ({ ...f, order: i }));
    sf({ endOfProductionFields: updated });
  }

  function updateEopField(id: string, patch: Partial<EopField>) {
    sf({
      endOfProductionFields: form.endOfProductionFields.map((f) =>
        f.id === id ? { ...f, ...patch } : f
      ),
    });
  }

  // ─── EOP Drag-and-drop ────────────────────────────────────────────────────────

  function onEopDragStart(idx: number) { eopDragIdx.current = idx; }
  function onEopDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (eopDragIdx.current === null || eopDragIdx.current === idx) return;
    const items = [...form.endOfProductionFields];
    const [moved] = items.splice(eopDragIdx.current, 1);
    items.splice(idx, 0, moved);
    eopDragIdx.current = idx;
    sf({ endOfProductionFields: items.map((f, i) => ({ ...f, order: i })) });
  }
  function onEopDragEnd() { eopDragIdx.current = null; }

  // ─── Checklist ────────────────────────────────────────────────────────────────

  function addChecklist() { sf({ releaseChecklistItems: [...form.releaseChecklistItems, ""] }); clearError("checklist"); }
  function removeChecklist(i: number) { sf({ releaseChecklistItems: form.releaseChecklistItems.filter((_, j) => j !== i) }); }
  function updateChecklist(i: number, v: string) {
    const a = [...form.releaseChecklistItems]; a[i] = v; sf({ releaseChecklistItems: a }); clearError("checklist");
  }

  // ─── Drag-and-drop (ingredients) ─────────────────────────────────────────────

  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const items = [...ingredients];
    const [moved] = items.splice(dragIdx.current, 1);
    items.splice(idx, 0, moved);
    dragIdx.current = idx;
    setIngredients(items);
  }
  function onDragEnd() { dragIdx.current = null; }

  // ─── Section completion ───────────────────────────────────────────────────────

  const sectionComplete: Record<string, boolean> = {
    A: form.name.trim().length > 0,
    B: true,
    C: true,
    D: form.ccpChecks.length > 0,
    E: ingredients.length > 0 && ingredients.every((i) => i.name.trim() !== "" && i.quantity_per_bowl > 0),
    F: true,
    G: true,
    H: form.releaseChecklistItems.length > 0 && form.releaseChecklistItems.every((s) => s.trim() !== ""),
  };

  // ─── Validation ───────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Template name is required.";
    if (ingredients.length === 0) {
      errs.ingredients = "At least one ingredient is required.";
    } else if (ingredients.some((i) => !i.name.trim() || i.quantity_per_bowl <= 0)) {
      errs.ingredients = "All ingredients must have a name and quantity > 0.";
    }
    setErrors(errs);
    if (errs.name) openSection("A");
    if (errs.ingredients) openSection("E");
    return Object.keys(errs).length === 0;
  }

  // ─── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave(asDraft = false) {
    if (!validate()) return;
    setSaving(true);
    clearError("submit");

    // Update order field of each EOP item to match array index before saving
    const eopFields = form.endOfProductionFields.map((f, i) => ({ ...f, order: i }));

    const payload = {
      name:                  form.name,
      description:           form.description,
      isActive:              asDraft ? false : form.isActive,
      ovensAvailable:        form.ovensAvailable,
      calibrationWeights:    form.calibrationWeights.filter((w) => w.trim()).map((label) => ({ label })),
      ccpChecks:             form.ccpChecks,
      ccpRequireTimestamp:   form.ccpRequireTimestamp,
      // Unit config is now embedded per-presentation inside each object
      presentations:         form.presentations,
      endOfProductionFields:   eopFields,
      declaredAllergens:       form.declaredAllergens.includes("None") ? [] : form.declaredAllergens,
      hasExpirationDate:       form.hasExpirationDate,
      releaseChecklistItems:   form.releaseChecklistItems,
      ingredients,
    };

    try {
      const templateId = (initialData as { id?: string })?.id;
      const url    = mode === "new" ? "/api/batch-sheet-templates" : `/api/batch-sheet-templates/${templateId}`;
      const method = mode === "new" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        // cache: 'no-store' ensures this write is never served from any browser cache
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail ?? errData.error ?? `HTTP ${res.status}`);
      }

      const saved = await res.json() as { id: string; updatedAt?: string; ovensAvailable?: unknown[]; releaseChecklistItems?: unknown[] };

      // Verify the response contains the data we sent
      if (mode === "edit" && saved) {
        const ovensSentCount = payload.ovensAvailable.length;
        const ovensBackCount = Array.isArray(saved.ovensAvailable) ? saved.ovensAvailable.length : -1;
        const checklistSentCount = payload.releaseChecklistItems.length;
        const checklistBackCount = Array.isArray(saved.releaseChecklistItems) ? saved.releaseChecklistItems.length : -1;

        if (ovensBackCount !== ovensSentCount || checklistBackCount !== checklistSentCount) {
          console.warn("[handleSave] Verification mismatch:", {
            ovensSent: ovensSentCount, ovensBack: ovensBackCount,
            checklistSent: checklistSentCount, checklistBack: checklistBackCount,
          });
          throw new Error("Save appeared to succeed but the server returned different data. Please try again.");
        }
      }

      setToast(asDraft ? "Saved as draft." : "Template saved!");
      setTimeout(() => { router.push("/dashboard/admin/batch-sheet-templates"); }, 1200);
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, submit: err instanceof Error ? err.message : "Save failed." }));
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const ccpTypeOptions = [
    { value: "temperature", label: "Internal Temperature" },
    { value: "weight",      label: "Weight Check" },
    { value: "visual",      label: "Visual Inspection" },
    { value: "custom",      label: "Custom" },
  ];

  const eopFieldTypeOptions: Array<{ value: EopField["field_type"]; label: string }> = [
    { value: "text",     label: "Text" },
    { value: "number",   label: "Number" },
    { value: "yes_no",   label: "Yes/No" },
    { value: "checkbox", label: "Checkbox" },
    { value: "date",     label: "Date" },
    { value: "textarea", label: "Textarea" },
  ];

  return (
    <div className="space-y-3 max-w-4xl">

      {/* Section A — Template Info */}
      <Section label="A" title="Template Info" isOpen={open.A} isComplete={sectionComplete.A} onToggle={() => toggleSection("A")}>
        <div className="space-y-4">
          <div>
            <label className="label">Template Name</label>
            <input className="input" value={form.name}
              onChange={(e) => { sf({ name: e.target.value }); clearError("name"); }}
              placeholder='e.g. Flatbread 18"' />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label className="label">Product Description</label>
            <textarea className="input resize-none" rows={4} value={form.description}
              onChange={(e) => sf({ description: e.target.value })}
              placeholder="Short description of this product (optional)" />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => sf({ isActive: !form.isActive })}
              className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors", form.isActive ? "bg-[#D64D4D]" : "bg-gray-200")}>
              <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", form.isActive ? "translate-x-6" : "translate-x-1")} />
            </button>
            <span className="text-sm text-gray-700">
              {form.isActive ? "Active — appears in supervisor batch sheet form" : "Inactive — hidden from supervisors"}
            </span>
          </div>
          <div>
            <label className="label">Has Expiration Date?</label>
            <p className="text-xs text-gray-400 font-mono mb-2">
              Disable for products with no set expiration date, such as in-house PreMix powders used as ingredients.
            </p>
            <div className="flex gap-2">
              {(["Yes", "No"] as const).map((opt) => {
                const isYes = opt === "Yes";
                const active = form.hasExpirationDate === isYes;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => sf({ hasExpirationDate: isYes })}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                      active
                        ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Section B — Ovens Available */}
      <Section label="B" title="Ovens Available" isOpen={open.B} isComplete={sectionComplete.B} onToggle={() => toggleSection("B")}>
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={addOven} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Oven
            </button>
          </div>
          {form.ovensAvailable.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">No ovens added. Click Add Oven.</p>
          ) : (
            <div className="space-y-2">
              {form.ovensAvailable.map((oven, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input flex-1" value={oven} placeholder="e.g. Oven 06"
                    onChange={(e) => updateOven(i, e.target.value)} />
                  <button type="button" onClick={() => removeOven(i)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Section C — Scale Calibration Weights */}
      <Section label="C" title="Scale Calibration Weights" isOpen={open.C} isComplete={sectionComplete.C} onToggle={() => toggleSection("C")}>
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={addWeight} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Weight
            </button>
          </div>
          {form.calibrationWeights.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">No weights added. Click Add Weight.</p>
          ) : (
            <div className="space-y-2">
              {form.calibrationWeights.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input flex-1" value={w} placeholder="e.g. 100g"
                    onChange={(e) => updateWeight(i, e.target.value)} />
                  <button type="button" onClick={() => removeWeight(i)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Section D — CCP Settings */}
      <Section label="D" title="CCP Settings" isOpen={open.D} isComplete={sectionComplete.D} onToggle={() => toggleSection("D")}>
        <div className="space-y-4">
          {/* CCP Check cards */}
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500 font-mono">Define each CCP check type and its pass/fail thresholds.</p>
            <button type="button" onClick={addCcpCheck} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add CCP Check
            </button>
          </div>

          {form.ccpChecks.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">No CCP checks defined. Click &quot;Add CCP Check&quot; to begin.</p>
          ) : (
            <div className="space-y-3">
              {form.ccpChecks.map((check) => (
                <div key={check.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50/40">
                  {/* Type selector + delete */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="label text-[10px]">Check Type</label>
                      <select className="input"
                        value={check.type}
                        onChange={(e) => updateCcpCheck(check.id, { type: e.target.value as CcpCheck["type"] })}>
                        {ccpTypeOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Unit dropdown for weight checks */}
                    {check.type === "weight" && (
                      <div className="w-24">
                        <label className="label text-[10px]">Unit</label>
                        <select className="input"
                          value={check.unit ?? "oz"}
                          onChange={(e) => updateCcpCheck(check.id, { unit: e.target.value })}>
                          <option value="oz">oz</option>
                          <option value="g">g</option>
                          <option value="lb">lb</option>
                        </select>
                      </div>
                    )}

                    <div className="flex items-end pb-0.5 ml-auto">
                      <button type="button" onClick={() => removeCcpCheck(check.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Custom check name (only for custom type) */}
                  {check.type === "custom" && (
                    <div>
                      <label className="label text-[10px]">Check Name</label>
                      <input className="input" value={check.custom_name ?? ""}
                        placeholder="e.g. pH Check"
                        onChange={(e) => updateCcpCheck(check.id, { custom_name: e.target.value })} />
                    </div>
                  )}

                  {/* Numeric inputs by type */}
                  <div className="flex flex-wrap gap-3">
                    {check.type === "temperature" && (
                      <div className="w-40">
                        <label className="label text-[10px]">Min Value (°F)</label>
                        <input type="number" className="input" step="0.1"
                          value={check.min_value ?? ""}
                          onChange={(e) => updateCcpCheck(check.id, { min_value: parseFloat(e.target.value) || null })} />
                      </div>
                    )}

                    {check.type === "weight" && (
                      <>
                        <div className="w-36">
                          <label className="label text-[10px]">Min Value ({check.unit ?? "oz"})</label>
                          <input type="number" className="input" step="0.01"
                            value={check.min_value ?? ""}
                            onChange={(e) => updateCcpCheck(check.id, { min_value: parseFloat(e.target.value) || null })} />
                        </div>
                        <div className="w-36">
                          <label className="label text-[10px]">Max Value ({check.unit ?? "oz"})</label>
                          <input type="number" className="input" step="0.01"
                            value={check.max_value ?? ""}
                            onChange={(e) => updateCcpCheck(check.id, { max_value: parseFloat(e.target.value) || null })} />
                        </div>
                      </>
                    )}

                    {/* Readings required — all types */}
                    <div className="w-36">
                      <label className="label text-[10px]">Readings Required</label>
                      <input type="number" className="input" min="1" step="1"
                        value={check.num_readings}
                        onChange={(e) => updateCcpCheck(check.id, { num_readings: Math.max(1, parseInt(e.target.value) || 1) })} />
                    </div>

                    {/* Sessions per check */}
                    <div className="w-36">
                      <label className="label text-[10px]">Sessions</label>
                      <input type="number" className="input" min="1" step="1"
                        value={check.num_sessions}
                        onChange={(e) => updateCcpCheck(check.id, { num_sessions: Math.max(1, parseInt(e.target.value) || 1) })} />
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">Times performed during production</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Require Check Session Timestamp */}
          <div className="border-t border-gray-100 pt-4 mt-2">
            <label className="label">Require Check Session Timestamp?</label>
            <p className="text-xs text-gray-400 font-mono mb-3">
              If enabled, the system will automatically record the time when each check session is completed.
            </p>
            <div className="flex items-center gap-3">
              <button type="button"
                onClick={() => sf({ ccpRequireTimestamp: !form.ccpRequireTimestamp })}
                className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  form.ccpRequireTimestamp ? "bg-[#D64D4D]" : "bg-gray-200")}>
                <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  form.ccpRequireTimestamp ? "translate-x-6" : "translate-x-1")} />
              </button>
              <span className="text-sm text-gray-700">
                {form.ccpRequireTimestamp ? "Timestamp required per session" : "No timestamp required"}
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* Section E — Ingredients */}
      <Section label="E" title="Ingredients" isOpen={open.E} isComplete={sectionComplete.E} onToggle={() => toggleSection("E")}>
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={addIngredient} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Ingredient
            </button>
          </div>
          {ingredients.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">No ingredients added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="w-6 py-2" />
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Ingredient Name</th>
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-28">Qty per Bowl</th>
                    <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-24">Unit</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ingredients.map((ing, idx) => (
                    <tr key={ing.id} draggable onDragStart={() => onDragStart(idx)}
                      onDragOver={(e) => onDragOver(e, idx)} onDragEnd={onDragEnd}
                      className={cn(dragIdx.current === idx && "opacity-50")}>
                      <td className="py-1.5 pr-1"><GripVertical className="w-4 h-4 text-gray-300 cursor-grab" /></td>
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
          {errors.ingredients && <p className="text-xs text-red-500">{errors.ingredients}</p>}
        </div>
      </Section>

      {/* Section F — Packaging Materials (Presentations) */}
      <Section label="F" title="Packaging Materials" isOpen={open.F} isComplete={sectionComplete.F} onToggle={() => toggleSection("F")}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 font-mono">
              Group packaging materials by presentation type. Food-contact items require supplier &amp; lot from supervisor.
            </p>
            <button type="button" onClick={addPresentation}
              className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Presentation
            </button>
          </div>

          {form.presentations.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">No presentations added yet.</p>
          ) : (
            <div className="space-y-4">
              {form.presentations.map((pres) => (
                <div key={pres.presentation_id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Presentation header */}
                  <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <input className="input flex-1 font-semibold" value={pres.presentation_name}
                      placeholder="Presentation Name (e.g. Standard Presentation)"
                      onChange={(e) => updatePresentationName(pres.presentation_id, e.target.value)} />
                    <button type="button" onClick={() => removePresentation(pres.presentation_id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Materials */}
                  <div className="p-4 space-y-3">
                    {pres.materials.length === 0 ? (
                      <p className="text-xs text-gray-400 font-mono">No materials. Click &quot;Add Material&quot; below.</p>
                    ) : (
                      <div className="space-y-2">
                        {pres.materials.map((mat) => (
                          <div key={mat.id}
                            className={cn(
                              "rounded-lg border p-3 flex flex-wrap gap-3 items-start transition-colors",
                              mat.food_contact ? "bg-emerald-50/40 border-emerald-100" : "bg-gray-50/60 border-gray-100"
                            )}>
                            <div className="flex-1 min-w-[180px]">
                              <label className="label text-[10px]">Material Name</label>
                              <input className="input" value={mat.name} placeholder="e.g. Parchment Paper"
                                onChange={(e) => updateMaterial(pres.presentation_id, mat.id, "name", e.target.value)} />
                            </div>
                            <div className="w-28">
                              <label className="label text-[10px]">Qty per Bowl</label>
                              <input type="number" className="input" min="0" step="0.01" value={mat.qty_per_bowl}
                                onChange={(e) => updateMaterial(pres.presentation_id, mat.id, "qty_per_bowl", parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                              <label className="label text-[10px]">Food Contact?</label>
                              <div className="flex rounded-md overflow-hidden border border-gray-200 w-fit">
                                <button type="button"
                                  onClick={() => updateMaterial(pres.presentation_id, mat.id, "food_contact", true)}
                                  className={cn("px-3 py-1.5 text-xs font-semibold transition-colors",
                                    mat.food_contact ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                                  Yes
                                </button>
                                <button type="button"
                                  onClick={() => updateMaterial(pres.presentation_id, mat.id, "food_contact", false)}
                                  className={cn("px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors",
                                    !mat.food_contact ? "bg-gray-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                                  No
                                </button>
                              </div>
                            </div>
                            {mat.food_contact && (
                              <>
                                <div className="w-36">
                                  <label className="label text-[10px]">Supplier</label>
                                  <input className="input bg-gray-50 text-gray-400 cursor-not-allowed" disabled placeholder="Filled by supervisor" />
                                </div>
                                <div className="w-32">
                                  <label className="label text-[10px]">Lot #</label>
                                  <input className="input bg-gray-50 text-gray-400 cursor-not-allowed" disabled placeholder="Filled by supervisor" />
                                </div>
                              </>
                            )}
                            <div className="flex items-end pb-0.5 ml-auto">
                              <button type="button" onClick={() => removeMaterial(pres.presentation_id, mat.id)}
                                className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => addMaterial(pres.presentation_id)}
                      className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
                      <Plus className="w-3.5 h-3.5" /> Add Material
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Section G — End of Production Summary Setup */}
      <Section label="G" title="End of Production Summary Setup" isOpen={open.G} isComplete={sectionComplete.G} onToggle={() => toggleSection("G")}>
        <div className="space-y-6">

          {/* ── Per-Presentation Unit Setup ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Per-Presentation Unit Setup</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  Configure the production unit tracking for each presentation defined in Section F.
                  Leave Primary Unit Name blank to skip unit tracking for a presentation.
                </p>
              </div>
            </div>

            {form.presentations.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
                <p className="text-xs text-gray-400 font-mono">
                  No presentations defined yet. Add presentations in Section F to configure unit setup here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {form.presentations.map((pres) => (
                  <div key={pres.presentation_id} className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50/40">
                    {/* Header: read-only presentation name */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">Presentation:</span>
                      <span className="text-sm font-semibold text-gray-800">{pres.presentation_name || <span className="text-gray-400 italic">(unnamed)</span>}</span>
                    </div>

                    {/* Primary Unit Name */}
                    <div>
                      <label className="label">Primary Unit Name</label>
                      <input
                        className="input"
                        value={pres.primary_unit_name ?? ""}
                        placeholder="e.g. Caddie, Box, Pouch, Loaf"
                        onChange={(e) => updatePresentationUnit(pres.presentation_id, "primary_unit_name", e.target.value)}
                      />
                      <p className="text-xs text-gray-400 font-mono mt-1">
                        The main countable unit of finished product. Leave blank to skip unit tracking.
                      </p>
                    </div>

                    {/* Has Internal Units toggle — only shown when primary unit is set */}
                    {(pres.primary_unit_name ?? "") && (
                      <>
                        <div>
                          <label className="label mb-1">Has Internal Units?</label>
                          <div className="flex gap-2">
                            {(["No", "Yes"] as const).map((opt) => {
                              const isYes = opt === "Yes";
                              const active = (pres.has_internal_units ?? false) === isYes;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => updatePresentationUnit(pres.presentation_id, "has_internal_units", isYes)}
                                  className={cn(
                                    "px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                                    active
                                      ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                                  )}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Conditional internal unit fields */}
                        {(pres.has_internal_units ?? false) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-200 pt-4">
                            <div>
                              <label className="label">Internal Unit Name</label>
                              <input
                                className="input"
                                value={pres.internal_unit_name ?? ""}
                                placeholder="e.g. Bar, Bag, Slice, Piece"
                                onChange={(e) => updatePresentationUnit(pres.presentation_id, "internal_unit_name", e.target.value)}
                              />
                              <p className="text-xs text-gray-400 font-mono mt-1">The individual unit inside the primary unit.</p>
                            </div>
                            <div>
                              <label className="label">Internal Units per Primary Unit</label>
                              <input
                                type="number"
                                className="input"
                                value={pres.internal_units_per_primary ?? ""}
                                placeholder="e.g. 12"
                                min="1"
                                step="1"
                                onChange={(e) => updatePresentationUnit(pres.presentation_id, "internal_units_per_primary", e.target.value ? parseFloat(e.target.value) : null)}
                              />
                              <p className="text-xs text-gray-400 font-mono mt-1">How many internal units make one primary unit.</p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Allergen Declaration Setup ── */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50/40">
            <p className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Allergen Declaration Setup</p>
            <p className="text-xs text-gray-500">
              Select all allergens present in this product. This will be used to verify the allergen
              declaration on the finished package during production.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALLERGEN_OPTIONS.map((allergen) => {
                const isNone = allergen === "None";
                // "None" is checked when no real allergens are selected
                const checked = isNone
                  ? form.declaredAllergens.length === 0 || form.declaredAllergens.includes("None")
                  : form.declaredAllergens.includes(allergen);
                return (
                  <label key={allergen} className="flex items-center gap-2 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[#D64D4D]"
                      checked={checked}
                      onChange={(e) => {
                        if (isNone) {
                          // Selecting "None" clears all real allergens
                          sf({ declaredAllergens: e.target.checked ? [] : form.declaredAllergens });
                        } else {
                          const current = form.declaredAllergens.filter((a) => a !== "None");
                          if (e.target.checked) {
                            sf({ declaredAllergens: [...current, allergen] });
                          } else {
                            sf({ declaredAllergens: current.filter((a) => a !== allergen) });
                          }
                        }
                      }}
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{allergen}</span>
                  </label>
                );
              })}
            </div>
            {form.declaredAllergens.length > 0 && !form.declaredAllergens.includes("None") && (
              <p className="text-xs text-[#D64D4D] font-mono font-semibold">
                Declared: {form.declaredAllergens.join(", ")}
              </p>
            )}
            {(form.declaredAllergens.length === 0 || form.declaredAllergens.includes("None")) && (
              <p className="text-xs text-gray-400 font-mono">No allergens declared — product is allergen-free.</p>
            )}
          </div>

          {/* ── Dynamic EOP Fields ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-mono">
                Define additional fields supervisors fill out at end of production. Drag to reorder.
              </p>
              <button type="button" onClick={addEopField}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Field
              </button>
            </div>

          {form.endOfProductionFields.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">No fields added yet. Click &quot;Add Field&quot;.</p>
          ) : (
            <div className="space-y-2">
              {form.endOfProductionFields.map((field, idx) => (
                <div
                  key={field.id}
                  draggable
                  onDragStart={() => onEopDragStart(idx)}
                  onDragOver={(e) => onEopDragOver(e, idx)}
                  onDragEnd={onEopDragEnd}
                  className={cn(
                    "border border-gray-200 rounded-lg p-3 bg-gray-50/40 flex flex-wrap items-center gap-3 transition-opacity",
                    eopDragIdx.current === idx && "opacity-50"
                  )}
                >
                  {/* Drag handle */}
                  <GripVertical className="w-4 h-4 text-gray-300 cursor-grab shrink-0" />

                  {/* Field Label */}
                  <div className="flex-1 min-w-[160px]">
                    <label className="label text-[10px]">Field Label</label>
                    <input
                      className="input"
                      value={field.label}
                      placeholder="e.g. Total Boxes Made"
                      onChange={(e) => updateEopField(field.id, { label: e.target.value })}
                    />
                  </div>

                  {/* Field Type */}
                  <div className="w-32">
                    <label className="label text-[10px]">Field Type</label>
                    <select
                      className="input"
                      value={field.field_type}
                      onChange={(e) => updateEopField(field.id, { field_type: e.target.value as EopField["field_type"] })}
                    >
                      {eopFieldTypeOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Required toggle */}
                  <div className="flex flex-col gap-1">
                    <label className="label text-[10px]">Required?</label>
                    <button
                      type="button"
                      onClick={() => updateEopField(field.id, { required: !field.required })}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                        field.required
                          ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                          : "bg-gray-100 text-gray-500 border-gray-200 hover:border-gray-400"
                      )}
                    >
                      {field.required ? "Required" : "Optional"}
                    </button>
                  </div>

                  {/* Delete */}
                  <div className="flex items-end pb-0.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => removeEopField(field.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>{/* end dynamic EOP fields */}
        </div>
      </Section>

      {/* Section H — Release Checklist Items */}
      <Section label="H" title="Release Checklist Items" isOpen={open.H} isComplete={sectionComplete.H} onToggle={() => toggleSection("H")}>
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={addChecklist} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>
          {form.releaseChecklistItems.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono">No checklist items added yet.</p>
          ) : (
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
          )}
        </div>
      </Section>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button type="button" onClick={() => handleSave(false)} disabled={saving} className="btn-primary px-6">
          {saving ? "Saving…" : "Save Template"}
        </button>
        <button type="button" onClick={() => handleSave(true)} disabled={saving} className="btn-secondary">
          Save as Draft
        </button>
        <button type="button" onClick={() => router.push("/dashboard/admin/batch-sheet-templates")}
          disabled={saving} className="btn-secondary">
          Cancel
        </button>
        {errors.submit && (
          <p className="text-sm text-red-600 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> {errors.submit}
          </p>
        )}
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
