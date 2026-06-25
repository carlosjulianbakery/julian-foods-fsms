"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { X, AlertTriangle, Eye, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";
import { aggregateInStandardUnit } from "@/lib/unitConversion";

interface InitialStockEntry {
  enteredAt: string;
  enteredBy: { name: string };
}

interface InventoryLot {
  id: string; materialId: string; materialName: string;
  supplierName: string; lotNumber: string; quantityReceived: number;
  quantityRemaining: number; unit: string; receivedDate: string;
  expirationDate: string | null; status: string;
  isConditional: boolean; conditionalNotes: string | null;
  receivingRecordId: string | null;
  initialStockEntry: InitialStockEntry | null;
  material: { minimumStockQuantity: number | null; minimumStockUnit: string | null; unit: string | null };
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  active:      { label: "ACTIVE",      cls: "bg-emerald-100 text-emerald-700" },
  low_stock:   { label: "LOW STOCK",   cls: "bg-amber-100 text-amber-700" },
  conditional: { label: "CONDITIONAL", cls: "bg-blue-100 text-blue-700" },
  quarantined: { label: "QUARANTINED", cls: "bg-red-100 text-red-700" },
  expired:     { label: "EXPIRED",     cls: "bg-red-100 text-red-600" },
  depleted:    { label: "DEPLETED",    cls: "bg-gray-100 text-gray-500" },
  recalled:    { label: "RECALLED",    cls: "bg-red-900/20 text-red-900" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status.toUpperCase(), cls: "bg-gray-100 text-gray-600" };
  return <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold font-mono", cfg.cls)}>{cfg.label}</span>;
}

const fmtDate = (d: string | null | undefined) => formatDate(d ?? null);

