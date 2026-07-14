"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ToleranceType = "min" | "max" | "approx" | "exact";

interface FormState {
  name: string;
  productType: string;
  description: string;
  targetServingSize: string;
  startedDate: string;
  targetLaunchDate: string;
  status: string;
  targetCalories: string;
  targetCaloriesTolerance: ToleranceType;
  targetFat: string;
  targetFatTolerance: ToleranceType;
  targetSaturatedFat: string;
  targetSaturatedFatTolerance: ToleranceType;
  targetCarbs: string;
  targetCarbsTolerance: ToleranceType;
  targetFiber: string;
  targetFiberTolerance: ToleranceType;
  targetSugars: string;
  targetSugarsTolerance: ToleranceType;
  targetAddedSugars: string;
  targetAddedSugarsTolerance: ToleranceType;
  targetProtein: string;
  targetProteinTolerance: ToleranceType;
  targetSodium: string;
  targetSodiumTolerance: ToleranceType;
}

const NUTRIENTS: { label: string; field: keyof FormState; tolField: keyof FormState; unit: string }[] = [
  { label: "Calories", field: "targetCalories", tolField: "targetCaloriesTolerance", unit: "kcal" },
  { label: "Total Fat", field: "targetFat", tolField: "targetFatTolerance", unit: "g" },
  { label: "Saturated Fat", field: "targetSaturatedFat", tolField: "targetSaturatedFatTolerance", unit: "g" },
  { label: "Total Carbohydrate", field: "targetCarbs", tolField: "targetCarbsTolerance", unit: "g" },
  { label: "Dietary Fiber", field: "targetFiber", tolField: "targetFiberTolerance", unit: "g" },
  { label: "Total Sugars", field: "targetSugars", tolField: "targetSugarsTolerance", unit: "g" },
  { label: "Added Sugars", field: "targetAddedSugars", tolField: "targetAddedSugarsTolerance", unit: "g" },
  { label: "Protein", field: "targetProtein", tolField: "targetProteinTolerance", unit: "g" },
  { label: "Sodium", field: "targetSodium", tolField: "targetSodiumTolerance", unit: "mg" },
];

export default function NewProjectForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    name: "",
    productType: "bar",
    description: "",
    targetServingSize: "",
    startedDate: new Date().toISOString().split("T")[0],
    targetLaunchDate: "",
    status: "concept",
    targetCalories: "",
    targetCaloriesTolerance: "approx",
    targetFat: "",
    targetFatTolerance: "approx",
    targetSaturatedFat: "",
    targetSaturatedFatTolerance: "approx",
    targetCarbs: "",
    targetCarbsTolerance: "approx",
    targetFiber: "",
    targetFiberTolerance: "approx",
    targetSugars: "",
    targetSugarsTolerance: "approx",
    targetAddedSugars: "",
    targetAddedSugarsTolerance: "approx",
    targetProtein: "",
    targetProteinTolerance: "approx",
    targetSodium: "",
    targetSodiumTolerance: "approx",
  });

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: form.name,
      productType: form.productType,
      description: form.description || null,
      targetServingSize: form.targetServingSize || null,
      startedDate: form.startedDate,
      targetLaunchDate: form.targetLaunchDate || null,
      status: form.status,
    };

    for (const { field, tolField } of NUTRIENTS) {
      const val = form[field] as string;
      payload[field as string] = val !== "" ? parseFloat(val) : null;
      payload[tolField as string] = form[tolField];
    }

    try {
      const res = await fetch("/api/rd/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create project");
      }

      const result = await res.json();
      router.push(`/dashboard/admin/rd/projects/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const sectionClass = "text-sm font-semibold text-gray-700 uppercase tracking-wide";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-5 space-y-5">
        <h2 className={sectionClass}>Basic Information</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelClass}>
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
              placeholder="e.g. High-Protein Almond Bar v2"
            />
          </div>

          <div>
            <label className={labelClass}>
              Product Type <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.productType}
              onChange={(e) => set("productType", e.target.value)}
              className={inputClass}
            >
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
            <input
              type="text"
              value={form.targetServingSize}
              onChange={(e) => set("targetServingSize", e.target.value)}
              className={inputClass}
              placeholder="e.g. 28g, 1 bar, 2 tbsp"
            />
          </div>

          <div>
            <label className={labelClass}>
              Started Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={form.startedDate}
              onChange={(e) => set("startedDate", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Target Launch Date</label>
            <input
              type="date"
              value={form.targetLaunchDate}
              onChange={(e) => set("targetLaunchDate", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Status <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={inputClass}
            >
              <option value="concept">Concept</option>
              <option value="in_development">In Development</option>
              <option value="testing">Testing</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="closed_launched">Closed — Launched</option>
              <option value="closed_discontinued">Closed — Discontinued</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className={inputClass}
              placeholder="Brief description of the project goals and context"
            />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h2 className={sectionClass}>Target Nutritional Profile (per serving)</h2>
          <p className="text-xs text-gray-500 mt-1">
            Optional — set targets to track against as iterations progress
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {NUTRIENTS.map(({ label, field, tolField, unit }) => (
            <div key={field} className="flex items-center gap-3">
              <div className="w-44 text-sm text-gray-700 shrink-0">
                {label}{" "}
                <span className="text-gray-400 font-mono text-xs">({unit})</span>
              </div>
              <input
                type="number"
                min="0"
                step="any"
                value={form[field] as string}
                onChange={(e) => set(field, e.target.value)}
                placeholder="—"
                className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
              />
              <select
                value={form[tolField] as string}
                onChange={(e) => set(tolField, e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20 focus:border-[#C41E3A]"
              >
                <option value="min">≥ Minimum</option>
                <option value="max">≤ Maximum</option>
                <option value="approx">~ Approximate ±10%</option>
                <option value="exact">= Exact</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#C41E3A] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#A01830] transition-colors disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Project"}
        </button>
        <Link
          href="/dashboard/admin/rd/projects"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
