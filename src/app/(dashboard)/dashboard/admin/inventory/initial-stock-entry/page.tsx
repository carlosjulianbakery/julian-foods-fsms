"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const UNITS = ["lb", "oz", "kg", "g", "gal", "L", "ml", "fl oz", "units", "each", "case", "pallet"] as const;

interface SupplierBrand { id: string; brandName: string }
interface Supplier { id: string; name: string; status: string; brands: SupplierBrand[] }
interface Material {
  id: string; name: string; unit: string | null; category: string;
  isAllergen: boolean; isOrganic: boolean; isTemperatureSensitive: boolean; coaRequired: boolean;
  suppliers: { supplier: Supplier }[];
}

function statusColor(s: string) {
  if (s === "APPROVED") return "bg-emerald-100 text-emerald-700";
  if (s === "PENDING") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

interface EntryRow {
  id: number;
  materialId: string;
  supplierMode: "linked" | "unknown" | "other";
  selectedSupplierId: string;
  selectedBrandId: string;
  selectedBrandName: string;
  supplierNameOverride: string;
  lotNumber: string;
  quantity: string;
  unit: string;
  expirationDate: string;
  dateReceived: string;
  notes: string;
}

function blankRow(id: number): EntryRow {
  return {
    id, materialId: "", supplierMode: "linked",
    selectedSupplierId: "", selectedBrandId: "", selectedBrandName: "",
    supplierNameOverride: "", lotNumber: "", quantity: "", unit: "",
    expirationDate: "", dateReceived: "", notes: "",
  };
}

let _rowId = 1;

export default function InitialStockEntryPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rows, setRows] = useState<EntryRow[]>([blankRow(_rowId++)]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ created: number; lots: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/supplier-management/materials")
      .then((r) => r.json())
      .then((d: Material[]) => {
        const active = d.filter((m) => m.category !== "WIP");
        setMaterials(active);
      })
      .catch(() => {});
  }, []);

  const updateRow = useCallback(<K extends keyof EntryRow>(id: number, key: K, val: EntryRow[K]) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [key]: val } : r));
  }, []);

  function getMaterialSuppliers(materialId: string): Supplier[] {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return [];
    return mat.suppliers.map((s) => s.supplier);
  }

  function getSelectedMaterial(materialId: string): Material | undefined {
    return materials.find((m) => m.id === materialId);
  }

  function onMaterialChange(rowId: number, materialId: string) {
    const mat = materials.find((m) => m.id === materialId);
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      return {
        ...r, materialId,
        unit: mat?.unit ?? "",
        supplierMode: "linked",
        selectedSupplierId: "", selectedBrandId: "", selectedBrandName: "",
        supplierNameOverride: "",
      };
    }));
  }

  function onSupplierChange(rowId: number, supplierId: string) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      return { ...r, selectedSupplierId: supplierId, selectedBrandId: "", selectedBrandName: "" };
    }));
  }

  function onBrandChange(rowId: number, brandId: string) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const suppliers = getMaterialSuppliers(row.materialId);
    const sup = suppliers.find((s) => s.id === row.selectedSupplierId);
    const brand = sup?.brands.find((b) => b.id === brandId);
    setRows((prev) => prev.map((r) =>
      r.id === rowId ? { ...r, selectedBrandId: brandId, selectedBrandName: brand?.brandName ?? "" } : r
    ));
  }

  const grouped = {
    INGREDIENT: materials.filter((m) => m.category === "INGREDIENT"),
    PACKAGING: materials.filter((m) => m.category === "PACKAGING"),
    OTHER: materials.filter((m) => !["INGREDIENT", "PACKAGING", "WIP"].includes(m.category)),
  };

  async function handleSubmit() {
    setError(null);
    for (const row of rows) {
      if (!row.materialId) { setError("All rows must have a material selected."); return; }
      if (!row.quantity || isNaN(parseFloat(row.quantity))) { setError("All rows must have a valid quantity."); return; }
      if (!row.unit) { setError("All rows must have a unit."); return; }
    }

    setSubmitting(true);
    try {
      const entries = rows.map((row) => {
        const supplierId = row.supplierMode === "linked" ? (row.selectedSupplierId || undefined) : undefined;
        const brandId = supplierId ? (row.selectedBrandId || undefined) : undefined;
        const brandName = supplierId ? (row.selectedBrandName || undefined) : undefined;
        const supplierName =
          row.supplierMode === "other" ? row.supplierNameOverride
          : row.supplierMode === "unknown" ? "Unknown Supplier"
          : undefined;
        return {
          materialId: row.materialId,
          supplierId,
          supplierName,
          brandId,
          brandName,
          lotNumber: row.lotNumber.trim() || undefined,
          quantity: parseFloat(row.quantity),
          unit: row.unit,
          expirationDate: row.expirationDate || undefined,
          dateReceived: row.dateReceived || undefined,
          notes: row.notes.trim() || undefined,
        };
      });

      const res = await fetch("/api/inventory/initial-stock-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Submission failed."); return; }
      setSuccess(data);
      setRows([blankRow(_rowId++)]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inp = "px-3 py-2.5 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 w-full min-h-[44px]";

  return (
    <div className="max-w-5xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Initial Stock Entry</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add existing inventory that was on hand before the system was set up.</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/admin/inventory/initial-stock-entry/records")}
          className="btn-secondary text-sm"
        >
          View Records
        </button>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 flex items-center justify-between">
          <p className="text-sm text-emerald-700 font-medium">
            {success.created} entr{success.created === 1 ? "y" : "ies"} saved and {success.lots} inventory lot{success.lots !== 1 ? "s" : ""} created.
          </p>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}

      <div className="space-y-4">
        {rows.map((row, idx) => {
          const suppliers = getMaterialSuppliers(row.materialId);
          const mat = getSelectedMaterial(row.materialId);
          const selectedSupplier = suppliers.find((s) => s.id === row.selectedSupplierId);

          return (
            <div key={row.id} className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Entry {idx + 1}</p>
                {rows.length > 1 && (
                  <button onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                    className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Material */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Material <span className="text-red-500">*</span></label>
                <select className={inp} value={row.materialId} onChange={(e) => onMaterialChange(row.id, e.target.value)}>
                  <option value="">— Select material —</option>
                  {grouped.INGREDIENT.length > 0 && (
                    <optgroup label="Ingredients">
                      {grouped.INGREDIENT.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  )}
                  {grouped.PACKAGING.length > 0 && (
                    <optgroup label="Packaging">
                      {grouped.PACKAGING.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  )}
                  {grouped.OTHER.length > 0 && (
                    <optgroup label="Other">
                      {grouped.OTHER.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {mat && (
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {mat.isAllergen && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-mono font-semibold">ALLERGEN</span>}
                    {mat.isOrganic && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-mono font-semibold">ORGANIC</span>}
                    {mat.isTemperatureSensitive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono font-semibold">TEMP SENSITIVE</span>}
                    {mat.coaRequired && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-mono font-semibold">COA REQUIRED</span>}
                  </div>
                )}
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
                <div className="flex gap-2 mb-2">
                  {(["linked", "unknown", "other"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        updateRow(row.id, "supplierMode", mode);
                        updateRow(row.id, "selectedSupplierId", "");
                        updateRow(row.id, "selectedBrandId", "");
                        updateRow(row.id, "selectedBrandName", "");
                        updateRow(row.id, "supplierNameOverride", "");
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                        row.supplierMode === mode
                          ? "bg-brand-600 text-white border-brand-600"
                          : "border-gray-300 text-gray-500 hover:border-brand-400"
                      )}
                    >
                      {mode === "linked" ? "Select supplier" : mode === "unknown" ? "Unknown supplier" : "Other supplier…"}
                    </button>
                  ))}
                </div>

                {row.supplierMode === "linked" && (
                  <div className="space-y-2">
                    <select
                      className={inp}
                      value={row.selectedSupplierId}
                      onChange={(e) => onSupplierChange(row.id, e.target.value)}
                    >
                      <option value="">— Select supplier —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      {suppliers.length === 0 && row.materialId && (
                        <option disabled>No linked suppliers for this material</option>
                      )}
                    </select>
                    {row.selectedSupplierId && selectedSupplier && (
                      <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold", statusColor(selectedSupplier.status))}>
                        {selectedSupplier.status}
                      </span>
                    )}
                    {row.selectedSupplierId && selectedSupplier && selectedSupplier.brands.length > 0 && (
                      <select
                        className={inp}
                        value={row.selectedBrandId}
                        onChange={(e) => onBrandChange(row.id, e.target.value)}
                      >
                        <option value="">— Brand (optional) —</option>
                        {selectedSupplier.brands.map((b) => (
                          <option key={b.id} value={b.id}>{b.brandName}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {row.supplierMode === "other" && (
                  <input
                    type="text"
                    className={inp}
                    placeholder="Enter supplier name…"
                    value={row.supplierNameOverride}
                    onChange={(e) => updateRow(row.id, "supplierNameOverride", e.target.value)}
                  />
                )}
              </div>

              {/* Lot, Qty, Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Lot # <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" className={inp} placeholder="Auto-generated if blank"
                    value={row.lotNumber} onChange={(e) => updateRow(row.id, "lotNumber", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="any" className={inp}
                    value={row.quantity} onChange={(e) => updateRow(row.id, "quantity", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit <span className="text-red-500">*</span></label>
                  <select className={inp} value={row.unit} onChange={(e) => updateRow(row.id, "unit", e.target.value)}>
                    <option value="">— Unit —</option>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expiration Date <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="date" className={inp}
                    value={row.expirationDate} onChange={(e) => updateRow(row.id, "expirationDate", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Approx. Date Received <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="date" className={inp}
                    value={row.dateReceived} onChange={(e) => updateRow(row.id, "dateReceived", e.target.value)} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea className={cn(inp, "resize-none min-h-[60px]")}
                  value={row.notes} onChange={(e) => updateRow(row.id, "notes", e.target.value)}
                  placeholder="Any notes about this stock…" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, blankRow(_rowId++)])}
          className="btn-secondary flex items-center justify-center gap-1.5 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Add Another Material
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary disabled:opacity-60 w-full sm:w-auto"
        >
          {submitting ? "Saving…" : `Save All ${rows.length > 1 ? `${rows.length} Entries` : "Entry"}`}
        </button>
      </div>
    </div>
  );
}
