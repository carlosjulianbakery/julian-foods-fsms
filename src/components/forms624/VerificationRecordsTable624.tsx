"use client";

import { Download, Eye, Trash2 } from "lucide-react";
import { periodLabel } from "@/lib/verification-624";

export interface VerificationListRow {
  id: string;
  period: string;
  status: string;
  conductedBy: string;
  initials: string;
  okCount: number;
  failCount: number;
  notInUseCount: number;
  submittedAt: string | null;
  submittedBy: { name: string } | null;
}

const submittedText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }) + " PT" : "—";

/** The record list is the log: one row per half-month period. */
export function VerificationRecordsTable624({
  rows, isAdmin, onView, onPdf, onDelete,
}: {
  rows: VerificationListRow[]; isAdmin: boolean;
  onView: (row: VerificationListRow) => void; onPdf: (row: VerificationListRow) => void; onDelete: (row: VerificationListRow) => void;
}) {
  if (rows.length === 0) return <div className="card p-6 text-center text-sm text-gray-500">No records yet.</div>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="px-4 py-2">Period</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Date submitted</th>
            <th className="px-4 py-2">Submitted by</th><th className="px-4 py-2 text-right">OK</th><th className="px-4 py-2 text-right">Not OK</th>
            <th className="px-4 py-2 text-right">Not in use</th><th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0 border-gray-100">
              <td className="px-4 py-2 font-medium text-gray-900">{periodLabel(r.period)}</td>
              <td className="px-4 py-2">
                {r.status === "submitted"
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Submitted</span>
                  : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Draft</span>}
              </td>
              <td className="px-4 py-2 text-gray-600">{submittedText(r.submittedAt)}</td>
              <td className="px-4 py-2 text-gray-600">{r.submittedBy?.name ?? (r.conductedBy || "—")}</td>
              <td className="px-4 py-2 text-right font-mono text-emerald-700">{r.okCount}</td>
              <td className={`px-4 py-2 text-right font-mono ${r.failCount > 0 ? "text-red-600 font-semibold" : "text-gray-500"}`}>{r.failCount}</td>
              <td className="px-4 py-2 text-right font-mono text-gray-500">{r.notInUseCount}</td>
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-1">
                  <button type="button" onClick={() => onView(r)} className="btn-secondary text-xs inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {r.status === "draft" ? "Continue" : "View"}</button>
                  <button type="button" onClick={() => onPdf(r)} className="btn-secondary text-xs inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> PDF</button>
                  {isAdmin && (
                    <button type="button" aria-label={`Delete record ${r.period}`} onClick={() => onDelete(r)} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
