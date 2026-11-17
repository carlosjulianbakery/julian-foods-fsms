"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck, AlertCircle, Download, Trash2, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import { buildMonthlyPdfHtml624 } from "@/components/forms624/pdfBuilders624";
import type { MonthlyClean624Record, MonthlyClean624LineSnapshot } from "@/components/forms624/types";
import { formatMonthKeyLabel } from "@/lib/pacific-time";

type ListRow = Pick<MonthlyClean624Record,
  "id" | "facility" | "month" | "status" | "conductedBy" | "initials" |
  "doneCount" | "naCount" | "notDoneCount" | "autoSubmitted" |
  "lastEditedBy" | "lastEditedAt" | "submittedAt" | "submittedBy" | "updatedAt" | "createdAt"
>;

function StatusBadge({ status, autoSubmitted }: { status: string; autoSubmitted: boolean }) {
  if (status === "submitted" && autoSubmitted) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Auto-submitted</span>;
  }
  if (status === "submitted") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Submitted</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Draft</span>;
}

export default function MonthlyCleaning624RecordsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN";

  const [records, setRecords]       = useState<ListRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [modal, setModal]           = useState<MonthlyClean624Record | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ListRow | null>(null);

  const loadRecords = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterYear !== "all") params.set("year", filterYear);
    fetch(`/api/monthly-cleaning-624?${params}`)
      .then((r) => r.json())
      .then((data: ListRow[] | { error?: string }) => {
        if (!Array.isArray(data)) { setError((data as { error?: string }).error ?? "Load failed"); setLoading(false); return; }
        setRecords(data);
        setLoading(false);
      })
      .catch(() => { setError("Could not load records."); setLoading(false); });
  }, [filterStatus, filterYear]);

  useEffect(() => {
    if (session?.user) loadRecords();
  }, [session?.user?.id, loadRecords]);

  async function openModal(row: ListRow) {
    setModalLoading(true);
    setModal(null);
    try {
      const res = await fetch(`/api/monthly-cleaning-624/${row.id}`);
      const data = await res.json() as MonthlyClean624Record;
      setModal(data);
    } catch { setError("Could not load record details."); }
    setModalLoading(false);
  }

  async function downloadPdf(row: ListRow) {
    setModalLoading(true);
    try {
      const res = await fetch(`/api/monthly-cleaning-624/${row.id}`);
      const full = await res.json() as MonthlyClean624Record;
      const html = buildMonthlyPdfHtml624(full);
      await exportFormPdf(html, `monthly-cleaning-624-${row.month}.pdf`);
    } catch { /* silent */ }
    setModalLoading(false);
  }

  async function handleDelete(row: ListRow) {
    setDeleting(row.id);
    try {
      const res = await fetch(`/api/monthly-cleaning-624/${row.id}`, { method: "DELETE" });
      const data = await res.json() as { success?: boolean; warning?: string; error?: string };
      if (data.success) {
        setRecords((prev) => prev.filter((r) => r.id !== row.id));
        if (data.warning) setError(data.warning);
      } else {
        setError(data.error ?? "Delete failed");
      }
    } catch { setError("Delete failed"); }
    setDeleting(null);
    setDeleteConfirm(null);
  }

  const years = Array.from(new Set(records.map((r) => r.month.slice(0, 4)))).sort().reverse();

  return (
    <div className="max-w-4xl space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title leading-tight">Monthly Cleaning and Sanitation &#8212; 624</h1>
            <p className="page-subtitle">624 Facility &#183; Records</p>
          </div>
        </div>
        <button type="button" onClick={() => router.push("/dashboard/supervisor/monthly-cleaning-624")} className="btn-primary">
          Current Month
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input text-sm py-1.5 w-auto">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
        </select>
        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="input text-sm py-1.5 w-auto">
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button type="button" onClick={() => setError("")} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="card p-6 text-center text-sm text-gray-500">Loading&hellip;</div>
      ) : records.length === 0 ? (
        <div className="card p-6 text-center text-sm text-gray-500">No records found.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Progress</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Last updated</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Submitted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{formatMonthKeyLabel(row.month)}</td>
                  <td className="px-4 py-3"><StatusBadge status={row.status} autoSubmitted={row.autoSubmitted} /></td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                    {row.doneCount + row.naCount + row.notDoneCount} of 19
                    <span className="text-xs text-gray-400 ml-1">({row.doneCount}D/{row.naCount}N/{row.notDoneCount}X)</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs font-mono">
                    {row.lastEditedBy && row.lastEditedAt
                      ? `${row.lastEditedBy} · ${new Date(row.lastEditedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" })}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                    {row.submittedAt
                      ? new Date(row.submittedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {row.status === "draft" ? (
                        <button type="button" onClick={() => router.push(`/dashboard/supervisor/monthly-cleaning-624?month=${row.month}`)}
                          className="text-xs btn-primary py-1 px-3">Continue</button>
                      ) : (
                        <button type="button" onClick={() => openModal(row)} className="text-xs btn-secondary py-1 px-3">View</button>
                      )}
                      <button type="button" onClick={() => downloadPdf(row)} title="Download PDF"
                        className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                        <button type="button" onClick={() => setDeleteConfirm(row)} title="Delete record"
                          className="p-1.5 text-red-400 hover:text-red-600 transition-colors">
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
      )}

      {/* Detail modal */}
      {(modal || modalLoading) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {modal ? formatMonthKeyLabel(modal.month) : "Loading…"} &#8212; Monthly Cleaning 624
                </h2>
                {modal && <p className="text-xs text-gray-500 mt-0.5">
                  {modal.autoSubmitted ? "Auto-submitted" : modal.conductedBy || "—"}
                  {modal.submittedAt ? ` &#183; ${new Date(modal.submittedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}` : ""}
                </p>}
              </div>
              <div className="flex items-center gap-2">
                {modal && (
                  <button type="button" onClick={() => downloadPdf(modal)} title="Download PDF"
                    className="p-1.5 text-gray-400 hover:text-gray-600">
                    <Download className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => setModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {modalLoading && <div className="p-6 text-center text-sm text-gray-500">Loading&hellip;</div>}
            {modal && (
              <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
                <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                  <span>{modal.doneCount} done</span>
                  <span>{modal.naCount} N/A</span>
                  <span>{modal.notDoneCount} not done</span>
                  <StatusBadge status={modal.status} autoSubmitted={modal.autoSubmitted} />
                </div>
                {modal.notes && (
                  <p className="text-sm bg-gray-50 rounded-lg px-3 py-2 text-gray-700">Notes: {modal.notes}</p>
                )}
                <div className="space-y-1.5">
                  {(modal.lines as MonthlyClean624LineSnapshot[]).map((line, i) => (
                    <div key={line.key} className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      line.state === "DONE"     ? "bg-emerald-50 border-emerald-200" :
                      line.state === "NA"       ? "bg-gray-50 border-gray-200" :
                      line.state === "NOT_DONE" ? "bg-red-50 border-red-200" :
                                                   "bg-white border-gray-200"
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 leading-snug">{i + 1}. {line.labelEn}</p>
                          <p className="text-xs text-gray-500">{line.labelEs}</p>
                          {line.chemical && <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{line.chemical}</span>}
                          {line.autoFilled && <span className="inline-block mt-0.5 ml-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">Auto-filled</span>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={cn("text-xs font-semibold",
                            line.state === "DONE"     ? "text-emerald-700" :
                            line.state === "NA"       ? "text-gray-500" :
                                                        "text-red-700"
                          )}>
                            {line.state === "DONE" ? "Done" : line.state === "NA" ? "N/A" : line.state === "NOT_DONE" ? "Not done" : "—"}
                          </span>
                          {line.lineDate && (
                            <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                              {line.lineDate.split("-").slice(1).concat(line.lineDate.split("-")[0]).join("/")}
                              {line.lineInitials ? ` / ${line.lineInitials}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      {line.reason && (
                        <p className="text-xs text-red-700 mt-1 pl-1">{line.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Delete {formatMonthKeyLabel(deleteConfirm.month)}?</h2>
            <p className="text-sm text-gray-600">This permanently deletes the record and cannot be undone. The linked task instance will be reopened.</p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={() => handleDelete(deleteConfirm)} disabled={!!deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                {deleting === deleteConfirm.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
