"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, AlertCircle, CheckCircle2, AlertTriangle,
  X, Eye, Trash2, Download, XCircle, ChevronLeft, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";

// ─── Area / Section Reference Data ────────────────────────────────────────────
// Matches the AREAS definition in the daily cleaning form.
// Used to reconstruct area names and section labels from stored item IDs.

const AREA_DEFS = [
  { id: "granola_production",  label: "Granola Production Area",               short: "Granola" },
  { id: "progranola_packing",  label: "Granola Packing Machine",           short: "ProGranola" },
  { id: "manual_packaging",    label: "Manual Packaging Area",  short: "Manual Pkg" },
  { id: "bar_production",      label: "Bar Production Area",                        short: "Bar" },
  { id: "crackers_production", label: "Crackers Production Area",               short: "Crackers" },
];
const NEW_AREA_IDS: Set<string> = new Set(AREA_DEFS.map((a) => a.id));
const AREA_LABEL: Record<string, string>  = Object.fromEntries(AREA_DEFS.map((a) => [a.id, a.label]));
const AREA_SHORT: Record<string, string>  = Object.fromEntries(AREA_DEFS.map((a) => [a.id, a.short]));

// itemId → section subheading label (null = flat, no subheading)
const ITEM_SECTION: Record<string, string | null> = {
  // Granola Production Area
  g_chisels: "Prep Tools", g_small_bowls: "Prep Tools", g_scales: "Prep Tools",
  g_scoops: "Prep Tools", g_buckets: "Prep Tools", g_mixing_bowls: "Prep Tools",
  g_mixing_paddles: "Prep Tools", g_bucket_lids: "Prep Tools",
  g_mixer3: "Machines", g_mixer4: "Machines",
  g_work_tables: "Work Surfaces",
  g_trays: "Baking Equipment", g_ovens_inside: "Baking Equipment", g_ovens_outside: "Baking Equipment",
  g_trash: "Facility", g_syrup_nozzle: "Facility", g_handwash: "Facility",
  g_sanitizer: "Facility", g_floor_drains: "Facility", g_floors: "Facility",
  // Granola Packing Machine (flat — no subheadings)
  pg_conveyor: null, pg_hopper: null, pg_bay_feeder: null,
  // Manual Packaging Area
  mp_tables: "Tools", mp_scales: "Tools", mp_containers: "Tools", mp_scoops: "Tools",
  mp_actionpac: "Sealing Equipment", mp_foot_sealer: "Sealing Equipment",
  mp_handwash: "Facility", mp_sanitizer: "Facility",
  // Bar Production Area
  b_mixer: "Machines", b_mixing_paddle: "Machines", b_vemag: "Machines",
  b_scissors: "Tools", b_chisels: "Tools", b_buckets: "Tools", b_scales: "Tools", b_bowls: "Tools",
  b_bar_cutter: "VeMag Removable Parts", b_conveyor: "VeMag Removable Parts",
  b_twin_screws: "VeMag Removable Parts", b_t_spiral: "VeMag Removable Parts",
  b_pkg_table: "Packaging",
  b_tables: "Facility", b_syrup_nozzle: "Facility", b_trash: "Facility",
  b_handwash: "Facility", b_sanitizer: "Facility", b_floor_drains: "Facility", b_floors: "Facility",
  // Crackers Production Area
  c_sheeter: "Machines", c_mixer: "Machines",
  c_sheeter_parts: "Tools", c_trays: "Tools", c_baking_mats: "Tools", c_scrapers: "Tools",
  c_mixing_bowls: "Tools", c_mixing_paddle: "Tools", c_baking_trays: "Tools",
  c_ovens_inside: "Baking Equipment", c_ovens_outside: "Baking Equipment",
  c_tables: "Facility", c_trash: "Facility", c_handwash: "Facility",
  c_sanitizer: "Facility", c_floor_drains: "Facility", c_floors: "Facility",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  label: string;
  group: string;
  checked: boolean;
  notes?: string;
}

