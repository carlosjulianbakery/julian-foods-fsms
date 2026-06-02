"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  ClipboardList, AlertCircle, CheckCircle2, AlertTriangle,
  X, Eye, Trash2, Download, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CleaningRecord {
  id:                  string;
  area:                "MAIN" | "BARS";
  date:                string;
  allMachinesCleaned:  boolean;
  prepToolsCleaned:    boolean;
  floorsMoppedSwept:   boolean;
  bakingTraysCleaned:  boolean;
  foodSurfacesCleaned: boolean;
  trashEmptied:        boolean;
  checkedBy:           string;
  notes:               string | null;
  status:              "COMPLETE" | "INCOMPLETE";
  submittedAt:         string;
  submittedBy: { name: string; email: string };
}

const ITEM_LABELS: { key: keyof CleaningRecord; label: string }[] = [
  { key: "allMachinesCleaned",  label: "All Machines Cleaned" },
  { key: "prepToolsCleaned",    label: "Prep Tools Cleaned" },
  { key: "floorsMoppedSwept",   label: "Floors Mopped and Swept" },
  { key: "bakingTraysCleaned",  label: "Baking Trays / Pans Cleaned and Properly Covered" },
  { key: "foodSurfacesCleaned", label: "All Food Contact Surfaces Cleaned" },
  { key: "trashEmptied",        label: "Trash Emptied" },
];

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "COMPLETE" | "INCOMPLETE" }) {
  if (status === "COMPLETE") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" /> COMPLETE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-amber-100 text-amber-700">
      <AlertTriangle className="w-3 h-3" /> INCOMPLETE
    </span>
  );
}

// ─── PDF Download ─────────────────────────────────────────────────────────────

