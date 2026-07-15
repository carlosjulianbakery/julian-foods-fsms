"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatRecommendation } from "@/lib/rdStatusLabels";

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
  collaborators?: { name: string; email: string | null }[] | null;
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

// ---- Dark theme color maps ----

const RD_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  concept:             { label: "Concept",                color: "#8B8B8B", bg: "#8B8B8B20" },
  in_development:      { label: "In Development",         color: "#60A5FA", bg: "#60A5FA20" },
  testing:             { label: "Testing",                color: "#F59E0B", bg: "#F59E0B20" },
  pending_approval:    { label: "Pending Approval",       color: "#A78BFA", bg: "#A78BFA20" },
  closed_launched:     { label: "Closed — Launched",      color: "#34D399", bg: "#34D39920" },
  closed_discontinued: { label: "Closed — Discontinued",  color: "#6B5F50", bg: "#6B5F5020" },
  in_progress:         { label: "In Progress",            color: "#60A5FA", bg: "#60A5FA20" },
  complete:            { label: "Complete",               color: "#34D399", bg: "#34D39920" },
  failed:              { label: "Failed",                 color: "#F87171", bg: "#F8717120" },
  draft:               { label: "Draft",                  color: "#8B8B8B", bg: "#8B8B8B20" },
};


const EVAL_COLORS = ["#F59E0B", "#60A5FA", "#34D399", "#A78BFA"];

const RD_REC: Record<string, { label: string; color: string; bg: string }> = {
  needs_significant_changes: { label: "Needs Significant Changes", color: "#F87171", bg: "#F8717120" },
  needs_minor_adjustments:   { label: "Needs Minor Adjustments",   color: "#F59E0B", bg: "#F59E0B20" },
  ready_for_next_phase:      { label: "Ready for Next Phase",      color: "#60A5FA", bg: "#60A5FA20" },
  approve_this_version:      { label: "Approve This Version",      color: "#34D399", bg: "#34D39920" },
};

const SENSORY_ATTRS: { key: keyof Evaluation; label: string; icon: string }[] = [
  { key: "ratingAppearance",     label: "Appearance",       icon: "👁" },
  { key: "ratingAroma",          label: "Aroma",            icon: "👃" },
  { key: "ratingTexture",        label: "Texture",          icon: "🤌" },
  { key: "ratingSweetness",      label: "Sweetness",        icon: "🍬" },
  { key: "ratingFlavorIntensity",label: "Flavor Intensity", icon: "💥" },
  { key: "ratingOverall",        label: "Overall",          icon: "⭐" },
];

// ---- Style helpers ----

const S = {
  input: {
    width: "100%",
    backgroundColor: "#1A1714",
    border: "1px solid #3D3427",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 14,
    color: "#F5F0E8",
    outline: "none",
  } as React.CSSProperties,
  inputSm: {
    backgroundColor: "#1A1714",
    border: "1px solid #3D3427",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 13,
    color: "#F5F0E8",
    outline: "none",
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#A89880",
    marginBottom: 6,
  } as React.CSSProperties,
  card: {
    backgroundColor: "#252118",
    border: "1px solid #3D3427",
    borderRadius: 16,
    overflow: "hidden" as const,
  } as React.CSSProperties,
  cardPadded: {
    backgroundColor: "#252118",
    border: "1px solid #3D3427",
    borderRadius: 16,
    padding: "20px 24px",
  } as React.CSSProperties,
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#F59E0B",
    marginBottom: 12,
    display: "block",
  } as React.CSSProperties,
};

const focus = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#F59E0B";
    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(245,158,11,0.15)";
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#3D3427";
    e.currentTarget.style.boxShadow = "none";
  },
};

// ---- Helpers ----

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [year, month, day] = d.split("T")[0].split("-");
  return `${month}/${day}/${year}`;
}

function fmtDateShort(d: string): string {
  const [, month, day] = d.split("T")[0].split("-");
  return `${parseInt(month)}/${parseInt(day)}`;
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

function computeNutritionStatus(
  actual: number | null,
  target: number | null,
  tol: string | null,
): { label: string; barColor: string; fillPct: number; met: boolean } {
  if (actual === null) {
    return { label: "Not entered", barColor: "#3D3427", fillPct: 0, met: false };
  }
  if (target === null) {
    return { label: String(actual), barColor: "#60A5FA", fillPct: 50, met: true };
  }
  const diff = actual - target;
  const pct = target !== 0 ? Math.abs(diff) / target : 0;
  const fillPct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;

  let met = false;
  if (tol === "min") met = actual >= target;
  else if (tol === "max") met = actual <= target;
  else if (tol === "approx") met = pct <= 0.1;
  else if (tol === "exact") met = actual === target;
  else met = true;

  const close = pct <= 0.2 && !met;
  const barColor = met ? "#34D399" : close ? "#F59E0B" : "#F87171";

  let label: string;
  if (tol === "min") label = met ? "✓ On target" : `✗ Below by ${Math.abs(diff).toFixed(1)}`;
  else if (tol === "max") label = met ? "✓ On target" : `✗ Above by ${Math.abs(diff).toFixed(1)}`;
  else if (tol === "approx") label = met ? "✓ On target" : `✗ ${diff > 0 ? "+" : ""}${diff.toFixed(1)} (${(pct * 100).toFixed(0)}% off)`;
  else if (tol === "exact") label = met ? "✓ Exact" : `✗ ${diff > 0 ? "+" : ""}${diff.toFixed(1)}`;
  else label = String(actual);

  return { label, barColor, fillPct, met };
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

function StatusBadge({ status }: { status: string }) {
  const s = RD_STATUS[status] ?? { label: status, color: "#A89880", bg: "#A89880" + "20" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        backgroundColor: s.bg,
        border: `1px solid ${s.color}40`,
        whiteSpace: "nowrap" as const,
      }}
    >
      {s.label}
    </span>
  );
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span style={{ color: "#6B5F50", fontSize: 13 }}>—</span>;
  const r = Math.round(rating);
  return (
    <span style={{ color: "#F59E0B", fontFamily: "monospace", fontSize: 13 }}>
      {"★".repeat(r)}{"☆".repeat(5 - r)}
      <span style={{ marginLeft: 4, color: "#A89880", fontSize: 11 }}>{rating.toFixed(1)}</span>
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 32,
            lineHeight: 1,
            padding: "2px",
            color: (hover || value) >= n ? "#F59E0B" : "#3D3427",
            transition: "color 0.15s ease",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function NutritionBar({ fillPct, barColor }: { fillPct: number; barColor: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(Math.min(fillPct, 100)), 60);
    return () => clearTimeout(t);
  }, [fillPct]);
  return (
    <div style={{ height: 8, borderRadius: 4, backgroundColor: "#3D3427", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          borderRadius: 4,
          width: `${width}%`,
          backgroundColor: barColor,
          transition: "width 0.4s ease-out",
        }}
      />
    </div>
  );
}