interface CleaningRecord {
  id:          string;
  date:        string;
  checkedBy:   string;
  notes:       string | null;
  status:      "COMPLETE" | "INCOMPLETE";
  submittedAt: string;
  items:       ChecklistItem[] | null;
  allMachinesCleaned?:  boolean;
  prepToolsCleaned?:    boolean;
  floorsMoppedSwept?:   boolean;
  bakingTraysCleaned?:  boolean;
  foodSurfacesCleaned?: boolean;
  trashEmptied?:        boolean;
  submittedBy: { name: string; email: string };
}

const LEGACY_ITEM_LABELS = [
  { key: "allMachinesCleaned",  label: "All Machines Cleaned" },
  { key: "prepToolsCleaned",    label: "Prep Tools Cleaned" },
  { key: "floorsMoppedSwept",   label: "Floors Mopped and Swept" },
  { key: "bakingTraysCleaned",  label: "Baking Trays / Pans Cleaned and Properly Covered" },
  { key: "foodSurfacesCleaned", label: "All Food Contact Surfaces Cleaned" },
  { key: "trashEmptied",        label: "Trash Emptied" },
] as const;

// Old group labels (for flat-format records submitted before the area rebuild)
const OLD_GROUP_LABELS: Record<string, string> = {
  floors_drains:   "Floors & Drains",
  equip_main:      "Equipment — Main",
  equip_bar:       "Equipment — Bar",
  shared_equip:    "Shared Equipment",
  granola_machine: "Granola Machine",
  general:         "General",
};

// ─── Format detection ─────────────────────────────────────────────────────────

type RecordFormat = "new_area" | "old_flat" | "legacy_null";

function detectFormat(rec: CleaningRecord): RecordFormat {
  if (!Array.isArray(rec.items)) return "legacy_null";
  if (rec.items.length === 0)   return "old_flat";
  return NEW_AREA_IDS.has(rec.items[0].group) ? "new_area" : "old_flat";
}

// ─── Area group builder (for new_area format) ─────────────────────────────────

interface AreaGroup {
  id:           string;
  label:        string;
  sections:     { label: string | null; items: ChecklistItem[] }[];
  checkedCount: number;
  totalCount:   number;
}

function buildAreaGroups(items: ChecklistItem[]): AreaGroup[] {
  const presentIds = new Set<string>(items.map((it) => it.group));
  return AREA_DEFS.filter((a) => presentIds.has(a.id)).map((area) => {
    const areaItems = items.filter((it) => it.group === area.id);
    const sectionMap = new Map<string | null, ChecklistItem[]>();
    for (const item of areaItems) {
      const sec = item.id in ITEM_SECTION ? ITEM_SECTION[item.id] : null;
      if (!sectionMap.has(sec)) sectionMap.set(sec, []);
      sectionMap.get(sec)!.push(item);
    }
    return {
      id:           area.id,
      label:        area.label,
      sections:     Array.from(sectionMap.entries()).map(([label, its]) => ({ label, items: its })),
      checkedCount: areaItems.filter((it) => it.checked).length,
      totalCount:   areaItems.length,
    };
  });
}

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
  const fmt = detectFormat(rec);
  const allComplete = rec.status === "COMPLETE";

  const header = `
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;border-bottom:2px solid #D64D4D;padding-bottom:14px">
  <div style="width:36px;height:36px;background:#D64D4D;border-radius:8px;display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="20" height="20"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
  </div>
  <div style="flex:1">
    <div style="font-size:16px;font-weight:bold">Julian Bakery — Daily Cleaning Checklist</div>
    <div style="font-size:10px;color:#6B7280;font-family:monospace">Food Safety Management System</div>
  </div>
  <div style="text-align:right;font-size:10px;color:#9CA3AF;font-family:monospace">Generated ${new Date().toLocaleString("en-US")}</div>
</div>`;

  const metaGrid = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px">
  <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:8px 12px">
    <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Date</div>
    <div style="font-size:13px;font-weight:600">${formatDate(rec.date)}</div>
  </div>
  <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:8px 12px">
    <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Checked By</div>
    <div style="font-size:13px;font-weight:600">${rec.checkedBy}</div>
  </div>
  <div style="background:${allComplete ? "#F0FDF4" : "#FFFBEB"};border:1px solid ${allComplete ? "#86EFAC" : "#FCD34D"};border-radius:6px;padding:8px 12px;grid-column:1/-1">
    <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Status</div>
    <div style="font-size:13px;font-weight:bold;color:${allComplete ? "#059669" : "#D97706"}">${allComplete ? "✓ COMPLETE" : "⚠ INCOMPLETE"}</div>
  </div>