function downloadPDF(rec: CleaningRecord) {
  const allComplete = rec.status === "COMPLETE";
  const itemRows = ITEM_LABELS.map(({ key, label }) => {
    const checked = rec[key] as boolean;
    return `
<tr style="border-bottom:1px solid #F3F4F6">
  <td style="padding:7px 10px;font-size:12px">${label}</td>
  <td style="padding:7px 10px;font-size:12px;text-align:center;color:${checked ? "#059669" : "#DC2626"};font-weight:bold">${checked ? "✓" : "✗"}</td>
</tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Daily Cleaning Checklist — Julian Bakery</title>
<style>
  body{font-family:Georgia,serif;margin:32px;color:#111827}
  table{width:100%;border-collapse:collapse}
  th{background:#FEF2F2;font-family:monospace;font-size:10px;color:#D64D4D;text-transform:uppercase;padding:7px 10px;text-align:left;border-bottom:2px solid #D64D4D}
  @media print{body{margin:16px}}
</style>
</head><body>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;border-bottom:2px solid #D64D4D;padding-bottom:14px">
  <div style="width:36px;height:36px;background:#D64D4D;border-radius:8px;display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </div>
  <div style="flex:1">
    <div style="font-size:16px;font-weight:bold">Julian Bakery — Daily Cleaning Checklist</div>
    <div style="font-size:10px;color:#6B7280;font-family:monospace">Food Safety Management System</div>
  </div>
  <div style="text-align:right;font-size:10px;color:#9CA3AF;font-family:monospace">
    Generated ${new Date().toLocaleString("en-US")}
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
  <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:8px 12px">
    <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Date</div>
    <div style="font-size:13px;font-weight:600">${formatDate(rec.date)}</div>
  </div>
  <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:8px 12px">
    <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Area</div>
    <div style="font-size:13px;font-weight:600">${rec.area === "MAIN" ? "Main (Granola, Crackers & Powders)" : "Bars (Protein Bars)"}</div>
  </div>
  <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:8px 12px">
    <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Checked By</div>
    <div style="font-size:13px;font-weight:600">${rec.checkedBy}</div>
  </div>
  <div style="background:${allComplete ? "#F0FDF4" : "#FFFBEB"};border:1px solid ${allComplete ? "#86EFAC" : "#FCD34D"};border-radius:6px;padding:8px 12px">
    <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Status</div>
    <div style="font-size:13px;font-weight:bold;color:${allComplete ? "#059669" : "#D97706"}">${allComplete ? "✓ COMPLETE" : "⚠ INCOMPLETE"}</div>
  </div>
</div>

<table>
  <thead><tr><th>Cleaning Item</th><th style="text-align:center;width:80px">Checked</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>

${rec.notes ? `
<div style="margin-top:14px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:10px 12px">
  <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">Notes</div>
  <div style="font-size:12px;color:#374151">${rec.notes}</div>
</div>` : ""}

<div style="margin-top:28px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;font-family:monospace;text-align:center">
  Julian Bakery Food Safety Management System — Internal Use Only
</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function RecordModal({ rec, onClose, role }: { rec: CleaningRecord; onClose: () => void; role: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Daily Cleaning Checklist</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {formatDate(rec.date)} · {rec.area === "MAIN" ? "Main Area" : "Bars Area"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={rec.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Date",         value: formatDate(rec.date) },
              { label: "Area",         value: rec.area === "MAIN" ? "Main" : "Bars" },
              { label: "Checked By",   value: rec.checkedBy },
              { label: "Submitted By", value: rec.submittedBy.name ?? rec.submittedBy.email },
              { label: "Submitted At", value: new Date(rec.submittedAt).toLocaleString("en-US") },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-sm text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Checklist items */}
          <div>
            <p className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wide mb-2">Checklist Items</p>
            <div className="space-y-1.5">
              {ITEM_LABELS.map(({ key, label }) => {
                const checked = rec[key] as boolean;
                return (
                  <div key={key} className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md",
                    checked ? "bg-emerald-50" : "bg-red-50"
                  )}>
                    {checked
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    }
                    <span className={cn("text-sm", checked ? "text-emerald-800" : "text-red-700")}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          {rec.notes && (
            <div>
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2 border border-gray-200">{rec.notes}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center shrink-0">
          <button
            onClick={() => downloadPDF(rec)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono border border-[#D64D4D] rounded hover:bg-red-50 text-[#D64D4D] transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download PDF
          </button>
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteModal({
  rec, onConfirm, onCancel, deleting,
}: { rec: CleaningRecord; onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-md">
        <div className="flex items-start gap-3 px-6 pt-6 pb-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-[#D64D4D]" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Delete Cleaning Record</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <div className="px-6 pb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-1.5 text-sm font-mono">
            <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Date</span><span className="font-semibold">{formatDate(rec.date)}</span></div>
            <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Area</span><span>{rec.area === "MAIN" ? "Main" : "Bars"}</span></div>
            <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Checked By</span><span>{rec.checkedBy}</span></div>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onCancel} disabled={deleting} className="btn-secondary disabled:opacity-50">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D64D4D] hover:bg-[#c44] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {deleting
              ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</>
              : <><Trash2 className="w-3.5 h-3.5" />Delete Record</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Records Page ─────────────────────────────────────────────────────────────

export default function DailyCleaningRecordsPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";

  const [records,     setRecords]     = useState<CleaningRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [selected,    setSelected]    = useState<CleaningRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CleaningRecord | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cleaning/daily");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CleaningRecord[] = await res.json();
      setRecords(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "loading") fetchRecords();
  }, [status, fetchRecords]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/cleaning/daily/${deleteTarget.id}`, { method: "DELETE" });
      if (r.ok) {
        setRecords((prev) => prev.filter((x) => x.id !== deleteTarget.id));
        setDeleteTarget(null);
        setToast("Record deleted.");
        setTimeout(() => setToast(null), 3000);
      } else {
        const err = await r.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setDeleting(false); }
  }

  if (status === "loading") return null;

  return (
    <>
      {selected && (
        <RecordModal rec={selected} onClose={() => setSelected(null)} role={role} />
      )}
      {deleteTarget && (
        <DeleteModal
          rec={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{toast}
        </div>
      )}

      <div className="space-y-5 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-[#D64D4D]" />
              Cleaning Checklist Records
            </h1>
            <p className="page-subtitle">Submitted daily cleaning checklists</p>
          </div>
          <a
            href="/dashboard/supervisor/cleaning/daily"
            className="btn-primary text-xs whitespace-nowrap"
          >
            + New Checklist
          </a>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm font-mono">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12 gap-2 text-gray-400 font-mono text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
              Loading…
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-mono">
                No cleaning checklists submitted yet.
              </p>
              <a
                href="/dashboard/supervisor/cleaning/daily"
                className="inline-block mt-3 btn-primary text-xs"
              >
                Submit Your First Checklist
              </a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Date", "Area", "All Items Complete", "Checked By", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((rec, i) => {
                    const allComplete = rec.status === "COMPLETE";
                    return (
                      <tr
                        key={rec.id}
                        className={cn(
                          "hover:bg-[#FEF2F2]/50 transition-colors",
                          i % 2 === 1 ? "bg-amber-50/20" : ""
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">
                          {formatDate(rec.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 text-gray-700">
                            {rec.area}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {allComplete
                            ? <span className="text-emerald-600 font-mono text-xs font-semibold">✓ Yes</span>
                            : <span className="text-amber-600 font-mono text-xs font-semibold">⚠ No</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-gray-700">{rec.checkedBy}</td>
                        <td className="px-4 py-3"><StatusBadge status={rec.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setSelected(rec)}
                              title="View details"
                              className="p-1.5 text-gray-400 hover:text-[#D64D4D] transition-colors rounded hover:bg-red-50"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => downloadPDF(rec)}
                              title="Download PDF"
                              className="p-1.5 text-gray-400 hover:text-[#D64D4D] transition-colors rounded hover:bg-red-50"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            {role === "ADMIN" && (
                              <button
                                onClick={() => setDeleteTarget(rec)}
                                title="Delete record"
                                className="p-1.5 text-gray-300 hover:text-[#D64D4D] transition-colors rounded hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
