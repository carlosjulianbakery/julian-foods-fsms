"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { X, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";

interface EntryLot {
  id: string; status: string; quantityRemaining: number; lotNumber: string;
  movements: { movementType: string }[];
}

interface StockEntry {
  id: string; materialName: string; supplierName: string; brandName: string | null;
  lotNumber: string; quantity: number; unit: string;
  expirationDate: string | null; dateReceived: string | null;
  notes: string | null; enteredAt: string;
  enteredBy: { name: string };
  inventoryLot: EntryLot;
}

const fmtDate = (d: string | null | undefined) => formatDate(d ?? null);

export default function InitialStockRecordsPage() {
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialFilter, setMaterialFilter] = useState("");
  const [viewEntry, setViewEntry] = useState<StockEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (materialFilter) p.set("material", materialFilter);
    try {
      const res = await fetch(`/api/inventory/initial-stock-entry?${p}`);
      if (res.ok) setEntries(await res.json());
    } finally { setLoading(false); }
  }, [materialFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/inventory/initial-stock-entry/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        setToast("Entry deleted.");
        setTimeout(() => setToast(null), 3000);
        fetchEntries();
      } else {
        const d = await res.json();
        setDeleteError(d.error ?? "Failed to delete.");
      }
    } finally { setDeleting(false); }
  }

  const inp = "px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  function isLotUsed(lot: EntryLot) {
    return lot.movements.length > 0;
  }

  return (
    <div className="max-w-6xl space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* View modal */}
      {viewEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <p className="font-bold text-gray-900 font-mono">{viewEntry.lotNumber}</p>
                <p className="text-xs text-gray-500">{viewEntry.materialName}</p>
              </div>
              <button onClick={() => setViewEntry(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-gray-500">Supplier</p><p className="font-medium">{viewEntry.supplierName || "—"}</p></div>
                {viewEntry.brandName && <div><p className="text-xs text-gray-500">Brand</p><p>{viewEntry.brandName}</p></div>}
                <div><p className="text-xs text-gray-500">Quantity</p><p className="font-semibold">{viewEntry.quantity} {viewEntry.unit}</p></div>
                <div><p className="text-xs text-gray-500">Qty Remaining</p><p>{viewEntry.inventoryLot.quantityRemaining} {viewEntry.unit}</p></div>
                {viewEntry.expirationDate && <div><p className="text-xs text-gray-500">Expiration</p><p>{fmtDate(viewEntry.expirationDate)}</p></div>}
                {viewEntry.dateReceived && <div><p className="text-xs text-gray-500">Approx. Date Received</p><p>{fmtDate(viewEntry.dateReceived)}</p></div>}
                <div><p className="text-xs text-gray-500">Entered By</p><p>{viewEntry.enteredBy.name}</p></div>
                <div><p className="text-xs text-gray-500">Entered At</p><p>{fmtDate(viewEntry.enteredAt)}</p></div>
              </div>
              {viewEntry.notes && (
                <div><p className="text-xs text-gray-500">Notes</p>
                  <p className="text-xs bg-gray-50 p-2 rounded border border-gray-100 mt-1">{viewEntry.notes}</p>
                </div>
              )}
              <div className="pt-2 flex items-center gap-2">
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded font-mono font-semibold",
                  viewEntry.inventoryLot.status === "active" ? "bg-emerald-100 text-emerald-700" :
                  viewEntry.inventoryLot.status === "low_stock" ? "bg-amber-100 text-amber-700" :
                  viewEntry.inventoryLot.status === "depleted" ? "bg-gray-100 text-gray-500" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {viewEntry.inventoryLot.status.toUpperCase().replace("_", " ")}
                </span>
                {isLotUsed(viewEntry.inventoryLot) && (
                  <span className="text-[10px] text-gray-500 italic">Lot has been used — cannot delete</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-semibold text-gray-900">Delete Entry?</p>
            <p className="text-sm text-gray-600">
              This will permanently delete the stock entry, inventory lot, and movement for{" "}
              <span className="font-medium">{deleteTarget.materialName}</span> (lot {deleteTarget.lotNumber}).
            </p>
            {deleteError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{deleteError}</p>}
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>Cancel</button>
              <button
                className="flex-1 px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Initial Stock Records</h1>
          <p className="text-sm text-gray-500 mt-0.5">{entries.length} entr{entries.length !== 1 ? "ies" : "y"}</p>
        </div>
        <Link href="/dashboard/admin/inventory/initial-stock-entry" className="btn-primary">+ New Entry</Link>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Material</label>
          <input type="text" className={inp} placeholder="Search…" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} />
        </div>
        {materialFilter && (
          <button className="text-xs text-gray-500 hover:text-gray-700 underline" onClick={() => setMaterialFilter("")}>Clear</button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Date Entered", "Material", "Supplier", "Lot #", "Qty", "Exp Date", "Entered By", "Actions"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-gray-400">Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-gray-400">No initial stock entries found.</td></tr>
            ) : entries.map((entry, i) => (
              <tr key={entry.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="px-3 py-2.5 text-xs">{fmtDate(entry.enteredAt)}</td>
                <td className="px-3 py-2.5 text-xs font-medium">{entry.materialName}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600">{entry.supplierName || "—"}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{entry.lotNumber}</td>
                <td className="px-3 py-2.5 text-xs font-semibold">{entry.quantity} {entry.unit}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600">{entry.expirationDate ? fmtDate(entry.expirationDate) : "—"}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{entry.enteredBy.name}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewEntry(entry)} className="text-gray-400 hover:text-brand-600" title="View">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(entry); setDeleteError(null); }}
                      className={cn(
                        "text-gray-400 hover:text-red-500",
                        isLotUsed(entry.inventoryLot) ? "opacity-30 cursor-not-allowed hover:text-gray-400" : ""
                      )}
                      disabled={isLotUsed(entry.inventoryLot)}
                      title={isLotUsed(entry.inventoryLot) ? "Lot has been used — cannot delete" : "Delete"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
