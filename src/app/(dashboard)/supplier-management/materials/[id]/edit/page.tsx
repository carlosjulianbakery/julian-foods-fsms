"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";


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

const RISK_OPTIONS = [
  "Pesticide Residues",
  "Heavy Metal Contamination",
  "Mycotoxin Risk",
  "Microbiological Risk",
  "Cross-Contamination Risk",
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

/** Parse stored risks array back into selectedRisks + otherRisk. */
function parseStoredRisks(raw: string[]): { selected: string[]; other: string } {
  const selected: string[] = [];
  let other = "";
  for (const r of raw) {
    if (r.startsWith("Other: ")) {
      selected.push("Other");
      other = r.slice(7);
    } else {
      selected.push(r);
    }
  }
  return { selected, other };
}

export default function EditMaterialPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; hasAffected: boolean; suppliersCount: number } | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "INGREDIENT",
    unit: "",
    isOrganic: false,
    isAllergen: false,
    selectedAllergens: [] as string[],
    otherAllergen: "",
    isGlutenFree: false,
    hasSpecialRisk: false,
    selectedRisks: [] as string[],
    otherRisk: "",
    isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [usedInProducts, setUsedInProducts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetch(`/api/products?materialId=${params.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setUsedInProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [params.id]);

  useEffect(() => {
    fetch(`/api/supplier-management/materials/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        const rawAllergens: string[] = Array.isArray(data.allergens) ? data.allergens : [];
        const { selected: selAllergens, other: otherAllergen } = parseStoredAllergens(rawAllergens);
        const rawRisks: string[] = Array.isArray(data.specialRiskTypes) ? data.specialRiskTypes : [];
        const { selected: selRisks, other: otherRisk } = parseStoredRisks(rawRisks);
        setForm({
          name: data.name ?? "",
          description: data.description ?? "",
          category: data.category ?? "INGREDIENT",
          unit: data.unit ?? "",
          isOrganic: data.isOrganic ?? false,
          isAllergen: data.isAllergen ?? false,
          selectedAllergens: selAllergens,
          otherAllergen,
          isGlutenFree: data.isGlutenFree ?? false,
          hasSpecialRisk: data.hasSpecialRisk ?? false,
          selectedRisks: selRisks,
          otherRisk,
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
    if (form.hasSpecialRisk && form.selectedRisks.length === 0) {
      e.risks = "Select at least one risk type";
    }
    if (form.hasSpecialRisk && form.selectedRisks.includes("Other") && !form.otherRisk.trim()) {
      e.otherRisk = "Please describe the risk";
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

  function toggleRisk(option: string) {
    setForm((f) => ({
      ...f,
      selectedRisks: f.selectedRisks.includes(option)
        ? f.selectedRisks.filter((r) => r !== option)
        : [...f.selectedRisks, option],
    }));
  }

  function buildAllergenArray(): string[] {
    return form.selectedAllergens.map((a) =>
      a === "Other" ? `Other: ${form.otherAllergen.trim()}` : a
    );
  }

  function buildRiskArray(): string[] {
    return form.selectedRisks.map((r) =>
      r === "Other" ? `Other: ${form.otherRisk.trim()}` : r
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
          isOrganic: form.isOrganic,
          isAllergen: form.isAllergen,
          allergens: form.isAllergen ? buildAllergenArray() : null,
          isGlutenFree: form.isGlutenFree,
          hasSpecialRisk: form.hasSpecialRisk,
          specialRiskTypes: form.hasSpecialRisk ? buildRiskArray() : null,
          isActive: form.isActive,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const affected: number = data.affectedSuppliers ?? 0;
        if (affected > 0) {
          setToast({ msg: `Material saved. ${affected} linked supplier(s) now have additional document requirements.`, hasAffected: true, suppliersCount: affected });
          setTimeout(() => {
            setToast(null);
            router.push("/supplier-management/materials");
            router.refresh();
          }, 3000);
        } else {
          router.push("/supplier-management/materials");
          router.refresh();
        }
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
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-3 rounded-md shadow-lg flex items-center gap-3 max-w-sm">
          <div className="flex-1">
            <p>{toast.msg}</p>
            {toast.hasAffected && (
              <a href="/supplier-management/alerts" className="text-blue-400 hover:text-blue-300 underline text-xs mt-1 block">
                View Alerts →
              </a>
            )}
          </div>
        </div>
      )}

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
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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

        {/* Organic toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.isOrganic}
            onClick={() => setForm((f) => ({ ...f, isOrganic: !f.isOrganic }))}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              form.isOrganic ? "bg-green-500" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                form.isOrganic ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <label className="text-sm font-medium text-gray-700">Organic</label>
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

        {/* Gluten Free toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.isGlutenFree}
            onClick={() => setForm((f) => ({ ...f, isGlutenFree: !f.isGlutenFree }))}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              form.isGlutenFree ? "bg-blue-500" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                form.isGlutenFree ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <div>
            <label className="text-sm font-medium text-gray-700">Gluten Free?</label>
            <p className="text-xs text-gray-400 mt-0.5">Mark if this ingredient must arrive verified gluten free from supplier.</p>
          </div>
        </div>

        {/* Special Risk toggle */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.hasSpecialRisk}
              onClick={() => setForm((f) => ({ ...f, hasSpecialRisk: !f.hasSpecialRisk, selectedRisks: [], otherRisk: "" }))}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                form.hasSpecialRisk ? "bg-[#D64D4D]" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  form.hasSpecialRisk ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <div>
              <label className="text-sm font-medium text-gray-700">Special Risk?</label>
              <p className="text-xs text-gray-400 mt-0.5">Mark if this ingredient has a known contamination or residue concern requiring additional testing.</p>
            </div>
          </div>

          {form.hasSpecialRisk && (
            <div className="ml-12 space-y-3">
              <p className="text-xs font-medium text-gray-600">Select risk type(s): <span className="text-red-500">*</span></p>
              {errors.risks && <p className="text-xs text-red-500">{errors.risks}</p>}
              <div className="space-y-2">
                {RISK_OPTIONS.map((option) => (
                  <label key={option} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={form.selectedRisks.includes(option)}
                      onChange={() => toggleRisk(option)}
                      className="w-4 h-4 rounded border-gray-300 accent-[#D64D4D]"
                    />
                    <span className="text-sm text-gray-800 group-hover:text-gray-900">{option}</span>
                  </label>
                ))}
              </div>
              {form.selectedRisks.includes("Other") && (
                <div>
                  <input
                    className={`input mt-1 ${errors.otherRisk ? "border-red-400" : ""}`}
                    placeholder="Describe the risk"
                    value={form.otherRisk}
                    onChange={(e) => setForm((f) => ({ ...f, otherRisk: e.target.value }))}
                  />
                  {errors.otherRisk && <p className="text-xs text-red-500 mt-1">{errors.otherRisk}</p>}
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

      {/* Used In Products */}
      <div className="card p-6 mt-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Used In Products</h2>
        {usedInProducts.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono">This material is not used in any product yet.</p>
        ) : (
          <ul className="space-y-1">
            {usedInProducts.map((p) => (
              <li key={p.id}>
                <Link href={`/supplier-management/products/${p.id}`} className="text-sm text-gray-700 hover:text-[#D64D4D]">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
