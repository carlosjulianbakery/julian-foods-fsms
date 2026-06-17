"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, X, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";

interface QuarantineRecord {
  id: string; recordNumber: string; createdAt: string;
  materialName: string; supplierName: string; lotNumber: string;
  quantity: number; unit: string; quarantineReason: string;
  actionTaken: string; quarantineLocation: string | null;
  adminNotified: boolean; status: string;
  resolutionNotes: string | null; resolvedAt: string | null;
  resolvedBy: { name: string } | null;
  receivingRecord: { recordNumber: string; date: string } | null;
}

const fmtDate = (d: string | null | undefined) => formatDate(d ?? null);

function StatusBadge({ status }: { status: string }) {
  return status === "resolved"
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" />RESOLVED</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700"><AlertTriangle className="w-3 h-3" />OPEN</span>;
}

export default function QuarantinePage() {
  const [records, setRecords] = useState<QuarantineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [materialFilter, setMaterialFilter] = useState("");
  const [selected, setSelected] = useState<QuarantineRecord | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (statusFilter) p.set("status", statusFilter);
    if (materialFilter) p.set("material", materialFilter);
    try {
      const res = await fetch(`/api/quarantine?${p}`);
      if (res.ok) setRecords(await res.json());
    } finally { setLoading(false); }
  }, [statusFilter, materialFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  async function handleResolve() {
    if (!selected || !resolutionNotes.trim()) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/quarantine/${selected.id}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionNotes }),
      });
      if (res.ok) {
        setToast("Quarantine record marked as resolved.");
        setSelected(null);
        setResolutionNotes("");
        fetchRecords();
        setTimeout(() => setToast(null), 3000);
      } else {
        const d = await res.json();
        alert(d.error ?? "Failed to resolve.");
      }
    } finally { setResolving(false); }
  }

  const inp = "px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="max-w-5xl space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Detail / Resolve Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <p className="font-bold text-gray-900">{selected.recordNumber}</p>
                <p className="text-xs text-gray-500">Created {fmtDate(selected.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
              </div>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-gray-500">Material</p><p className="font-medium">{selected.materialName}</p></div>
                <div><p className="text-xs text-gray-500">Supplier</p><p className="font-medium">{selected.supplierName}</p></div>
                <div><p className="text-xs text-gray-500">Lot #</p><p className="font-mono">{selected.lotNumber}</p></div>
                <div><p className="text-xs text-gray-500">Quantity</p><p>{selected.quantity} {selected.unit}</p></div>
                <div><p className="text-xs text-gray-500">Action</p><p>{selected.actionTaken === "quarantine_on_site" ? "Quarantine on-site" : "Return to supplier"}</p></div>
                {selected.quarantineLocation && <div><p className="text-xs text-gray-500">Location</p><p>{selected.quarantineLocation}</p></div>}
                <div><p className="text-xs text-gray-500">Admin Notified</p><p>{selected.adminNotified ? "Yes" : "No"}</p></div>
                {selected.receivingRecord && (
                  <div><p className="text-xs text-gray-500">Receiving Record</p>
                    <Link href="/dashboard/supervisor/receiving/records" className="text-brand-600 hover:underline text-xs">{selected.receivingRecord.recordNumber}</Link>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Quarantine Reason</p>
                <p className="text-sm bg-gray-50 p-3 rounded border border-gray-200">{selected.quarantineReason}</p>
              </div>

              {selected.status === "resolved" && selected.resolutionNotes && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Resolution</p>
                  <p className="text-sm bg-emerald-50 p-3 rounded border border-emerald-200">{selected.resolutionNotes}</p>
                  <p className="text-xs text-gray-400 mt-1">Resolved by {selected.resolvedBy?.name} on {fmtDate(selected.resolvedAt)}</p>
                </div>
              )}

              {selected.status === "open" && (
                <div className="space-y-3 pt-2 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700">Resolution Notes <span className="text-red-500">*</span></label>
                  <textarea
                    className={cn("w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 min-h-[80px]")}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Describe how this was resolved…"
                  />
                  <button
                    className="btn-primary w-full disabled:opacity-60"
                    disabled={resolving || !resolutionNotes.trim()}
                    onClick={handleResolve}
                  >
                    {resolving ? "Saving…" : "Mark as Resolved"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Quarantine Records</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage rejected and conditional material lots</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select className={inp} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Material</label>
          <input type="text" className={inp} placeholder="Search…" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} />
        </div>
        {(statusFilter !== "open" || materialFilter) && (
          <button className="text-xs text-gray-500 hover:text-gray-700 underline"
            onClick={() => { setStatusFilter("open"); setMaterialFilter(""); }}>
            Reset
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["QR #", "Date", "Material", "Supplier", "Lot #", "Reason (summary)", "Status", "Actions"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-gray-400">Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-gray-400">No quarantine records found.</td></tr>
            ) : records.map((r, i) => (
              <tr key={r.id} className={cn(i % 2 === 0 ? "bg-white" : "bg-gray-50/50", "hover:bg-brand-50/30 cursor-pointer")} onClick={() => setSelected(r)}>
                <td className="px-3 py-2.5 font-mono text-xs font-medium">{r.recordNumber}</td>
                <td className="px-3 py-2.5 text-xs">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2.5 text-xs font-medium">{r.materialName}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600">{r.supplierName}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{r.lotNumber}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600 max-w-xs truncate">{r.quarantineReason}</td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2.5">
                  <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(r); setResolutionNotes(""); }}>
                    {r.status === "open" ? "Resolve" : "View"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