// ---- Ingredient Table (form mode) ----

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

  const thStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#6B5F50",
    paddingBottom: 6,
    textAlign: "left",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 80px 1fr 28px", gap: 8 }}>
        <span style={thStyle}>Source</span>
        <span style={thStyle}>Ingredient</span>
        <span style={thStyle}>Qty</span>
        <span style={thStyle}>Unit</span>
        <span style={thStyle}>Notes</span>
        <span />
      </div>
      {rows.map((row, i) => {
        const opts = row.ingredientType === "material" ? materialOptions : rdIngredientOptions;
        const dlId = `ing-dl-${i}`;
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 80px 1fr 28px", gap: 8, alignItems: "center" }}>
            <select
              value={row.ingredientType}
              onChange={(e) => handleTypeChange(i, e.target.value)}
              style={{ ...S.inputSm, width: "100%" }}
              {...focus}
            >
              <option value="material">Material</option>
              <option value="rd_ingredient">R&D Ingredient</option>
            </select>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                list={dlId}
                value={row.name}
                onChange={(e) => handleNameChange(i, e.target.value)}
                placeholder={opts.length ? "Type to search…" : "Name"}
                style={{ ...S.inputSm, width: "100%" }}
                {...focus}
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
              style={{ ...S.inputSm, width: "100%" }}
              {...focus}
            />
            <select
              value={row.unit}
              onChange={(e) => updateRows(i, { unit: e.target.value })}
              style={{ ...S.inputSm, width: "100%" }}
              {...focus}
            >
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input
              type="text"
              value={row.notes}
              onChange={(e) => updateRows(i, { notes: e.target.value })}
              placeholder="Notes"
              style={{ ...S.inputSm, width: "100%" }}
              {...focus}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#6B5F50", fontSize: 20, lineHeight: 1, padding: 0 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#F87171"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6B5F50"; }}
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#F59E0B", fontSize: 13, textAlign: "left", padding: "4px 0" }}
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
  onIterationCreated?: (id: string) => void;
  prefill?: Iteration | null;
}

function NewIterationForm({ projectId, iterationNumber, onClose, onSaved, onIterationCreated, prefill }: NewIterationFormProps) {
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
      const data = await res.json();
      onSaved();
      if (!prefill && onIterationCreated && data?.id) {
        onIterationCreated(data.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...S.cardPadded, borderLeft: "4px solid #F59E0B", display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ ...S.sectionLabel, marginBottom: 0 }}>
        {prefill ? `Edit Iteration ${prefill.iterationNumber}` : `New Iteration #${iterationNumber}`}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <div>
          <label style={S.label}>Date Performed <span style={{ color: "#F87171" }}>*</span></label>
          <input type="date" required value={datePerformed} onChange={(e) => setDatePerformed(e.target.value)} style={{ ...S.input, colorScheme: "dark" }} {...focus} />
        </div>
        <div>
          <label style={S.label}>Performed By <span style={{ color: "#F87171" }}>*</span></label>
          <input type="text" required value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} style={S.input} placeholder="Name" {...focus} />
        </div>
        <div>
          <label style={S.label}>Batch Size</label>
          <input type="text" value={batchSize} onChange={(e) => setBatchSize(e.target.value)} style={S.input} placeholder="e.g. 2 kg" {...focus} />
        </div>
        <div>
          <label style={S.label}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={S.input} {...focus}>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <div>
        <label style={S.label}>Recipe / Ingredients</label>
        <IngredientTable
          rows={ingredientRows}
          onChange={setIngredientRows}
          materialOptions={materialOptions}
          rdIngredientOptions={rdIngredientOptions}
        />
      </div>

      {iterationNumber > 1 && (
        <div>
          <label style={S.label}>Changes from Prior Iteration</label>
          <textarea rows={2} value={changesFromPrior} onChange={(e) => setChangesFromPrior(e.target.value)} style={{ ...S.input, resize: "vertical" }} {...focus} />
        </div>
      )}
      <div>
        <label style={S.label}>Process Notes</label>
        <textarea rows={2} value={processNotes} onChange={(e) => setProcessNotes(e.target.value)} style={{ ...S.input, resize: "vertical" }} {...focus} />
      </div>
      <div>
        <label style={S.label}>Outcome</label>
        <textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ ...S.input, resize: "vertical" }} {...focus} />
      </div>
      <div>
        <label style={S.label}>Next Steps</label>
        <textarea rows={2} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} style={{ ...S.input, resize: "vertical" }} {...focus} />
      </div>

      {error && (
        <div style={{ backgroundColor: "#F8717115", border: "1px solid #F87171", borderRadius: 10, padding: "10px 14px", color: "#F87171", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{ backgroundColor: "#F59E0B", color: "#1A1714", padding: "10px 20px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
          onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
        >
          {submitting ? "Saving…" : prefill ? "Save Changes" : "Add Iteration"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#A89880", fontSize: 13 }}
        >
          Cancel
        </button>
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

  const RATING_ATTRS: { key: keyof typeof ratings; label: string; icon: string }[] = [
    { key: "appearance",     label: "Appearance",       icon: "👁" },
    { key: "aroma",          label: "Aroma",            icon: "👃" },
    { key: "texture",        label: "Texture",          icon: "🤌" },
    { key: "sweetness",      label: "Sweetness",        icon: "🍬" },
    { key: "flavorIntensity",label: "Flavor Intensity", icon: "💥" },
    { key: "overall",        label: "Overall",          icon: "⭐" },
  ];

  const RECS = [
    { value: "needs_significant_changes", label: "Needs Significant Changes" },
    { value: "needs_minor_adjustments",   label: "Needs Minor Adjustments" },
    { value: "ready_for_next_phase",      label: "Ready for Next Phase" },
    { value: "approve_this_version",      label: "Approve This Version" },
  ];

  return (
    <form onSubmit={handleSubmit} style={{ ...S.cardPadded, borderLeft: "4px solid #60A5FA", display: "flex", flexDirection: "column", gap: 20, marginTop: 12 }}>
      <p style={{ ...S.sectionLabel, marginBottom: 0 }}>Add Evaluation</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={S.label}>Evaluator Name <span style={{ color: "#F87171" }}>*</span></label>
          <input type="text" required value={evaluatorName} onChange={(e) => setEvaluatorName(e.target.value)} style={S.input} {...focus} />
        </div>
        <div>
          <label style={S.label}>Date <span style={{ color: "#F87171" }}>*</span></label>
          <input type="date" required value={evaluationDate} onChange={(e) => setEvaluationDate(e.target.value)} style={{ ...S.input, colorScheme: "dark" }} {...focus} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {RATING_ATTRS.map(({ key, label, icon }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 140, display: "flex", alignItems: "center", gap: 8, color: "#A89880", fontSize: 14, flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>{icon}</span> {label}
            </span>
            <StarPicker value={ratings[key]} onChange={(v) => setRating(key, v)} />
          </div>
        ))}
      </div>

      <div>
        <label style={S.label}>Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...S.input, resize: "vertical" }} {...focus} />
      </div>

      <div>
        <label style={S.label}>Recommendation</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {RECS.map((opt) => {
            const rc = RD_REC[opt.value];
            const selected = recommendation === opt.value;
            return (
              <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="recommendation"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setRecommendation(opt.value)}
                  style={{ accentColor: "#F59E0B" }}
                />
                <span style={{ color: selected ? rc?.color ?? "#F5F0E8" : "#A89880", fontSize: 13, fontWeight: selected ? 600 : 400 }}>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: "#F8717115", border: "1px solid #F87171", borderRadius: 10, padding: "10px 14px", color: "#F87171", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{ backgroundColor: "#F59E0B", color: "#1A1714", padding: "10px 20px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
          onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
        >
          {submitting ? "Saving…" : "Save Evaluation"}
        </button>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#A89880", fontSize: 13 }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---- Nutritional Actuals Form ----

function NutritionalActualsForm({ iter, onClose, onSaved }: { iter: Iteration; onClose: () => void; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({
    actualCalories:    String(iter.actualCalories ?? ""),
    actualFat:         String(iter.actualFat ?? ""),
    actualSaturatedFat:String(iter.actualSaturatedFat ?? ""),
    actualCarbs:       String(iter.actualCarbs ?? ""),
    actualFiber:       String(iter.actualFiber ?? ""),
    actualSugars:      String(iter.actualSugars ?? ""),
    actualAddedSugars: String(iter.actualAddedSugars ?? ""),
    actualProtein:     String(iter.actualProtein ?? ""),
    actualSodium:      String(iter.actualSodium ?? ""),
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
    { label: "Calories",          field: "actualCalories",     unit: "kcal" },
    { label: "Total Fat",         field: "actualFat",          unit: "g" },
    { label: "Saturated Fat",     field: "actualSaturatedFat", unit: "g" },
    { label: "Total Carbohydrate",field: "actualCarbs",        unit: "g" },
    { label: "Dietary Fiber",     field: "actualFiber",        unit: "g" },
    { label: "Total Sugars",      field: "actualSugars",       unit: "g" },
    { label: "Added Sugars",      field: "actualAddedSugars",  unit: "g" },
    { label: "Protein",           field: "actualProtein",      unit: "g" },
    { label: "Sodium",            field: "actualSodium",       unit: "mg" },
  ];

  return (
    <form onSubmit={handleSubmit} style={{ ...S.cardPadded, borderLeft: "4px solid #34D399", display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
      <p style={{ ...S.sectionLabel, marginBottom: 0 }}>Edit Nutritional Actuals</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {ACTUAL_FIELDS.map(({ label, field, unit }) => (
          <div key={field}>
            <label style={S.label}>
              {label} <span style={{ color: "#6B5F50", fontFamily: "monospace", fontSize: 10 }}>({unit})</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={vals[field]}
              onChange={(e) => setVals((prev) => ({ ...prev, [field]: e.target.value }))}
              placeholder="—"
              style={S.input}
              {...focus}
            />
          </div>
        ))}
      </div>
      {error && (
        <div style={{ backgroundColor: "#F8717115", border: "1px solid #F87171", borderRadius: 10, padding: "10px 14px", color: "#F87171", fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{ backgroundColor: "#F59E0B", color: "#1A1714", padding: "10px 20px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
          onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
        >
          {submitting ? "Saving…" : "Save Actuals"}
        </button>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#A89880", fontSize: 13 }}>
          Cancel
        </button>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <span style={{ color: "#A89880", fontSize: 13 }}>
          <span style={{ color: "#6B5F50", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>By </span>
          {iter.performedBy}
        </span>
        {iter.batchSize && (
          <span style={{ color: "#A89880", fontSize: 13 }}>
            <span style={{ color: "#6B5F50", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Batch </span>
            {iter.batchSize}
          </span>
        )}
      </div>

      {(iter.recipe?.length ?? 0) > 0 ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {iter.recipe.map((ing) => {
              const isRd = ing.ingredientType === "rd_ingredient";
              const dotColor = isRd ? "#A78BFA" : "#60A5FA";
              return (
                <div
                  key={ing.id}
                  style={{ backgroundColor: "#1A1714", border: "1px solid #3D3427", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dotColor, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ color: "#F5F0E8", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {ing.name}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: dotColor, backgroundColor: `${dotColor}20`, borderRadius: 8, padding: "2px 6px", flexShrink: 0, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                        {isRd ? "R&D" : "Mat"}
                      </span>
                    </div>
                    {ing.quantity != null && (
                      <div style={{ color: "#F59E0B", fontFamily: "monospace", fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                        {ing.quantity} <span style={{ fontSize: 12, fontWeight: 400 }}>{ing.unit ?? ""}</span>
                      </div>
                    )}
                    {ing.notes && (
                      <p style={{ color: "#6B5F50", fontSize: 12, marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                        {ing.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {totalG > 0 && (
            <div style={{ borderTop: "1px solid #3D3427", paddingTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <span style={{ color: "#A89880", fontSize: 13 }}>
                Total: <span style={{ color: "#F5F0E8", fontWeight: 600 }}>{totalLabel}</span>
              </span>
            </div>
          )}
        </>
      ) : (
        <p style={{ color: "#6B5F50", fontSize: 13, fontStyle: "italic" }}>No ingredients recorded.</p>
      )}

      {iter.changesFromPrior && iter.iterationNumber > 1 && (
        <div style={{ backgroundColor: "#F59E0B08", border: "1px solid #F59E0B30", borderRadius: 10, padding: "12px 14px" }}>
          <p style={{ ...S.sectionLabel, color: "#F59E0B", marginBottom: 6 }}>Changes from prior</p>
          <p style={{ color: "#A89880", fontSize: 13 }}>{iter.changesFromPrior}</p>
        </div>
      )}
      {iter.processNotes && (
        <div>
          <p style={{ ...S.sectionLabel }}>Process Notes</p>
          <p style={{ color: "#A89880", fontSize: 13 }}>{iter.processNotes}</p>
        </div>
      )}
      {iter.outcome && (
        <div>
          <p style={{ ...S.sectionLabel }}>Outcome</p>
          <p style={{ color: "#A89880", fontSize: 13 }}>{iter.outcome}</p>
        </div>
      )}
      {iter.nextSteps && (
        <div>
          <p style={{ ...S.sectionLabel }}>Next Steps</p>
          <p style={{ color: "#A89880", fontSize: 13 }}>{iter.nextSteps}</p>
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
        <button
          onClick={() => setEditing(true)}
          style={{ alignSelf: "flex-start", padding: "8px 16px", borderRadius: 10, border: "1px solid #3D3427", background: "transparent", color: "#A89880", fontSize: 13, cursor: "pointer", marginTop: 4 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#F59E0B"; (e.currentTarget as HTMLButtonElement).style.color = "#F5F0E8"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3D3427"; (e.currentTarget as HTMLButtonElement).style.color = "#A89880"; }}
        >
          Edit Iteration
        </button>
      )}
    </div>
  );
}

// ---- Sensory Tab ----

function SensoryTab({ iter, onSaved }: { iter: Iteration; onSaved: () => void }) {
  const [showForm, setShowForm] = useState(false);

  const radarData = SENSORY_ATTRS.map(({ key, label }) => {
    const point: Record<string, string | number> = { subject: label };
    iter.evaluations.forEach((ev, i) => {
      point[`eval_${i}`] = (ev[key] as number | null) ?? 0;
    });
    return point;
  });

  const recCounts: Record<string, number> = {};
  for (const ev of iter.evaluations) {
    if (ev.recommendation) recCounts[ev.recommendation] = (recCounts[ev.recommendation] ?? 0) + 1;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {iter.evaluations.length > 0 && (
        <>
          {/* Radar Chart */}
          <div style={{ backgroundColor: "#1A1714", border: "1px solid #3D3427", borderRadius: 12, padding: "16px 0 8px" }}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} margin={{ top: 8, right: 32, bottom: 8, left: 32 }}>
                <PolarGrid stroke="#3D3427" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: "#A89880", fontSize: 11 }} />
                {iter.evaluations.map((ev, i) => (
                  <Radar
                    key={ev.id}
                    name={ev.evaluatorName}
                    dataKey={`eval_${i}`}
                    stroke={EVAL_COLORS[i % EVAL_COLORS.length]}
                    fill={EVAL_COLORS[i % EVAL_COLORS.length]}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                ))}
                {iter.evaluations.length > 1 && (
                  <Legend
                    wrapperStyle={{ color: "#A89880", fontSize: 12, paddingTop: 8 }}
                  />
                )}
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Recommendations */}
          {Object.keys(recCounts).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(recCounts).map(([rec, count]) => {
                const rc = RD_REC[rec] ?? { label: formatRecommendation(rec).label, color: "#A89880", bg: "#A8988020" };
                return (
                  <span
                    key={rec}
                    style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, color: rc.color, backgroundColor: rc.bg, border: `1px solid ${rc.color}40` }}
                  >
                    {rc.label} ({count})
                  </span>
                );
              })}
            </div>
          )}

          {/* Individual evaluation cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={S.sectionLabel}>Individual Evaluations</span>
            {iter.evaluations.map((ev, i) => {
              const evalColor = EVAL_COLORS[i % EVAL_COLORS.length];
              const rc = ev.recommendation ? RD_REC[ev.recommendation] : null;
              return (
                <div key={ev.id} style={{ backgroundColor: "#1A1714", border: "1px solid #3D3427", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: evalColor }} />
                      <span style={{ color: "#F5F0E8", fontWeight: 600, fontSize: 14 }}>{ev.evaluatorName}</span>
                    </div>
                    <span style={{ color: "#6B5F50", fontSize: 12, fontFamily: "monospace" }}>{fmtDate(ev.evaluationDate)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                    {SENSORY_ATTRS.map(({ key, label, icon }) => (
                      <div key={key}>
                        <p style={{ color: "#6B5F50", fontSize: 10, marginBottom: 2 }}>{icon} {label}</p>
                        <Stars rating={ev[key] as number | null} />
                      </div>
                    ))}
                  </div>
                  {ev.notes && <p style={{ color: "#A89880", fontSize: 13, marginBottom: 8 }}>{ev.notes}</p>}
                  {rc && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: rc.color, backgroundColor: rc.bg, borderRadius: 20, padding: "3px 10px", border: `1px solid ${rc.color}40` }}>
                      {rc.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {iter.evaluations.length === 0 && !showForm && (
        <p style={{ color: "#6B5F50", fontSize: 13, fontStyle: "italic" }}>No evaluations yet.</p>
      )}

      {showForm ? (
        <EvaluationForm iterationId={iter.id} onClose={() => setShowForm(false)} onSaved={onSaved} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{ alignSelf: "flex-start", padding: "8px 16px", borderRadius: 10, border: "1px solid #3D3427", background: "transparent", color: "#A89880", fontSize: 13, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#F59E0B"; (e.currentTarget as HTMLButtonElement).style.color = "#F5F0E8"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3D3427"; (e.currentTarget as HTMLButtonElement).style.color = "#A89880"; }}
        >
          + Add Evaluation
        </button>
      )}
    </div>
  );
}

// ---- Nutritional Tab ----

function NutritionalTab({ iter, project, onSaved }: { iter: Iteration; project: Project; onSaved: () => void }) {
  const [editingActuals, setEditingActuals] = useState(false);

  const hasTargets = NUTRIENTS.some((n) => project[n.targetField] !== null);
  const targetCount = NUTRIENTS.filter((n) => project[n.targetField] !== null).length;
  const metCount = NUTRIENTS.filter(({ targetField, tolField, actualField }) => {
    const target = project[targetField] as number | null;
    const tol = project[tolField] as string | null;
    const actual = iter[actualField] as number | null;
    return computeNutritionStatus(actual, target, tol).met;
  }).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {hasTargets && targetCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", backgroundColor: "#1A1714", borderRadius: 10, border: "1px solid #3D3427" }}>
          <span style={{ color: "#F59E0B", fontSize: 13, fontWeight: 600 }}>
            {metCount} of {targetCount}
          </span>
          <span style={{ color: "#6B5F50", fontSize: 13 }}>nutritional targets met</span>
          <div style={{ flex: 1, marginLeft: 8 }}>
            <NutritionBar fillPct={(metCount / targetCount) * 100} barColor={metCount === targetCount ? "#34D399" : metCount >= targetCount * 0.7 ? "#F59E0B" : "#F87171"} />
          </div>
        </div>
      )}

      {hasTargets ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {NUTRIENTS.map(({ label, targetField, tolField, actualField, unit }) => {
            const target = project[targetField] as number | null;
            const tol = project[tolField] as string | null;
            const actual = iter[actualField] as number | null;
            if (target === null && actual === null) return null;
            const { label: statusLabel, barColor, fillPct } = computeNutritionStatus(actual, target, tol);
            return (
              <div key={String(targetField)} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: "#A89880", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {label} <span style={{ color: "#6B5F50", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({unit})</span>
                  </span>
                  <span style={{ display: "flex", gap: 12, fontSize: 12, fontFamily: "monospace" }}>
                    <span style={{ color: "#6B5F50" }}>
                      {target !== null ? `${toleranceSymbol(tol)}${target}` : "—"}
                    </span>
                    <span style={{ color: actual !== null ? "#F5F0E8" : "#6B5F50" }}>
                      {actual !== null ? actual : "—"}
                    </span>
                    <span style={{ color: barColor, fontFamily: "inherit", fontSize: 11 }}>{statusLabel}</span>
                  </span>
                </div>
                <NutritionBar fillPct={fillPct} barColor={barColor} />
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: "#6B5F50", fontSize: 13, fontStyle: "italic" }}>No nutritional targets set for this project.</p>
      )}

      {editingActuals ? (
        <NutritionalActualsForm
          iter={iter}
          onClose={() => setEditingActuals(false)}
          onSaved={() => { onSaved(); setEditingActuals(false); }}
        />
      ) : (
        <button
          onClick={() => setEditingActuals(true)}
          style={{ alignSelf: "flex-start", padding: "8px 16px", borderRadius: 10, border: "1px solid #3D3427", background: "transparent", color: "#A89880", fontSize: 13, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#F59E0B"; (e.currentTarget as HTMLButtonElement).style.color = "#F5F0E8"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3D3427"; (e.currentTarget as HTMLButtonElement).style.color = "#A89880"; }}
        >
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {iter.attachments.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {iter.attachments.map((att) => (
            <div
              key={att.id}
              style={{ backgroundColor: "#1A1714", border: "1px solid #3D3427", borderRadius: 12, overflow: "hidden" }}
              className="group"
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#F59E0B40"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#3D3427"; }}
            >
              {isImage(att.mimeType) ? (
                <div
                  onClick={() => setLightboxUrl(att.fileUrl)}
                  style={{ height: 100, overflow: "hidden", cursor: "zoom-in", backgroundColor: "#2E2820" }}
                >
                  <img
                    src={att.fileUrl}
                    alt={att.fileName}
                    style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.2s ease" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1.04)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1)"; }}
                  />
                </div>
              ) : (
                <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#2E2820" }}>
                  <span style={{ fontSize: 32 }}>📄</span>
                </div>
              )}
              <div style={{ padding: "10px 12px" }}>
                <p style={{ color: "#F5F0E8", fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{att.fileName}</p>
                <p style={{ color: "#6B5F50", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>{fmtFileSize(att.fileSize)}</p>
                {att.description && <p style={{ color: "#A89880", fontSize: 11, marginTop: 4 }}>{att.description}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <a
                    href={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#60A5FA", fontSize: 11, textDecoration: "none" }}
                  >
                    View
                  </a>
                  <button
                    onClick={() => deleteAttachment(att.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#F87171", fontSize: 11, padding: 0 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {iter.attachments.length === 0 && (
        <p style={{ color: "#6B5F50", fontSize: 13, fontStyle: "italic" }}>No files uploaded yet.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={S.label}>Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={S.input}
            placeholder="Label for this upload"
            {...focus}
          />
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#F59E0B" : "#3D3427"}`,
            borderRadius: 12,
            padding: "32px 24px",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: dragOver ? "#F59E0B08" : "transparent",
            transition: "all 0.2s ease",
          }}
        >
          <p style={{ color: "#A89880", fontSize: 14 }}>{uploading ? "Uploading…" : "Drop files here or click to select"}</p>
          <p style={{ color: "#6B5F50", fontSize: 12, marginTop: 6 }}>JPG, PNG, WEBP, PDF, DOC, DOCX · Max 10MB</p>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
            multiple
            style={{ display: "none" }}
            onChange={(e) => uploadFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <img
            src={lightboxUrl}
            alt=""
            style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{ position: "absolute", top: 20, right: 24, background: "none", border: "none", color: "#F5F0E8", fontSize: 32, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Iteration Card ----

const ITER_TABS = [
  { id: "recipe",      label: "Recipe" },
  { id: "sensory",     label: "Sensory" },
  { id: "nutritional", label: "Nutritional" },
  { id: "files",       label: "Files" },
];

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
  const numPad = String(iter.iterationNumber).padStart(2, "0");
  const sensoryAvg = avgOverall(iter.evaluations);

  const tabBadges: Record<string, number | null> = {
    sensory:     iter.evaluations.length > 0 ? iter.evaluations.length : null,
    files:       iter.attachments.length > 0 ? iter.attachments.length : null,
    recipe:      null,
    nutritional: null,
  };

  return (
    <div ref={cardRef} id={`iter-${iter.id}`} style={{ ...S.card, position: "relative" }}>
      {/* Watermark number */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -10,
          right: 16,
          fontSize: "6rem",
          fontWeight: 900,
          color: "#F59E0B",
          opacity: 0.06,
          lineHeight: 1,
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      >
        {numPad}
      </div>

      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          textAlign: "left",
          padding: "18px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        <div style={{ transition: "transform 0.25s ease", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", color: "#F59E0B", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <ChevronDown size={16} />
        </div>
        <span style={{ color: "#F59E0B", fontWeight: 700, fontSize: "1.05rem" }}>
          Iteration {numPad}
        </span>
        <span style={{ color: "#A89880", fontSize: 13 }}>
          {fmtDate(iter.datePerformed)} · {iter.performedBy}
        </span>
        <StatusBadge status={iter.status} />
        {sensoryAvg !== null && (
          <span style={{ marginLeft: "auto", color: "#F59E0B", fontSize: 13, flexShrink: 0 }}>
            ★ {sensoryAvg.toFixed(1)}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid #3D3427", padding: "0 20px 20px", position: "relative", zIndex: 1 }}>
          {/* Underline tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #3D3427", marginBottom: 20, paddingTop: 4 }}>
            {ITER_TABS.map((tab) => {
              const active = activeTab === tab.id;
              const badge = tabBadges[tab.id];
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: `2px solid ${active ? "#F59E0B" : "transparent"}`,
                    cursor: "pointer",
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? "#F59E0B" : "#A89880",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {tab.label}
                  {badge !== null && (
                    <span style={{ fontSize: 10, backgroundColor: active ? "#F59E0B" : "#3D3427", color: active ? "#1A1714" : "#A89880", borderRadius: 10, padding: "1px 5px", fontWeight: 700 }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === "recipe"      && <RecipeTab iter={iter} projectId={project.id} onSaved={onSaved} />}
          {activeTab === "sensory"     && <SensoryTab iter={iter} onSaved={onSaved} />}
          {activeTab === "nutritional" && <NutritionalTab iter={iter} project={project} onSaved={onSaved} />}
          {activeTab === "files"       && <FilesTab iter={iter} onSaved={onSaved} />}
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

function CompareDisplay({ result }: { result: CompareResult }) {
  const allNames = Array.from(new Set([
    ...result.iter1.ingredients.map((i) => i.name),
    ...result.iter2.ingredients.map((i) => i.name),
  ]));

  const thStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#6B5F50",
    paddingBottom: 8,
    textAlign: "left",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Recipe diff */}
      <div>
        <span style={S.sectionLabel}>Recipe Diff</span>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Ingredient</th>
                <th style={{ ...thStyle, textAlign: "right" }}>
                  <span style={{ color: "#F59E0B" }}>Iter {result.iter1.number}</span>
                </th>
                <th style={{ ...thStyle, textAlign: "right" }}>
                  <span style={{ color: "#60A5FA" }}>Iter {result.iter2.number}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {allNames.map((name) => {
                const i1 = result.iter1.ingredients.find((i) => i.name.toLowerCase() === name.toLowerCase());
                const i2 = result.iter2.ingredients.find((i) => i.name.toLowerCase() === name.toLowerCase());
                const changed = !i1 || !i2 || i1.quantity !== i2.quantity;
                const rowBg = !i1 ? "#34D39910" : !i2 ? "#F8717110" : changed ? "#F59E0B10" : "transparent";
                return (
                  <tr key={name} style={{ borderBottom: "1px solid #3D3427", backgroundColor: rowBg }}>
                    <td style={{ padding: "8px 0", color: "#F5F0E8" }}>{name}</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace", color: i1 ? "#A89880" : "#F87171" }}>
                      {i1 ? `${i1.quantity ?? "—"} ${i1.unit ?? ""}` : <span style={{ textDecoration: "line-through" }}>removed</span>}
                    </td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace", color: i2 ? (changed ? "#F59E0B" : "#A89880") : "#34D399" }}>
                      {i2 ? `${i2.quantity ?? "—"} ${i2.unit ?? ""}` : <span>✨ new</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sensory comparison */}
      {(result.iter1.evaluations.length > 0 || result.iter2.evaluations.length > 0) && (
        <div>
          <span style={S.sectionLabel}>Sensory Comparison</span>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Attribute</th>
                <th style={{ ...thStyle, textAlign: "right", color: "#F59E0B" }}>Iter {result.iter1.number}</th>
                <th style={{ ...thStyle, textAlign: "right", color: "#60A5FA" }}>Iter {result.iter2.number}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {SENSORY_ATTRS.map(({ key, label }) => {
                const a1 = avgAttribute(result.iter1.evaluations, key);
                const a2 = avgAttribute(result.iter2.evaluations, key);
                const delta = a1 !== null && a2 !== null ? a2 - a1 : null;
                return (
                  <tr key={key} style={{ borderBottom: "1px solid #3D3427" }}>
                    <td style={{ padding: "8px 0", color: "#A89880" }}>{label}</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace", color: "#A89880" }}>{a1 !== null ? a1.toFixed(1) : "—"}</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace", color: "#A89880" }}>{a2 !== null ? a2.toFixed(1) : "—"}</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: delta !== null ? (delta > 0 ? "#34D399" : delta < 0 ? "#F87171" : "#6B5F50") : "#6B5F50" }}>
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
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  }

  function openDeleteModal() {
    setShowDeleteModal(true);
    setDeleteError(null);
    setTimeout(() => deleteCancelRef.current?.focus(), 50);
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/rd/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete project");
      }
      router.push("/dashboard/admin/rd/projects");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  async function refreshProject() {
    try {
      const res = await fetch(`/api/rd/projects/${initialProject.id}`);
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
      }
    } catch {
      // ignore — router.refresh() will handle server components
    }
    router.refresh();
  }

  const [editNutritionOpen, setEditNutritionOpen] = useState(false);
  const [editCollaborators, setEditCollaborators] = useState<{ name: string; email: string }[]>(
    ((project.collaborators as { name: string; email: string | null }[] | null) ?? []).map((c) => ({
      name: c.name,
      email: c.email ?? "",
    }))
  );

  const [editForm, setEditForm] = useState({
    name: project.name,
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
    const res = await fetch(`/api/rd/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description || null,
        targetServingSize: editForm.targetServingSize || null,
        startedDate: editForm.startedDate || null,
        targetLaunchDate: editForm.targetLaunchDate || null,
        collaborators: editCollaborators.filter((c) => c.name.trim()).map((c) => ({
          name: c.name.trim(),
          email: c.email.trim() || null,
        })),
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
    if (res.ok) {
      await refreshProject();
      showSuccess("Project updated successfully");
    }
  }

  async function onSaved() {
    await refreshProject();
  }

  const targetCount = NUTRIENTS.filter((n) => project[n.targetField] !== null).length;
  const heroAccentColor = RD_STATUS[project.status]?.color ?? "#8B8B8B";
  const latestSensoryAvg = (() => {
    for (const iter of [...project.iterations].reverse()) {
      const avg = avgOverall(iter.evaluations);
      if (avg !== null) return avg;
    }
    return null;
  })();

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: 80 }}>

      {/* ── Hero ── */}
      <div style={{ position: "relative", paddingBottom: 28, marginBottom: 24 }}>
        {/* Subtle status gradient */}
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at top left, ${heroAccentColor}0D 0%, transparent 55%)`, pointerEvents: "none", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Lab pill */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 20, background: "#F59E0B15", border: "1px solid #F59E0B40", color: "#F59E0B", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                🧪 R&D Lab
              </span>
            </div>

            {/* Project name */}
            <h1 style={{ color: "#F5F0E8", fontSize: "2.5rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 10 }}>
              {project.name}
            </h1>

            {project.description && (
              <p style={{ color: "#A89880", fontSize: 15, marginBottom: 16, maxWidth: 560 }}>
                {project.description}
              </p>
            )}

            {/* Meta row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              <StatusBadge status={project.status} />
              <span style={{ color: "#6B5F50", fontSize: 13 }}>
                Started {fmtDate(project.startedDate)}
              </span>
              {project.targetLaunchDate && (
                <>
                  <span style={{ color: "#3D3427" }}>·</span>
                  <span style={{ color: "#6B5F50", fontSize: 13 }}>Target: {fmtDate(project.targetLaunchDate)}</span>
                  {!["closed_launched", "closed_discontinued"].includes(project.status) && (() => {
                    const days = Math.ceil((new Date(project.targetLaunchDate!).getTime() - Date.now()) / 86400000);
                    if (days > 0) {
                      return (
                        <span style={{ color: days < 30 ? "#F59E0B" : "#34D399", fontSize: 12, fontWeight: 600 }}>
                          ⏱ {days}d to target
                        </span>
                      );
                    }
                    return null;
                  })()}
                </>
              )}
            </div>

            {/* Collaborators */}
            {(() => {
              const collabs = project.collaborators as { name: string; email: string | null }[] | null | undefined;
              if (!collabs || collabs.length === 0) return null;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ color: "#6B5F50", fontSize: 12 }}>Collaborators:</span>
                  {collabs.map((c, i) =>
                    c.email ? (
                      <a
                        key={i}
                        href={`mailto:${c.email}`}
                        style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500, color: "#F59E0B", backgroundColor: "#F59E0B15", border: "1px solid #F59E0B40", textDecoration: "none" }}
                      >
                        {c.name}
                      </a>
                    ) : (
                      <span
                        key={i}
                        style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500, color: "#F59E0B", backgroundColor: "#F59E0B15", border: "1px solid #F59E0B40" }}
                      >
                        {c.name}
                      </span>
                    )
                  )}
                </div>
              );
            })()}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowStatusDropdown((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1px solid #3D3427", background: "transparent", color: "#A89880", fontSize: 13, cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#F59E0B"; }}
                  onMouseLeave={(e) => { if (!showStatusDropdown) (e.currentTarget as HTMLButtonElement).style.borderColor = "#3D3427"; }}
                >
                  Change Status <ChevronDown size={12} />
                </button>
                {showStatusDropdown && (
                  <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", backgroundColor: "#2E2820", border: "1px solid #3D3427", borderRadius: 12, minWidth: 220, zIndex: 30, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
                    {STATUS_OPTIONS.map((opt) => {
                      const sc = RD_STATUS[opt.value];
                      return (
                        <button
                          key={opt.value}
                          onClick={() => handleStatusChange(opt.value)}
                          style={{ width: "100%", textAlign: "left", padding: "10px 16px", background: "transparent", border: "none", color: sc?.color ?? "#F5F0E8", fontSize: 13, cursor: "pointer" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#3D3427"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditingProject((v) => !v)}
                style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #3D3427", background: "transparent", color: "#A89880", fontSize: 13, cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#F59E0B"; (e.currentTarget as HTMLButtonElement).style.color = "#F5F0E8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3D3427"; (e.currentTarget as HTMLButtonElement).style.color = "#A89880"; }}
              >
                {editingProject ? "Cancel Edit" : "Edit Project"}
              </button>
              <button
                onClick={openDeleteModal}
                style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #F87171", background: "transparent", color: "#F87171", fontSize: 13, cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F8717115"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                Delete Project
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 28, flexShrink: 0, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "4rem", fontWeight: 800, color: "#F59E0B", lineHeight: 1 }}>
                {project.iterations.length}
              </div>
              <div style={{ color: "#6B5F50", fontSize: 12, marginTop: 4 }}>iterations</div>
            </div>
            {latestSensoryAvg !== null && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "3rem", fontWeight: 800, color: "#F59E0B", lineHeight: 1 }}>
                  ★{latestSensoryAvg.toFixed(1)}
                </div>
                <div style={{ color: "#6B5F50", fontSize: 12, marginTop: 4 }}>avg score</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit Project Form ── */}
      {editingProject && (
        <form onSubmit={handleEditProjectSubmit} style={{ ...S.cardPadded, marginBottom: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={S.sectionLabel}>Edit Project Details</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={S.label}>Project Name</label>
              <input type="text" required value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} style={S.input} {...focus} />
            </div>
            <div>
              <label style={S.label}>Started Date</label>
              <input type="date" value={editForm.startedDate} onChange={(e) => setEditForm((p) => ({ ...p, startedDate: e.target.value }))} style={{ ...S.input, colorScheme: "dark" }} {...focus} />
            </div>
            <div>
              <label style={S.label}>Target Launch Date</label>
              <input type="date" value={editForm.targetLaunchDate} onChange={(e) => setEditForm((p) => ({ ...p, targetLaunchDate: e.target.value }))} style={{ ...S.input, colorScheme: "dark" }} {...focus} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={S.label}>Description</label>
              <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} style={{ ...S.input, resize: "vertical" }} {...focus} />
            </div>

            {/* Collaborators */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={S.label}>Collaborators</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {editCollaborators.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => setEditCollaborators((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Name *"
                      style={{ ...S.input, flex: 1 }}
                      {...focus}
                    />
                    <input
                      type="email"
                      value={c.email}
                      onChange={(e) => setEditCollaborators((prev) => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                      placeholder="Email (optional)"
                      style={{ ...S.input, flex: 1 }}
                      {...focus}
                    />
                    <button
                      type="button"
                      onClick={() => setEditCollaborators((prev) => prev.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#6B5F50", fontSize: 20, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#F87171"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6B5F50"; }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditCollaborators((prev) => [...prev, { name: "", email: "" }])}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#F59E0B", fontSize: 13, textAlign: "left", padding: "4px 0" }}
                >
                  + Add collaborator
                </button>
              </div>
            </div>
          </div>

          {/* Nutritional Targets — collapsible */}
          <div style={{ borderTop: "1px solid #3D3427", paddingTop: 16 }}>
            <button
              type="button"
              onClick={() => setEditNutritionOpen((v) => !v)}
              style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: "0 0 12px" }}
            >
              <span style={S.sectionLabel}>Nutritional Targets</span>
              <span style={{ color: "#6B5F50", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                {editNutritionOpen ? "Collapse" : "Expand"}
                <div style={{ transition: "transform 0.2s ease", transform: editNutritionOpen ? "rotate(0deg)" : "rotate(-90deg)", display: "flex" }}>
                  <ChevronDown size={13} />
                </div>
              </span>
            </button>
            {editNutritionOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Serving size first */}
                <div>
                  <label style={S.label}>Target Serving Size</label>
                  <input type="text" value={editForm.targetServingSize} onChange={(e) => setEditForm((p) => ({ ...p, targetServingSize: e.target.value }))} style={{ ...S.input, maxWidth: 280 }} placeholder="e.g. 28g" {...focus} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {NUTRIENTS.map(({ label, targetField, tolField, unit }) => {
                    const tf = targetField as string;
                    const tlf = tolField as string;
                    return (
                      <div key={tf} style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ ...S.label, marginBottom: 4 }}>
                            {label} <span style={{ color: "#6B5F50", textTransform: "none", fontWeight: 400, fontFamily: "monospace", letterSpacing: 0 }}>({unit})</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={(editForm as Record<string, string>)[tf]}
                            onChange={(e) => setEditForm((p) => ({ ...p, [tf]: e.target.value }))}
                            placeholder="—"
                            style={S.input}
                            {...focus}
                          />
                        </div>
                        <div style={{ width: 80, flexShrink: 0 }}>
                          <label style={{ ...S.label, marginBottom: 4 }}>Tol.</label>
                          <select
                            value={(editForm as Record<string, string>)[tlf]}
                            onChange={(e) => setEditForm((p) => ({ ...p, [tlf]: e.target.value }))}
                            style={S.input}
                            {...focus}
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
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="submit"
              style={{ backgroundColor: "#F59E0B", color: "#1A1714", padding: "10px 20px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
            >
              Save Changes
            </button>
            <button type="button" onClick={() => setEditingProject(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A89880", fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Nutritional Targets Summary ── */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <button
          onClick={() => setShowNutritionExpanded((v) => !v)}
          style={{ width: "100%", textAlign: "left", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ transition: "transform 0.25s ease", transform: showNutritionExpanded ? "rotate(0deg)" : "rotate(-90deg)", color: "#6B5F50", display: "flex", alignItems: "center" }}>
              <ChevronDown size={14} />
            </div>
            <span style={{ color: "#A89880", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Nutritional Targets
            </span>
            <span style={{ color: "#6B5F50", fontSize: 12 }}>{targetCount} target{targetCount !== 1 ? "s" : ""} set</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setEditingProject(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#F59E0B", fontSize: 12 }}
          >
            Edit targets
          </button>
        </button>
        {showNutritionExpanded && (
          <div style={{ padding: "4px 20px 20px", borderTop: "1px solid #3D3427" }}>
            {targetCount === 0 ? (
              <p style={{ color: "#6B5F50", fontSize: 13, fontStyle: "italic", paddingTop: 12 }}>No targets set.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, paddingTop: 12 }}>
                {NUTRIENTS.map(({ label, targetField, tolField, unit }) => {
                  const target = project[targetField] as number | null;
                  const tol = project[tolField] as string | null;
                  if (target === null) return null;
                  return (
                    <div key={String(targetField)} style={{ backgroundColor: "#1A1714", borderRadius: 10, padding: "10px 12px", border: "1px solid #3D3427" }}>
                      <p style={{ color: "#6B5F50", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label} ({unit})</p>
                      <p style={{ color: "#F59E0B", fontSize: 16, fontWeight: 700, fontFamily: "monospace", marginTop: 2 }}>
                        {toleranceSymbol(tol)}{target}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Iterations section ── */}
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ color: "#A89880", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Iterations
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {project.iterations.length >= 2 && (
              <button
                onClick={() => { setShowCompare((v) => !v); setCompareResult(null); }}
                style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #3D3427", background: "transparent", color: "#A89880", fontSize: 13, cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#F59E0B"; (e.currentTarget as HTMLButtonElement).style.color = "#F5F0E8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3D3427"; (e.currentTarget as HTMLButtonElement).style.color = "#A89880"; }}
              >
                {showCompare ? "Hide Compare" : "Compare Iterations"}
              </button>
            )}
            <button
              onClick={() => setShowNewIterationForm((v) => !v)}
              style={{ padding: "8px 16px", borderRadius: 10, backgroundColor: "#F59E0B", color: "#1A1714", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
            >
              {showNewIterationForm ? "Cancel" : "+ New Iteration"}
            </button>
          </div>
        </div>

        {/* Compare panel */}
        {showCompare && (
          <div style={{ ...S.cardPadded, marginBottom: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <select
                value={compareIter1}
                onChange={(e) => setCompareIter1(e.target.value)}
                style={{ ...S.inputSm, width: "auto" }}
                {...focus}
              >
                <option value="">Select iteration…</option>
                {project.iterations.map((i) => <option key={i.id} value={i.id}>Iteration {i.iterationNumber}</option>)}
              </select>
              <span style={{ color: "#6B5F50", fontSize: 13 }}>vs</span>
              <select
                value={compareIter2}
                onChange={(e) => setCompareIter2(e.target.value)}
                style={{ ...S.inputSm, width: "auto" }}
                {...focus}
              >
                <option value="">Select iteration…</option>
                {project.iterations.map((i) => <option key={i.id} value={i.id}>Iteration {i.iterationNumber}</option>)}
              </select>
              <button
                onClick={handleCompare}
                disabled={!compareIter1 || !compareIter2 || compareIter1 === compareIter2}
                style={{ padding: "8px 16px", borderRadius: 10, backgroundColor: "#F59E0B", color: "#1A1714", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: (!compareIter1 || !compareIter2 || compareIter1 === compareIter2) ? 0.5 : 1 }}
                onMouseEnter={(e) => { if (compareIter1 && compareIter2 && compareIter1 !== compareIter2) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
              >
                Compare
              </button>
            </div>
            {compareResult && <CompareDisplay result={compareResult} />}
          </div>
        )}

        {/* New iteration form */}
        {showNewIterationForm && (
          <div style={{ marginBottom: 16 }}>
            <NewIterationForm
              projectId={project.id}
              iterationNumber={project.iterations.length + 1}
              onClose={() => setShowNewIterationForm(false)}
              onSaved={onSaved}
              onIterationCreated={(id) => {
                expandIteration(id);
                scrollToIteration(id);
                showSuccess(`Iteration ${project.iterations.length + 1} saved`);
              }}
            />
          </div>
        )}

        {/* Timeline + Cards */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Vertical timeline (desktop) */}
          {project.iterations.length > 0 && (
            <div className="hidden sm:flex" style={{ flexDirection: "column", alignItems: "center", width: 72, flexShrink: 0, paddingTop: 22 }}>
              {project.iterations.map((iter, i) => (
                <React.Fragment key={iter.id}>
                  <button
                    onClick={() => { expandIteration(iter.id); scrollToIteration(iter.id); }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: "4px 0", width: "100%" }}
                  >
                    <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#F59E0B", boxShadow: "0 0 8px rgba(245,158,11,0.4)", flexShrink: 0 }} />
                    <span style={{ color: "#F59E0B", fontWeight: 700, fontSize: 13, lineHeight: 1 }}>
                      {String(iter.iterationNumber).padStart(2, "0")}
                    </span>
                    <span style={{ color: "#6B5F50", fontSize: 10, fontFamily: "monospace" }}>
                      {fmtDateShort(iter.datePerformed)}
                    </span>
                    {avgOverall(iter.evaluations) !== null && (
                      <span style={{ color: "#F59E0B", fontSize: 10 }}>
                        ★{avgOverall(iter.evaluations)!.toFixed(1)}
                      </span>
                    )}
                  </button>
                  {i < project.iterations.length - 1 && (
                    <div style={{ width: 2, minHeight: 28, borderLeft: "2px dashed #3D3427", margin: "3px 0" }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Cards */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {project.iterations.length === 0 && !showNewIterationForm && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#6B5F50", fontSize: 14 }}>
                No iterations yet. Click &ldquo;+ New Iteration&rdquo; to get started.
              </div>
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
        </div>
      </div>

      {/* ── Back link ── */}
      <div style={{ paddingTop: 32 }}>
        <Link
          href="/dashboard/admin/rd/projects"
          style={{ color: "#6B5F50", fontSize: 13, textDecoration: "none", transition: "color 0.15s ease" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#A89880"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#6B5F50"; }}
        >
          ← Back to Projects
        </Link>
      </div>

      {/* ── Success toast ── */}
      {successMsg && (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 100, backgroundColor: "#34D399", color: "#1A1714", padding: "12px 20px", borderRadius: 12, boxShadow: "0 8px 24px rgba(52,211,153,0.3)", fontSize: 14, fontWeight: 600 }}>
          {successMsg}
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {showDeleteModal && (() => {
        const iterCount = project.iterations.length;
        const evalCount = project.iterations.reduce((s, it) => s + it.evaluations.length, 0);
        const fileCount = project.iterations.reduce((s, it) => s + it.attachments.length, 0);
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 150, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
          >
            <div style={{ backgroundColor: "#252118", border: "1px solid #3D3427", borderRadius: 20, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
              <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid #3D3427" }}>
                <p style={{ color: "#F87171", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  Destructive Action
                </p>
                <h2 style={{ color: "#F5F0E8", fontSize: "1.25rem", fontWeight: 700 }}>Delete Project?</h2>
              </div>
              <div style={{ padding: "20px 28px" }}>
                <p style={{ color: "#A89880", fontSize: 14, marginBottom: 16 }}>This will permanently delete:</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#F5F0E8", fontSize: 14 }}>
                    <span style={{ color: "#F59E0B" }}>•</span>
                    <strong>{project.name}</strong>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#A89880", fontSize: 14 }}>
                    <span style={{ color: "#F59E0B" }}>•</span>
                    {iterCount} iteration{iterCount !== 1 ? "s" : ""}
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#A89880", fontSize: 14 }}>
                    <span style={{ color: "#F59E0B" }}>•</span>
                    {evalCount} sensory evaluation{evalCount !== 1 ? "s" : ""}
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#A89880", fontSize: 14 }}>
                    <span style={{ color: "#F59E0B" }}>•</span>
                    {fileCount} file attachment{fileCount !== 1 ? "s" : ""}
                  </li>
                </ul>
                <p style={{ color: "#6B5F50", fontSize: 12, fontStyle: "italic" }}>This action cannot be undone.</p>
                {deleteError && (
                  <div style={{ marginTop: 12, backgroundColor: "#F8717115", border: "1px solid #F87171", borderRadius: 8, padding: "8px 12px", color: "#F87171", fontSize: 13 }}>
                    {deleteError}
                  </div>
                )}
              </div>
              <div style={{ padding: "0 28px 24px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  ref={deleteCancelRef}
                  onClick={() => setShowDeleteModal(false)}
                  style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #3D3427", background: "transparent", color: "#A89880", fontSize: 14, cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#6B5F50"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3D3427"; }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #F87171", backgroundColor: "#F8717115", color: "#F87171", fontSize: 14, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1 }}
                  onMouseEnter={(e) => { if (!deleting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F8717125"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F8717115"; }}
                >
                  {deleting ? "Deleting…" : "Delete Permanently"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
