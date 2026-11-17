import type { DailyClean624Record, CleaningRowSnapshot, MonthlyClean624Record, MonthlyClean624LineSnapshot } from "./types";
import { INSTRUCTIONS_TEXT_MONTHLY } from "@/app/(dashboard)/dashboard/supervisor/monthly-cleaning-624/config";

export function formatMDY(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
}

export function getWeekMon(anyDateInWeek: string): Date {
  const d = new Date(anyDateInWeek + "T12:00:00Z");
  const day = d.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diffToMon);
  return mon;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildPdfHtml(r: DailyClean624Record): string {
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
  <h1>Daily Cleaning and Sanitation — 624 Facility</h1>
  <p class="sub">Date: ${r.date} &nbsp;|&nbsp; Time: ${r.time} &nbsp;|&nbsp; Conducted by: ${r.conductedBy} (${r.initials})</p>
  <p class="sub">Summary: ${r.doneCount} done &middot; ${r.naCount} N/A &middot; ${r.notDoneCount} not done
    ${r.notes ? `&nbsp;|&nbsp; Notes: ${r.notes}` : ""}
  </p>
  <p class="sub">Status: <span class="badge ${r.notDoneCount === 0 ? "ok" : "issues"}">${r.notDoneCount === 0 ? "All done" : `${r.notDoneCount} not done`}</span></p>
  <table>
    <thead><tr><th>Activity (EN)</th><th>Actividad (ES)</th><th>State</th><th>Reason</th><th>Chemical</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">Submitted by: ${r.conductedBy} (${r.initials}) &nbsp;·&nbsp; ${submittedPT} PT &nbsp;·&nbsp; Julian Foods — 624 Facility</p>
  </body></html>`;
}

export function buildWeekPdfHtml(weekRecords: DailyClean624Record[], mon: string): string {
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
      <h1 style="font-size:18px">Daily Cleaning — 624 | Week of ${formatMDY(mon)} – ${formatMDY(fri)}</h1>
      <p style="font-size:13px;color:#6b7280">No records found for this week.</p>
    </body></html>`;
  }

  const dayHeaders = weekDays.map((day) => {
    const r = recordByDate.get(day);
    if (r) {
      return `<th style="text-align:center;padding:6px 8px;font-size:11px;color:#374151;border-bottom:2px solid #e5e7eb;min-width:80px">${day}<br/><span style="font-weight:400;font-size:10px;color:#6b7280">${r.initials}</span></th>`;
    }
    return `<th style="text-align:center;padding:6px 8px;font-size:11px;color:#9ca3af;border-bottom:2px solid #e5e7eb;min-width:80px;background:#f9fafb">${day}<br/><span style="font-weight:400;font-size:10px">No record</span></th>`;
  }).join("");

  const firstRecord = weekRecords[0];
  const activities = (firstRecord.rows as CleaningRowSnapshot[]).map((row) => ({ key: row.key, labelEn: row.labelEn, labelEs: row.labelEs }));

  const activityRows = activities.map((act) => {
    const cells = weekDays.map((day) => {
      const r = recordByDate.get(day);
      if (!r) {
        return `<td style="text-align:center;padding:5px 8px;font-size:12px;color:#9ca3af;background:#f9fafb">—</td>`;
      }
      const row = (r.rows as CleaningRowSnapshot[]).find((rr) => rr.key === act.key);
      const state = row?.state ?? "—";
      const color = state === "DONE" ? "#059669" : state === "NOT_DONE" ? "#dc2626" : "#6b7280";
      const label = state === "DONE" ? "✓" : state === "NA" ? "N/A" : state === "NOT_DONE" ? "✗" : "—";
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
    if (!r) return `<td style="text-align:center;padding:5px 8px;font-size:11px;color:#9ca3af;background:#f9fafb">—</td>`;
    return `<td style="text-align:center;padding:5px 8px;font-size:11px;color:#374151">${r.doneCount}✓ ${r.naCount}N/A ${r.notDoneCount > 0 ? `<span style="color:#dc2626">${r.notDoneCount}✗</span>` : ""}</td>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { font-size: 12px; color: #6b7280; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; font-size: 11px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
  </style></head><body>
  <h1>Daily Cleaning and Sanitation — 624 Facility</h1>
  <p class="sub">Week of ${formatMDY(mon)} – ${formatMDY(fri)} &nbsp;|&nbsp; ${weekRecords.length} record(s)</p>
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
  <p style="margin-top:24px;font-size:10px;color:#9ca3af">Generated ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT &nbsp;|&nbsp; Julian Foods — 624 Facility</p>
  </body></html>`;
}

export function buildMonthlyPdfHtml624(r: MonthlyClean624Record): string {
  const monthParts = r.month.split("-");
  const monthLabel = new Date(Date.UTC(Number(monthParts[0]), Number(monthParts[1]) - 1, 1))
    .toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

  const isDraft = r.status === "draft";
  const isAuto  = r.autoSubmitted;

  const rows = (r.lines as MonthlyClean624LineSnapshot[]).map((line) => {
    const stateLabel =
      line.state === "DONE"     ? "Done" :
      line.state === "NA"       ? "N/A" :
      line.state === "NOT_DONE" ? "Not done" : "—";
    const stateColor =
      line.state === "DONE"     ? "#059669" :
      line.state === "NOT_DONE" ? "#dc2626" : "#6b7280";
    const stamp = (line.lineDate && line.lineInitials)
      ? `${formatMDY(line.lineDate)} / ${line.lineInitials}`
      : "—";
    const autoTag = line.autoFilled
      ? " <span style='font-size:9px;color:#ea580c;font-weight:600'>[Auto-filled]</span>"
      : "";
    return `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:5px 8px;font-size:12px">${line.labelEn}</td>
      <td style="padding:5px 8px;font-size:11px;color:#6b7280">${line.labelEs}</td>
      <td style="padding:5px 8px;font-size:11px;color:#6b7280">${line.chemical || "—"}</td>
      <td style="padding:5px 8px;text-align:center;font-size:12px;font-weight:600;color:${stateColor}">${stateLabel}${autoTag}</td>
      <td style="padding:5px 8px;font-size:11px;color:#374151;font-family:monospace">${stamp}</td>
      <td style="padding:5px 8px;font-size:11px;color:#374151">${line.reason || "—"}</td>
    </tr>`;
  }).join("");

  const submitterLine = isAuto
    ? "Auto-submitted"
    : r.conductedBy
    ? `${r.conductedBy}${r.initials ? ` (${r.initials})` : ""}`
    : "—";

  const submittedPT = r.submittedAt
    ? new Date(r.submittedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    : "—";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { font-size: 12px; color: #6b7280; margin: 0 0 12px; }
    p.instr { font-size: 11px; color: #374151; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 8px 12px; margin: 0 0 16px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; font-size: 11px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
    .draft { background: #fef3c7; color: #92400e; }
    .footer { margin-top: 24px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  </style></head><body>
  <h1>Monthly Cleaning and Sanitation &#8212; 624${isDraft ? ' <span class="badge draft">DRAFT</span>' : ""}</h1>
  <p class="sub">Month: ${monthLabel} &nbsp;|&nbsp; Facility: 624 &nbsp;|&nbsp; ${r.doneCount} done &middot; ${r.naCount} N/A &middot; ${r.notDoneCount} not done</p>
  <p class="instr">${INSTRUCTIONS_TEXT_MONTHLY}</p>
  <table>
    <thead><tr>
      <th>Activity</th><th>Actividad</th><th>Chemical</th><th>Status</th><th>Date / Initials</th><th>Reason</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">
    ${isDraft ? "DRAFT — not yet submitted" : `Submitted: ${submittedPT} PT &nbsp;|&nbsp; By: ${submitterLine}`}
    ${r.notes ? ` &nbsp;|&nbsp; Notes: ${r.notes}` : ""}
    &nbsp;|&nbsp; Julian Foods &#8212; 624 Facility
  </p>
  </body></html>`;
}
