"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { toUpperCaseInput } from "@/lib/formatters";

const CATEGORIES = ["INGREDIENT", "PACKAGING", "OTHER"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  INGREDIENT: "Ingredient",
  PACKAGING: "Packaging",
  OTHER: "Other",
};

const ALLERGEN_OPTIONS = [
  "Egg",
  "Peanut",
  "Milk (Whey, Cheese)",
  "Sesame",
  "Tree Nut (Coconut, Almond)",
  "Other",
] as const;

/** Parse stored allergens array back into selectedAllergens + otherAllergen. */
function parseStoredAllergens(raw: string[]): { selected: string[]; other: string } {
  const selected: string[] = [];
  let other = "";
  for (const a of raw) {
    if (a.startsWith("Other: ")) {
      selected.push("Other");
      other = a.slice(7);
    } else {
      selected.push(a);
    }
  }
  return { selected, other };
}

export default function EditMaterialPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "INGREDIENT",
    unit: "",
    isAllergen: false,
    selectedAllergens: [] as string[],
    otherAllergen: "",
    isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/supplier-management/materials/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        const rawAllergens: string[] = Array.isArray(data.allergens) ? data.allergens : [];
        const { selected, other } = parseStoredAllergens(rawAllergens);
        setForm({
          name: data.name ?? "",
          description: data.description ?? "",
          category: data.category ?? "INGREDIENT",
          unit: data.unit ?? "",
          isAllergen: data.isAllergen ?? false,
          selectedAllergens: selected,
          otherAllergen: other,
          isActive: data.isActive ?? true,
        });
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (form.isAllergen && form.selectedAllergens.length === 0) {
      e.allergens = "Select at least one allergen";
    }
    if (form.isAllergen && form.selectedAllergens.includes("Other") && !form.otherAllergen.trim()) {
      e.otherAllergen = "Please specify the allergen";
    }
    return e;
  }

  function toggleAllergen(option: string) {
    setForm((f) => ({
      ...f,
      selectedAllergens: f.selectedAllergens.includes(option)
        ? f.selectedAllergens.filter((a) => a !== option)
        : [...f.selectedAllergens, option],
    }));
  }

  function buildAllergenArray(): string[] {
    return form.selectedAllergens.map((a) =>
      a === "Other" ? `Other: ${form.otherAllergen.trim()}` : a
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/supplier-management/materials/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          category: form.category,
          unit: form.unit,
          isAllergen: form.isAllergen,
          allergens: form.isAllergen ? buildAllergenArray() : null,
          isActive: form.isActive,
        }),
      });
      if (res.ok) {
        router.push("/supplier-management/materials");
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to update material.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <Link href="/supplier-management/materials" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Materials
          </Link>
          <h1 className="page-title">Edit Material</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
          <input
            className={`input ${errors.name ? "border-red-400" : ""}`}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: toUpperCaseInput(e.target.value) }))}
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>

        {/* Unit */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit of Measure</label>
          <select
            className="input"
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
          >
            <option value="">Select unit of measure</option>
            <optgroup label="Weight">
              <option value="lb">lb</option>
              <option value="oz">oz</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
            </optgroup>
            <optgroup label="Volume">
              <option value="gal">gal</option>
              <option value="L">L</option>
              <option value="ml">ml</option>
              <option value="fl oz">fl oz</option>
            </optgroup>
            <optgroup label="Count">
              <option value="units">units</option>
              <option value="each">each</option>
              <option value="case">case</option>
              <option value="pallet">pallet</option>
            </optgroup>
            <optgroup label="Other">
              <option value="N/A">N/A</option>
            </optgroup>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        {/* Allergen toggle */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.isAllergen}
              onClick={() => setForm((f) => ({ ...f, isAllergen: !f.isAllergen, selectedAllergens: [], otherAllergen: "" }))}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                form.isAllergen ? "bg-amber-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  form.isAllergen ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <label className="text-sm font-medium text-gray-700">
              Is this material an allergen or does it contain an allergen?
            </label>
          </div>

          {form.isAllergen && (
            <div className="ml-12 space-y-3">
              <p className="text-xs font-medium text-gray-600">Select allergen(s): <span className="text-red-500">*</span></p>
              {errors.allergens && <p className="text-xs text-red-500">{errors.allergens}</p>}
              <div className="space-y-2">
                {ALLERGEN_OPTIONS.map((option) => (
                  <label key={option} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={form.selectedAllergens.includes(option)}
                      onChange={() => toggleAllergen(option)}
                      className="w-4 h-4 rounded border-gray-300 accent-amber-500"
                    />
                    <span className="text-sm text-gray-800 group-hover:text-gray-900">{option}</span>
                  </label>
                ))}
              </div>
              {form.selectedAllergens.includes("Other") && (
                <div>
                  <input
                    className={`input mt-1 ${errors.otherAllergen ? "border-red-400" : ""}`}
                    placeholder="Specify allergen"
                    value={form.otherAllergen}
                    onChange={(e) => setForm((f) => ({ ...f, otherAllergen: e.target.value }))}
                  />
                  {errors.otherAllergen && <p className="text-xs text-red-500 mt-1">{errors.otherAllergen}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300"
          />
          <label htmlFor="isActive" className="text-sm text-gray-700">Active (visible in forms)</label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/supplier-management/materials" className="btn-secondary">Cancel</Link>
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <><Save className="w-4 h-4" />Save Changes</>}
          </button>
        </div>
      </form>
    </div>
  );
}
