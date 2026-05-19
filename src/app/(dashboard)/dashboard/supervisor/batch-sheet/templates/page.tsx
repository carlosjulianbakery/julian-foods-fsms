"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Settings2,
  ChevronLeft,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
const UNITS = ["lbs", "oz", "kg", "g", "ml", "L", "tsp", "tbsp", "cup"] as const;
type Unit = (typeof UNITS)[number];

interface Ingredient {
  id: string;
  name: string;
  quantity_per_bowl: number;
  unit: Unit;
}

interface Template {
  id: string;
  name: string;
  ingredients: Ingredient[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function newIngredient(): Ingredient {
  return {
    id: Math.random().toString(36).slice(2),
    name: "",
    quantity_per_bowl: 1,
    unit: "lbs",
  };
}

// ---------------------------------------------------------------------------
// Ingredient row editor
// ---------------------------------------------------------------------------
function IngredientRow({
  ing,
  onChange,
  onRemove,
  canRemove,
}: {
  ing: Ingredient;
  onChange: (updated: Ingredient) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <tr className="group hover:bg-gray-50/60 transition-colors">
      <td className="px-3 py-2 w-6 text-gray-300">
        <GripVertical className="w-4 h-4" />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          className="input text-sm py-1.5"
          placeholder="Ingredient name"
          value={ing.name}
          onChange={(e) => onChange({ ...ing, name: e.target.value })}
          required
        />
      </td>
      <td className="px-2 py-1.5 w-32">
        <input
          type="number"
          min={0}
          step="any"
          className="input text-sm py-1.5 text-right"
          value={ing.quantity_per_bowl}
          onChange={(e) => onChange({ ...ing, quantity_per_bowl: Number(e.target.value) })}
          required
        />
      </td>
      <td className="px-2 py-1.5 w-28">
        <select
          className="input text-sm py-1.5"
          value={ing.unit}
          onChange={(e) => onChange({ ...ing, unit: e.target.value as Unit })}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5 w-10 text-right pr-4">
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className={cn(
            "p-1 rounded transition-colors",
            canRemove
              ? "text-gray-300 hover:text-red-500 hover:bg-red-50"
              : "text-gray-100 cursor-not-allowed"
          )}
          aria-label="Remove ingredient"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Template editor card
// ---------------------------------------------------------------------------
function TemplateEditor({
  template: initial,
  onSaved,
}: {
  template: Template;
  onSaved: (updated: Template) => void;
}) {
  const [name, setName]             = useState(initial.name);
  const [ingredients, setIngredients] = useState<Ingredient[]>(initial.ingredients);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [saved, setSaved]           = useState(false);

  const isDirty =
    name !== initial.name ||
    JSON.stringify(ingredients) !== JSON.stringify(initial.ingredients);

  function updateIngredient(idx: number, updated: Ingredient) {
    setIngredients((prev) => prev.map((ing, i) => (i === idx ? updated : ing)));
    setSaved(false);
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
    setSaved(false);
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, newIngredient()]);
    setSaved(false);
  }

  async function handleSave() {
    setError("");

    const empty = ingredients.find((ing) => !ing.name.trim());
    if (empty) { setError("All ingredients must have a name."); return; }
    if (!name.trim()) { setError("Template name is required."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/batch-sheet/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: initial.id, name: name.trim(), ingredients }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Save failed.");
        return;
      }
      const updated: Template = await res.json();
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      {/* Template name */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-4">
        <div className="flex-1">
          <label className="label text-xs mb-0.5">Template Name</label>
          <input
            type="text"
            className="input text-sm"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
          />
        </div>
        <div className="flex items-center gap-2 self-end">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={cn(
              "btn-primary py-2",
              (!isDirty && !saving) && "opacity-50 cursor-not-allowed"
            )}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save</>}
          </button>
        </div>
      </div>

      {/* Ingredient table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="w-6 px-3" />
              <th className="text-left px-2 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Ingredient</th>
              <th className="text-right px-2 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider w-32">Qty / Bowl</th>
              <th className="text-left px-2 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider w-28">Unit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ingredients.map((ing, idx) => (
              <IngredientRow
                key={ing.id}
                ing={ing}
                onChange={(updated) => updateIngredient(idx, updated)}
                onRemove={() => removeIngredient(idx)}
                canRemove={ingredients.length > 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Add ingredient */}
      <div className="px-5 py-3 border-t border-gray-100">
        <button
          type="button"
          onClick={addIngredient}
          className="inline-flex items-center gap-1.5 text-sm text-[#D64D4D] font-mono font-medium hover:text-[#C04040] transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Ingredient
        </button>
      </div>

      {error && (
        <div className="mx-5 mb-4 flex items-center gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function BatchSheetTemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState("");

  const role = (session?.user as { role?: string })?.role ?? "";

  const load = useCallback(() => {
    setFetchError("");
    fetch("/api/batch-sheet/templates")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setTemplates)
      .catch((e) => setFetchError(e.message ?? "Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "SUPERVISOR" && role !== "ADMIN") return;
    load();
  }, [status, role, load]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 font-mono text-sm">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
        Loading templates…
      </div>
    );
  }

  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return (
      <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm">
        <AlertCircle className="w-4 h-4" /> Access restricted to supervisors and administrators.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-[#D64D4D]" />
            Batch Sheet Templates
          </h1>
          <p className="page-subtitle">Edit ingredient lists and quantities used in batch sheet forms</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/supervisor/batch-sheet")}
          className="btn-secondary"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Form
        </button>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {fetchError}
          <button onClick={load} className="ml-auto underline">Retry</button>
        </div>
      )}

      {templates.length === 0 && !fetchError ? (
        <div className="card p-10 text-center">
          <Settings2 className="w-8 h-8 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-mono">No templates found.</p>
        </div>
      ) : (
        templates.map((tpl) => (
          <div key={tpl.id}>
            <TemplateEditor
              template={tpl}
              onSaved={(updated) =>
                setTemplates((prev) =>
                  prev.map((t) => (t.id === updated.id ? updated : t))
                )
              }
            />
          </div>
        ))
      )}

      <p className="text-xs text-gray-400 font-mono pb-8">
        Changes to a template only affect future batch sheets — existing records are not modified.
      </p>
    </div>
  );
}
