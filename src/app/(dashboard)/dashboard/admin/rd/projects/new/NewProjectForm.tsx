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

  const S = {
    card: {
      backgroundColor: "#252118",
      border: "1px solid #3D3427",
      borderRadius: 16,
      padding: "20px 24px",
    } as React.CSSProperties,
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
    label: {
      display: "block",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "#A89880",
      marginBottom: 6,
    } as React.CSSProperties,
    section: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color: "#F59E0B",
      marginBottom: 16,
    } as React.CSSProperties,
  };

  const inputFocusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = "#F59E0B";
      e.currentTarget.style.boxShadow = "0 0 0 2px rgba(245,158,11,0.15)";
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = "#3D3427";
      e.currentTarget.style.boxShadow = "none";
    },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div style={S.card}>
        <p style={S.section}>Basic Information</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label style={S.label}>Project Name <span style={{ color: "#F87171" }}>*</span></label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              style={S.input}
              placeholder="e.g. High-Protein Almond Bar v2"
              {...inputFocusHandlers}
            />
          </div>
          <div>
            <label style={S.label}>Product Type <span style={{ color: "#F87171" }}>*</span></label>
            <select
              required
              value={form.productType}
              onChange={(e) => set("productType", e.target.value)}
              style={{ ...S.input }}
              {...inputFocusHandlers}
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
            <label style={S.label}>Target Serving Size</label>
            <input
              type="text"
              value={form.targetServingSize}
              onChange={(e) => set("targetServingSize", e.target.value)}
              style={S.input}
              placeholder="e.g. 28g, 1 bar, 2 tbsp"
              {...inputFocusHandlers}
            />
          </div>
          <div>
            <label style={S.label}>Started Date <span style={{ color: "#F87171" }}>*</span></label>
            <input
              type="date"
              required
              value={form.startedDate}
              onChange={(e) => set("startedDate", e.target.value)}
              style={{ ...S.input, colorScheme: "dark" }}
              {...inputFocusHandlers}
            />
          </div>
          <div>
            <label style={S.label}>Target Launch Date</label>
            <input
              type="date"
              value={form.targetLaunchDate}
              onChange={(e) => set("targetLaunchDate", e.target.value)}
              style={{ ...S.input, colorScheme: "dark" }}
              {...inputFocusHandlers}
            />
          </div>
          <div>
            <label style={S.label}>Status <span style={{ color: "#F87171" }}>*</span></label>
            <select
              required
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              style={{ ...S.input }}
              {...inputFocusHandlers}
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
            <label style={S.label}>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              style={{ ...S.input, resize: "vertical" }}
              placeholder="Brief description of the project goals and context"
              {...inputFocusHandlers}
            />
          </div>
        </div>
      </div>

      <div style={S.card}>
        <p style={S.section}>Target Nutritional Profile (per serving)</p>
        <p className="text-xs mb-4" style={{ color: "#6B5F50" }}>
          Optional — set targets to track against as iterations progress
        </p>
        <div className="grid grid-cols-1 gap-3">
          {NUTRIENTS.map(({ label, field, tolField, unit }) => (
            <div key={field} className="flex items-center gap-3">
              <div className="w-44 text-sm shrink-0" style={{ color: "#A89880" }}>
                {label}{" "}
                <span className="font-mono text-xs" style={{ color: "#6B5F50" }}>({unit})</span>
              </div>
              <input
                type="number"
                min="0"
                step="any"
                value={form[field] as string}
                onChange={(e) => set(field, e.target.value)}
                placeholder="—"
                style={{ ...S.input, width: 112 }}
                {...inputFocusHandlers}
              />
              <select
                value={form[tolField] as string}
                onChange={(e) => set(tolField, e.target.value)}
                style={{ ...S.input, width: "auto" }}
                {...inputFocusHandlers}
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
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: "#F8717115", border: "1px solid #F87171", color: "#F87171" }}
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ backgroundColor: "#F59E0B", color: "#1A1714" }}
          onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FCD34D"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F59E0B"; }}
        >
          {submitting ? "Creating…" : "Create Project"}
        </button>
        <Link
          href="/dashboard/admin/rd/projects"
          className="text-sm"
          style={{ color: "#A89880" }}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