</div>`;

  let bodyHtml = "";

  if (fmt === "new_area") {
    const items = rec.items as ChecklistItem[];
    const areaGroups = buildAreaGroups(items);
    const totalChecked = items.filter((it) => it.checked).length;
    const totalItems   = items.length;

    const areaSummaryBadge = `
<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:8px 12px;margin-bottom:18px">
  <div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">Areas Covered</div>
  <div style="font-size:12px;color:#374151;margin-bottom:6px">${areaGroups.map((a) => a.label).join(" · ")}</div>
  <div style="font-size:11px;font-family:monospace;color:${totalChecked === totalItems ? "#059669" : "#D97706"}">
    Overall: ${totalChecked} of ${totalItems} items complete
  </div>
</div>`;

    const areasHtml = areaGroups.map((ag) => {
      const areaComplete = ag.checkedCount === ag.totalCount;
      const sectionsHtml = ag.sections.map((sec) => {
        const secHeader = sec.label
          ? `<tr><td colspan="2" style="padding:6px 10px 3px;font-size:9px;font-family:monospace;font-weight:bold;color:#6B7280;background:#F9FAFB;text-transform:uppercase;letter-spacing:0.05em;border-top:1px solid #E5E7EB">${sec.label}</td></tr>`
          : "";
        const itemRows = sec.items.map((it) => `
<tr style="border-bottom:1px solid #F3F4F6">
  <td style="padding:6px 10px 6px ${sec.label ? "22px" : "10px"};font-size:11px;color:${it.checked ? "#111827" : "#374151"}">
    ${it.checked ? "✓" : "○"} ${it.label}${it.notes ? `<br/><span style="font-size:9px;color:#6B7280;font-style:italic">Note: ${it.notes}</span>` : ""}
  </td>
  <td style="padding:6px 10px;font-size:11px;text-align:right;color:${it.checked ? "#059669" : "#9CA3AF"};font-weight:bold;white-space:nowrap">${it.checked ? "Done" : "—"}</td>
</tr>`).join("");
        return secHeader + itemRows;
      }).join("");

      return `
<div style="margin-bottom:18px;border:1px solid ${areaComplete ? "#86EFAC" : "#E5E7EB"};border-radius:8px;overflow:hidden">
  <div style="background:${areaComplete ? "#F0FDF4" : "#F9FAFB"};padding:10px 12px;border-bottom:1px solid ${areaComplete ? "#86EFAC" : "#E5E7EB"}">
    <div style="font-size:13px;font-weight:bold;color:${areaComplete ? "#065F46" : "#111827"}">${areaComplete ? "✓ " : ""}${ag.label}</div>
    <div style="font-size:10px;font-family:monospace;color:${areaComplete ? "#059669" : "#D97706"};margin-top:2px">${ag.checkedCount} of ${ag.totalCount} items complete</div>
  </div>
  <table style="width:100%;border-collapse:collapse">
    <tbody>${sectionsHtml}</tbody>
  </table>
</div>`;
    }).join("");

    const footerNote = `
<div style="margin-top:18px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:10px 12px;display:flex;gap:8px">
  <div style="color:#3B82F6;font-size:12px;shrink:0">ℹ</div>
  <div style="font-size:10px;color:#1E40AF;line-height:1.5">Food contact surface verification (ATP swab) and allergen verification (Allergen Changeover swab) are recorded separately in the Pre-Op Inspection and Allergen Changeover logs.</div>
