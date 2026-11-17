"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChevronLeft, X, Download, CalendarDays } from "lucide-react";
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
      <td style="padding:6px 8px;font-size:11px;color:#374151">${row.reason || "\u2014"}</td>
      <td style="padding:6px 8px;font-size:11px;color:#6b7280">${row.chemical || "\u2014"}</td>
    </tr>`).join("");

  const submittedPT = new Date(r.submittedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

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
    .footer { margin-top: 24px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  </style></head><body>
  <h1>Daily Cleaning and Sanitation \u2014 624 Facility</h1>
  <p class="sub">Date: ${r.date} &nbsp;|&nbsp; Time: ${r.time} &nbsp;|&nbsp; Conducted by: ${r.conductedBy} (${r.initials})</p>
  <p class="sub">Summary: ${r.doneCount} done &middot; ${r.naCount} N/A &middot; ${r.notDoneCount} not done
    ${r.notes ? `&nbsp;|&nbsp; Notes: ${r.notes}` : ""}
  </p>
  <p class="sub">Status: <span class="badge ${r.notDoneCount === 0 ? "ok" : "issues"}">${r.notDoneCount === 0 ? "All done" : `${r.notDoneCount} not done`}</span></p>
  <table>
    <thead><tr><th>Activity (EN)</th><th>Actividad (ES)</th><th>State</th><th>Reason</th><th>Chemical</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">Submitted by: ${r.conductedBy} (${r.initials}) &nbsp;&middot;&nbsp; ${submittedPT} PT &nbsp;&middot;&nbsp; Julian Foods \u2014 624 Facility</p>
  </body></html>`;
}

function formatMDY(isoDateStr: string): string {
  const [y, m, d] = isoDateStr.split("-");
  return `${m}/${d}/${y}`;
}

