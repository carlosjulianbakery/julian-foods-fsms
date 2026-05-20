"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  ChevronLeft,
  Download,
  Eye,
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchStatus = "PASS" | "FAIL" | "PASS_WITH_ISSUES" | "COMPLETE" | "IN_PROGRESS";

interface CalibRow  { label: string; reading: string; pass: boolean | null; corrective_action: string }
interface IngRow    { id: string; name: string; quantity_per_bowl: number; unit: string; supplier: string; lot_number: string }
interface PkgRow    { id: string; name: string; units_per_n_flatbreads: number; quantity_needed: number; supplier: string; lot_number: string }
interface BowlEntry {
  bowl_number: number;
  temp1: string; temp2: string; temp_pass: boolean | null; temp_corrective_action: string;
  weight1: string; weight2: string; weight_pass: boolean | null; weight_corrective_action: string;
  visual_pass: boolean | null; visual_notes: string; initials: string;
}
interface ChecklistItem { label: string; checked: boolean; initials: string }

interface Section1 { ovens_used: string[]; calibration: CalibRow[]; initials: string }
interface Section2 { bowls_planned: number; ingredients: IngRow[]; packaging: PkgRow[] }
interface Section3 extends Array<BowlEntry> {}
interface Section4 {
  bowls_produced: string; total_boxes: string; extra_bags: string;
  yield_per_bowl: string; waste: string; bake_date: string; prod_hours: string;
  packaging_review: { product_labeled_as: string; lot_on_package: string; exp_date_on_package: string; reviewer: string; comments: string };
  quality: { color: string; shape: string; smell: string; taste: string; overall: string; comments: string };
}
interface Section5 { checklist: ChecklistItem[]; supervisor_signature: string; all_passed: boolean }

