"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChevronLeft, X, Download } from "lucide-react";
import { getPacificToday } from "@/lib/pacific-time";
import { CleaningRecordsList624 } from "@/components/forms624/CleaningRecordsList624";
import { DoneNaRow624 } from "@/components/forms624/DoneNaRow624";
import { FormHeader624 } from "@/components/forms624/FormHeader624";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import type { DailyClean624Record, CleaningRowSnapshot } from "@/components/forms624/types";

function buildPdfHtml(r: DailyClean624Record): string {
  const rows = (r.rows as CleaningRowSnapshot[]).map((row) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 8px;font-size:12px">${row.labelEn}</td>
      <td style="padding:6px 8px;font-size:12px;color:#6b7280">${row.labelEs}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;font-weight:600;color:${row.state === "DONE" ? "#059669" : row.state === "NOT_DONE" ? "#dc2626" : "#6b7280"}">
        ${row.state === "DONE" ? "Done" : row.state === "NA" ? "N/A" : "Not done"}
      </td>
      <td style="padding:6px 8px;font-size:11px;color:#374151">${row.reason || "—"}</td>
      <td style="padding:6px 8px;font-size:11px;color:#6b7280">${row.chemical || "—"}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { font-size: 12px; color: #6b7280; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; font-size: 11px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
    .ok { background: #d1fae5; color: #065f46; }
    .issues { background: #fef3c7; color: #92400e; }
  </style></head><body>
  <h1>Daily Cleaning and Sanitation — 624 Facility</h1>
  <p class="sub">Date: ${r.date} &nbsp;|&nbsp; Time: ${r.time} &nbsp;|&nbsp; Conducted by: ${r.conductedBy}</p>
  <p class="sub">Submitted: ${new Date(r.submittedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} by ${r.submittedBy.name}</p>
  <p class="sub">Summary: ${r.doneCount} done &middot; ${r.naCount} N/A &middot; ${r.notDoneCount} not done
    &nbsp;|&nbsp; Allergen change: ${r.allergenChange ? "Yes" : "No"}
    ${r.notes ? `&nbsp;|&nbsp; Notes: ${r.notes}` : ""}
  </p>
  <p class="sub">Status: <span class="badge ${r.notDoneCount === 0 ? "ok" : "issues"}">${r.notDoneCount === 0 ? "All done" : `${r.notDoneCount} not done`}</span></p>
  <table>
    <thead><tr><th>Activity (EN)</th><th>Actividad (ES)</th><th>State</th><th>Reason</th><th>Chemical</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`;
}

export default function DailyCleaning624RecordsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const today = getPacificToday();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [filterNotDone, setFilterNotDone] = useState<"" | "true">("");

  const [records, setRecords] = useState<DailyClean624Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTarget, setViewTarget] = useState<DailyClean624Record | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!session || !["SUPERVISOR", "ADMIN"].includes(role)) {
      router.replace("/dashboard");
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (filterNotDone) params.set("hasNotDone", "true");
    fetch(`/api/daily-cleaning-624?${params}`)
      .then((r) => r.json())
      .then((data: unknown) => { setRecords(data as DailyClean624Record[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, [from, to, filterNotDone, session, authStatus, role, router]);

  async function handleDownload(r: DailyClean624Record) {
    setDownloadingId(r.id);
    try {
      const html = buildPdfHtml(r);
      await exportFormPdf(html, `daily-cleaning-624-${r.date}.pdf`);
    } catch (err) {
      console.error("PDF failed:", err);
      alert("PDF generation failed. Try again or check popup blocker.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(r: DailyClean624Record) {
    if (!confirm(`Delete Daily Cleaning record from ${r.date}? This cannot be undone.`)) return;
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/daily-cleaning-624/${r.id}`, { method: "DELETE" });
      if (!res.ok) { alert("Delete failed."); return; }
      setRecords((prev) => prev.filter((rec) => rec.id !== r.id));
      if (viewTarget?.id === r.id) setViewTarget(null);
    } catch {
      alert("Network error — could not delete.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="page-header">
        <div>
          <button
            onClick={() => router.push("/dashboard/supervisor/daily-cleaning-624")}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 mb-1"
          >
            <ChevronLeft className="w-3 h-3" /> New record
          </button>
          <h1 className="page-title">Daily Cleaning Records — 624</h1>
          <p className="page-subtitle">Last 30 days by default. ADMIN only can delete.</p>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={filterNotDone}
            onChange={(e) => setFilterNotDone(e.target.value as "" | "true")}
            className="input text-sm"
          >
            <option value="">All</option>
            <option value="true">Has not done</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <CleaningRecordsList624
          records={records}
          isAdmin={isAdmin}
          onView={setViewTarget}
          onDownload={handleDownload}
          onDelete={handleDelete}
          downloadingId={downloadingId}
          deletingId={deletingId}
        />
      )}

      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl my-8 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Daily Cleaning — {viewTarget.date}</h2>
              <button onClick={() => setViewTarget(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <FormHeader624
              date={viewTarget.date}
              time={viewTarget.time}
              conductedBy={viewTarget.conductedBy}
              readOnly
            />

            <div className="space-y-2">
              {(viewTarget.rows as CleaningRowSnapshot[]).map((row) => (
                <DoneNaRow624
                  key={row.key}
                  rowKey={row.key}
                  labelEn={row.labelEn}
                  labelEs={row.labelEs}
                  chemical={row.chemical}
                  state={row.state}
                  reason={row.reason ?? ""}
                  readOnly
                />
              ))}
            </div>

            {viewTarget.allergenChange && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                Allergen change registered this day.
              </div>
            )}

            {viewTarget.notes && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700">
                <span className="font-semibold">Notes: </span>{viewTarget.notes}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => handleDownload(viewTarget)}
                disabled={downloadingId === viewTarget.id}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {downloadingId === viewTarget.id ? "Generating…" : "Download PDF"}
              </button>
              <button onClick={() => setViewTarget(null)} className="btn btn-primary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