// Get Monday of the week containing anyDateInWeek (ISO date string)
function getWeekMon(anyDateInWeek: string): Date {
  const d = new Date(anyDateInWeek + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ...
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diffToMon);
  return mon;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildWeekPdfHtml(weekRecords: DailyClean624Record[], mon: string): string {
  // Build Mon–Fri columns
  const monDate = getWeekMon(mon);
  const weekDays: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monDate);
    d.setUTCDate(monDate.getUTCDate() + i);
    weekDays.push(isoDate(d));
  }

  const fri = weekDays[4];
  const recordByDate = new Map<string, DailyClean624Record>();
  weekRecords.forEach((r) => recordByDate.set(r.date, r));

  const hasAnyRecord = weekDays.some((day) => recordByDate.has(day));

  if (!hasAnyRecord) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial,sans-serif;padding:32px">
      <h1 style="font-size:18px">Daily Cleaning &#8212; 624 | Week of ${formatMDY(mon)} &#8211; ${formatMDY(fri)}</h1>
      <p style="font-size:13px;color:#6b7280">No records found for this week.</p>
    </body></html>`;
  }

  // Day column headers: date + initials (or "No record")
  const dayHeaders = weekDays.map((day) => {
    const r = recordByDate.get(day);
    if (r) {
      return `<th style="text-align:center;padding:6px 8px;font-size:11px;color:#374151;border-bottom:2px solid #e5e7eb;min-width:80px">${day}<br/><span style="font-weight:400;font-size:10px;color:#6b7280">${r.initials}</span></th>`;
    }
    return `<th style="text-align:center;padding:6px 8px;font-size:11px;color:#9ca3af;border-bottom:2px solid #e5e7eb;min-width:80px;background:#f9fafb">${day}<br/><span style="font-weight:400;font-size:10px">No record</span></th>`;
  }).join("");

  // Activity rows — use the first available record to get activity labels
  const firstRecord = weekRecords[0];
  const activities = (firstRecord.rows as CleaningRowSnapshot[]).map((row) => ({ key: row.key, labelEn: row.labelEn, labelEs: row.labelEs }));

  const activityRows = activities.map((act) => {
    const cells = weekDays.map((day) => {
      const r = recordByDate.get(day);
      if (!r) {
        return `<td style="text-align:center;padding:5px 8px;font-size:12px;color:#9ca3af;background:#f9fafb">\u2014</td>`;
      }
      const row = (r.rows as CleaningRowSnapshot[]).find((rr) => rr.key === act.key);
      const state = row?.state ?? "\u2014";
      const color = state === "DONE" ? "#059669" : state === "NOT_DONE" ? "#dc2626" : "#6b7280";
      const label = state === "DONE" ? "\u2713" : state === "NA" ? "N/A" : state === "NOT_DONE" ? "\u2717" : "\u2014";
      return `<td style="text-align:center;padding:5px 8px;font-size:12px;font-weight:600;color:${color}">${label}</td>`;
    }).join("");
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:5px 8px;font-size:12px">${act.labelEn}</td>
      <td style="padding:5px 8px;font-size:11px;color:#9ca3af">${act.labelEs}</td>
      ${cells}
    </tr>`;
  }).join("");

  const summaryRow = weekDays.map((day) => {
    const r = recordByDate.get(day);
    if (!r) return `<td style="text-align:center;padding:5px 8px;font-size:11px;color:#9ca3af;background:#f9fafb">\u2014</td>`;
    return `<td style="text-align:center;padding:5px 8px;font-size:11px;color:#374151">${r.doneCount}\u2713 ${r.naCount}N/A ${r.notDoneCount > 0 ? `<span style="color:#dc2626">${r.notDoneCount}\u2717</span>` : ""}</td>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { font-size: 12px; color: #6b7280; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; font-size: 11px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
  </style></head><body>
  <h1>Daily Cleaning and Sanitation \u2014 624 Facility</h1>
  <p class="sub">Week of ${formatMDY(mon)} &#8211; ${formatMDY(fri)} &nbsp;|&nbsp; ${weekRecords.length} record(s)</p>
  <table>
    <thead>
      <tr>
        <th>Activity (EN)</th>
        <th style="color:#9ca3af">ES</th>
        ${dayHeaders}
      </tr>
    </thead>
    <tbody>
      ${activityRows}
      <tr style="border-top:2px solid #e5e7eb;font-weight:600">
        <td colspan="2" style="padding:5px 8px;font-size:11px">Summary</td>
        ${summaryRow}
      </tr>
    </tbody>
  </table>
  <p style="margin-top:24px;font-size:10px;color:#9ca3af">Generated ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT &nbsp;|&nbsp; Julian Foods \u2014 624 Facility</p>
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
  const [weekDate, setWeekDate] = useState(today);
  const [weekDownloading, setWeekDownloading] = useState(false);

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
      alert("Network error \u2014 could not delete.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleWeekDownload() {
    setWeekDownloading(true);
    try {
      const mon = isoDate(getWeekMon(weekDate));
      const monDate = getWeekMon(weekDate);
      const friDate = new Date(monDate);
      friDate.setUTCDate(monDate.getUTCDate() + 4);
      const fri = isoDate(friDate);
      const params = new URLSearchParams({ from: mon, to: fri });
      const res = await fetch(`/api/daily-cleaning-624?${params}`);
      const weekRecords: DailyClean624Record[] = await res.json();
      const html = buildWeekPdfHtml(weekRecords, mon);
      await exportFormPdf(html, `daily-cleaning-624-week-${mon}.pdf`);
    } catch (err) {
      console.error("Week PDF failed:", err);
      alert("Week PDF generation failed.");
    } finally {
      setWeekDownloading(false);
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
          <h1 className="page-title">Daily Cleaning Records &#8212; 624</h1>
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

      {/* Week PDF download */}
      <div className="card p-4 flex flex-wrap gap-4 items-end bg-indigo-50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Download week PDF</label>
          <input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} className="input text-sm" />
        </div>
        <button
          onClick={handleWeekDownload}
          disabled={weekDownloading}
          className="btn-secondary flex items-center gap-2 disabled:opacity-60"
        >
          <CalendarDays className="w-4 h-4" />
          {weekDownloading ? "Generating\u2026" : "Download week PDF"}
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400 text-sm">Loading&#8230;</div>
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
              <h2 className="font-semibold text-lg">Daily Cleaning &#8212; {viewTarget.date}</h2>
              <button onClick={() => setViewTarget(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <FormHeader624
              date={viewTarget.date}
              time={viewTarget.time}
              initials={viewTarget.initials}
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
                {downloadingId === viewTarget.id ? "Generating\u2026" : "Download PDF"}
              </button>
              <button onClick={() => setViewTarget(null)} className="btn btn-primary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
