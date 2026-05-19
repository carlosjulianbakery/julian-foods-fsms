"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TemplateIngredient {
  id: string;
  name: string;
  quantity_per_bowl: number;
  unit: string;
}

interface Template {
  id: string;
  name: string;
  ingredients: TemplateIngredient[];
}

interface IngredientRow extends TemplateIngredient {
  total_quantity: number;
  supplier: string;
  lot_number: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function buildRows(template: Template, bowls: number): IngredientRow[] {
  return template.ingredients.map((ing) => ({
    ...ing,
    total_quantity: round2(ing.quantity_per_bowl * bowls),
    supplier: "",
    lot_number: "",
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function BatchSheetFormPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [date, setDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift]       = useState<"AM" | "PM">("AM");
  const [productName, setProductName] = useState("");
  const [bowls, setBowls]       = useState(1);
  const [rows, setRows]         = useState<IngredientRow[]>([]);
  const [notes, setNotes]       = useState("");
  const [signature, setSignature] = useState("");

  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);

  const role = (session?.user as { role?: string })?.role ?? "";

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "SUPERVISOR" && role !== "ADMIN") return;
    fetch("/api/batch-sheet/templates")
      .then((r) => r.json())
      .then((data: Template[]) => {
        setTemplates(data);
        if (data.length > 0) {
          setSelectedTemplate(data[0]);
          setRows(buildRows(data[0], 1));
        }
      })
      .finally(() => setLoadingTemplates(false));
  }, [status, role]);

  if (status === "loading" || loadingTemplates) return null;

  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return (
      <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm">
        <AlertCircle className="w-4 h-4" /> Access restricted to supervisors and administrators.
      </div>
    );
  }

  // ── handlers ──
  function handleBowlsChange(val: number) {
    const n = Math.max(1, val);
    setBowls(n);
    if (selectedTemplate) {
      setRows((prev) =>
        prev.map((row) => ({ ...row, total_quantity: round2(row.quantity_per_bowl * n) }))
      );
    }
  }

  function handleTemplateChange(id: string) {
    const t = templates.find((t) => t.id === id) ?? null;
    setSelectedTemplate(t);
    if (t) setRows(buildRows(t, bowls));
  }

  function updateRow(idx: number, field: "supplier" | "lot_number", value: string) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!selectedTemplate) { setError("No template selected."); return; }
    if (!productName.trim()) { setError("Product name is required."); return; }
    if (!signature.trim())   { setError("Supervisor signature is required."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/batch-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          date,
          shift,
          productName: productName.trim(),
          numberOfBowls: bowls,
          ingredients: rows,
          notes,
          supervisorSignature: signature,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Submission failed.");
        return;
      }
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setProductName("");
    setBowls(1);
    setNotes("");
    setSignature("");
    if (selectedTemplate) setRows(buildRows(selectedTemplate, 1));
    setSuccess(false);
    setError("");
  }

  // ── success screen ──
  if (success) {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center space-y-4">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold font-garamond text-gray-900">Batch Sheet Submitted</h2>
        <p className="text-sm text-gray-500 font-mono">The batch record has been saved.</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={resetForm} className="btn-secondary">New Batch Sheet</button>
          <button onClick={() => router.push("/dashboard/supervisor/batch-sheet/records")} className="btn-primary">
            View Records <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#D64D4D]" />
            Batch Sheet
          </h1>
          <p className="page-subtitle">Record ingredient quantities and lot numbers for each batch</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/supervisor/batch-sheet/records")}
          className="btn-secondary"
        >
          View Records
        </button>
      </div>

      {/* Top fields */}
      <div className="card p-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* Template */}
        {templates.length > 1 && (
          <div className="col-span-2 md:col-span-1">
            <label className="label" htmlFor="template">Template</label>
            <select
              id="template"
              className="input"
              value={selectedTemplate?.id ?? ""}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label">Shift</label>
          <div className="flex gap-2 mt-1">
            {(["AM", "PM"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShift(s)}
                className={cn(
                  "flex-1 py-2 rounded border text-sm font-mono font-medium transition-colors",
                  shift === s
                    ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                    : "bg-white text-gray-600 border-gray-300 hover:border-[#D64D4D] hover:text-[#D64D4D]"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="label" htmlFor="product">Product Name</label>
          <input
            id="product"
            type="text"
            className="input"
            placeholder="e.g. Sourdough Loaf"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="bowls">Number of Bowls</label>
          <input
            id="bowls"
            type="number"
            min={1}
            step={1}
            className="input"
            value={bowls}
            onChange={(e) => handleBowlsChange(Number(e.target.value))}
            required
          />
        </div>
      </div>

      {/* Ingredients table */}
      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 font-mono">Ingredients</h2>
            <span className="text-xs text-gray-400 font-mono">{bowls} bowl{bowls !== 1 ? "s" : ""}</span>
          </div>

          {/* Desktop table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider w-[28%]">Ingredient</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider w-[16%]">Per Bowl</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider w-[16%]">Total</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider w-[22%]">Supplier</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider w-[18%]">Lot #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, idx) => (
                  <tr key={row.id} className="group hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{row.name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {row.quantity_per_bowl} {row.unit}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block bg-[#FAE8E8] text-[#C04040] font-mono text-xs font-semibold px-2.5 py-1 rounded">
                        {row.total_quantity} {row.unit}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        className="input text-xs py-1.5"
                        placeholder="Supplier name"
                        value={row.supplier}
                        onChange={(e) => updateRow(idx, "supplier", e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2 pr-5">
                      <input
                        type="text"
                        className="input text-xs py-1.5"
                        placeholder="Lot number"
                        value={row.lot_number}
                        onChange={(e) => updateRow(idx, "lot_number", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="card p-5 space-y-2">
        <label className="label" htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          className="input min-h-[72px] resize-y"
          placeholder="Any deviations, observations, or additional information…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Signature */}
      <div className="card p-5">
        <label className="label" htmlFor="sig">Supervisor Signature</label>
        <input
          id="sig"
          type="text"
          className="input"
          placeholder="Type full name as signature"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          required
        />
        <p className="text-xs text-gray-400 font-mono mt-1">
          By signing, you certify that the batch was prepared in accordance with the recipe and all ingredients are correctly recorded.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <button type="button" onClick={resetForm} className="btn-secondary">Reset</button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
          ) : (
            "Submit Batch Sheet"
          )}
        </button>
      </div>
    </form>
  );
}