</div>`;

    bodyHtml = areaSummaryBadge + areasHtml + footerNote;

  } else if (fmt === "old_flat") {
    const items = rec.items as ChecklistItem[];
    const oldGroupIds = Array.from(new Set<string>(items.map((it) => it.group)));
    const rows = oldGroupIds.map((gid) => {
      const glabel = OLD_GROUP_LABELS[gid] ?? gid;
      const gItems = items.filter((it) => it.group === gid);
      const header = `<tr><td colspan="2" style="padding:8px 10px 4px;font-size:10px;font-family:monospace;font-weight:bold;color:#6B7280;background:#F9FAFB;text-transform:uppercase;letter-spacing:0.05em">${glabel}</td></tr>`;
      const itemRows = gItems.map((it) => `
<tr style="border-bottom:1px solid #F3F4F6">
  <td style="padding:6px 10px 6px 20px;font-size:11px">${it.label}${it.notes ? `<br/><span style="font-size:10px;color:#6B7280;font-style:italic">Note: ${it.notes}</span>` : ""}</td>
  <td style="padding:6px 10px;font-size:12px;text-align:center;color:${it.checked ? "#059669" : "#DC2626"};font-weight:bold">${it.checked ? "✓" : "✗"}</td>
</tr>`).join("");
      return header + itemRows;
    }).join("");

    const legacyNote = `<div style="margin-bottom:12px;font-size:10px;color:#9CA3AF;font-style:italic;font-family:monospace">Submitted before the updated form structure (legacy format)</div>`;
    bodyHtml = legacyNote + `<table style="width:100%;border-collapse:collapse">
  <thead><tr>
    <th style="background:#FEF2F2;font-family:monospace;font-size:10px;color:#D64D4D;text-transform:uppercase;padding:7px 10px;text-align:left;border-bottom:2px solid #D64D4D">Cleaning Item</th>
    <th style="background:#FEF2F2;font-family:monospace;font-size:10px;color:#D64D4D;text-transform:uppercase;padding:7px 10px;text-align:center;border-bottom:2px solid #D64D4D;width:80px">Checked</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`;

  } else {
    // legacy_null — boolean columns
    const legacyRows = LEGACY_ITEM_LABELS.map(({ key, label }) => {
      const checked = !!(rec as unknown as Record<string, unknown>)[key];
      return `<tr style="border-bottom:1px solid #F3F4F6">
  <td style="padding:7px 10px;font-size:12px">${label}</td>
  <td style="padding:7px 10px;font-size:12px;text-align:center;color:${checked ? "#059669" : "#DC2626"};font-weight:bold">${checked ? "✓" : "✗"}</td>
</tr>`;
    }).join("");
    bodyHtml = `<table style="width:100%;border-collapse:collapse">
  <thead><tr>
    <th style="background:#FEF2F2;font-family:monospace;font-size:10px;color:#D64D4D;text-transform:uppercase;padding:7px 10px;text-align:left;border-bottom:2px solid #D64D4D">Cleaning Item</th>
    <th style="background:#FEF2F2;font-family:monospace;font-size:10px;color:#D64D4D;text-transform:uppercase;padding:7px 10px;text-align:center;border-bottom:2px solid #D64D4D;width:80px">Checked</th>
  </tr></thead>
  <tbody>${legacyRows}</tbody>
</table>`;
  }

  const notesHtml = rec.notes
    ? `<div style="margin-top:14px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:10px 12px"><div style="font-size:9px;font-family:monospace;color:#9CA3AF;text-transform:uppercase;margin-bottom:4px">Notes</div><div style="font-size:12px;color:#374151">${rec.notes}</div></div>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Daily Cleaning Checklist — Julian Bakery</title>
