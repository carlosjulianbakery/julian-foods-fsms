"use client";

import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";
import { convertUnit, getUnitFamily } from "@/lib/unitConversion";
import { formatQty, formatQtyUnit, formatDelta } from "@/lib/formatNumber";

interface Material { id: string; name: string; unit: string | null }
interface InventoryLot {
  id: string; lotNumber: string; quantityRemaining: number; unit: string;
  supplierName: string; receivedDate: string;
}
interface CycleCount {
  id: string; countDate: string; materialName: string; lotNumber: string;
  quantityExpected: number; quantityCounted: number;
  quantityCountedOriginal: number | null; quantityCountedOriginalUnit: string | null;
  variance: number; unit: string;
  reason: string | null; reasonOther: string | null;
  notes: string | null;
  performedAt: string; performedBy: { name: string };
}

const REASONS = ["spillage", "damage", "measurement_error", "theft", "other"] as const;

// Unit options per family for the "count in different unit" selector
const UNIT_OPTIONS: Record<string, string[]> = {
  weight: ["g", "kg", "lb", "oz"],
  volume: ["ml", "l", "cup", "tsp", "tbsp", "fl oz", "gal"],
  count: [],
};

const fmtDate = (d: string | null | undefined) => formatDate(d ?? null);

export default function CycleCountPage() {
  const searchParams = useSearchParams();
  const initMaterialId = searchParams.get("materialId") ?? "";
  const initLotId      = searchParams.get("lotId") ?? "";

  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState(initMaterialId);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [selectedLot, setSelectedLot] = useState<InventoryLot | null>(null);
  const [counted, setCounted] = useState("");
  const [countedUnit, setCountedUnit] = useState("");
  const [reason, setReason] = useState<string>("");
  const [reasonOther, setReasonOther] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [history, setHistory] = useState<CycleCount[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const pendingLotId = useRef(initLotId);

  useEffect(() => {
    fetch("/api/supplier-management/materials")
      .then((r) => r.json())
      .then((d) => setMaterials(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedMaterialId) { setLots([]); setSelectedLotId(""); return; }
    fetch(`/api/inventory/available-lots?material_id=${selectedMaterialId}`)
      .then((r) => r.json())
      .then((d: InventoryLot[]) => {
        const arr = Array.isArray(d) ? d : [];
        setLots(arr);
        // Pre-select lot from URL param if present
        if (pendingLotId.current) {
          const match = arr.find((l) => l.id === pendingLotId.current);
          if (match) setSelectedLotId(match.id);
          pendingLotId.current = "";
        } else {
          setSelectedLotId("");
        }
      })
      .catch(() => {});
  }, [selectedMaterialId]);

  useEffect(() => {
    if (!selectedLotId) { setSelectedLot(null); setCountedUnit(""); return; }
    const lot = lots.find((l) => l.id === selectedLotId) ?? null;
    setSelectedLot(lot);
    setCountedUnit(lot?.unit ?? "");
    setCounted("");
  }, [selectedLotId, lots]);

  useEffect(() => {
    fetch("/api/inventory/cycle-count")
      .then((r) => r.json())
      .then((d) => setHistory(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Unit options for the dropdown (same family as lot unit)
  const unitOptions = selectedLot
    ? (UNIT_OPTIONS[getUnitFamily(selectedLot.unit)] ?? [])
    : [];

  // Convert entered quantity to lot unit for variance
  const parsedCounted = counted !== "" ? parseFloat(counted) : NaN;
  const convResult =
    selectedLot && counted !== "" && !isNaN(parsedCounted) && countedUnit
      ? convertUnit(parsedCounted, countedUnit, selectedLot.unit)
      : null;

  // 0 is a valid count (lot physically empty) — avoid falsy coercion
  const countedInLotUnit: number | null =
    countedUnit === selectedLot?.unit
      ? (!isNaN(parsedCounted) && counted !== "" ? parsedCounted : null)
      : convResult?.possible
      ? convResult.result
      : null;

  const unitFamilyError =
    !!(countedUnit && selectedLot &&
    countedUnit !== selectedLot.unit &&
    convResult && !convResult.possible);

  const variance =
    selectedLot && countedInLotUnit !== null
      ? countedInLotUnit - selectedLot.quantityRemaining
      : null;

  const isDifferentUnit = countedUnit && selectedLot && countedUnit !== selectedLot.unit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLotId || counted === "" || !selectedLot) return;
    if (unitFamilyError) { alert("Cannot convert selected unit to lot unit."); return; }
    if (countedInLotUnit === null) { alert("Please enter a valid count."); return; }
    if (variance !== 0 && !reason) { alert("Reason is required when there is a variance."); return; }
    if (reason === "other" && !reasonOther.trim()) { alert("Please describe the reason."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/cycle-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryLotId: selectedLotId,
          quantityCounted: countedInLotUnit,
          quantityCountedOriginal: isDifferentUnit ? parseFloat(counted) : undefined,
          quantityCountedOriginalUnit: isDifferentUnit ? countedUnit : undefined,
          reason: reason || undefined,
          reasonOther: reason === "other" ? reasonOther : undefined,
          notes: notes || undefined,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const adj = d.variance;
        setToast(`Cycle count recorded. Inventory adjusted by ${formatDelta(adj, selectedLot.unit)}.`);
        setSelectedMaterialId("");
        setSelectedLotId("");
        setCounted("");
        setCountedUnit("");
        setReason("");
        setReasonOther("");
        setNotes("");
        setTimeout(() => setToast(null), 4000);
        fetch("/api/inventory/cycle-count").then((r) => r.json()).then((d) => setHistory(Array.isArray(d) ? d : [])).catch(() => {});
      } else {
        const d = await res.json();
        alert(d.error ?? "Failed.");
      }
    } finally { setSubmitting(false); }
  }

  const inp = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="max-w-2xl space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium max-w-sm">
          {toast}
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">Cycle Count</h1>
        <p className="text-sm text-gray-500">Reconcile physical counts with system quantities</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Step 1 — Material */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">1. Select Material</label>
          <select className={inp} value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)}>
            <option value="">Choose a material…</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* Step 2 — Lot */}
        {selectedMaterialId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">2. Select Lot</label>
            {lots.length === 0 ? (
              <p className="text-sm text-gray-400">No active inventory lots for this material.</p>
            ) : (
              <select className={inp} value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)}>
                <option value="">Choose a lot…</option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotNumber} — {l.quantityRemaining} {l.unit} (received {fmtDate(l.receivedDate)})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Step 3 — Count */}
        {selectedLot && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">3. Enter Physical Count</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">System Quantity</p>
                <div className={cn(inp, "bg-gray-50 text-gray-500 text-center font-semibold")}>
                  {formatQtyUnit(selectedLot.quantityRemaining, selectedLot.unit)}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Physically Counted</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={cn(inp, "flex-1")}
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    placeholder="0"
                  />
                  {unitOptions.length > 0 ? (
                    <select
                      className="px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                      value={countedUnit}
                      onChange={(e) => setCountedUnit(e.target.value)}
                    >
                      {unitOptions.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex items-center px-2 text-sm text-gray-500 bg-gray-50 border border-gray-300 rounded-md">
                      {selectedLot.unit}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Unit conversion preview */}
            {isDifferentUnit && counted && (
              <div className="mt-2 text-xs">
                {convResult?.possible ? (
                  <p className="text-blue-600">
                    {counted} {countedUnit} = {formatQtyUnit(convResult.result, selectedLot.unit)}
                  </p>
                ) : (
                  <p className="text-red-600 flex items-center gap-1">
                    ⚠ Cannot convert {countedUnit} to {selectedLot.unit} — different unit families. Please count in a {getUnitFamily(selectedLot.unit)} unit.
                  </p>
                )}
              </div>
            )}

            {counted && variance !== null && (
              <div className={cn("mt-3 p-3 rounded-md text-sm font-semibold text-center",
                variance === 0 ? "bg-emerald-50 text-emerald-700" :
                variance > 0 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
              )}>
                Variance: {formatDelta(variance, selectedLot.unit)}
                {isDifferentUnit && convResult?.possible && (
                  <p className="text-xs font-normal mt-0.5">
                    (counted {counted} {countedUnit} = {formatQtyUnit(countedInLotUnit, selectedLot.unit)})
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4 — Reason (if variance) */}
        {variance !== null && variance !== 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">4. Reason for Variance <span className="text-red-500">*</span></label>
            <select className={inp} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select reason…</option>
              {REASONS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1).replace("_", " ")}</option>)}
            </select>
            {reason === "other" && (
              <input type="text" className={cn(inp, "mt-2")} placeholder="Describe the reason…"
                value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} />
            )}
          </div>
        )}

        {/* Notes */}
        {selectedLot && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea className={cn(inp, "min-h-[60px]")} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any observations…" />
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !selectedLotId || counted === "" || !!unitFamilyError || countedInLotUnit === null}
          className="w-full btn-primary py-3 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Submit Cycle Count"}
        </button>
      </form>

      {/* History */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-900">Recent Cycle Counts</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Date", "Material", "Lot", "Expected", "Counted", "Variance", "By", ""].map((h, idx) => (
                <th key={idx} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-6 text-gray-400">No cycle counts yet.</td></tr>
            ) : history.map((c, i) => {
              const hasNote = !!(c.notes && c.notes.trim());
              const isExpanded = expandedNotes.has(c.id);
              const rowBg = i % 2 === 0 ? "bg-white" : "bg-gray-50/50";
              return (
                <React.Fragment key={c.id}>
                  <tr className={rowBg}>
                    <td className="px-3 py-2">{fmtDate(c.performedAt)}</td>
                    <td className="px-3 py-2 font-medium">{c.materialName}</td>
                    <td className="px-3 py-2 font-mono">{c.lotNumber}</td>
                    <td className="px-3 py-2">{formatQtyUnit(c.quantityExpected, c.unit)}</td>
                    <td className="px-3 py-2">
                      <div>
                        <span>{formatQtyUnit(c.quantityCounted, c.unit)}</span>
                        {c.quantityCountedOriginal !== null && c.quantityCountedOriginalUnit && c.quantityCountedOriginalUnit !== c.unit && (
                          <p className="text-[10px] text-gray-400">
                            (entered as {formatQtyUnit(c.quantityCountedOriginal, c.quantityCountedOriginalUnit)})
                          </p>
                        )}
                      </div>
                    </td>
                    <td className={cn("px-3 py-2 font-semibold", c.variance === 0 ? "text-gray-500" : c.variance > 0 ? "text-amber-600" : "text-red-600")}>
                      {formatDelta(c.variance, c.unit)}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{c.performedBy.name}</td>
                    <td className="px-3 py-2 text-center" style={{ width: 44 }}>
                      {hasNote && (
                        <button
                          onClick={() => setExpandedNotes((prev) => {
                            const next = new Set(prev);
                            next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                            return next;
                          })}
                          title={isExpanded ? "Hide note" : "Show note"}
                          style={{ minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: "0 4px" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6B7280"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; }}
                        >
                          <span style={{ fontSize: 10, marginRight: 2 }}>📝</span>
                          <span style={{
                            display: "inline-block",
                            transition: "transform 0.2s ease",
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                            fontSize: 10,
                          }}>▼</span>
                        </button>
                      )}
                    </td>
                  </tr>
                  {hasNote && isExpanded && (
                    <tr className={rowBg}>
                      <td colSpan={8} style={{ padding: "0 12px 10px 32px", borderTop: "1px dashed #E5E7EB" }}>
                        <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "8px 12px", borderLeft: "3px solid #D1D5DB" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6B7280", marginRight: 8 }}>Note:</span>
                          <span style={{ fontSize: "0.8rem", color: "#374151" }}>{c.notes}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
