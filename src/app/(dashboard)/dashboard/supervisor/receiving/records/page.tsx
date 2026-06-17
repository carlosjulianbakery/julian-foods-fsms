"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ChevronLeft, CheckCircle2, AlertCircle, XCircle, Eye, Trash2, AlertTriangle,
  Download, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";

interface ConditionCheck {
  packaging_integrity?: string; seal_intact?: string;
  label_matches_po?: string; expiration_acceptable?: string;
  contamination_evidence?: string; temperature_at_receiving?: string;
  temperature_pass?: string; temperature_corrective_action?: string;
  condition_notes?: string; coa_no_reason?: string;
}

interface ReceivingRecord {
  id: string; recordNumber: string; date: string; timeReceived: string;
  receivedBy: { name: string }; purchaseOrderNumber: string | null;
  materialName: string; supplierName: string; lotNumber: string;
  quantityReceived: number; unit: string; expirationDate: string | null;
  conditionCheck: ConditionCheck; coaRequired: boolean; coaReceived: boolean | null;
  coaDocumentUrl: string | null; decision: string; submittedAt: string;
  notes: string | null;
}

const DECISION_CONFIG = {
  accepted: { label: "ACCEPTED", icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700" },
  accepted_with_conditions: { label: "CONDITIONS", icon: AlertCircle, cls: "bg-amber-100 text-amber-700" },
  rejected: { label: "REJECTED", icon: XCircle, cls: "bg-red-100 text-red-700" },
};

function DecisionBadge({ decision }: { decision: string }) {
  const cfg = DECISION_CONFIG[decision as keyof typeof DECISION_CONFIG] ?? { label: decision, icon: AlertCircle, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold", cfg.cls)}>
      <cfg.icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function fmtDate(d: string | null | undefined) { return formatDate(d ?? null); }

export default function ReceivingRecordsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [records, setRecords] = useState<ReceivingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewRecord, setViewRecord] = useState<ReceivingRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReceivingRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    if (materialFilter) p.set("material", materialFilter);
    if (decisionFilter) p.set("decision", decisionFilter);
    try {
      const res = await fetch(`/api/receiving?${p}`);
      if (res.ok) setRecords(await res.json());
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, materialFilter, decisionFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/receiving/${deleteTarget.id}`, { method: "DELETE" });
      if (r.ok) {
        setRecords((prev) => prev.filter((x) => x.id !== deleteTarget.id));
        setDeleteTarget(null);
        setToast("Record deleted.");
        setTimeout(() => setToast(null), 3000);
      } else {
        const d = await r.json();
        alert(d.error ?? "Failed to delete.");
      }
    } finally { setDeleting(false); }
  }

  function printRecord(rec: ReceivingRecord) {
    const cc = rec.conditionCheck ?? {};
    const checkRow = (label: string, val?: string) =>
      `<tr><td style="padding:4px 8px;font-size:11px">${label}</td><td style="padding:4px 8px;font-size:11px;font-weight:600;color:${val === "pass" ? "#059669" : val === "fail" ? "#dc2626" : "#6b7280"}">${val ? val.toUpperCase() : "—"}</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${rec.recordNumber}</title>
    <style>body{font-family:sans-serif;color:#111;padding:32px;max-width:700px;margin:0 auto}
    h1{font-size:20px;font-weight:700}h2{font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:20px 0 8px}
    table{border-collapse:collapse;width:100%}td{padding:6px 12px;font-size:12px;border-bottom:1px solid #f3f4f6}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
    .green{background:#d1fae5;color:#065f46}.amber{background:#fef3c7;color:#92400e}.red{background:#fee2e2;color:#991b1b}
    @media print{body{padding:16px}}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:24px">
      <div><h1>Julian Bakery — Receiving Record</h1><p style="font-size:14px;color:#6b7280;margin:4px 0">${rec.recordNumber}</p></div>
      <span class="badge ${rec.decision === "accepted" ? "green" : rec.decision === "rejected" ? "red" : "amber"}">${rec.decision.replace(/_/g, " ").toUpperCase()}</span>
    </div>
    <h2>Delivery Information</h2>
    <table><tr><td>Date</td><td>${fmtDate(rec.date)}</td></tr><tr><td>Time</td><td>${rec.timeReceived}</td></tr>
    <tr><td>Received By</td><td>${rec.receivedBy.name}</td></tr>
    ${rec.purchaseOrderNumber ? `<tr><td>PO #</td><td>${rec.purchaseOrderNumber}</td></tr>` : ""}
    </table>
    <h2>Item Received</h2>
    <table><tr><td>Material</td><td>${rec.materialName}</td></tr><tr><td>Supplier</td><td>${rec.supplierName}</td></tr>
    <tr><td>Lot #</td><td>${rec.lotNumber}</td></tr><tr><td>Quantity</td><td>${rec.quantityReceived} ${rec.unit}</td></tr>
    ${rec.expirationDate ? `<tr><td>Expiration</td><td>${fmtDate(rec.expirationDate)}</td></tr>` : ""}
    </table>
    <h2>Condition Check</h2>
    <table>
      ${checkRow("Packaging Integrity", cc.packaging_integrity ?? undefined)}
      ${checkRow("Seal Intact", cc.seal_intact ?? undefined)}
      ${checkRow("Label Matches PO", cc.label_matches_po ?? undefined)}
      ${cc.expiration_acceptable !== undefined ? checkRow("Expiration Acceptable", cc.expiration_acceptable ?? undefined) : ""}
      ${checkRow("No Contamination Evidence", cc.contamination_evidence ?? undefined)}
      ${cc.temperature_at_receiving ? `<tr><td>Temperature (°F)</td><td>${cc.temperature_at_receiving} — ${(cc.temperature_pass ?? "—").toUpperCase()}</td></tr>` : ""}
      ${cc.condition_notes ? `<tr><td>Notes</td><td>${cc.condition_notes}</td></tr>` : ""}
    </table>
    ${rec.notes ? `<h2>Notes</h2><p style="font-size:12px">${rec.notes}</p>` : ""}
    <p style="font-size:11px;color:#9ca3af;margin-top:32px">Printed ${new Date().toLocaleString()}</p>
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }

  const inp = "px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="max-w-6xl space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">Delete receiving record?</p>
                <p className="text-sm text-gray-500 mt-1">{deleteTarget.recordNumber} — {deleteTarget.materialName}</p>
                <p className="text-xs text-gray-400 mt-1">This will also delete the linked inventory lot if it has not been used in any batch sheets.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-primary bg-red-600 hover:bg-red-700 text-sm" disabled={deleting} onClick={handleDelete}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <p className="font-bold text-gray-900">{viewRecord.recordNumber}</p>
                <p className="text-xs text-gray-500">{fmtDate(viewRecord.date)} at {viewRecord.timeReceived} — {viewRecord.receivedBy.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <DecisionBadge decision={viewRecord.decision} />
                <button onClick={() => printRecord(viewRecord)} className="btn-secondary text-xs py-1">
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button onClick={() => setViewRecord(null)}>
                  <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 text-sm">
              {viewRecord.purchaseOrderNumber && <p><span className="font-medium text-gray-600">PO #:</span> {viewRecord.purchaseOrderNumber}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-gray-500">Material</p><p className="font-medium">{viewRecord.materialName}</p></div>
                <div><p className="text-xs text-gray-500">Supplier</p><p className="font-medium">{viewRecord.supplierName}</p></div>
                <div><p className="text-xs text-gray-500">Lot #</p><p className="font-mono font-medium">{viewRecord.lotNumber}</p></div>
                <div><p className="text-xs text-gray-500">Quantity</p><p className="font-medium">{viewRecord.quantityReceived} {viewRecord.unit}</p></div>
                {viewRecord.expirationDate && <div><p className="text-xs text-gray-500">Exp Date</p><p className="font-medium">{fmtDate(viewRecord.expirationDate)}</p></div>}
              </div>
              {viewRecord.notes && <p className="text-gray-600 italic text-xs">{viewRecord.notes}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <Link href="/dashboard/supervisor/receiving" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Receiving
          </Link>
          <h1 className="page-title">Receiving Records</h1>
        </div>
        <Link href="/dashboard/supervisor/receiving" className="btn-primary">+ New Record</Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" className={inp} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" className={inp} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Material</label>
            <input type="text" className={inp} placeholder="Search…" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Decision</label>
            <select className={inp} value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)}>
              <option value="">All</option>
              <option value="accepted">Accepted</option>
              <option value="accepted_with_conditions">Conditions</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          {(dateFrom || dateTo || materialFilter || decisionFilter) && (
            <button className="text-xs text-gray-500 hover:text-gray-700 underline"
              onClick={() => { setDateFrom(""); setDateTo(""); setMaterialFilter(""); setDecisionFilter(""); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Record #", "Date", "Material", "Supplier", "Lot #", "Qty", "Decision", "Received By", "Actions"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">No records found.</td></tr>
            ) : records.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="px-3 py-2.5 font-mono text-xs font-medium text-gray-700">{r.recordNumber}</td>
                <td className="px-3 py-2.5 text-xs">{fmtDate(r.date)}</td>
                <td className="px-3 py-2.5 text-xs font-medium">{r.materialName}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600">{r.supplierName}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{r.lotNumber}</td>
                <td className="px-3 py-2.5 text-xs">{r.quantityReceived} {r.unit}</td>
                <td className="px-3 py-2.5"><DecisionBadge decision={r.decision} /></td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{r.receivedBy.name}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewRecord(r)} className="text-gray-400 hover:text-brand-600" title="View">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => printRecord(r)} className="text-gray-400 hover:text-brand-600" title="PDF">
                      <Download className="w-4 h-4" />
                    </button>
                    {isAdmin && (
                      <button onClick={() => setDeleteTarget(r)} className="text-gray-400 hover:text-red-500" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
