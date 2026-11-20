import {
  INSTRUCTIONS, INSTRUCTIONS_VER_VERIFICATION, LABELS, SCALE_POINTS, SECTION_TITLES, periodLabel, splitStored,
  type ItemSnapshot, type Section,
} from "@/lib/verification-624";
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

// ── Scales & Thermometer Verification ──────────────────────────────────────────

export interface VerificationPdfRecord {
  period: string;
  status: string;
  conductedBy: string;
  initials: string;
  items: unknown;
  listVersion: number;
  okCount: number;
  failCount: number;
  notInUseCount: number;
  notes: string | null;
  submittedAt: string | Date | null;
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n: number | null | undefined, d: number) => (typeof n === "number" ? n.toFixed(d) : "—");
const resultCell = (r: string | null) =>
  r === "OK" ? '<span style="color:#059669;font-weight:600">OK</span>'
  : r === "NOT_OK" ? '<span style="color:#dc2626;font-weight:600">Not OK</span>'
  : '<span style="color:#6b7280">—</span>';

export function buildVerificationPdfHtml624(r: VerificationPdfRecord): string {
  const { header, snapshots } = splitStored(r.items);
  const isDraft = r.status !== "submitted";
  const bySection = (section: Section) => snapshots.filter((i) => i.section === section).sort((a, b) => a.position - b.position);
  const tail = (i: ItemSnapshot) => `<td>${esc(i.notes) || "—"}</td><td>${esc(i.correctiveAction) || "—"}</td>`;
  const notInUse = (i: ItemSnapshot, span: number) =>
    `<tr><td>#${i.position} ${esc(i.name)}</td><td colspan="${span}" style="color:#6b7280;font-style:italic">Not in use</td></tr>`;

  const portable = bySection("portable_thermometer").map((i) =>
    !i.inUse ? notInUse(i, 5)
    : `<tr><td>#${i.position} ${esc(i.name)}</td><td class="n">${num(i.reading, 1)}</td><td class="n">${num(i.recheck, 1)}</td><td>${resultCell(i.result)}</td>${tail(i)}</tr>`).join("");
  const fixed = bySection("fixed_thermometer").map((i) =>
    !i.inUse ? notInUse(i, 6)
    : `<tr><td>#${i.position} ${esc(i.name)}</td><td>${esc(i.referenceName) || "—"}</td><td class="n">${num(i.target, 1)}</td><td class="n">${num(i.fixedReading, 1)}</td><td>${resultCell(i.result)}</td>${tail(i)}</tr>`).join("");
  const scales = bySection("scale").map((i) =>
    !i.inUse ? notInUse(i, 8)
    : `<tr><td>#${i.position} ${esc(i.name)}${i.location ? `<br/><span style="color:#6b7280;font-size:10px">${esc(i.location)}</span>` : ""}</td>${SCALE_POINTS.map((_, k) => {
        const bad = i.pointResults?.[k] === "NOT_OK";
        return `<td class="n" style="${bad ? "color:#dc2626;font-weight:600" : ""}">${num(i.points?.[k], 2)}</td>`;
      }).join("")}<td>${resultCell(i.result)}</td>${tail(i)}</tr>`).join("");

  const submittedPT = r.submittedAt ? new Date(r.submittedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—";
  const dateLine = header ? `${formatMDY(header.date)} ${esc(header.time)}` : "—";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; padding: 28px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 13px; margin: 18px 0 6px; }
    p.sub { font-size: 12px; color: #6b7280; margin: 0 0 10px; }
    p.instr { font-size: 10px; color: #374151; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 6px 10px; margin: 0 0 6px; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 5px 6px; font-size: 10px; color: #6b7280; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
    td { padding: 5px 6px; font-size: 11px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    td.n { font-family: monospace; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #fef3c7; color: #92400e; }
    .footer { margin-top: 20px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  </style></head><body>
  <h1>Scales &amp; Thermometer Verification — 624${isDraft ? ' <span class="badge">DRAFT</span>' : ""}</h1>
  <p class="sub">Period: ${esc(periodLabel(r.period))} &nbsp;|&nbsp; Facility: 624 &nbsp;|&nbsp; Date: ${dateLine} &nbsp;|&nbsp; Initials: ${esc(r.initials) || "—"} &nbsp;|&nbsp; ${r.okCount} OK · ${r.failCount} Not OK · ${r.notInUseCount} not in use</p>
  <p class="instr"><b>Procedure for Scales:</b> ${esc(INSTRUCTIONS.scale)}</p>
  <p class="instr"><b>Procedure for Portable Thermometer:</b> ${esc(INSTRUCTIONS.portable_thermometer)}</p>
  <p class="instr"><b>Procedure for Non-Movable Thermometer:</b> ${esc(INSTRUCTIONS.fixed_thermometer)}</p>

  <h2>${SECTION_TITLES.portable_thermometer.en} / ${SECTION_TITLES.portable_thermometer.es}</h2>
  <table><thead><tr><th>Thermometer</th><th>${LABELS.iceWater.es}</th><th>Re-check</th><th>Result</th><th>${LABELS.conditions.es}</th><th>${LABELS.corrective.es}</th></tr></thead><tbody>${portable}</tbody></table>

  <h2>${SECTION_TITLES.fixed_thermometer.en} / ${SECTION_TITLES.fixed_thermometer.es}</h2>
  <table><thead><tr><th>Thermometer</th><th>Reference used</th><th>Target °F</th><th>Reading °F</th><th>Result (± 5 °F)</th><th>${LABELS.conditions.es}</th><th>${LABELS.corrective.es}</th></tr></thead><tbody>${fixed}</tbody></table>

  <h2>${SECTION_TITLES.scale.en} / ${SECTION_TITLES.scale.es} — 500 g, 1.10 lb ± 0.1 lb</h2>
  <table><thead><tr><th>Scale</th>${SCALE_POINTS.map((n, k) => `<th>${k + 1}. ${n}</th>`).join("")}<th>Result</th><th>${LABELS.conditions.es}</th><th>${LABELS.corrective.es}</th></tr></thead><tbody>${scales}</tbody></table>

  <p class="footer">
    ${isDraft ? "DRAFT — not yet submitted" : `Submitted: ${submittedPT} PT &nbsp;|&nbsp; By: ${esc(r.conductedBy) || "—"}${r.initials ? ` (${esc(r.initials)})` : ""}`}
    ${r.notes ? ` &nbsp;|&nbsp; Notes: ${esc(r.notes)}` : ""}
    &nbsp;|&nbsp; Instructions ${INSTRUCTIONS_VER_VERIFICATION} &nbsp;|&nbsp; Equipment list v${r.listVersion} &nbsp;|&nbsp; Julian Foods — 624 Facility
  </p>
  </body></html>`;
}

