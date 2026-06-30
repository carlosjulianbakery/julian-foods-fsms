"use client";

import { useState, useEffect } from "react";
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

interface ProductOption {
  id: string;
  name: string;
  isWipMaterial?: boolean;
}

export default function NewMaterialPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
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
    materialType: "raw",
    sourceProductId: "",
    isTemperatureSensitive: false,
    coaRequired: false,
    minimumStockQuantity: "",
    minimumStockUnit: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.category) e.category = "Category is required";
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
      const res = await fetch("/api/supplier-management/materials", {
        method: "POST",
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
          materialType: form.materialType,
          sourceProductId: form.materialType === "wip" && form.sourceProductId ? form.sourceProductId : null,
          isTemperatureSensitive: form.isTemperatureSensitive,
          coaRequired: form.coaRequired,
          minimumStockQuantity: form.minimumStockQuantity.trim() !== "" ? parseFloat(form.minimumStockQuantity) : null,
          minimumStockUnit: form.minimumStockQuantity.trim() !== "" && form.minimumStockUnit.trim() !== "" ? form.minimumStockUnit : null,
        }),
      });
      if (res.ok) {
        router.push("/supplier-management/materials");
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to create material.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <Link href="/supplier-management/materials" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Materials
          </Link>
          <h1 className="page-title">New Material</h1>
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
            placeholder="e.g. Almond Flour"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
          <select
            className={`input ${errors.category ? "border-red-400" : ""}`}
            value={form.category}
            onChange={(e) => {
              const cat = e.target.value;
              setForm((f) => ({
                ...f,
                category: cat,
                materialType: cat === "PACKAGING" ? "packaging" : (f.materialType === "packaging" ? "raw" : f.materialType),
              }));
            }}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
        </div>

        {/* Material Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Material Type <span className="text-red-500">*</span></label>
          <select
            className="input"
            value={form.materialType}
            onChange={(e) => setForm((f) => ({ ...f, materialType: e.target.value, sourceProductId: "" }))}
          >
            <option value="raw">Raw Material (sourced from external supplier)</option>
            <option value="packaging">Packaging (sourced from external supplier)</option>
            <option value="wip">In-House / WIP (produced internally by Julian Bakery)</option>
          </select>
        </div>

        {/* WIP-specific fields */}
        {form.materialType === "wip" && (
          <div className="space-y-3">
            <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              This material is produced in-house. Supplier is automatically set to Julian Bakery (Internal Production).
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Linked Product (source batch sheet)</label>
              <select
                className="input"
                value={form.sourceProductId}
                onChange={(e) => setForm((f) => ({ ...f, sourceProductId: e.target.value }))}
              >
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Links this material to its production batch sheet for lot validation.</p>
            </div>
          </div>
        )}

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
            placeholder="Optional notes about this material"
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

        {/* Temperature Sensitive */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.isTemperatureSensitive}
            onClick={() => setForm((f) => ({ ...f, isTemperatureSensitive: !f.isTemperatureSensitive }))}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${form.isTemperatureSensitive ? "bg-blue-500" : "bg-gray-200"}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.isTemperatureSensitive ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <div>
            <label className="text-sm font-medium text-gray-700">Temperature Sensitive?</label>
            <p className="text-xs text-gray-400 mt-0.5">If yes, supervisor will be asked to record temperature at receiving.</p>
          </div>
        </div>

        {/* COA Required */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.coaRequired}
            onClick={() => setForm((f) => ({ ...f, coaRequired: !f.coaRequired }))}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${form.coaRequired ? "bg-purple-500" : "bg-gray-200"}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.coaRequired ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <div>
            <label className="text-sm font-medium text-gray-700">COA Required with Each Delivery?</label>
            <p className="text-xs text-gray-400 mt-0.5">If yes, supervisor must upload COA at receiving for each delivery of this material.</p>
          </div>
        </div>

        {/* Minimum Stock Level */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock Level</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="any"
              className="input flex-1"
              placeholder="Quantity"
              value={form.minimumStockQuantity}
              onChange={(e) => setForm((f) => ({ ...f, minimumStockQuantity: e.target.value }))}
            />
            <select
              className="input w-32"
              value={form.minimumStockUnit}
              onChange={(e) => setForm((f) => ({ ...f, minimumStockUnit: e.target.value }))}
            >
              <option value="">Unit</option>
              <option value="lb">lb</option>
              <option value="oz">oz</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="gal">gal</option>
              <option value="L">L</option>
              <option value="ml">ml</option>
              <option value="fl oz">fl oz</option>
              <option value="units">units</option>
              <option value="each">each</option>
              <option value="case">case</option>
            </select>
          </div>
          <p className="text-xs text-gray-400 mt-1">System will alert when inventory falls below this quantity. Leave blank if no minimum needed.</p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/supplier-management/materials" className="btn-secondary">Cancel</Link>
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <><Save className="w-4 h-4" />Create Material</>}
          </button>
        </div>
      </form>
    </div>
  );
}
