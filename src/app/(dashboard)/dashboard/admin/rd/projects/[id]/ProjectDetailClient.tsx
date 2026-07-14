"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TabBar } from "@/components/ui/TabBar";

// ---- Types ----

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  description: string | null;
  uploadedById: string;
  uploadedAt: string;
}

interface Evaluation {
  id: string;
  evaluatorName: string;
  evaluationDate: string;
  ratingAppearance: number | null;
  ratingAroma: number | null;
  ratingTexture: number | null;
  ratingSweetness: number | null;
  ratingFlavorIntensity: number | null;
  ratingOverall: number | null;
  notes: string | null;
  recommendation: string | null;
}

interface IngredientRow {
  id: string;
  ingredientType: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
}

interface Iteration {
  id: string;
  iterationNumber: number;
  datePerformed: string;
  performedBy: string;
  batchSize: string | null;
  status: string;
  changesFromPrior: string | null;
  processNotes: string | null;
  outcome: string | null;
  nextSteps: string | null;
  recipe: IngredientRow[];
  actualCalories: number | null;
  actualFat: number | null;
  actualSaturatedFat: number | null;
  actualCarbs: number | null;
  actualFiber: number | null;
  actualSugars: number | null;
  actualAddedSugars: number | null;
  actualProtein: number | null;
  actualSodium: number | null;
  evaluations: Evaluation[];
  attachments: Attachment[];
}

interface Project {
  id: string;
  name: string;
  productType: string;
  description: string | null;
  targetServingSize: string | null;
  startedDate: string | null;
  targetLaunchDate: string | null;
  status: string;
  createdBy: { name: string | null };
  iterations: Iteration[];
  targetCalories: number | null;
  targetCaloriesTolerance: string | null;
  targetFat: number | null;
  targetFatTolerance: string | null;
  targetSaturatedFat: number | null;
  targetSaturatedFatTolerance: string | null;
  targetCarbs: number | null;
  targetCarbsTolerance: string | null;
  targetFiber: number | null;
  targetFiberTolerance: string | null;
  targetSugars: number | null;
  targetSugarsTolerance: string | null;
  targetAddedSugars: number | null;
  targetAddedSugarsTolerance: string | null;
  targetProtein: number | null;
  targetProteinTolerance: string | null;
  targetSodium: number | null;
  targetSodiumTolerance: string | null;
}

// ---- Constants ----

const STATUS_OPTIONS = [
  { value: "concept", label: "Concept" },
  { value: "in_development", label: "In Development" },
  { value: "testing", label: "Testing" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "closed_launched", label: "Closed — Product Launched" },
  { value: "closed_discontinued", label: "Closed — Discontinued" },
];

const NUTRIENTS: {
  label: string;
  targetField: keyof Project;
  tolField: keyof Project;
  actualField: keyof Iteration;
  unit: string;
}[] = [
  { label: "Calories", targetField: "targetCalories", tolField: "targetCaloriesTolerance", actualField: "actualCalories", unit: "kcal" },
  { label: "Total Fat", targetField: "targetFat", tolField: "targetFatTolerance", actualField: "actualFat", unit: "g" },
  { label: "Saturated Fat", targetField: "targetSaturatedFat", tolField: "targetSaturatedFatTolerance", actualField: "actualSaturatedFat", unit: "g" },
  { label: "Total Carbohydrate", targetField: "targetCarbs", tolField: "targetCarbsTolerance", actualField: "actualCarbs", unit: "g" },
  { label: "Dietary Fiber", targetField: "targetFiber", tolField: "targetFiberTolerance", actualField: "actualFiber", unit: "g" },
  { label: "Total Sugars", targetField: "targetSugars", tolField: "targetSugarsTolerance", actualField: "actualSugars", unit: "g" },
  { label: "Added Sugars", targetField: "targetAddedSugars", tolField: "targetAddedSugarsTolerance", actualField: "actualAddedSugars", unit: "g" },
  { label: "Protein", targetField: "targetProtein", tolField: "targetProteinTolerance", actualField: "actualProtein", unit: "g" },
  { label: "Sodium", targetField: "targetSodium", tolField: "targetSodiumTolerance", actualField: "actualSodium", unit: "mg" },
];

const WEIGHT_UNITS: Record<string, number> = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 };