export default function CurrentInventoryPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialFilter, setMaterialFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [lotFilter, setLotFilter] = useState("");
  const [viewLot, setViewLot] = useState<InventoryLot | null>(null);
  const [adjustLot, setAdjustLot] = useState<InventoryLot | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchLots = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (materialFilter) p.set("material", materialFilter);
    if (lotFilter) p.set("lot", lotFilter);
    statusFilter.forEach((s) => p.append("status", s));
    try {
      const res = await fetch(`/api/inventory/current?${p}`);
      if (res.ok) setLots(await res.json());
    } finally { setLoading(false); }
  }, [materialFilter, lotFilter, statusFilter]);

  useEffect(() => { fetchLots(); }, [fetchLots]);

  async function handleAdjust() {
    if (!adjustLot || !adjustQty) return;
    setAdjusting(true);
    try {
      const res = await fetch(`/api/inventory/lots/${adjustLot.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustmentQty: parseFloat(adjustQty), notes: adjustNotes }),
      });
      if (res.ok) {
        setToast("Inventory adjusted.");
        setAdjustLot(null);
        setAdjustQty("");
        setAdjustNotes("");
        fetchLots();
        setTimeout(() => setToast(null), 3000);
      } else {
        const d = await res.json();
        alert(d.error ?? "Failed to adjust.");
      }
    } finally { setAdjusting(false); }
  }

  async function handleStatusChange(lot: InventoryLot, newStatus: string) {
    const res = await fetch(`/api/inventory/lots/${lot.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) { fetchLots(); setToast(`Lot ${newStatus}.`); setTimeout(() => setToast(null), 3000); }
  }

  const inp = "px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  // Expiring soon: within 60 days
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);

  // Per-material lot totals (only for active/low_stock/conditional lots)
  const materialTotals = useMemo(() => {
    const countable = lots.filter((l) => ["active", "low_stock", "conditional"].includes(l.status));
    const byMaterial = new Map<string, { name: string; standardUnit: string | null; lots: Array<{ quantityRemaining: number; unit: string }> }>();
    for (const lot of countable) {
      const existing = byMaterial.get(lot.materialId);
      if (existing) {
        existing.lots.push(lot);
      } else {
        byMaterial.set(lot.materialId, {
          name: lot.materialName,
          standardUnit: lot.material.unit ?? null,
          lots: [lot],
        });
      }
    }
    const result = new Map<string, { total: number; unit: string; possible: boolean; mismatchUnits: string[] }>();
    byMaterial.forEach((data, materialId) => {
      if (data.lots.length < 2) return; // Only show totals for multi-lot materials
      const targetUnit = data.standardUnit ?? data.lots[0].unit;
      const agg = aggregateInStandardUnit(
        data.lots.map((l) => ({ quantity: l.quantityRemaining, unit: l.unit })),
        targetUnit
      );
      result.set(materialId, {
        total: agg.total,
        unit: targetUnit,
        possible: agg.possible,
        mismatchUnits: agg.mismatches,
      });
    });
    return result;
  }, [lots]);

  return (
    <div className="max-w-6xl space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Lot detail */}
      {viewLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <p className="font-bold text-gray-900 font-mono">{viewLot.lotNumber}</p>
                <p className="text-xs text-gray-500">{viewLot.materialName}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={viewLot.status} />
                <button onClick={() => setViewLot(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
              </div>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-gray-500">Supplier</p><p className="font-medium">{viewLot.supplierName}</p></div>
                <div><p className="text-xs text-gray-500">Received</p><p>{fmtDate(viewLot.receivedDate)}</p></div>
                <div><p className="text-xs text-gray-500">Qty Received</p><p>{viewLot.quantityReceived} {viewLot.unit}</p></div>
                <div><p className="text-xs text-gray-500">Qty Remaining</p><p className="font-semibold">{viewLot.quantityRemaining} {viewLot.unit}</p></div>
                {viewLot.expirationDate && <div><p className="text-xs text-gray-500">Expiration</p><p>{fmtDate(viewLot.expirationDate)}</p></div>}
                {viewLot.conditionalNotes && <div className="col-span-2"><p className="text-xs text-gray-500">Notes</p><p className="text-xs bg-blue-50 p-2 rounded">{viewLot.conditionalNotes}</p></div>}
              </div>
              {viewLot.receivingRecordId && (
                <Link href="/dashboard/supervisor/receiving/records" className="text-xs text-brand-600 hover:underline">View Receiving Record →</Link>
              )}
              {!viewLot.receivingRecordId && viewLot.initialStockEntry && (
                <p className="text-xs text-gray-500">
                  Source: Initial Stock Entry — entered by{" "}
                  <span className="font-medium">{viewLot.initialStockEntry.enteredBy.name}</span>{" "}
                  on {fmtDate(viewLot.initialStockEntry.enteredAt)}
                </p>
              )}
              {isAdmin && (
                <div className="flex gap-2 pt-3 border-t border-gray-200">
                  <button className="btn-secondary text-xs py-1" onClick={() => { setViewLot(null); setAdjustLot(viewLot); setAdjustQty(""); }}>
                    Adjust Quantity
                  </button>
                  {viewLot.status !== "quarantined" && (
                    <button className="text-xs px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                      onClick={() => handleStatusChange(viewLot, "quarantined")}>
                      Flag Quarantined
                    </button>
                  )}
                  {viewLot.status !== "recalled" && (
                    <button className="text-xs px-3 py-1 rounded bg-red-900/20 text-red-900 hover:bg-red-200"
                      onClick={() => handleStatusChange(viewLot, "recalled")}>
                      Flag Recalled
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {adjustLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">Manual Adjustment</p>
              <button onClick={() => setAdjustLot(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div>
              <p className="text-sm text-gray-600">{adjustLot.materialName} — Lot {adjustLot.lotNumber}</p>
              <p className="text-xs text-gray-400 mt-0.5">Current: {adjustLot.quantityRemaining} {adjustLot.unit}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment (+ or −)</label>
              <input type="number" step="any" className={cn(inp, "w-full")} value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)} placeholder="e.g. -2.5" />
              <p className="text-xs text-gray-400 mt-1">
                New qty: {adjustQty ? Math.max(0, adjustLot.quantityRemaining + parseFloat(adjustQty || "0")).toFixed(2) : "—"} {adjustLot.unit}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea className={cn("w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none min-h-[60px]")}
                value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} placeholder="Reason for adjustment…" />
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setAdjustLot(null)}>Cancel</button>
              <button className="btn-primary flex-1 disabled:opacity-60" disabled={!adjustQty || adjusting} onClick={handleAdjust}>
                {adjusting ? "Saving…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Current Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{lots.length} lot{lots.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <Link href="/dashboard/supervisor/receiving" className="btn-primary">+ Receive</Link>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Material</label>
          <input type="text" className={inp} placeholder="Search…" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Lot #</label>
          <input type="text" className={inp} placeholder="Search…" value={lotFilter} onChange={(e) => setLotFilter(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select className={inp} value={statusFilter[0] ?? ""} onChange={(e) => setStatusFilter(e.target.value ? [e.target.value] : [])}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {(materialFilter || lotFilter || statusFilter.length > 0) && (
          <button className="text-xs text-gray-500 hover:text-gray-700 underline"
            onClick={() => { setMaterialFilter(""); setLotFilter(""); setStatusFilter([]); }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Material", "Supplier", "Lot #", "Received", "Qty Remaining", "Unit", "Exp Date", "Status", "Actions"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">Loading…</td></tr>
            ) : lots.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">No inventory lots found.</td></tr>
            ) : lots.map((lot, i) => {
              const expiringSoon = lot.expirationDate
                ? new Date(lot.expirationDate) <= soon && lot.status === "active"
                : false;
              // Check if this is the last lot for this material and a total exists
              const isLastForMaterial =
                (i === lots.length - 1 || lots[i + 1].materialId !== lot.materialId);
              const matTotal = isLastForMaterial ? materialTotals.get(lot.materialId) : undefined;
              return (
                <>
                  <tr key={lot.id} className={cn(
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/50",
                    lot.status === "expired" || lot.status === "recalled" ? "opacity-60" : ""
                  )}>
                    <td className="px-3 py-2.5 text-xs font-medium">{lot.materialName}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{lot.supplierName}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{lot.lotNumber}</td>
                    <td className="px-3 py-2.5 text-xs">{fmtDate(lot.receivedDate)}</td>
                    <td className={cn("px-3 py-2.5 text-xs font-semibold", lot.status === "low_stock" ? "text-amber-600" : "text-gray-800")}>
                      {lot.quantityRemaining}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{lot.unit}</td>
                    <td className={cn("px-3 py-2.5 text-xs", expiringSoon ? "text-amber-600 font-medium" : "text-gray-600")}>
                      {lot.expirationDate ? fmtDate(lot.expirationDate) : "—"}
                      {expiringSoon && <span className="ml-1 text-[10px]">⚠</span>}
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge status={lot.status} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setViewLot(lot)} className="text-gray-400 hover:text-brand-600" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button onClick={() => { setAdjustLot(lot); setAdjustQty(""); setAdjustNotes(""); }}
                            className="text-gray-400 hover:text-brand-600" title="Adjust">
                            <Settings2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {matTotal && (
                    <tr key={`total-${lot.materialId}`} className="bg-gray-100 border-t border-gray-300">
                      <td colSpan={4} className="px-3 py-1.5 text-[11px] text-gray-500 font-mono pl-6">
                        └─ TOTAL ({lot.materialName})
                      </td>
                      <td colSpan={5} className="px-3 py-1.5 text-[11px] font-semibold font-mono">
                        {matTotal.possible ? (
                          <span className="text-gray-700">
                            {matTotal.total.toFixed(3)} {matTotal.unit}
                            <span className="text-gray-400 font-normal ml-2">(all active lots, converted to standard unit)</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Cannot combine — unit family mismatch ({matTotal.mismatchUnits.join(", ")} incompatible with {matTotal.unit})
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