interface Submission {
  id: string;
  templateName: string;
  productionDate: string;
  productionLot: string | null;
  expirationDate: string | null;
  shift: "AM" | "PM";
  supervisorName: string;
  numEmployees: number | null;
  status: BatchStatus;
  section1: Section1 | null;
  section2: Section2 | null;
  section3: Section3 | null;
  section4: Section4 | null;
  section5: Section5 | null;
  notes: string | null;
  submittedAt: string;
  submittedBy: { name: string; email: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BatchStatus }) {
  const map: Record<BatchStatus, { label: string; cls: string }> = {
    PASS:             { label: "Pass",            cls: "bg-emerald-100 text-emerald-800" },
    FAIL:             { label: "Fail",            cls: "bg-red-100 text-red-700" },
    PASS_WITH_ISSUES: { label: "Pass w/ Issues", cls: "bg-amber-100 text-amber-700" },
    COMPLETE:         { label: "Complete",        cls: "bg-blue-100 text-blue-700" },
    IN_PROGRESS:      { label: "In Progress",     cls: "bg-gray-100 text-gray-600" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={cn("badge", cfg.cls)}>{cfg.label}</span>;
}

function PassChip({ pass }: { pass: boolean | null }) {
  if (pass === null) return <span className="badge bg-gray-100 text-gray-400">—</span>;
  return pass
    ? <span className="badge bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />PASS</span>
    : <span className="badge bg-red-100 text-red-700 flex items-center gap-1"><XCircle className="w-3 h-3" />FAIL</span>;
}

function SectionHdr({ n, title }: { n: number; title: string }) {
  return (
    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
      <span className="w-5 h-5 bg-[#D64D4D] text-white rounded-full text-[10px] flex items-center justify-center font-bold shrink-0">{n}</span>
      <span className="font-semibold text-sm text-gray-900">{title}</span>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value || <span className="text-gray-300">—</span>}</p>
    </div>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function downloadPDF(sub: Submission) {
  const s2 = sub.section2;
  const s3 = sub.section3 ?? [];
  const s4 = sub.section4;
  const s5 = sub.section5;

  const statusLabel = { PASS: "PASS", FAIL: "FAIL", PASS_WITH_ISSUES: "PASS WITH ISSUES", COMPLETE: "COMPLETE", IN_PROGRESS: "IN PROGRESS" }[sub.status] ?? sub.status;
  const statusColor = { PASS: "#059669", FAIL: "#D64D4D", PASS_WITH_ISSUES: "#D97706", COMPLETE: "#2563EB", IN_PROGRESS: "#6B7280" }[sub.status] ?? "#6B7280";

  const ingRows = (s2?.ingredients ?? []).map((ing) => `
    <tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:4px 8px;font-size:11px">${ing.name}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center">${ing.quantity_per_bowl} ${ing.unit}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center;font-weight:600;color:#D64D4D">${s2?.bowls_planned ? (ing.quantity_per_bowl * s2.bowls_planned).toFixed(3) : "—"} ${ing.unit}</td>
      <td style="padding:4px 8px;font-size:11px">${ing.supplier || "—"}</td>
      <td style="padding:4px 8px;font-size:11px;font-family:monospace">${ing.lot_number || "—"}</td>
    </tr>`).join("");

  const bowlRows = s3.map((b) => `
    <tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:4px 8px;font-size:11px;font-weight:600">${b.bowl_number}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center">${b.temp1 || "—"}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center">${b.temp2 || "—"}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center;color:${b.temp_pass === true ? "#059669" : b.temp_pass === false ? "#D64D4D" : "#9CA3AF"}">${b.temp_pass === true ? "PASS" : b.temp_pass === false ? "FAIL" : "—"}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center">${b.weight1 || "—"}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center">${b.weight2 || "—"}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center;color:${b.weight_pass === true ? "#059669" : b.weight_pass === false ? "#D64D4D" : "#9CA3AF"}">${b.weight_pass === true ? "PASS" : b.weight_pass === false ? "FAIL" : "—"}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center;color:${b.visual_pass === true ? "#059669" : b.visual_pass === false ? "#D97706" : "#9CA3AF"}">${b.visual_pass === true ? "PASS" : b.visual_pass === false ? "ISSUE" : "—"}</td>
      <td style="padding:4px 8px;font-size:11px">${b.initials || "—"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Batch Sheet — ${sub.templateName} — ${fmtDate(sub.productionDate)}</title>
<style>body{font-family:Georgia,serif;margin:32px;color:#111827}table{width:100%;border-collapse:collapse}th{background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;text-transform:uppercase;padding:6px 8px;text-align:left;border-bottom:1px solid #E5E7EB}@media print{body{margin:16px}}</style>
</head>
<body>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;border-bottom:2px solid #D64D4D;padding-bottom:14px">
  <div style="width:36px;height:36px;background:#D64D4D;border-radius:8px;display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </div>
  <div>
    <div style="font-size:16px;font-weight:bold">Julian Bakery — Batch Sheet</div>
    <div style="font-size:10px;color:#6B7280;font-family:monospace">${sub.templateName}</div>
  </div>
  <div style="margin-left:auto;text-align:right">
    <div style="font-size:18px;font-weight:bold;color:${statusColor}">${statusLabel}</div>
    <div style="font-size:10px;color:#6B7280;font-family:monospace">${sub.shift} Shift</div>
  </div>
</div>

<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;font-family:monospace;font-size:11px">
  <div><span style="color:#9CA3AF">DATE</span><br/><strong>${fmtDate(sub.productionDate)}</strong></div>
  <div><span style="color:#9CA3AF">LOT</span><br/><strong>${sub.productionLot || "—"}</strong></div>
  <div><span style="color:#9CA3AF">SUPERVISOR</span><br/><strong>${sub.supervisorName}</strong></div>
  <div><span style="color:#9CA3AF">BOWLS PLANNED</span><br/><strong>${s2?.bowls_planned ?? "—"}</strong></div>
</div>

${s2?.ingredients.length ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 2 — Ingredients</h3>
<table style="margin-bottom:16px">
  <thead><tr><th>Ingredient</th><th>Per Bowl</th><th>Total</th><th>Supplier</th><th>Lot #</th></tr></thead>
  <tbody>${ingRows}</tbody>
</table>` : ""}

${s3.length ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 3 — CCP Per Bowl</h3>
<table style="margin-bottom:16px">
  <thead><tr><th>Bowl</th><th>Temp 1</th><th>Temp 2</th><th>Temp</th><th>Wt 1</th><th>Wt 2</th><th>Weight</th><th>Visual</th><th>Init</th></tr></thead>
  <tbody>${bowlRows}</tbody>
</table>` : ""}

${s4 ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 4 — End of Production</h3>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;font-family:monospace;font-size:11px">
  <div><span style="color:#9CA3AF">BOWLS PRODUCED</span><br/><strong>${s4.bowls_produced || "—"}</strong></div>
  <div><span style="color:#9CA3AF">TOTAL BOXES</span><br/><strong>${s4.total_boxes || "—"}</strong></div>
  <div><span style="color:#9CA3AF">EXTRA BAGS</span><br/><strong>${s4.extra_bags || "—"}</strong></div>
  <div><span style="color:#9CA3AF">PROD HOURS</span><br/><strong>${s4.prod_hours || "—"}</strong></div>
</div>
<div style="font-family:monospace;font-size:11px;margin-bottom:12px">
  <span style="color:#9CA3AF">QUALITY — </span>
  Color: ${s4.quality.color || "—"} | Shape: ${s4.quality.shape || "—"} | Smell: ${s4.quality.smell || "—"} | Taste: ${s4.quality.taste || "—"} | Overall: ${s4.quality.overall || "—"}
</div>` : ""}

${s5 ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 5 — Release Checklist</h3>
<div style="margin-bottom:12px">
  ${s5.checklist.map((c) => `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid #F3F4F6">
    <span style="color:${c.checked ? "#059669" : "#D64D4D"}">${c.checked ? "☑" : "☐"}</span>
    <span style="margin-left:6px">${c.label}</span>
    ${c.initials ? `<span style="margin-left:8px;color:#9CA3AF;font-family:monospace">${c.initials}</span>` : ""}
  </div>`).join("")}
</div>
<div style="margin-top:16px;padding-top:10px;border-top:1px solid #E5E7EB">
  <div style="font-size:10px;color:#9CA3AF;font-family:monospace">SUPERVISOR SIGNATURE</div>
  <div style="font-size:14px;font-style:italic;color:#374151;margin-top:4px">${s5.supervisor_signature}</div>
</div>` : ""}

${sub.notes ? `
<div style="margin-top:14px;padding:10px;border:1px solid #E5E7EB;border-radius:6px">
  <div style="font-size:10px;font-family:monospace;color:#6B7280;margin-bottom:4px">NOTES</div>
  <div style="font-size:12px">${sub.notes}</div>
</div>` : ""}

<div style="margin-top:28px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;font-family:monospace;text-align:center">
  Julian Bakery Food Safety Management System — Internal Use Only — Generated ${new Date().toLocaleString()}
</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function SubmissionModal({ sub, onClose }: { sub: Submission; onClose: () => void }) {
  const s1 = sub.section1;
  const s2 = sub.section2;
  const s3 = sub.section3 ?? [];
  const s4 = sub.section4;
  const s5 = sub.section5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 font-garamond">{sub.templateName}</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {fmtDate(sub.productionDate)} · {sub.shift} Shift · {sub.supervisorName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={sub.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Meta */}
          <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KV label="Production Date" value={fmtDate(sub.productionDate)} />
            <KV label="Lot" value={sub.productionLot} />
            <KV label="Expiry Date" value={fmtDate(sub.expirationDate)} />
            <KV label="Employees" value={sub.numEmployees} />
          </div>

          {/* Section 1 */}
          {s1 && (
            <div className="card overflow-hidden">
              <SectionHdr n={1} title="Pre-Production Setup" />
              <div className="p-4 space-y-3">
                {s1.ovens_used.length > 0 && (
                  <div>
                    <p className="label">Ovens Used</p>
                    <p className="text-sm text-gray-700">{s1.ovens_used.join(", ")}</p>
                  </div>
                )}
                {s1.calibration.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {["Weight", "Reading", "Pass/Fail", "Corrective Action"].map((h) => (
                            <th key={h} className="text-left py-1.5 pr-3 text-xs font-mono text-gray-400 font-normal">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {s1.calibration.map((row, i) => (
                          <tr key={i}>
                            <td className="py-1.5 pr-3 font-medium text-gray-700">{row.label}</td>
                            <td className="py-1.5 pr-3 font-mono text-gray-600">{row.reading || "—"}</td>
                            <td className="py-1.5 pr-3"><PassChip pass={row.pass} /></td>
                            <td className="py-1.5 text-gray-600 text-xs">{row.corrective_action || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {s1.initials && <KV label="Initials" value={s1.initials} />}
              </div>
            </div>
          )}

          {/* Section 2 */}
          {s2 && (
            <div className="card overflow-hidden">
              <SectionHdr n={2} title="Batch Recipe" />
              <div className="p-4 space-y-4">
                <KV label="Bowls Planned" value={s2.bowls_planned} />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {["Ingredient", "Qty/Bowl", "Total", "Supplier", "Lot #"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {s2.ingredients.map((ing) => (
                        <tr key={ing.id}>
                          <td className="px-3 py-2 font-medium text-gray-800">{ing.name}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-xs">{ing.quantity_per_bowl} {ing.unit}</td>
                          <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">
                            <span className="bg-[#FAE8E8] text-[#C04040] font-mono text-xs px-1.5 py-0.5 rounded">
                              {(ing.quantity_per_bowl * s2.bowls_planned).toFixed(3)} {ing.unit}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 text-xs">{ing.supplier || "—"}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono text-xs">{ing.lot_number || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 3 */}
          {s3.length > 0 && (
            <div className="card overflow-hidden">
              <SectionHdr n={3} title="CCP Monitoring Per Bowl" />
              <div className="p-4 space-y-3">
                {s3.map((bowl, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 border-b border-gray-100">
                      <span className="text-sm font-semibold text-gray-700">Bowl {bowl.bowl_number}</span>
                      {bowl.temp_pass   === false && <span className="badge bg-red-100 text-red-700 text-[10px]">Temp Fail</span>}
                      {bowl.weight_pass === false && <span className="badge bg-red-100 text-red-700 text-[10px]">Weight Fail</span>}
                      {bowl.visual_pass === false && <span className="badge bg-amber-100 text-amber-700 text-[10px]">Visual Issue</span>}
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="label">Temperature (°F)</p>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-700">{bowl.temp1 || "—"} / {bowl.temp2 || "—"}</span>
                          <PassChip pass={bowl.temp_pass} />
                        </div>
                        {bowl.temp_corrective_action && (
                          <p className="text-xs text-red-600 mt-1">{bowl.temp_corrective_action}</p>
                        )}
                      </div>
                      <div>
                        <p className="label">Weight (oz)</p>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-700">{bowl.weight1 || "—"} / {bowl.weight2 || "—"}</span>
                          <PassChip pass={bowl.weight_pass} />
                        </div>
                        {bowl.weight_corrective_action && (
                          <p className="text-xs text-red-600 mt-1">{bowl.weight_corrective_action}</p>
                        )}
                      </div>
                      <div>
                        <p className="label">Visual</p>
                        <PassChip pass={bowl.visual_pass} />
                        {bowl.visual_notes && <p className="text-xs text-amber-700 mt-1">{bowl.visual_notes}</p>}
                        {bowl.initials && <p className="text-xs text-gray-400 font-mono mt-1">Init: {bowl.initials}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4 */}
          {s4 && (
            <div className="card overflow-hidden">
              <SectionHdr n={4} title="End of Production Summary" />
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <KV label="Bowls Produced" value={s4.bowls_produced} />
                  <KV label="Total Boxes"    value={s4.total_boxes} />
                  <KV label="Extra Bags"     value={s4.extra_bags} />
                  <KV label="Yield / Bowl"   value={s4.yield_per_bowl} />
                  <KV label="Waste"          value={s4.waste} />
                  <KV label="Bake Date"      value={fmtDate(s4.bake_date)} />
                  <KV label="Prod Hours"     value={s4.prod_hours} />
                </div>
                <div>
                  <p className="label">Packaging Review</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
                    <KV label="Labeled As"  value={s4.packaging_review.product_labeled_as} />
                    <KV label="Lot"         value={s4.packaging_review.lot_on_package} />
                    <KV label="Exp Date"    value={s4.packaging_review.exp_date_on_package} />
                    <KV label="Reviewer"    value={s4.packaging_review.reviewer} />
                    <KV label="Comments"    value={s4.packaging_review.comments} />
                  </div>
                </div>
                <div>
                  <p className="label">Quality Check</p>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {[
                      { k: "Color",  v: s4.quality.color },
                      { k: "Shape",  v: s4.quality.shape },
                      { k: "Smell",  v: s4.quality.smell },
                      { k: "Taste",  v: s4.quality.taste },
                      { k: "Overall",v: s4.quality.overall },
                    ].map(({ k, v }) => v ? (
                      <div key={k} className="text-xs font-mono">
                        <span className="text-gray-400">{k}: </span>
                        <span className="font-semibold capitalize text-gray-700">{v}</span>
                      </div>
                    ) : null)}
                  </div>
                  {s4.quality.comments && <p className="text-sm text-gray-600 mt-2">{s4.quality.comments}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Section 5 */}
          {s5 && (
            <div className="card overflow-hidden">
              <SectionHdr n={5} title="Product Release Checklist" />
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  {s5.checklist.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 py-1 border-b border-gray-50 last:border-0">
                      {item.checked
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      }
                      <span className={cn("flex-1 text-sm", item.checked ? "text-gray-600" : "text-red-600")}>
                        {item.label}
                      </span>
                      {item.initials && (
                        <span className="text-xs font-mono text-gray-400">{item.initials}</span>
                      )}
                    </div>
                  ))}
                </div>
                {s5.supervisor_signature && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-mono">SUPERVISOR SIGNATURE</p>
                    <p className="text-base italic text-gray-700 mt-1">{s5.supervisor_signature}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {sub.notes && (
            <div className="border border-gray-100 rounded-md p-4">
              <p className="label">Additional Notes</p>
              <p className="text-sm text-gray-700 mt-1">{sub.notes}</p>
            </div>
          )}

          <div className="text-xs text-gray-400 font-mono text-right">
            Submitted by {sub.submittedBy.name} · {new Date(sub.submittedAt).toLocaleString()}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={() => downloadPDF(sub)} className="btn-primary">
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BatchSheetRecordsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<Submission | null>(null);

  const role = (session?.user as { role?: string })?.role ?? "";

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "SUPERVISOR" && role !== "ADMIN") { setLoading(false); return; }
    fetch("/api/batch-sheet")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setSubmissions)
      .catch((e) => console.error("Failed to load batch sheets:", e))
      .finally(() => setLoading(false));
  }, [status, role]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 font-mono text-sm">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
        Loading records…
      </div>
    );
  }

  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return (
      <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm">
        <AlertCircle className="w-4 h-4" /> Access restricted.
      </div>
    );
  }

  return (
    <>
      {selected && <SubmissionModal sub={selected} onClose={() => setSelected(null)} />}

      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <FolderOpen className="w-6 h-6 text-[#D64D4D]" />
              Batch Sheet Records
            </h1>
            <p className="page-subtitle">{submissions.length} record{submissions.length !== 1 ? "s" : ""} total</p>
          </div>
          <button onClick={() => router.push("/dashboard/supervisor/batch-sheet")} className="btn-primary">
            <ChevronLeft className="w-4 h-4" /> New Batch Sheet
          </button>
        </div>

        {submissions.length === 0 ? (
          <div className="card p-12 text-center">
            <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-mono">No batch sheets submitted yet.</p>
          </div>
        ) : (
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Date", "Product", "Lot", "Supervisor", "Bowls Planned", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-gray-700 whitespace-nowrap">
                      {fmtDate(sub.productionDate)}
                    </td>
                    <td className="px-5 py-3 text-gray-800 font-medium whitespace-nowrap">{sub.templateName}</td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{sub.productionLot || "—"}</td>
                    <td className="px-5 py-3 text-gray-700">{sub.supervisorName}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono">{sub.section2?.bowls_planned ?? "—"}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setSelected(sub)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono border border-gray-200 rounded hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                        <button
                          onClick={() => downloadPDF(sub)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono border border-gray-200 rounded hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