// ---- Helpers ----

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateShort(d: string): string {
  const date = new Date(d);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function avgOverall(evals: Evaluation[]): number | null {
  if (!evals.length) return null;
  const scores = evals.map((e) => e.ratingOverall).filter((s): s is number => s !== null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

function avgAttribute(evals: Evaluation[], attr: keyof Evaluation): number | null {
  if (!evals.length) return null;
  const scores = evals.map((e) => e[attr] as number | null).filter((s): s is number => s !== null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

function fmtFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toleranceSymbol(tol: string | null): string {
  if (tol === "min") return "≥";
  if (tol === "max") return "≤";
  if (tol === "approx") return "~";
  if (tol === "exact") return "=";
  return "";
}

function computeNutritionStatus(actual: number | null, target: number | null, tol: string | null): { label: string; color: string } {
  if (actual === null) return { label: "— Not entered", color: "text-gray-400" };
  if (target === null) return { label: String(actual), color: "text-gray-700" };
  const diff = actual - target;
  const pct = target !== 0 ? Math.abs(diff) / target : 0;
  if (tol === "min") {
    return actual >= target
      ? { label: "✓ On target", color: "text-green-600" }
      : { label: `✗ Below by ${Math.abs(diff).toFixed(1)}`, color: "text-red-600" };
  }
  if (tol === "max") {
    return actual <= target
      ? { label: "✓ On target", color: "text-green-600" }
      : { label: `✗ Above by ${Math.abs(diff).toFixed(1)}`, color: "text-red-600" };
  }
  if (tol === "approx") {
    return pct <= 0.1
      ? { label: "✓ On target", color: "text-green-600" }
      : { label: `✗ ${diff > 0 ? "+" : ""}${diff.toFixed(1)} (${(pct * 100).toFixed(0)}% off)`, color: "text-red-600" };
  }
  if (tol === "exact") {
    return actual === target
      ? { label: "✓ Exact", color: "text-green-600" }
      : { label: `✗ ${diff > 0 ? "+" : ""}${diff.toFixed(1)}`, color: "text-red-600" };
  }
  return { label: String(actual), color: "text-gray-700" };
}

function totalWeightGrams(ingredients: IngredientRow[]): number {
  let total = 0;
  for (const ing of ingredients) {
    if (!ing.quantity || !ing.unit) continue;
    const factor = WEIGHT_UNITS[ing.unit.toLowerCase()];
    if (factor) total += ing.quantity * factor;
  }
  return total;
}

// ---- Sub-components ----

function StatusBadge({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const map: Record<string, string> = {
    concept: "bg-gray-100 text-gray-700",
    in_development: "bg-blue-100 text-blue-700",
    testing: "bg-amber-100 text-amber-700",
    pending_approval: "bg-purple-100 text-purple-700",
    closed_launched: "bg-green-100 text-green-700",
    closed_discontinued: "bg-red-100 text-red-700",
    in_progress: "bg-blue-100 text-blue-700",
    complete: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
  const cls = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";
  return (
    <span className={`${cls} rounded-full font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {label}
    </span>
  );
}

function ProductTypeBadge({ type }: { type: string }) {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
      {label}
    </span>
  );
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-gray-400 text-sm">—</span>;
  const r = Math.round(rating);
  return (
    <span className="text-amber-500 font-mono text-sm">
      {"★".repeat(r)}{"☆".repeat(5 - r)}
      <span className="ml-1 text-gray-600 text-xs">{rating.toFixed(1)}</span>
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="text-xl leading-none"
        >
          <span className={(hover || value) >= n ? "text-amber-500" : "text-gray-300"}>★</span>
        </button>
      ))}
    </div>
  );
}

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

// ---- New Ingredient Row ----

interface IngredientRowInput {
  ingredientType: string;
  name: string;
  quantity: string;
  unit: string;
  notes: string;
}

interface IngredientOption {
  name: string;
  unit: string;
}

const UNIT_OPTIONS = ["g", "kg", "lb", "oz", "ml", "L", "tsp", "tbsp", "cup", "unit"];

function IngredientTable({
  rows,
  onChange,
  materialOptions = [],
  rdIngredientOptions = [],
}: {
  rows: IngredientRowInput[];
  onChange: (rows: IngredientRowInput[]) => void;
  materialOptions?: IngredientOption[];
  rdIngredientOptions?: IngredientOption[];
}) {
  function updateRows(i: number, updates: Partial<IngredientRowInput>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...updates } : r));
    onChange(next);
  }
  function handleNameChange(i: number, value: string) {
    const opts = rows[i].ingredientType === "material" ? materialOptions : rdIngredientOptions;
    const match = opts.find((o) => o.name.toLowerCase() === value.toLowerCase());
    updateRows(i, { name: value, ...(match ? { unit: match.unit || "g" } : {}) });
  }
  function handleTypeChange(i: number, value: string) {
    updateRows(i, { ingredientType: value, name: "", unit: "g" });
  }
  function addRow() {
    onChange([...rows, { ingredientType: "material", name: "", quantity: "", unit: "g", notes: "" }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[120px_1fr_80px_80px_1fr_32px] gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
        <span>Source</span>
        <span>Ingredient</span>
        <span>Qty</span>
        <span>Unit</span>
        <span>Notes</span>
        <span></span>
      </div>
      {rows.map((row, i) => {
        const opts = row.ingredientType === "material" ? materialOptions : rdIngredientOptions;
        const dlId = `ing-dl-${i}`;
        return (
          <div key={i} className="grid grid-cols-[120px_1fr_80px_80px_1fr_32px] gap-2 items-center">
            <select
              value={row.ingredientType}
              onChange={(e) => handleTypeChange(i, e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
            >
              <option value="material">Material</option>
              <option value="rd_ingredient">R&D Ingredient</option>
            </select>
            <div className="relative">
              <input
                type="text"
                list={dlId}
                value={row.name}
                onChange={(e) => handleNameChange(i, e.target.value)}
                placeholder={opts.length ? "Type to search…" : "Name"}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
              />
              <datalist id={dlId}>
                {opts.map((o, j) => <option key={j} value={o.name} />)}
              </datalist>
            </div>
            <input
              type="number"
              min="0"
              step="any"
              value={row.quantity}
              onChange={(e) => updateRows(i, { quantity: e.target.value })}
              placeholder="0"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
            />
            <select
              value={row.unit}
              onChange={(e) => updateRows(i, { unit: e.target.value })}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
            >
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input
              type="text"
              value={row.notes}
              onChange={(e) => updateRows(i, { notes: e.target.value })}
              placeholder="Notes"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-gray-400 hover:text-red-500 text-lg leading-none"
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        className="text-sm text-[#C41E3A] hover:underline mt-1"
      >
        + Add ingredient
      </button>
    </div>
  );
}

// ---- New Iteration Form ----

interface NewIterationFormProps {
  projectId: string;
  iterationNumber: number;
  onClose: () => void;
  onSaved: () => void;
  prefill?: Iteration | null;
}

function NewIterationForm({ projectId, iterationNumber, onClose, onSaved, prefill }: NewIterationFormProps) {
  const { data: session } = useSession();
  const [datePerformed, setDatePerformed] = useState(prefill?.datePerformed?.split("T")[0] ?? new Date().toISOString().split("T")[0]);
  const [performedBy, setPerformedBy] = useState(prefill?.performedBy ?? "");
  const [batchSize, setBatchSize] = useState(prefill?.batchSize ?? "");
  const [status, setStatus] = useState(prefill?.status ?? "in_progress");
  const [changesFromPrior, setChangesFromPrior] = useState(prefill?.changesFromPrior ?? "");
  const [processNotes, setProcessNotes] = useState(prefill?.processNotes ?? "");
  const [outcome, setOutcome] = useState(prefill?.outcome ?? "");
  const [nextSteps, setNextSteps] = useState(prefill?.nextSteps ?? "");
  const [ingredientRows, setIngredientRows] = useState<IngredientRowInput[]>(
    prefill?.recipe?.map((ing) => ({
      ingredientType: ing.ingredientType,
      name: ing.name,
      quantity: String(ing.quantity ?? ""),
      unit: ing.unit ?? "g",
      notes: ing.notes ?? "",
    })) ?? [{ ingredientType: "material", name: "", quantity: "", unit: "g", notes: "" }]
  );
  const [materialOptions, setMaterialOptions] = useState<IngredientOption[]>([]);
  const [rdIngredientOptions, setRdIngredientOptions] = useState<IngredientOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/supplier-management/materials")
      .then((r) => r.json())
      .then((data: { name: string; unit?: string }[]) =>
        setMaterialOptions(Array.isArray(data) ? data.map((m) => ({ name: m.name, unit: m.unit ?? "g" })) : [])
      )
      .catch(() => {});
    fetch("/api/rd/ingredients")
      .then((r) => r.json())
      .then((data: { name: string; unit: string }[]) =>
        setRdIngredientOptions(Array.isArray(data) ? data.map((i) => ({ name: i.name, unit: i.unit })) : [])
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!prefill && !performedBy && session?.user?.name) {
      setPerformedBy(session.user.name);
    }
  }, [session?.user?.name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        datePerformed,
        performedBy,
        batchSize: batchSize || null,
        status,
        changesFromPrior: changesFromPrior || null,
        processNotes: processNotes || null,
        outcome: outcome || null,
        nextSteps: nextSteps || null,
        recipe: ingredientRows
          .filter((r) => r.name.trim())
          .map((r) => ({
            ingredientType: r.ingredientType,
            name: r.name,
            quantity: r.quantity ? parseFloat(r.quantity) : null,
            unit: r.unit || null,
            notes: r.notes || null,
          })),
      };
      const method = prefill ? "PUT" : "POST";
      const url = prefill
        ? `/api/rd/iterations/${prefill.id}`
        : `/api/rd/projects/${projectId}/iterations`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save iteration");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4 border-l-4 border-l-[#C41E3A]">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        {prefill ? `Edit Iteration ${prefill.iterationNumber}` : `New Iteration #${iterationNumber}`}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Date Performed <span className="text-red-500">*</span></label>
          <input type="date" required value={datePerformed} onChange={(e) => setDatePerformed(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Performed By <span className="text-red-500">*</span></label>
          <input type="text" required value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} className={inputClass} placeholder="Name" />
        </div>
        <div>
          <label className={labelClass}>Batch Size</label>
          <input type="text" value={batchSize} onChange={(e) => setBatchSize(e.target.value)} className={inputClass} placeholder="e.g. 2 kg" />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Recipe / Ingredients</label>
        <IngredientTable
          rows={ingredientRows}
          onChange={setIngredientRows}
          materialOptions={materialOptions}
          rdIngredientOptions={rdIngredientOptions}
        />
      </div>

      {iterationNumber > 1 && (
        <div>
          <label className={labelClass}>Changes from Prior Iteration</label>
          <textarea rows={2} value={changesFromPrior} onChange={(e) => setChangesFromPrior(e.target.value)} className={inputClass} />
        </div>
      )}
      <div>
        <label className={labelClass}>Process Notes</label>
        <textarea rows={2} value={processNotes} onChange={(e) => setProcessNotes(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Outcome</label>
        <textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Next Steps</label>
        <textarea rows={2} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} className={inputClass} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting} className="bg-[#C41E3A] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#A01830] transition-colors disabled:opacity-50">
          {submitting ? "Saving…" : prefill ? "Save Changes" : "Add Iteration"}
        </button>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </form>
  );
}

// ---- Evaluation Form ----

function EvaluationForm({ iterationId, onClose, onSaved }: { iterationId: string; onClose: () => void; onSaved: () => void }) {
  const [evaluatorName, setEvaluatorName] = useState("");
  const [evaluationDate, setEvaluationDate] = useState(new Date().toISOString().split("T")[0]);
  const [ratings, setRatings] = useState({ appearance: 0, aroma: 0, texture: 0, sweetness: 0, flavorIntensity: 0, overall: 0 });
  const [notes, setNotes] = useState("");
  const [recommendation, setRecommendation] = useState("needs_minor_adjustments");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setRating(attr: keyof typeof ratings, v: number) {
    setRatings((prev) => ({ ...prev, [attr]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/rd/iterations/${iterationId}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluatorName,
          evaluationDate,
          ratingAppearance: ratings.appearance || null,
          ratingAroma: ratings.aroma || null,
          ratingTexture: ratings.texture || null,
          ratingSweetness: ratings.sweetness || null,
          ratingFlavorIntensity: ratings.flavorIntensity || null,
          ratingOverall: ratings.overall || null,
          notes: notes || null,
          recommendation,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save evaluation");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const RATING_ATTRS: { key: keyof typeof ratings; label: string }[] = [
    { key: "appearance", label: "Appearance" },
    { key: "aroma", label: "Aroma" },
    { key: "texture", label: "Texture" },
    { key: "sweetness", label: "Sweetness" },
    { key: "flavorIntensity", label: "Flavor Intensity" },
    { key: "overall", label: "Overall" },
  ];

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4 border-l-4 border-l-blue-500 mt-4">
      <h4 className="text-sm font-semibold text-gray-700">Add Evaluation</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Evaluator Name <span className="text-red-500">*</span></label>
          <input type="text" required value={evaluatorName} onChange={(e) => setEvaluatorName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Date <span className="text-red-500">*</span></label>
          <input type="date" required value={evaluationDate} onChange={(e) => setEvaluationDate(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="space-y-3">
        {RATING_ATTRS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-4">
            <span className="w-36 text-sm text-gray-700 shrink-0">{label}</span>
            <StarPicker value={ratings[key]} onChange={(v) => setRating(key, v)} />
          </div>
        ))}
      </div>
      <div>
        <label className={labelClass}>Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Recommendation</label>
        <div className="space-y-2">
          {[
            { value: "needs_significant_changes", label: "Needs Significant Changes" },
            { value: "needs_minor_adjustments", label: "Needs Minor Adjustments" },
            { value: "ready_for_next_phase", label: "Ready for Next Phase" },
            { value: "approve_this_version", label: "Approve This Version" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="recommendation" value={opt.value} checked={recommendation === opt.value} onChange={() => setRecommendation(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting} className="bg-[#C41E3A] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#A01830] transition-colors disabled:opacity-50">
          {submitting ? "Saving…" : "Save Evaluation"}
        </button>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </form>
  );
}

// ---- Nutritional Actuals Form ----

function NutritionalActualsForm({ iter, onClose, onSaved }: { iter: Iteration; onClose: () => void; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({
    actualCalories: String(iter.actualCalories ?? ""),
    actualFat: String(iter.actualFat ?? ""),
    actualSaturatedFat: String(iter.actualSaturatedFat ?? ""),
    actualCarbs: String(iter.actualCarbs ?? ""),
    actualFiber: String(iter.actualFiber ?? ""),
    actualSugars: String(iter.actualSugars ?? ""),
    actualAddedSugars: String(iter.actualAddedSugars ?? ""),
    actualProtein: String(iter.actualProtein ?? ""),
    actualSodium: String(iter.actualSodium ?? ""),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(vals)) {
        payload[k] = v !== "" ? parseFloat(v) : null;
      }
      const res = await fetch(`/api/rd/iterations/${iter.id}/nutrition`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const ACTUAL_FIELDS: { label: string; field: string; unit: string }[] = [
    { label: "Calories", field: "actualCalories", unit: "kcal" },
    { label: "Total Fat", field: "actualFat", unit: "g" },
    { label: "Saturated Fat", field: "actualSaturatedFat", unit: "g" },
    { label: "Total Carbohydrate", field: "actualCarbs", unit: "g" },
    { label: "Dietary Fiber", field: "actualFiber", unit: "g" },
    { label: "Total Sugars", field: "actualSugars", unit: "g" },
    { label: "Added Sugars", field: "actualAddedSugars", unit: "g" },
    { label: "Protein", field: "actualProtein", unit: "g" },
    { label: "Sodium", field: "actualSodium", unit: "mg" },
  ];

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4 border-l-4 border-l-green-500 mt-4">
      <h4 className="text-sm font-semibold text-gray-700">Edit Nutritional Actuals</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ACTUAL_FIELDS.map(({ label, field, unit }) => (
          <div key={field}>
            <label className={labelClass}>{label} <span className="text-gray-400 font-mono text-xs">({unit})</span></label>
            <input
              type="number"
              min="0"
              step="any"
              value={vals[field]}
              onChange={(e) => setVals((prev) => ({ ...prev, [field]: e.target.value }))}
              placeholder="—"
              className={inputClass}
            />
          </div>
        ))}
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting} className="bg-[#C41E3A] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#A01830] transition-colors disabled:opacity-50">
          {submitting ? "Saving…" : "Save Actuals"}
        </button>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </form>
  );
}

// ---- Recipe Tab ----

function RecipeTab({ iter, projectId, onSaved }: { iter: Iteration; projectId: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const totalG = totalWeightGrams(iter.recipe ?? []);
  const totalLabel = totalG >= 1000 ? `${(totalG / 1000).toFixed(2)} kg` : `${totalG.toFixed(1)} g`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span><span className="font-medium">Performed by:</span> {iter.performedBy}</span>
        {iter.batchSize && <span><span className="font-medium">Batch size:</span> {iter.batchSize}</span>}
      </div>

      {(iter.recipe?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ingredient</th>
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
                <th className="text-right py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
              </tr>
            </thead>
            <tbody>
              {iter.recipe.map((ing) => (
                <tr key={ing.id} className="border-b border-gray-50">
                  <td className="py-2 pr-3 font-medium text-gray-900">{ing.name}</td>
                  <td className="py-2 pr-3">
                    {ing.ingredientType === "rd_ingredient" ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">R&D</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Materials</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">{ing.quantity ?? "—"}</td>
                  <td className="py-2 pr-3 text-gray-600">{ing.unit ?? "—"}</td>
                  <td className="py-2 text-gray-500">{ing.notes ?? "—"}</td>
                </tr>
              ))}
              {totalG > 0 && (
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={2} className="py-2 pr-3 font-semibold text-gray-700">Total Weight</td>
                  <td colSpan={3} className="py-2 font-mono font-semibold text-gray-900">{totalLabel}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No ingredients recorded.</p>
      )}

      {iter.changesFromPrior && iter.iterationNumber > 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Changes from prior</p>
          <p className="text-sm text-amber-800">{iter.changesFromPrior}</p>
        </div>
      )}
      {iter.processNotes && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Process Notes</p>
          <p className="text-sm text-gray-700">{iter.processNotes}</p>
        </div>
      )}
      {iter.outcome && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Outcome</p>
          <p className="text-sm text-gray-700">{iter.outcome}</p>
        </div>
      )}
      {iter.nextSteps && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Next Steps</p>
          <p className="text-sm text-gray-700">{iter.nextSteps}</p>
        </div>
      )}

      {editing ? (
        <NewIterationForm
          projectId={projectId}
          iterationNumber={iter.iterationNumber}
          prefill={iter}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      ) : (
        <button onClick={() => setEditing(true)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 mt-2">
          Edit Iteration
        </button>
      )}
    </div>
  );
}

// ---- Sensory Tab ----

function SensoryTab({ iter, onSaved }: { iter: Iteration; onSaved: () => void }) {
  const [showForm, setShowForm] = useState(false);

  const SENSORY_ATTRS: { key: keyof Evaluation; label: string }[] = [
    { key: "ratingAppearance", label: "Appearance" },
    { key: "ratingAroma", label: "Aroma" },
    { key: "ratingTexture", label: "Texture" },
    { key: "ratingSweetness", label: "Sweetness" },
    { key: "ratingFlavorIntensity", label: "Flavor Intensity" },
    { key: "ratingOverall", label: "Overall" },
  ];

  const recCounts: Record<string, number> = {};
  for (const ev of iter.evaluations) {
    if (ev.recommendation) recCounts[ev.recommendation] = (recCounts[ev.recommendation] ?? 0) + 1;
  }

  return (
    <div className="space-y-5">
      {iter.evaluations.length > 0 && (
        <>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Aggregate Scores</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SENSORY_ATTRS.map(({ key, label }) => {
                const avg = avgAttribute(iter.evaluations, key);
                return (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <Stars rating={avg} />
                  </div>
                );
              })}
            </div>
          </div>

          {Object.keys(recCounts).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommendations</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(recCounts).map(([rec, count]) => (
                  <span key={rec} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                    {rec.replace(/_/g, " ")} ({count})
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Individual Evaluations</p>
            {iter.evaluations.map((ev) => (
              <div key={ev.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-gray-900">{ev.evaluatorName}</span>
                  <span className="text-xs text-gray-400 font-mono">{fmtDate(ev.evaluationDate)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SENSORY_ATTRS.map(({ key, label }) => (
                    <div key={key}>
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <Stars rating={ev[key] as number | null} />
                    </div>
                  ))}
                </div>
                {ev.notes && <p className="text-sm text-gray-600">{ev.notes}</p>}
                {ev.recommendation && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                    {ev.recommendation.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {iter.evaluations.length === 0 && !showForm && (
        <p className="text-sm text-gray-400 italic">No evaluations yet.</p>
      )}

      {showForm ? (
        <EvaluationForm iterationId={iter.id} onClose={() => setShowForm(false)} onSaved={onSaved} />
      ) : (
        <button onClick={() => setShowForm(true)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50">
          + Add Evaluation
        </button>
      )}
    </div>
  );
}

// ---- Nutritional Tab ----

function NutritionalTab({ iter, project }: { iter: Iteration; project: Project }) {
  const [editingActuals, setEditingActuals] = useState(false);
  const router = useRouter();

  const hasTargets = NUTRIENTS.some((n) => project[n.targetField] !== null);

  return (
    <div className="space-y-4">
      {hasTargets ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nutrient</th>
                <th className="text-right py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                <th className="text-right py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</th>
                <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {NUTRIENTS.map(({ label, targetField, tolField, actualField, unit }) => {
                const target = project[targetField] as number | null;
                const tol = project[tolField] as string | null;
                const actual = iter[actualField] as number | null;
                const { label: statusLabel, color } = computeNutritionStatus(actual, target, tol);
                return (
                  <tr key={targetField} className="border-b border-gray-50">
                    <td className="py-2 pr-3 text-gray-700">{label} <span className="text-gray-400 text-xs">({unit})</span></td>
                    <td className="py-2 pr-3 text-right font-mono text-gray-600">
                      {target !== null ? `${toleranceSymbol(tol)} ${target}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-gray-900">
                      {actual !== null ? actual : "—"}
                    </td>
                    <td className={`py-2 text-xs ${color}`}>{statusLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No nutritional targets set for this project.</p>
      )}

      {editingActuals ? (
        <NutritionalActualsForm
          iter={iter}
          onClose={() => setEditingActuals(false)}
          onSaved={() => { router.refresh(); setEditingActuals(false); }}
        />
      ) : (
        <button onClick={() => setEditingActuals(true)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50">
          Edit Nutritional Actuals
        </button>
      )}
    </div>
  );
}

// ---- Files Tab ----

function FilesTab({ iter, onSaved }: { iter: Iteration; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("description", description);
        await fetch(`/api/rd/iterations/${iter.id}/attachments`, { method: "POST", body: fd });
      }
      onSaved();
      setDescription("");
    } finally {
      setUploading(false);
    }
  }

  async function deleteAttachment(id: string) {
    if (!confirm("Delete this file?")) return;
    await fetch(`/api/rd/attachments/${id}`, { method: "DELETE" });
    onSaved();
  }

  const isImage = (mime: string | null) => mime?.startsWith("image/") ?? false;

  return (
    <div className="space-y-4">
      {iter.attachments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">File</th>
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded</th>
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {iter.attachments.map((att) => (
                <tr key={att.id} className="border-b border-gray-50">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      {isImage(att.mimeType) && (
                        <img src={att.fileUrl} alt={att.fileName} className="w-8 h-8 object-cover rounded" />
                      )}
                      <span className="font-medium text-gray-900 truncate max-w-[200px]">{att.fileName}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-gray-500 font-mono text-xs">{fmtFileSize(att.fileSize)}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{fmtDate(att.uploadedAt)}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{att.description ?? "—"}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">View</a>
                      <button onClick={() => deleteAttachment(att.id)} className="text-red-500 hover:underline text-xs">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {iter.attachments.length === 0 && <p className="text-sm text-gray-400 italic">No files uploaded yet.</p>}

      <div className="space-y-2">
        <div>
          <label className={labelClass}>Description (optional)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="Label for this upload" />
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-colors ${dragOver ? "border-[#C41E3A] bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
        >
          <p className="text-sm text-gray-500">{uploading ? "Uploading…" : "Drag & drop files here, or click to select"}</p>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP, PDF, DOC, DOCX</p>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
            multiple
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
        </div>
      </div>
    </div>
  );
}

// ---- Iteration Card ----

function IterationCard({
  iter,
  project,
  expanded,
  activeTab,
  onToggle,
  onTabChange,
  onSaved,
}: {
  iter: Iteration;
  project: Project;
  expanded: boolean;
  activeTab: string;
  onToggle: () => void;
  onTabChange: (tab: string) => void;
  onSaved: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={cardRef} id={`iter-${iter.id}`} className="card overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50">
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
        <span className="font-semibold text-gray-900">Iteration {iter.iterationNumber}</span>
        <span className="text-sm text-gray-500">{fmtDate(iter.datePerformed)} · {iter.performedBy}</span>
        <StatusBadge status={iter.status} size="sm" />
        {avgOverall(iter.evaluations) !== null && (
          <span className="ml-auto text-sm text-amber-600">★ {avgOverall(iter.evaluations)!.toFixed(1)} avg</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          <TabBar
            tabs={[
              { id: "recipe", label: "Recipe" },
              { id: "sensory", label: "Sensory", badge: iter.evaluations.length > 0 ? iter.evaluations.length : null },
              { id: "nutritional", label: "Nutritional" },
              { id: "files", label: "Files", badge: iter.attachments.length > 0 ? iter.attachments.length : null },
            ]}
            activeTab={activeTab}
            onChange={onTabChange}
          />
          <div>
            {activeTab === "recipe" && <RecipeTab iter={iter} projectId={project.id} onSaved={onSaved} />}
            {activeTab === "sensory" && <SensoryTab iter={iter} onSaved={onSaved} />}
            {activeTab === "nutritional" && <NutritionalTab iter={iter} project={project} />}
            {activeTab === "files" && <FilesTab iter={iter} onSaved={onSaved} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Compare Display ----

interface CompareResult {
  iter1: { number: number; ingredients: IngredientRow[]; evaluations: Evaluation[]; actuals: Record<string, number | null> };
  iter2: { number: number; ingredients: IngredientRow[]; evaluations: Evaluation[]; actuals: Record<string, number | null> };
}

function CompareDisplay({ result, project }: { result: CompareResult; project: Project }) {
  const names1 = new Set(result.iter1.ingredients.map((i) => i.name.toLowerCase()));
  const names2 = new Set(result.iter2.ingredients.map((i) => i.name.toLowerCase()));
  const allNames = Array.from(new Set([...result.iter1.ingredients.map((i) => i.name), ...result.iter2.ingredients.map((i) => i.name)]));

  const SENSORY_KEYS: { key: keyof Evaluation; label: string }[] = [
    { key: "ratingAppearance", label: "Appearance" },
    { key: "ratingAroma", label: "Aroma" },
    { key: "ratingTexture", label: "Texture" },
    { key: "ratingSweetness", label: "Sweetness" },
    { key: "ratingFlavorIntensity", label: "Flavor Intensity" },
    { key: "ratingOverall", label: "Overall" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recipe Diff</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500">Ingredient</th>
                <th className="text-right py-2 pr-3 text-xs font-semibold text-gray-500">Iter {result.iter1.number}</th>
                <th className="text-right py-2 text-xs font-semibold text-gray-500">Iter {result.iter2.number}</th>
              </tr>
            </thead>
            <tbody>
              {allNames.map((name) => {
                const i1 = result.iter1.ingredients.find((i) => i.name.toLowerCase() === name.toLowerCase());
                const i2 = result.iter2.ingredients.find((i) => i.name.toLowerCase() === name.toLowerCase());
                const rowColor = !i1 ? "bg-green-50" : !i2 ? "bg-red-50" : i1.quantity !== i2.quantity ? "bg-amber-50" : "";
                return (
                  <tr key={name} className={`border-b border-gray-50 ${rowColor}`}>
                    <td className="py-2 pr-3 text-gray-900">{name}</td>
                    <td className="py-2 pr-3 text-right font-mono text-gray-600">
                      {i1 ? `${i1.quantity ?? "—"} ${i1.unit ?? ""}` : <span className="text-red-400">removed</span>}
                    </td>
                    <td className="py-2 text-right font-mono text-gray-600">
                      {i2 ? `${i2.quantity ?? "—"} ${i2.unit ?? ""}` : <span className="text-green-400">added</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(result.iter1.evaluations.length > 0 || result.iter2.evaluations.length > 0) && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sensory Comparison</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500">Attribute</th>
                <th className="text-right py-2 pr-3 text-xs font-semibold text-gray-500">Iter {result.iter1.number}</th>
                <th className="text-right py-2 pr-3 text-xs font-semibold text-gray-500">Iter {result.iter2.number}</th>
                <th className="text-right py-2 text-xs font-semibold text-gray-500">Delta</th>
              </tr>
            </thead>
            <tbody>
              {SENSORY_KEYS.map(({ key, label }) => {
                const a1 = avgAttribute(result.iter1.evaluations, key);
                const a2 = avgAttribute(result.iter2.evaluations, key);
                const delta = a1 !== null && a2 !== null ? a2 - a1 : null;
                return (
                  <tr key={key} className="border-b border-gray-50">
                    <td className="py-2 pr-3 text-gray-700">{label}</td>
                    <td className="py-2 pr-3 text-right font-mono">{a1 !== null ? a1.toFixed(1) : "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{a2 !== null ? a2.toFixed(1) : "—"}</td>
                    <td className={`py-2 text-right font-mono text-xs ${delta !== null ? (delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-gray-400") : "text-gray-400"}`}>
                      {delta !== null ? `${delta > 0 ? "▲" : delta < 0 ? "▼" : ""}${Math.abs(delta).toFixed(1)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Main Component ----

export default function ProjectDetailClient({ project: initialProject, userId }: { project: Project; userId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project>(initialProject);
  const [expandedIterations, setExpandedIterations] = useState<Set<string>>(new Set());
  const [activeIterationTab, setActiveIterationTab] = useState<Record<string, string>>({});
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showNewIterationForm, setShowNewIterationForm] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareIter1, setCompareIter1] = useState("");
  const [compareIter2, setCompareIter2] = useState("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [showNutritionExpanded, setShowNutritionExpanded] = useState(false);
  const [editingProject, setEditingProject] = useState(false);

  const [editForm, setEditForm] = useState({
    name: project.name,
    productType: project.productType,
    description: project.description ?? "",
    targetServingSize: project.targetServingSize ?? "",
    startedDate: project.startedDate?.split("T")[0] ?? "",
    targetLaunchDate: project.targetLaunchDate?.split("T")[0] ?? "",
    targetCalories: String(project.targetCalories ?? ""),
    targetCaloriesTolerance: project.targetCaloriesTolerance ?? "",
    targetFat: String(project.targetFat ?? ""),
    targetFatTolerance: project.targetFatTolerance ?? "",
    targetSaturatedFat: String(project.targetSaturatedFat ?? ""),
    targetSaturatedFatTolerance: project.targetSaturatedFatTolerance ?? "",
    targetCarbs: String(project.targetCarbs ?? ""),
    targetCarbsTolerance: project.targetCarbsTolerance ?? "",
    targetFiber: String(project.targetFiber ?? ""),
    targetFiberTolerance: project.targetFiberTolerance ?? "",
    targetSugars: String(project.targetSugars ?? ""),
    targetSugarsTolerance: project.targetSugarsTolerance ?? "",
    targetAddedSugars: String(project.targetAddedSugars ?? ""),
    targetAddedSugarsTolerance: project.targetAddedSugarsTolerance ?? "",
    targetProtein: String(project.targetProtein ?? ""),
    targetProteinTolerance: project.targetProteinTolerance ?? "",
    targetSodium: String(project.targetSodium ?? ""),
    targetSodiumTolerance: project.targetSodiumTolerance ?? "",
  });

  function toggleIteration(id: string) {
    setExpandedIterations((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setActiveIterationTab((prev) => ({ ...prev, [id]: prev[id] ?? "recipe" }));
  }

  function scrollToIteration(id: string) {
    setTimeout(() => {
      document.getElementById(`iter-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function expandIteration(id: string) {
    setExpandedIterations((prev) => new Set(Array.from(prev).concat(id)));
    setActiveIterationTab((prev) => ({ ...prev, [id]: prev[id] ?? "recipe" }));
  }

  async function handleStatusChange(status: string) {
    setShowStatusDropdown(false);
    await fetch(`/api/rd/projects/${project.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
    setProject((prev) => ({ ...prev, status }));
  }

  async function handleCompare() {
    if (!compareIter1 || !compareIter2) return;
    const res = await fetch(`/api/rd/iterations/compare?iterationId1=${compareIter1}&iterationId2=${compareIter2}`);
    if (res.ok) {
      const data = await res.json();
      setCompareResult(data);
    }
  }

  async function handleEditProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/rd/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        productType: editForm.productType,
        description: editForm.description || null,
        targetServingSize: editForm.targetServingSize || null,
        startedDate: editForm.startedDate || null,
        targetLaunchDate: editForm.targetLaunchDate || null,
        targetCalories: editForm.targetCalories !== "" ? Number(editForm.targetCalories) : null,
        targetCaloriesTolerance: editForm.targetCaloriesTolerance || null,
        targetFat: editForm.targetFat !== "" ? Number(editForm.targetFat) : null,
        targetFatTolerance: editForm.targetFatTolerance || null,
        targetSaturatedFat: editForm.targetSaturatedFat !== "" ? Number(editForm.targetSaturatedFat) : null,
        targetSaturatedFatTolerance: editForm.targetSaturatedFatTolerance || null,
        targetCarbs: editForm.targetCarbs !== "" ? Number(editForm.targetCarbs) : null,
        targetCarbsTolerance: editForm.targetCarbsTolerance || null,
        targetFiber: editForm.targetFiber !== "" ? Number(editForm.targetFiber) : null,
        targetFiberTolerance: editForm.targetFiberTolerance || null,
        targetSugars: editForm.targetSugars !== "" ? Number(editForm.targetSugars) : null,
        targetSugarsTolerance: editForm.targetSugarsTolerance || null,
        targetAddedSugars: editForm.targetAddedSugars !== "" ? Number(editForm.targetAddedSugars) : null,
        targetAddedSugarsTolerance: editForm.targetAddedSugarsTolerance || null,
        targetProtein: editForm.targetProtein !== "" ? Number(editForm.targetProtein) : null,
        targetProteinTolerance: editForm.targetProteinTolerance || null,
        targetSodium: editForm.targetSodium !== "" ? Number(editForm.targetSodium) : null,
        targetSodiumTolerance: editForm.targetSodiumTolerance || null,
      }),
    });
    setEditingProject(false);
    router.refresh();
  }

  function onSaved() {
    router.refresh();
  }

  const targetCount = NUTRIENTS.filter((n) => project[n.targetField] !== null).length;

  const selectClass = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]";

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-6 px-4">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              <StatusBadge status={project.status} />
              <ProductTypeBadge type={project.productType} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-500 font-mono">
              <span>Started: {fmtDate(project.startedDate)}</span>
              <span>·</span>
              <span>Target launch: {fmtDate(project.targetLaunchDate)}</span>
              <span>·</span>
              <span>{project.iterations.length} iteration{project.iterations.length !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>Created by: {project.createdBy.name ?? "—"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowStatusDropdown((v) => !v)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 hover:bg-gray-50"
              >
                Change Status <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showStatusDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[200px]">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setEditingProject((v) => !v)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
            >
              {editingProject ? "Cancel Edit" : "Edit Project"}
            </button>
          </div>
        </div>
        {project.description && <p className="mt-3 text-sm text-gray-600">{project.description}</p>}

        {editingProject && (
          <form onSubmit={handleEditProjectSubmit} className="mt-5 border-t border-gray-100 pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Project Name</label>
                <input type="text" required value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Product Type</label>
                <select value={editForm.productType} onChange={(e) => setEditForm((p) => ({ ...p, productType: e.target.value }))} className={inputClass}>
                  <option value="bar">Bar</option>
                  <option value="granola">Granola</option>
                  <option value="cracker">Cracker</option>
                  <option value="powder">Powder</option>
                  <option value="sweetener">Sweetener</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Target Serving Size</label>
                <input type="text" value={editForm.targetServingSize} onChange={(e) => setEditForm((p) => ({ ...p, targetServingSize: e.target.value }))} className={inputClass} placeholder="e.g. 28g" />
              </div>
              <div>
                <label className={labelClass}>Started Date</label>
                <input type="date" value={editForm.startedDate} onChange={(e) => setEditForm((p) => ({ ...p, startedDate: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Target Launch Date</label>
                <input type="date" value={editForm.targetLaunchDate} onChange={(e) => setEditForm((p) => ({ ...p, targetLaunchDate: e.target.value }))} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} className={inputClass} />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nutritional Targets</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {NUTRIENTS.map(({ label, targetField, tolField, unit }) => {
                  const tf = targetField as string;
                  const tlf = tolField as string;
                  return (
                    <div key={tf} className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">{label} <span className="text-gray-400">({unit})</span></label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={(editForm as Record<string, string>)[tf]}
                          onChange={(e) => setEditForm((p) => ({ ...p, [tf]: e.target.value }))}
                          placeholder="—"
                          className={inputClass}
                        />
                      </div>
                      <div className="w-20">
                        <label className="block text-xs text-gray-500 mb-1">Tol.</label>
                        <select
                          value={(editForm as Record<string, string>)[tlf]}
                          onChange={(e) => setEditForm((p) => ({ ...p, [tlf]: e.target.value }))}
                          className={inputClass}
                        >
                          <option value="">—</option>
                          <option value="min">≥ min</option>
                          <option value="max">≤ max</option>
                          <option value="approx">~ approx</option>
                          <option value="exact">= exact</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" className="bg-[#C41E3A] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#A01830] transition-colors">
                Save Changes
              </button>
              <button type="button" onClick={() => setEditingProject(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div className="card overflow-hidden">
        <button
          onClick={() => setShowNutritionExpanded((v) => !v)}
          className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            {showNutritionExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Nutritional Targets</span>
            <span className="text-xs text-gray-400">{targetCount} target{targetCount !== 1 ? "s" : ""} set</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setEditingProject(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="text-xs text-[#C41E3A] hover:underline"
          >
            Edit targets
          </button>
        </button>
        {showNutritionExpanded && (
          <div className="px-5 pb-4 border-t border-gray-100">
            {targetCount === 0 ? (
              <p className="text-sm text-gray-400 italic py-3">No targets set.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
                {NUTRIENTS.map(({ label, targetField, tolField, unit }) => {
                  const target = project[targetField] as number | null;
                  const tol = project[tolField] as string | null;
                  if (target === null) return null;
                  return (
                    <div key={targetField} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{label} <span className="text-gray-400">({unit})</span></p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">
                        {toleranceSymbol(tol)} {target}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Iteration Timeline</p>
        {project.iterations.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No iterations yet. Add the first iteration below.</p>
        ) : (
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {project.iterations.map((iter, i) => (
              <React.Fragment key={iter.id}>
                {i > 0 && <div className="h-px w-8 bg-gray-200 shrink-0" />}
                <button
                  onClick={() => { expandIteration(iter.id); scrollToIteration(iter.id); }}
                  className="flex flex-col items-center gap-0.5 shrink-0 group"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-gray-200 group-hover:border-[#C41E3A] flex items-center justify-center text-xs font-bold font-mono text-gray-700">
                    {iter.iterationNumber}
                  </div>
                  <span className="text-[10px] font-mono text-gray-500">{fmtDateShort(iter.datePerformed)}</span>
                  {avgOverall(iter.evaluations) !== null && (
                    <span className="text-[10px] font-mono text-amber-600">★{avgOverall(iter.evaluations)!.toFixed(1)}</span>
                  )}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Iterations</h2>
          <div className="flex items-center gap-2">
            {project.iterations.length >= 2 && (
              <button
                onClick={() => { setShowCompare((v) => !v); setCompareResult(null); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
              >
                {showCompare ? "Hide Compare" : "Compare Iterations"}
              </button>
            )}
            <button
              onClick={() => setShowNewIterationForm((v) => !v)}
              className="bg-[#C41E3A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#A01830] transition-colors"
            >
              {showNewIterationForm ? "Cancel" : "+ New Iteration"}
            </button>
          </div>
        </div>

        {showCompare && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={compareIter1} onChange={(e) => setCompareIter1(e.target.value)} className={selectClass}>
                <option value="">Select iteration…</option>
                {project.iterations.map((i) => <option key={i.id} value={i.id}>Iteration {i.iterationNumber}</option>)}
              </select>
              <span className="text-gray-400">vs</span>
              <select value={compareIter2} onChange={(e) => setCompareIter2(e.target.value)} className={selectClass}>
                <option value="">Select iteration…</option>
                {project.iterations.map((i) => <option key={i.id} value={i.id}>Iteration {i.iterationNumber}</option>)}
              </select>
              <button
                onClick={handleCompare}
                disabled={!compareIter1 || !compareIter2 || compareIter1 === compareIter2}
                className="bg-[#C41E3A] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#A01830] transition-colors disabled:opacity-50"
              >
                Compare
              </button>
            </div>
            {compareResult && <CompareDisplay result={compareResult} project={project} />}
          </div>
        )}

        {showNewIterationForm && (
          <NewIterationForm
            projectId={project.id}
            iterationNumber={project.iterations.length + 1}
            onClose={() => setShowNewIterationForm(false)}
            onSaved={onSaved}
          />
        )}

        {project.iterations.length === 0 && !showNewIterationForm && (
          <p className="text-sm text-gray-400 italic">No iterations yet. Click "+ New Iteration" to get started.</p>
        )}

        {project.iterations.map((iter) => (
          <IterationCard
            key={iter.id}
            iter={iter}
            project={project}
            expanded={expandedIterations.has(iter.id)}
            activeTab={activeIterationTab[iter.id] ?? "recipe"}
            onToggle={() => toggleIteration(iter.id)}
            onTabChange={(tab) => setActiveIterationTab((prev) => ({ ...prev, [iter.id]: tab }))}
            onSaved={onSaved}
          />
        ))}
      </div>

      <div className="pb-8">
        <Link href="/dashboard/admin/rd/projects" className="text-sm text-gray-400 hover:text-gray-600">
          ← Back to Projects
        </Link>
      </div>
    </div>
  );
}