<style>body{font-family:Georgia,serif;margin:32px;color:#111827}@media print{body{margin:16px}}</style>
</head><body>
${header}
${metaGrid}
${bodyHtml}
${notesHtml}
<div style="margin-top:28px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;font-family:monospace;text-align:center">Julian Bakery Food Safety Management System — Internal Use Only</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function RecordModal({ rec, onClose }: { rec: CleaningRecord; onClose: () => void }) {
  const fmt = detectFormat(rec);
  const items = Array.isArray(rec.items) ? rec.items : [];
  const areaGroups  = fmt === "new_area"  ? buildAreaGroups(items) : [];
  const oldGroups   = fmt === "old_flat"
    ? Object.entries(OLD_GROUP_LABELS)
        .map(([gid, glabel]) => ({ id: gid, label: glabel, items: items.filter((it) => it.group === gid) }))
        .filter((g) => g.items.length > 0)
    : [];

  const totalChecked = items.filter((it) => it.checked).length;
  const totalItems   = items.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg border border-gray-200 shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col">

        {/* Modal header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Daily Cleaning Checklist</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{formatDate(rec.date)}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={rec.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Date",         value: formatDate(rec.date) },
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

          {/* ── New area-based format ── */}
          {fmt === "new_area" && (
            <>
              {/* Summary strip */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 space-y-1">
                <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">Areas Covered</p>
                <p className="text-sm text-gray-700">{areaGroups.map((a) => a.label).join(" · ")}</p>
                <p className={cn(
                  "text-xs font-mono font-semibold",
                  totalChecked === totalItems ? "text-emerald-600" : "text-amber-600"
                )}>
                  Overall: {totalChecked} of {totalItems} items complete
                </p>
              </div>

              {/* Per-area cards */}
              {areaGroups.map((ag) => {
                const allDone = ag.checkedCount === ag.totalCount;
                return (
                  <div key={ag.id} className={cn("rounded-lg border overflow-hidden", allDone ? "border-emerald-200" : "border-gray-200")}>
                    {/* Area header */}
                    <div className={cn("px-4 py-3 flex items-center justify-between", allDone ? "bg-emerald-50" : "bg-gray-50")}>
                      <div className="flex items-center gap-2">
                        {allDone && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                        <span className={cn("text-sm font-semibold", allDone ? "text-emerald-700" : "text-gray-800")}>
                          {ag.label}
                        </span>
                      </div>
                      <span className={cn(
                        "text-xs font-mono font-semibold px-2 py-0.5 rounded-full",
                        allDone ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {ag.checkedCount}/{ag.totalCount}
                      </span>
                    </div>

                    {/* Sections + items */}
                    <div className="divide-y divide-gray-50">
                      {ag.sections.map((sec, si) => (
                        <div key={si}>
                          {sec.label && (
                            <div className="px-4 py-1.5 bg-gray-50/60">
                              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{sec.label}</span>
                            </div>
                          )}
                          {sec.items.map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                "flex flex-col gap-0.5 px-4 py-2.5 border-b border-gray-50 last:border-0",
                                item.checked ? "bg-emerald-50/40" : ""
                              )}
                            >
                              <div className="flex items-center gap-2.5">
                                {item.checked
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />
                                }
                                <span className={cn(
                                  "text-sm leading-snug",
                                  item.checked ? "text-emerald-800" : "text-gray-600"
                                )}>
                                  {item.label}
                                </span>
                              </div>
                              {item.notes && (
                                <p className="ml-6 text-xs text-gray-400 italic">{item.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Info note */}
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Food contact surface verification (ATP swab) and allergen verification (Allergen Changeover swab) are recorded separately in the Pre-Op Inspection and Allergen Changeover logs.
                </p>
              </div>
            </>
          )}

          {/* ── Old flat format ── */}
          {fmt === "old_flat" && (
            <>
              <div className="flex items-center gap-2 text-xs text-gray-400 font-mono italic bg-gray-50 border border-gray-200 rounded px-3 py-2">
                Submitted before the updated form structure (legacy format)
              </div>
              <div className="space-y-3">
                {oldGroups.map((g) => (
                  <div key={g.id}>
                    <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{g.label}</p>
                    <div className="space-y-1.5">
                      {g.items.map((item) => (
                        <div key={item.id} className={cn("flex flex-col gap-1 px-3 py-2 rounded-md", item.checked ? "bg-emerald-50" : "bg-red-50")}>
                          <div className="flex items-center gap-3">
                            {item.checked
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                            }
                            <span className={cn("text-sm", item.checked ? "text-emerald-800" : "text-red-700")}>{item.label}</span>
                          </div>
                          {item.notes && <p className="ml-7 text-xs text-gray-500 italic">{item.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Legacy null format (boolean columns) ── */}
          {fmt === "legacy_null" && (
            <>
              <div className="flex items-center gap-2 text-xs text-gray-400 font-mono italic bg-gray-50 border border-gray-200 rounded px-3 py-2">
                Submitted before the updated form structure (legacy format)
              </div>
              <div className="space-y-1.5">
                {LEGACY_ITEM_LABELS.map(({ key, label }) => {
                  const checked = !!(rec as unknown as Record<string, unknown>)[key];
                  return (
                    <div key={key} className={cn("flex items-center gap-3 px-3 py-2 rounded-md", checked ? "bg-emerald-50" : "bg-red-50")}>
                      {checked
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      }
                      <span className={cn("text-sm", checked ? "text-emerald-800" : "text-red-700")}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {rec.notes && (
            <div>
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2 border border-gray-200">{rec.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
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
            <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Date</span><span className="font-semibold">{formatDate(rec.date)}</span></div>
            <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Checked By</span><span>{rec.checkedBy}</span></div>
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
  const router = useRouter();
  const role = (session?.user as { role?: string })?.role ?? "";

  const [records,      setRecords]      = useState<CleaningRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [selected,     setSelected]     = useState<CleaningRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CleaningRecord | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);

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
        alert((err as { error?: string }).error ?? "Failed to delete.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setDeleting(false); }
  }

  if (status === "loading") return null;

  return (
    <>
      {selected && <RecordModal rec={selected} onClose={() => setSelected(null)} />}
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
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-[#D64D4D]" />
              Daily Cleaning Records
            </h1>
            <p className="page-subtitle">Submitted daily cleaning checklists</p>
          </div>
          <button onClick={() => router.push("/dashboard/supervisor/cleaning/daily")} className="btn-primary">
            <ChevronLeft className="w-4 h-4" /> Back to Form
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm font-mono">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12 gap-2 text-gray-400 font-mono text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
              Loading…
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-mono">No cleaning checklists submitted yet.</p>
              <a href="/dashboard/supervisor/cleaning/daily" className="inline-block mt-3 btn-primary text-xs">
                Submit Your First Checklist
              </a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Date", "Areas / Items", "Checked By", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((rec, i) => {
                    const fmt       = detectFormat(rec);
                    const allItems  = Array.isArray(rec.items) ? rec.items : [];
                    const checked   = allItems.filter((it) => it.checked).length;

                    // Build "areas / items" cell content
                    let areaCell: React.ReactNode;
                    if (fmt === "legacy_null") {
                      areaCell = <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Legacy</span>;
                    } else if (fmt === "new_area") {
                      const presentAreaIds = Array.from(new Set<string>(allItems.map((it) => it.group)));
                      const shortNames = AREA_DEFS
                        .filter((a) => presentAreaIds.includes(a.id))
                        .map((a) => a.short)
                        .join(", ");
                      const statusColor = rec.status === "COMPLETE" ? "text-emerald-600" : "text-amber-600";
                      areaCell = (
                        <div>
                          <div className="text-xs text-gray-600 leading-snug">{shortNames}</div>
                          <div className={cn("text-[11px] font-mono font-semibold mt-0.5", statusColor)}>
                            {checked}/{allItems.length} items
                          </div>
                        </div>
                      );
                    } else {
                      // old_flat
                      areaCell = rec.status === "COMPLETE"
                        ? <span className="text-emerald-600 font-mono text-xs font-semibold">✓ {checked}/{allItems.length}</span>
                        : <span className="text-amber-600 font-mono text-xs font-semibold">⚠ {checked}/{allItems.length}</span>;
                    }

                    return (
                      <tr key={rec.id} className={cn("hover:bg-[#FEF2F2]/50 transition-colors", i % 2 === 1 ? "bg-amber-50/20" : "")}>
                        <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{formatDate(rec.date)}</td>
                        <td className="px-4 py-3">{areaCell}</td>
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
