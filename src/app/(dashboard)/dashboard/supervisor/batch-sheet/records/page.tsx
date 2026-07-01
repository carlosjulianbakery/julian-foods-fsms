"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FolderOpen, ChevronLeft, Download, Eye, X,
  CheckCircle2, XCircle, AlertCircle, Clock, Trash2, AlertTriangle, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate as fmtDateUtil } from "@/lib/dateUtils";
import { formatQty, formatQtyUnit } from "@/lib/formatNumber";

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchStatus = "DRAFT" | "PASS" | "FAIL" | "PASS_WITH_ISSUES" | "COMPLETE" | "IN_PROGRESS";

interface DraftSummary {
  id: string;
  templateName: string;
  productionDate: string;
  supervisorName: string;
  shift: "AM" | "PM";
  lastSavedAt: string | null;
  lastActiveSection: number | null;
  submittedById: string;
}

interface CalibRow  { label: string; reading: string; pass: boolean | null; corrective_action: string }
interface IngRow {
  id: string;
  name: string;
  unit: string;
  // Old format
  quantity_per_bowl?: number;
  // New format (with override tracking)
  qty_per_bowl_template?: number;
  qty_per_bowl_used?: number;
  total_qty_calculated?: number | null;
  total_qty_used?: number | null;
  override_type?: "none" | "qty_per_bowl" | "total_qty";
  override_reason?: string | null;
  override_reason_other?: string | null;
  // Common
  supplier?: string;
  supplier_id?: string | null;
  supplier_source?: "linked" | "other" | "free_text";
  supplier_approval_status?: string | null;
  lot_number?: string;
  // Multi-lot (new format)
  lots?: Array<{
    lot_number: string;
    inventory_lot_id: string | null;
    supplier_name: string | null;
    supplier_source: string | null;
    qty_used_from_this_lot: number;
    brand_name?: string | null;
  }>;
  // Inventory lots (WIP ingredients store lot data here instead of lots[])
  inventory_lots?: Array<{
    lot_id?: string | null;
    lot_number: string;
    qty_used?: number | null;
    unit?: string | null;
  }>;
  // WIP fields
  is_wip?: boolean;
  wip_lot_verified?: boolean | null;
  wip_source_submission_id?: string | null;
}

interface PkgRow {
  id: string; name: string;
  qty_per_bowl?: number; qty_used?: number; food_contact?: boolean;
  units_per_n_flatbreads?: number; quantity_needed?: number;
  supplier?: string; lot_number?: string;
}
interface PkgLotRecord {
  lot_number?: string | null;
  inventory_lot_id?: string | null;
  unit?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  brand_name?: string | null;
  supplier_source?: string | null;
  supplier_approval_status?: string | null;
  qty_used?: number | null;
}
interface PresentationMaterial {
  id: string; name: string; food_contact: boolean;
  // New format
  lots?: PkgLotRecord[];
  total_qty_used?: number | null;
  // Legacy flat fields (backward compat)
  qty_used?: number; supplier?: string; lot_number?: string;
  supplier_source?: "linked" | "other" | "free_text";
  brand_name?: string | null;
}
interface PresentationData {
  presentation_id: string; presentation_name: string; selected: boolean; materials: PresentationMaterial[];
}

// Old bowl-based CCP format
interface BowlEntry {
  bowl_number: number;
  temp1: string; temp2: string; temp_pass: boolean | null; temp_corrective_action: string;
  weight1: string; weight2: string; weight_pass: boolean | null; weight_corrective_action: string;
  visual_pass: boolean | null; visual_notes: string; initials: string;
}
// New session-based CCP format (v1)
interface CcpCheckResult {
  check_id: string; label: string; type: string;
  readings: string[]; pass: boolean | null;
  corrective_action: string; visual_result: string | null; visual_notes: string;
}
interface CcpSession {
  session_number: number; initials: string; check_time?: string; checks: CcpCheckResult[];
}
// New v2 — per-check-type independent sessions
interface CcpGroupSession {
  session_number: number;
  initials: string;
  check_time: string;
  readings: string[];
  pass: boolean | null;
  corrective_action: string;
  visual_result: "pass" | "issue" | null;
  visual_notes: string;
}
interface CcpGroupEntry {
  check_id: string;
  check_name: string;
  check_type: string;
  unit: string | null;
  num_sessions: number;
  sessions: CcpGroupSession[];
}

interface ChecklistItem { label: string; checked: boolean; initials: string }

// New dynamic EOP field format
interface EopField {
  field_id: string; label: string; field_type: string; value: string; order?: number;
}
// Old named-field EOP format
interface EopOld {
  bowls_produced?: string; total_boxes?: string; extra_bags?: string;
  yield_per_bowl?: string; waste?: string; bake_date?: string; prod_hours?: string;
  packaging_review?: { product_labeled_as: string; lot_on_package: string; exp_date_on_package: string; reviewer: string; comments: string };
  quality?: { color: string; shape: string; smell: string; taste: string; overall: string; comments: string };
}
// Packaging verification stored in EopNew — supports both legacy "entered" and new "confirmed" format
interface PkgVerifyFieldLegacy { entered: string; expected: string; match: boolean }
interface PkgVerifyAllergenLegacy { entered: string[]; expected: string[]; match: boolean }
interface PkgVerifyFieldNew { expected: string; confirmed: boolean; discrepancy_value: string | null; match: boolean }
interface PkgVerifyAllergenNew { expected: string[]; confirmed: boolean; entered: string[]; match: boolean }
interface PkgVerification {
  // New format fields (may be absent on old records)
  product_label:    PkgVerifyFieldNew | PkgVerifyFieldLegacy;
  allergens:        PkgVerifyAllergenNew | PkgVerifyAllergenLegacy;
  lot_number:       PkgVerifyFieldNew | PkgVerifyFieldLegacy;
  expiration_date:  PkgVerifyFieldNew | PkgVerifyFieldLegacy;
  all_confirmed?:   boolean;
  all_match?:       boolean; // legacy
}
// Per-presentation unit record (new format)
interface PresentationUnitRecord {
  presentation_id: string;
  presentation_name: string;
  was_produced: boolean;
  total_produced?: number | null;
  extra_internal?: number | null;
  yield_per_bowl?: number | null;
  primary_unit_name?: string | null;
  has_internal_units?: boolean;
  internal_unit_name?: string | null;
  internal_units_per_primary?: number | null;
  // Finished Unit mode — the base unit count IS the finished unit count, no yield calc
  finished_unit_count?: number | null;
  base_unit_name?: string | null;
}

// New unit-production EOP format (includes structured unit data + dynamic fields)
interface EopNew {
  // Legacy single-block fields (kept for backward compat with old records)
  primary_unit_name?:        string | null;
  has_internal_units?:       boolean;
  internal_unit_name?:       string | null;
  internal_units_per_primary?: number | null;
  total_units_produced?:     number | null;
  extra_internal_units?:     number | null;
  yield_per_bowl?:           number | null;
  // New per-presentation format
  presentation_units?:       PresentationUnitRecord[];
  packaging_verification?:   PkgVerification;
  // Base production unit snapshot — replaces the hardcoded "Bowl" label
  base_unit_name?:           string | null;
  base_unit_is_finished?:    boolean | null;
  fields:                    EopField[];
}

// Normalize a presentation name for deduplication — "9 oz" and "9.0 oz" collapse to the same key.
function normPresName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/(\d+)\.0+(?=\s|$)/g, "$1")
    .replace(/(\d+\.\d*?)0+(?=\s|$)/g, "$1")
    .trim();
}

// Allergen changeover
interface SwabAttemptRecord {
  attempt_number: number;
  equipment_swabbed: string;
  time_recorded: string;
  result: "pass" | "fail";
  initials: string;
}
interface AllergenSection {
  changeover_required: boolean;
  previous_product_id?: string | null;
  previous_product_name: string | null;
  previous_product_allergens: string[] | null;
  allergens_auto_filled?: boolean;
  allergens_manually_adjusted?: boolean;
  swab_attempts: SwabAttemptRecord[] | null;
  final_result: "pass" | "not_required" | null;
}

interface Section1    { ovens_used: string[]; calibration: CalibRow[]; initials: string; expiration_date_auto?: boolean; shelf_life_months_used?: number | null }
interface Section3Rec {              // batch recipe (was section2)
  bowls_planned?: number;
  bowls_produced?: number;
  ingredients: IngRow[];
  packaging?: PkgRow[];
  presentations?: PresentationData[];
}
type Section4Rec = BowlEntry[] | CcpSession[] | CcpGroupEntry[];  // CCP (was section3)
type Section5Rec = EopField[] | EopOld | EopNew;  // EOP (was section4)
// New format — auto-status items
interface S6StatusItem {
  id: string;
  label: string;
  present: boolean;
  status: string;
  subItems?: { id: string; label: string; status: string }[];
}
interface Section6Rec {               // release checklist / auto-status dashboard
  // Legacy format (v1)
  checklist?: ChecklistItem[];
  all_passed?: boolean;
  // New format (v2)
  items?: S6StatusItem[];
  all_present_items_resolved?: boolean;
  release_status?: string;
  // Shared
  supervisor_signature?: string;
}

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
  section1:          Section1 | null;
  section2_allergen: AllergenSection | null;
  section3:          Section3Rec | null;
  section4:          Section4Rec | null;
  section5:          Section5Rec | null;
  section6:          Section6Rec | null;
  notes: string | null;
  submittedAt: string;
  submittedBy: { name: string; email: string };
  // Template metadata (joined at fetch time)
  template?: { name: string; hasExpirationDate: boolean };
  // Base production unit snapshot — replaces the hardcoded "Bowl" label. Missing on
  // submissions recorded before this feature — default to "Bowl" / Production Vessel.
  baseUnitName?: string | null;
  baseUnitIsFinished?: boolean | null;
  // Product recipe snapshot at submit time — used to restore ingredient order and names in display
  recipeSnapshot?: Array<{ id: string; materialName: string; order?: number }> | null;
  // Admin-only annotation (omitted from API response for non-admins)
  adminNotes?: string | null;
  adminNotesUpdatedByName?: string | null;
  adminNotesUpdatedAt?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12h(time24: string): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function isNewV2Ccp(s4: Section4Rec): s4 is CcpGroupEntry[] {
  if (!Array.isArray(s4) || s4.length === 0) return false;
  return "sessions" in (s4[0] as object) && "check_id" in (s4[0] as object);
}

function isNewCcp(s4: Section4Rec): s4 is CcpSession[] {
  if (!s4 || s4.length === 0) return false;
  if (isNewV2Ccp(s4)) return false;
  return "session_number" in s4[0];
}

// New structured format: object with a "fields" array key
function isEopNew(s5: Section5Rec): s5 is EopNew {
  return !Array.isArray(s5) && s5 !== null && typeof s5 === "object" && "fields" in (s5 as object);
}
// Legacy dynamic format: plain EopField[]
function isNewEop(s5: Section5Rec): s5 is EopField[] {
  return Array.isArray(s5);
}

function fmtDate(d: string | null | undefined): string {
  return fmtDateUtil(d ?? null);
}

function formatEopValue(field: EopField): string {
  if (!field.value) return "—";
  if (field.field_type === "date") return fmtDateUtil(field.value);
  if (field.field_type === "yes_no") return field.value === "yes" ? "Yes" : field.value === "no" ? "No" : field.value;
  if (field.field_type === "checkbox") return field.value === "true" ? "Yes" : "No";
  return field.value;
}

function StatusBadge({ status }: { status: BatchStatus }) {
  const map: Record<BatchStatus, { label: string; cls: string }> = {
    DRAFT:            { label: "Draft",          cls: "bg-yellow-100 text-yellow-700" },
    PASS:             { label: "Pass",           cls: "bg-emerald-100 text-emerald-800" },
    FAIL:             { label: "Fail",           cls: "bg-red-100 text-red-700" },
    PASS_WITH_ISSUES: { label: "Pass w/ Issues", cls: "bg-amber-100 text-amber-700" },
    COMPLETE:         { label: "Complete",       cls: "bg-blue-100 text-blue-700" },
    IN_PROGRESS:      { label: "In Progress",    cls: "bg-gray-100 text-gray-600" },
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

function SectionHdr({ n, title }: { n: number | string; title: string }) {
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

// ─── PDF export ───────────────────────────────────────────────────────────────

function downloadPDF(sub: Submission) {
  const s2a = sub.section2_allergen;
  const s3  = sub.section3;
  const s4raw = sub.section4 ?? [];
  const s5  = sub.section5;
  const s6  = sub.section6;
  const hasExpDate = sub.template?.hasExpirationDate !== false;

  const statusLabel = { DRAFT: "DRAFT", PASS: "PASS", FAIL: "FAIL", PASS_WITH_ISSUES: "PASS WITH ISSUES", COMPLETE: "COMPLETE", IN_PROGRESS: "IN PROGRESS" }[sub.status] ?? sub.status;
  const statusColor = { DRAFT: "#B45309", PASS: "#059669", FAIL: "#D64D4D", PASS_WITH_ISSUES: "#D97706", COMPLETE: "#2563EB", IN_PROGRESS: "#6B7280" }[sub.status] ?? "#6B7280";

  const bowlsCount = s3?.bowls_produced ?? s3?.bowls_planned ?? "—";
  // Base production unit snapshot — missing on older submissions defaults to "Bowl"
  const baseUnitName = sub.baseUnitName || "Bowl";
  const baseUnitIsFinished = sub.baseUnitIsFinished ?? false;

  // ── Section 2 — Allergen Changeover ──────────────────────────────────────────
  let s2aHtml = "";
  if (s2a) {
    if (!s2a.changeover_required) {
      s2aHtml = `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 2 — Allergen Changeover</h3>
<p style="font-size:11px;color:#059669;font-weight:600;margin-bottom:12px">No allergen changeover required.</p>`;
    } else {
      const attemptsHtml = (s2a.swab_attempts ?? []).map((att) => `
        <tr style="border-bottom:1px solid #F3F4F6">
          <td style="padding:4px 8px;font-size:11px;text-align:center">${att.attempt_number}</td>
          <td style="padding:4px 8px;font-size:11px">${att.equipment_swabbed}</td>
          <td style="padding:4px 8px;font-size:11px;text-align:center;font-family:monospace">${att.time_recorded}</td>
          <td style="padding:4px 8px;font-size:11px;text-align:center;font-weight:bold;color:${att.result === "pass" ? "#059669" : "#7C3AED"}">
            ${att.result === "pass" ? "PASS" : "FAIL"}
          </td>
          <td style="padding:4px 8px;font-size:11px;font-family:monospace">${att.initials}</td>
        </tr>`).join("");

      const passingAtt = (s2a.swab_attempts ?? []).find((a) => a.result === "pass");
      const pdfAllergenNote = s2a.allergens_auto_filled && !s2a.allergens_manually_adjusted
        ? " <span style=\"color:#9CA3AF;font-style:italic\">(auto-filled from product record)</span>"
        : s2a.allergens_manually_adjusted
        ? " <span style=\"color:#D97706;font-style:italic\">(manually adjusted)</span>"
        : "";
      s2aHtml = `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 2 — Allergen Changeover</h3>
<div style="font-family:monospace;font-size:11px;margin-bottom:8px">
  <span style="color:#9CA3AF">Previous Product: </span><strong>${s2a.previous_product_name ?? "—"}</strong>
  &nbsp;&nbsp;
  <span style="color:#9CA3AF">Allergens: </span><strong>${(s2a.previous_product_allergens ?? []).join(", ") || "—"}</strong>${pdfAllergenNote}
</div>
<table style="margin-bottom:4px">
  <thead><tr>
    <th style="padding:4px 8px;text-align:center">#</th>
    <th style="padding:4px 8px;text-align:left">Equipment Swabbed</th>
    <th style="padding:4px 8px;text-align:center">Time</th>
    <th style="padding:4px 8px;text-align:center">Result</th>
    <th style="padding:4px 8px;text-align:left">Initials</th>
  </tr></thead>
  <tbody>${attemptsHtml}</tbody>
</table>
${passingAtt ? `<p style="font-size:11px;color:#059669;font-weight:600;margin-bottom:12px">Allergen Changeover Cleared at ${passingAtt.time_recorded}</p>` : ""}`;
    }
  }

  // ── Section 3 — Ingredients & Packaging ──────────────────────────────────────
  const s3Bowls = s3?.bowls_produced ?? s3?.bowls_planned as number | undefined;
  // Resolve ingredient display order: if recipeSnapshot exists, sort by its order field
  // and merge section3 data by id — fixes ordering on existing submissions without touching stored data.
  const pdfIngredients = (() => {
    const snapshot = sub.recipeSnapshot;
    if (snapshot && snapshot.length > 0 && s3?.ingredients) {
      const s3ById = new Map(s3.ingredients.map((ing) => [ing.id, ing]));
      return [...snapshot]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((snap) => s3ById.has(snap.id) ? { ...s3ById.get(snap.id)!, name: snap.materialName } : null)
        .filter((x): x is IngRow => x !== null);
    }
    return s3?.ingredients ?? [];
  })();
  const ingRows = pdfIngredients.map((ing) => {
    const isModified = (ing.override_type ?? "none") !== "none";
    // Prefer new format fields; fall back to old format
    const qpbTemplate = ing.qty_per_bowl_template ?? ing.quantity_per_bowl ?? 0;
    const qpbUsed = ing.qty_per_bowl_used ?? qpbTemplate;
    const totalUsed = ing.total_qty_used != null
      ? ing.total_qty_used
      : (s3Bowls ? qpbUsed * s3Bowls : null);
    const modifiedBg = isModified ? "background:#FFFBEB;" : "";
    const reasonLabel = ing.override_type !== "none" && ing.override_type != null
      ? (ing.override_reason === "Other (explain below)" ? (ing.override_reason_other || "Other") : (ing.override_reason || "—"))
      : null;
    return `
    <tr style="border-bottom:1px solid #F3F4F6;${modifiedBg}">
      <td style="padding:4px 8px;font-size:11px;border-left:${isModified ? "3px solid #FBBF24" : "none"}">
        ${isModified ? '<span style="font-size:9px;font-weight:bold;color:#92400E;background:#FEF3C7;padding:1px 5px;border-radius:4px;margin-right:4px">MODIFIED</span>' : ""}
        ${ing.name}${reasonLabel ? `<div style="font-size:9px;color:#92400E;margin-top:2px">Reason: ${reasonLabel}</div>` : ""}
      </td>
      <td style="padding:4px 8px;font-size:11px;text-align:center">${qpbUsed} ${ing.unit}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center;font-weight:600;color:${isModified ? "#92400E" : "#D64D4D"}">
        ${totalUsed != null ? `${typeof totalUsed === "number" ? formatQty(totalUsed) : totalUsed} ${ing.unit}` : "—"}
      </td>
      <td style="padding:4px 8px;font-size:11px">${
        ing.lots?.length
          ? ing.lots.map((l) => {
              const isOther = l.supplier_source === "other" || l.supplier_source === "free_text";
              const name = l.brand_name ? `${l.brand_name} (${l.supplier_name || "—"})` : (l.supplier_name || "—");
              return isOther ? `<span style="color:#D97706">${name}</span>` : name;
            }).join("<br/>")
          : (() => {
              const isOther = ing.supplier_source === "other" || ing.supplier_source === "free_text";
              return isOther ? `<span style="color:#D97706">${ing.supplier || "—"}</span>` : (ing.supplier || "—");
            })()
      }</td>
      <td style="padding:4px 8px;font-size:11px;font-family:monospace">${
        ing.lots?.length
          ? ing.lots.map((l) => `${l.lot_number || "—"}${l.qty_used_from_this_lot ? ` (${l.qty_used_from_this_lot})` : ""}`).join("<br/>")
          : ing.inventory_lots?.length
          ? ing.inventory_lots.map((l) => `${l.lot_number || "—"}${l.qty_used ? ` (${l.qty_used})` : ""}`).join("<br/>")
          : (ing.lot_number || "—")
      }</td>
    </tr>`;
  }).join("");

  // Recipe deviations for PDF
  const deviatedIngs = pdfIngredients.filter((ing) => (ing.override_type ?? "none") !== "none");
  const deviationsHtml = deviatedIngs.length > 0 ? `
<div style="margin-top:12px;border:1px solid #FCD34D;border-radius:6px;overflow:hidden">
  <div style="background:#FEF3C7;padding:6px 10px;font-size:11px;font-weight:bold;color:#92400E">⚠ Recipe Deviations This Batch</div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="background:#FFFBEB;font-size:9px;color:#92400E;padding:4px 8px;text-align:left;border-bottom:1px solid #FDE68A">Ingredient</th>
      <th style="background:#FFFBEB;font-size:9px;color:#92400E;padding:4px 8px;text-align:left;border-bottom:1px solid #FDE68A">Orig Qty/${baseUnitName}</th>
      <th style="background:#FFFBEB;font-size:9px;color:#92400E;padding:4px 8px;text-align:left;border-bottom:1px solid #FDE68A">Used Qty/${baseUnitName}</th>
      <th style="background:#FFFBEB;font-size:9px;color:#92400E;padding:4px 8px;text-align:left;border-bottom:1px solid #FDE68A">Orig Total</th>
      <th style="background:#FFFBEB;font-size:9px;color:#92400E;padding:4px 8px;text-align:left;border-bottom:1px solid #FDE68A">Used Total</th>
      <th style="background:#FFFBEB;font-size:9px;color:#92400E;padding:4px 8px;text-align:left;border-bottom:1px solid #FDE68A">Reason</th>
    </tr></thead>
    <tbody>
      ${deviatedIngs.map((ing) => {
        const tmpl = ing.qty_per_bowl_template ?? ing.quantity_per_bowl ?? 0;
        const used = ing.qty_per_bowl_used ?? tmpl;
        const origTotal = s3Bowls ? formatQty(tmpl * s3Bowls) : "—";
        const usedTotal = ing.total_qty_used != null
          ? (typeof ing.total_qty_used === "number" ? formatQty(ing.total_qty_used) : ing.total_qty_used)
          : (s3Bowls ? formatQty(used * s3Bowls) : "—");
        const reason = ing.override_reason === "Other (explain below)"
          ? (ing.override_reason_other || "Other")
          : (ing.override_reason || "—");
        return `<tr style="border-bottom:1px solid #FDE68A">
          <td style="padding:4px 8px;font-size:10px;font-weight:600">${ing.name}</td>
          <td style="padding:4px 8px;font-size:10px">${tmpl} ${ing.unit}</td>
          <td style="padding:4px 8px;font-size:10px;font-weight:bold;color:#92400E">${used} ${ing.unit}</td>
          <td style="padding:4px 8px;font-size:10px">${origTotal !== "—" ? `${origTotal} ${ing.unit}` : "—"}</td>
          <td style="padding:4px 8px;font-size:10px;font-weight:bold;color:#92400E">${usedTotal !== "—" ? `${usedTotal} ${ing.unit}` : "—"}</td>
          <td style="padding:4px 8px;font-size:10px;color:#6B7280">${reason}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
</div>` : "";

  let pkgHtml = "";
  if (s3?.presentations && s3.presentations.length > 0) {
    s3.presentations.filter((p) => p.selected).forEach((pres) => {
      pkgHtml += `<tr><td colspan="4" style="padding:4px 8px;font-size:10px;font-weight:bold;color:#D64D4D;background:#FEF2F2">${pres.presentation_name}</td></tr>`;
      pres.materials.forEach((mat) => {
        const isFC = mat.food_contact;
        const hasLots = mat.lots && mat.lots.length > 0;
        if (hasLots) {
          mat.lots!.forEach((lot, li) => {
            const lotsCount = mat.lots!.length;
            const lotLabel = isFC ? (lotsCount > 1 ? `Lot ${li + 1}: ${lot.lot_number || "—"}` : (lot.lot_number || "—")) : "";
            const supplierRaw = isFC
              ? (lot.brand_name ? `${lot.brand_name} (${lot.supplier_name || "—"})` : (lot.supplier_name || "—"))
              : "—";
            const isOtherPkg = isFC && (lot.supplier_source === "other" || lot.supplier_source === "free_text");
            const supplierDisplay = isOtherPkg ? `<span style="color:#D97706">${supplierRaw}</span>` : supplierRaw;
            const qtyDisplay = lot.qty_used != null ? `${lot.qty_used}${lot.unit ? ` ${lot.unit}` : ""}` : "—";
            pkgHtml += `
              <tr style="border-bottom:1px solid #F3F4F6;background:${isFC ? "#F0FDF4" : "transparent"}">
                <td style="padding:4px 8px;font-size:11px;padding-left:${li > 0 ? "28" : "20"}px">${li === 0 ? `<strong>${mat.name}</strong>${isFC ? ' <span style="font-size:9px;color:#1D4ED8;background:#DBEAFE;padding:1px 5px;border-radius:9999px">FC</span>' : ""}` : ""}</td>
                <td style="padding:4px 8px;font-size:11px;font-family:monospace">${isFC ? lotLabel : ""}</td>
                <td style="padding:4px 8px;font-size:11px">${isFC ? supplierDisplay : (li === 0 ? `<span style="font-family:monospace">${qtyDisplay}</span>` : `<span style="font-family:monospace">${qtyDisplay}</span>`)}</td>
                <td style="padding:4px 8px;font-size:11px;font-family:monospace">${isFC ? qtyDisplay : ""}</td>
              </tr>`;
          });
          if (isFC && mat.total_qty_used != null && mat.lots!.length > 1) {
            const unit = mat.lots!.find(l => l.unit)?.unit ?? "";
            pkgHtml += `<tr style="border-bottom:1px solid #E5E7EB;background:#F0FDF4"><td></td><td colspan="2" style="padding:2px 8px;font-size:10px;color:#166534;font-weight:bold;font-family:monospace">Total: ${mat.total_qty_used}${unit ? ` ${unit}` : ""}</td><td></td></tr>`;
          }
        } else {
          // Legacy flat fields
          const legacyQty = mat.qty_used ?? "—";
          const legacySupplierRaw = isFC ? (mat.brand_name ? `${mat.brand_name} (${(mat as {supplier?: string}).supplier || "—"})` : ((mat as {supplier?: string}).supplier || "—")) : "—";
          const isLegacyOther = isFC && (mat.supplier_source === "other" || mat.supplier_source === "free_text");
          const legacySupplier = isLegacyOther ? `<span style="color:#D97706">${legacySupplierRaw}</span>` : legacySupplierRaw;
          const legacyLot = isFC ? ((mat as {lot_number?: string}).lot_number || "—") : "—";
          pkgHtml += `
            <tr style="border-bottom:1px solid #F3F4F6;background:${isFC ? "#F0FDF4" : "transparent"}">
              <td style="padding:4px 8px;font-size:11px;padding-left:20px"><strong>${mat.name}</strong></td>
              <td style="padding:4px 8px;font-size:11px;font-family:monospace">${legacyLot}</td>
              <td style="padding:4px 8px;font-size:11px">${legacySupplier}</td>
              <td style="padding:4px 8px;font-size:11px;font-family:monospace">${legacyQty}</td>
            </tr>`;
        }
      });
    });
  } else if (s3?.packaging && s3.packaging.length > 0) {
    pkgHtml = s3.packaging.map((pkg) => {
      const qtyUsed = pkg.qty_used ?? pkg.quantity_needed ?? "—";
      const isFC = pkg.food_contact ?? true;
      return `
        <tr style="border-bottom:1px solid #F3F4F6;background:${isFC ? "#F0FDF4" : "transparent"}">
          <td style="padding:4px 8px;font-size:11px">${pkg.name}</td>
          <td style="padding:4px 8px;font-size:11px;text-align:center">${qtyUsed}</td>
          <td style="padding:4px 8px;font-size:11px;text-align:center">
            <span style="padding:1px 6px;border-radius:9999px;font-size:10px;background:${isFC ? "#DCFCE7" : "#F3F4F6"};color:${isFC ? "#166534" : "#6B7280"}">${isFC ? "Food Contact" : "Non-Food"}</span>
          </td>
          <td style="padding:4px 8px;font-size:11px">${isFC ? ((pkg as {brand_name?: string | null}).brand_name ? `${(pkg as {brand_name?: string | null}).brand_name} (${pkg.supplier || "—"})` : (pkg.supplier || "—")) : "—"}</td>
          <td style="padding:4px 8px;font-size:11px;font-family:monospace">${isFC ? (pkg.lot_number || "—") : "—"}</td>
        </tr>`;
    }).join("");
  }

  // ── Section 4 — CCP ──────────────────────────────────────────────────────────
  let s4Html = "";
  if (s4raw.length > 0) {
    if (isNewV2Ccp(s4raw)) {
      const groups = s4raw as CcpGroupEntry[];
      s4Html = `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 4 — CCP Monitoring</h3>
${groups.map((group) => `
  <div style="margin-bottom:12px">
    <div style="font-size:11px;font-weight:bold;color:#D64D4D;margin-bottom:4px">${group.check_name}${group.unit ? ` (${group.unit})` : ""}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <thead><tr>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Session</th>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Readings</th>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Result</th>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Time</th>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Notes</th>
      </tr></thead>
      <tbody>
        ${group.sessions.map((s) => {
          const readingsStr = group.check_type === "visual"
            ? (s.visual_result ?? "—")
            : s.readings.filter(Boolean).map((r) => group.unit ? `${r} ${group.unit}` : r).join(" / ") || "—";
          const notes = s.corrective_action || s.visual_notes || "—";
          return `
          <tr style="border-bottom:1px solid #F3F4F6">
            <td style="padding:4px 8px;font-size:11px;font-weight:600">#${s.session_number}${s.initials ? ` — ${s.initials}` : ""}</td>
            <td style="padding:4px 8px;font-size:11px;font-family:monospace">${readingsStr}</td>
            <td style="padding:4px 8px;font-size:11px;font-weight:bold;color:${s.pass === true ? "#059669" : s.pass === false ? "#D64D4D" : "#9CA3AF"}">
              ${s.pass === true ? "PASS" : s.pass === false ? "FAIL" : "—"}
            </td>
            <td style="padding:4px 8px;font-size:11px;font-family:monospace">${s.check_time || "—"}</td>
            <td style="padding:4px 8px;font-size:11px;color:#6B7280">${notes}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>`).join("")}`;
    } else if (isNewCcp(s4raw)) {
      const sessions = s4raw as CcpSession[];
      s4Html = `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 4 — CCP Monitoring</h3>
${sessions.map((sess) => `
  <div style="margin-bottom:12px">
    <div style="font-size:11px;font-weight:bold;color:#D64D4D;margin-bottom:4px">Check Session ${sess.session_number}${sess.check_time ? ` — ${fmt12h(sess.check_time)}` : ""}${sess.initials ? ` — ${sess.initials}` : ""}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <thead><tr>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Check</th>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Readings</th>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Result</th>
        <th style="background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;padding:4px 8px;text-align:left;border-bottom:1px solid #E5E7EB">Notes</th>
      </tr></thead>
      <tbody>
        ${sess.checks.map((c) => `
          <tr style="border-bottom:1px solid #F3F4F6">
            <td style="padding:4px 8px;font-size:11px;font-weight:600">${c.label || c.type}</td>
            <td style="padding:4px 8px;font-size:11px;font-family:monospace">
              ${c.type === "visual" ? (c.visual_result ?? "—") : (c.readings.filter(Boolean).join(" / ") || "—")}
            </td>
            <td style="padding:4px 8px;font-size:11px;font-weight:bold;color:${c.pass === true ? "#059669" : c.pass === false ? "#D64D4D" : "#9CA3AF"}">
              ${c.pass === true ? "PASS" : c.pass === false ? "FAIL" : "—"}
            </td>
            <td style="padding:4px 8px;font-size:11px;color:#6B7280">${c.corrective_action || c.visual_notes || "—"}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>`).join("")}`;
    } else {
      const bowls = s4raw as BowlEntry[];
      const bowlRows = bowls.map((b) => `
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
      s4Html = `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 4 — CCP Per Bowl</h3>
<table style="margin-bottom:16px">
  <thead><tr><th>Bowl</th><th>Temp 1</th><th>Temp 2</th><th>Temp</th><th>Wt 1</th><th>Wt 2</th><th>Weight</th><th>Visual</th><th>Init</th></tr></thead>
  <tbody>${bowlRows}</tbody>
</table>`;
    }
  }

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
  <div><span style="color:#9CA3AF">${baseUnitName.toUpperCase()}S</span><br/><strong>${bowlsCount}</strong></div>
</div>

${s2aHtml}

${(s3?.ingredients.length ?? 0) > 0 ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 3 — Ingredients</h3>
<table style="margin-bottom:4px">
  <thead><tr><th>Ingredient</th><th>Per ${baseUnitName}</th><th>Total</th><th>Supplier</th><th>Lot #</th></tr></thead>
  <tbody>${ingRows}</tbody>
</table>
${deviationsHtml}
<div style="margin-bottom:12px"></div>` : ""}

${pkgHtml ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 3 — Packaging Materials</h3>
<table style="margin-bottom:16px">
  <thead><tr><th>Material</th><th>Lot #</th><th>Supplier</th><th>Qty Used</th></tr></thead>
  <tbody>${pkgHtml}</tbody>
</table>` : ""}

${s4Html}

${s5 ? (() => {
  if (isEopNew(s5)) {
    const s5n = s5 as EopNew;
    const pdfBaseUnitName = s5n.base_unit_name || baseUnitName;
    const pdfBaseUnitIsFinished = s5n.base_unit_is_finished ?? baseUnitIsFinished;
    // Build unit block: new per-presentation format or legacy single-block
    let unitBlock = "";
    if (s5n.presentation_units && s5n.presentation_units.length > 0) {
      // Deduplicate by presentation_name before rendering (guards against stale template duplicates)
      const seenPdfNames = new Set<string>();
      const producedUnits = s5n.presentation_units.filter((pu) => {
        if (!pu.was_produced) return false;
        const key = normPresName(pu.presentation_name ?? "") || pu.presentation_id;
        if (seenPdfNames.has(key)) return false;
        seenPdfNames.add(key);
        return true;
      });
      if (producedUnits.length > 0) {
        const puRows = producedUnits.map((pu) => `
<div style="border-bottom:1px solid #FDE68A;padding-bottom:8px;margin-bottom:8px">
  <div style="font-size:10px;font-weight:bold;color:#92400E;margin-bottom:4px">${pu.presentation_name}</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-family:monospace;font-size:11px">
    ${(pdfBaseUnitIsFinished || pu.finished_unit_count != null) && pu.finished_unit_count != null
      ? `<div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase">${pdfBaseUnitName}s Produced</span><br/><strong>${pu.finished_unit_count}</strong></div>`
      : `
    ${pu.total_produced != null && pu.primary_unit_name ? `<div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase">Total ${pu.primary_unit_name} Produced</span><br/><strong>${pu.total_produced}</strong></div>` : ""}
    ${pu.has_internal_units && pu.extra_internal != null && pu.internal_unit_name ? `<div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase">Extra ${pu.internal_unit_name} Produced</span><br/><strong>${pu.extra_internal}</strong></div>` : ""}
    ${pu.yield_per_bowl != null && pu.primary_unit_name ? `<div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase">Yield per ${pdfBaseUnitName}</span><br/><strong style="color:#065F46">${formatQty(pu.yield_per_bowl)} ${pu.primary_unit_name} per ${pdfBaseUnitName}</strong>${pu.has_internal_units && pu.internal_unit_name && pu.internal_units_per_primary ? `<br/><span style="font-size:9px;color:#6B7280">≈ ${formatQty(pu.yield_per_bowl * pu.internal_units_per_primary)} ${pu.internal_unit_name} per ${pdfBaseUnitName}</span>` : ""}</div>` : ""}
    `}
  </div>
</div>`).join("");
        unitBlock = `
<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:10px 12px;margin-bottom:10px">
  <div style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;color:#92400E;margin-bottom:6px">Unit Production</div>
  ${puRows}
</div>`;
      }
    } else if (s5n.primary_unit_name) {
      // Legacy single-block format
      unitBlock = `
<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:10px 12px;margin-bottom:10px">
  <div style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;color:#92400E;margin-bottom:6px">Unit Production</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-family:monospace;font-size:11px">
    ${s5n.total_units_produced != null ? `<div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase">Total ${s5n.primary_unit_name} Produced</span><br/><strong>${s5n.total_units_produced}</strong></div>` : ""}
    ${s5n.has_internal_units && s5n.extra_internal_units != null && s5n.internal_unit_name ? `<div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase">Extra ${s5n.internal_unit_name} Produced</span><br/><strong>${s5n.extra_internal_units}</strong></div>` : ""}
    ${s5n.yield_per_bowl != null && s5n.primary_unit_name ? `<div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase">Yield per ${pdfBaseUnitName}</span><br/><strong style="color:#065F46">${formatQty(s5n.yield_per_bowl)} ${s5n.primary_unit_name} per ${pdfBaseUnitName}</strong>${s5n.has_internal_units && s5n.internal_unit_name && s5n.internal_units_per_primary ? `<br/><span style="font-size:9px;color:#6B7280">≈ ${formatQty(s5n.yield_per_bowl * s5n.internal_units_per_primary)} ${s5n.internal_unit_name} per ${pdfBaseUnitName}</span>` : ""}</div>` : ""}
  </div>
</div>`;
    }
    // Packaging verification block for PDF
    const pv = s5n.packaging_verification;
    const pvBlock = pv ? (() => {
      const isNewFmt = "confirmed" in (pv.product_label as object);
      const allOk = isNewFmt ? (pv.all_confirmed ?? false) : (pv.all_match ?? false);
      const anyDiscrepancy = !allOk;

      function pvRowValue(field: PkgVerifyFieldNew | PkgVerifyFieldLegacy, isDate = false): string {
        if (isNewFmt) {
          const f = field as PkgVerifyFieldNew;
          if (f.confirmed) return isDate ? fmtDate(f.expected) : (f.expected || "—");
          return f.discrepancy_value ? (isDate ? fmtDate(f.discrepancy_value) : f.discrepancy_value) : "—";
        }
        const f = field as PkgVerifyFieldLegacy;
        return isDate ? (fmtDate(f.entered) || "—") : (f.entered || "—");
      }
      function pvRowConfirmed(field: PkgVerifyFieldNew | PkgVerifyFieldLegacy): boolean {
        if (isNewFmt) return (field as PkgVerifyFieldNew).confirmed;
        return (field as PkgVerifyFieldLegacy).match;
      }
      function pvRow(label: string, value: string, expected: string, confirmed: boolean) {
        const badge = confirmed
          ? `<span style="color:#059669;font-weight:bold;font-size:10px;margin-left:6px">✓ CONFIRMED</span>`
          : `<span style="color:#D64D4D;font-weight:bold;font-size:10px;margin-left:6px">✗ DISCREPANCY</span>`;
        return `<div style="padding:4px 0;border-bottom:1px solid #F3F4F6">
  <span style="color:#9CA3AF;font-size:9px;text-transform:uppercase">${label}</span>${badge}<br/>
  <span style="font-size:9px;color:#6B7280">Expected: ${expected || "—"}</span><br/>
  ${!confirmed ? `<strong style="font-size:11px;color:#991B1B">${value}</strong>` : ""}
</div>`;
      }
      const allergenEntered = isNewFmt
        ? (pv.allergens as PkgVerifyAllergenNew).entered
        : (pv.allergens as PkgVerifyAllergenLegacy).entered;
      const allergenExpected = pv.allergens.expected;

      const discrepancyHeader = anyDiscrepancy
        ? `<div style="color:#D64D4D;font-weight:bold;font-size:11px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">⚠ PACKAGING DISCREPANCY REPORTED — SEE DETAILS</div>`
        : `<div style="color:#059669;font-weight:bold;font-size:11px;margin-bottom:6px">✓ All packaging verified and confirmed.</div>`;
      return `
<div style="background:${anyDiscrepancy ? "#FEF2F2" : "#F0FDF4"};border:1px solid ${anyDiscrepancy ? "#FCA5A5" : "#86EFAC"};border-radius:6px;padding:10px 12px;margin-bottom:10px">
  <div style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;color:${anyDiscrepancy ? "#991B1B" : "#14532D"};margin-bottom:6px">Packaging Verification</div>
  ${discrepancyHeader}
  ${pvRow("Product Labeled As", pvRowValue(pv.product_label), pv.product_label.expected, pvRowConfirmed(pv.product_label))}
  ${pvRow("Lot on Package", pvRowValue(pv.lot_number), pv.lot_number.expected || "—", pvRowConfirmed(pv.lot_number))}
  ${hasExpDate ? pvRow("Expiration Date on Package", pvRowValue(pv.expiration_date, true), fmtDate(pv.expiration_date.expected), pvRowConfirmed(pv.expiration_date)) : ""}
  ${pvRow("Allergens on Package", allergenEntered.length === 0 ? "None" : allergenEntered.join(", "), allergenExpected.length === 0 ? "None" : allergenExpected.join(", "), pv.allergens.match)}
</div>`;
    })() : "";
    const fieldRows = s5n.fields.filter((f) => f.value).map((f) => `
  <div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase;letter-spacing:0.05em">${f.label}</span><br/><strong style="font-size:11px">${formatEopValue(f)}</strong></div>`).join("");
    return `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 5 — End of Production</h3>
${unitBlock}
${pvBlock}
${fieldRows ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;font-family:monospace;font-size:11px">${fieldRows}</div>` : ""}`;
  } else if (isNewEop(s5)) {
    const fieldRows = (s5 as EopField[]).map((f) => `
  <div><span style="color:#9CA3AF;font-size:9px;text-transform:uppercase;letter-spacing:0.05em">${f.label}</span><br/><strong style="font-size:11px">${formatEopValue(f)}</strong></div>`).join("");
    return `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 5 — End of Production</h3>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;font-family:monospace;font-size:11px">
  ${fieldRows}
</div>`;
  } else {
    const s5old = s5 as EopOld;
    return `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 5 — End of Production</h3>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;font-family:monospace;font-size:11px">
  <div><span style="color:#9CA3AF">BOWLS</span><br/><strong>${s5old.bowls_produced || "—"}</strong></div>
  <div><span style="color:#9CA3AF">TOTAL BOXES</span><br/><strong>${s5old.total_boxes || "—"}</strong></div>
  <div><span style="color:#9CA3AF">EXTRA BAGS</span><br/><strong>${s5old.extra_bags || "—"}</strong></div>
  <div><span style="color:#9CA3AF">PROD HOURS</span><br/><strong>${s5old.prod_hours || "—"}</strong></div>
</div>
${s5old.quality ? `<div style="font-family:monospace;font-size:11px;margin-bottom:12px">
  <span style="color:#9CA3AF">QUALITY — </span>
  Color: ${s5old.quality.color || "—"} | Shape: ${s5old.quality.shape || "—"} | Smell: ${s5old.quality.smell || "—"} | Taste: ${s5old.quality.taste || "—"} | Overall: ${s5old.quality.overall || "—"}
</div>` : ""}`;
  }
})() : ""}

${s6 ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 6 — Product Release Dashboard</h3>
${(() => {
  const statusColors: Record<string, string> = {
    complete: "#059669", pass_with_issues: "#ea580c", in_progress: "#d97706",
    not_started: "#9CA3AF", not_applicable: "#D1D5DB",
  };
  const statusLabels: Record<string, string> = {
    complete: "COMPLETE", pass_with_issues: "PASS W/ ISSUES", in_progress: "IN PROGRESS",
    not_started: "NOT STARTED", not_applicable: "N/A",
  };
  if (s6.items && s6.items.length > 0) {
    return `<div style="margin-bottom:12px">
  ${s6.items.map((item) => {
    const col = statusColors[item.status] ?? "#9CA3AF";
    const lbl = statusLabels[item.status] ?? item.status;
    return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:4px 0;border-bottom:1px solid #F3F4F6">
    <span style="color:#374151">${item.label}${!item.present ? " (N/A)" : ""}</span>
    <span style="color:${col};font-weight:bold;font-size:10px;font-family:monospace">${lbl}</span>
  </div>
  ${(item.subItems ?? []).map((sub) => {
    const sc = statusColors[sub.status] ?? "#9CA3AF";
    const sl = statusLabels[sub.status] ?? sub.status;
    return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;padding:2px 0 2px 16px;color:#6B7280">
    <span>${sub.label}</span><span style="color:${sc};font-weight:bold;font-size:9px">${sl}</span>
  </div>`;
  }).join("")}`;
  }).join("")}
</div>
${s6.release_status ? `<div style="padding:8px;border-radius:6px;margin-bottom:12px;font-size:11px;${s6.release_status === "ready" ? "background:#D1FAE5;border:1px solid #6EE7B7;color:#065F46" : s6.release_status === "ready_with_issues" ? "background:#FEF3C7;border:1px solid #FCD34D;color:#92400E" : "background:#FEF9C3;border:1px solid #FDE68A;color:#78350F"}">
  ${s6.release_status === "ready" ? "✓ Product verified — Ready for release." : s6.release_status === "ready_with_issues" ? "⚠ Release with issues — review before releasing." : "⚠ Batch sheet pending completion."}
</div>` : ""}`;
  }
  // Legacy checklist format
  if (s6.checklist && s6.checklist.length > 0) {
    return `<div style="margin-bottom:12px">
  ${s6.checklist.map((c) => `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid #F3F4F6">
    <span style="color:${c.checked ? "#059669" : "#D64D4D"}">${c.checked ? "☑" : "☐"}</span>
    <span style="margin-left:6px">${c.label}</span>
    ${c.initials ? `<span style="margin-left:8px;color:#9CA3AF;font-family:monospace">${c.initials}</span>` : ""}
  </div>`).join("")}
</div>`;
  }
  return "";
})()}
${s6?.supervisor_signature ? `
<div style="margin-top:16px;padding-top:10px;border-top:1px solid #E5E7EB">
  <div style="font-size:10px;color:#9CA3AF;font-family:monospace">PRODUCTION MANAGER SIGNATURE</div>
  ${s6.supervisor_signature.startsWith("data:image")
    ? `<img src="${s6.supervisor_signature}" alt="Signature" style="max-width:100%;height:120px;object-fit:contain;margin-top:4px;border:1px solid #E5E7EB;border-radius:6px" />`
    : `<div style="font-size:14px;font-style:italic;color:#374151;margin-top:4px">${s6.supervisor_signature}</div>`
  }
</div>` : ""}` : ""}

${sub.notes ? `
<div style="margin-top:14px;padding:10px;border:1px solid #E5E7EB;border-radius:6px">
  <div style="font-size:10px;font-family:monospace;color:#6B7280;margin-bottom:4px">NOTES</div>
  <div style="font-size:12px">${sub.notes}</div>
</div>` : ""}

<div style="margin-top:28px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;font-family:monospace;text-align:center">
  Julian Bakery Food Safety Management System — Internal Use Only — Generated ${new Date().toLocaleString("en-US")}
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

// ─── Allergen section display ─────────────────────────────────────────────────

function AllergenSectionView({ data }: { data: AllergenSection }) {
  if (!data.changeover_required) {
    return (
      <div className="flex items-center gap-2 p-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="text-sm text-emerald-700 font-medium">No allergen changeover required.</span>
      </div>
    );
  }

  const passingAtt = (data.swab_attempts ?? []).find((a) => a.result === "pass");

  const allergenNote = data.allergens_auto_filled && !data.allergens_manually_adjusted
    ? "(auto-filled from product record)"
    : data.allergens_manually_adjusted
    ? "(manually adjusted)"
    : null;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wide mb-0.5">Previous Product</p>
          {data.previous_product_id ? (
            <a href={`/dashboard/products/${data.previous_product_id}`} className="text-sm text-[#D64D4D] hover:underline font-medium">
              {data.previous_product_name ?? "—"}
            </a>
          ) : (
            <p className="text-sm text-gray-800">{data.previous_product_name ?? "—"}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wide mb-0.5">Allergens Present</p>
          <p className="text-sm text-gray-800">{(data.previous_product_allergens ?? []).join(", ") || "—"}</p>
          {allergenNote && (
            <p className={`text-[10px] font-mono mt-0.5 ${data.allergens_manually_adjusted ? "text-amber-600" : "text-gray-400 italic"}`}>
              {allergenNote}
            </p>
          )}
        </div>
      </div>

      {(data.swab_attempts ?? []).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Attempt #", "Equipment Swabbed", "Time", "Result", "Initials"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data.swab_attempts ?? []).map((att) => (
                <tr key={att.attempt_number}>
                  <td className="px-3 py-2 text-center text-gray-600 font-mono">{att.attempt_number}</td>
                  <td className="px-3 py-2 text-gray-800">{att.equipment_swabbed}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{att.time_recorded}</td>
                  <td className="px-3 py-2">
                    {att.result === "pass"
                      ? <span className="badge bg-emerald-100 text-emerald-700 font-semibold">✓ PASS</span>
                      : <span className="badge bg-purple-100 text-purple-700 font-semibold">✗ FAIL</span>
                    }
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600">{att.initials}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {passingAtt ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-sm text-emerald-800 font-medium">
            Allergen Changeover Cleared at {passingAtt.time_recorded}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700">No passing swab recorded.</span>
        </div>
      )}
    </div>
  );
}

// ─── Admin Notes Section ──────────────────────────────────────────────────────

function AdminNotesSection({
  submissionId,
  initialNotes,
  initialUpdatedByName,
  initialUpdatedAt,
  onUpdate,
}: {
  submissionId: string;
  initialNotes: string | null;
  initialUpdatedByName: string | null;
  initialUpdatedAt: string | null;
  onUpdate: (notes: string | null, byName: string | null, at: string | null) => void;
}) {
  const [notes, setNotes]               = useState(initialNotes);
  const [byName, setByName]             = useState(initialUpdatedByName);
  const [updatedAt, setUpdatedAt]       = useState(initialUpdatedAt);
  const [editing, setEditing]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft]               = useState(initialNotes ?? "");
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const textareaRef                     = useRef<HTMLTextAreaElement>(null);

  async function save() {
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/batch-sheet/${submissionId}/admin-notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_notes: draft.trim() }),
      });
      if (!r.ok) throw new Error("Failed to save note");
      const data = await r.json();
      const newNotes   = data.adminNotes ?? null;
      const newByName  = data.adminNotesUpdatedByName ?? null;
      const newAt      = data.adminNotesUpdatedAt ?? null;
      setNotes(newNotes);
      setByName(newByName);
      setUpdatedAt(newAt);
      setEditing(false);
      onUpdate(newNotes, newByName, newAt);
    } catch {
      setError("Could not save note. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/batch-sheet/${submissionId}/admin-notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_notes: null }),
      });
      if (!r.ok) throw new Error("Failed to delete note");
      setNotes(null);
      setByName(null);
      setUpdatedAt(null);
      setConfirmDelete(false);
      onUpdate(null, null, null);
    } catch {
      setError("Could not delete note. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setDraft(notes ?? "");
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function startAdd() {
    setDraft("");
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const fmtAt = updatedAt
    ? new Date(updatedAt).toLocaleString("en-US", {
        month: "2-digit", day: "2-digit", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      })
    : null;

  return (
    <div className="mt-4 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-gray-200 bg-gray-100">
        <Lock className="w-3 h-3 text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin Notes</span>
        <span className="text-[10px] text-gray-400 font-mono ml-1">(Internal)</span>
      </div>

      <div className="px-4 py-3">
        <p className="text-[10px] text-gray-400 italic mb-2">
          Visible to admins only. Not included in PDF export.
        </p>

        {error && (
          <p className="text-xs text-red-600 mb-2">{error}</p>
        )}

        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-gray-400 resize-none bg-white"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Enter internal note…"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || !draft.trim()}
                className="px-2.5 py-1 text-xs font-mono bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Note"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null); }}
                disabled={saving}
                className="px-2.5 py-1 text-xs font-mono text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : confirmDelete ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600">Delete this note? This cannot be undone.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={deleteNote}
                disabled={saving}
                className="px-2.5 py-1 text-xs font-mono bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); setError(null); }}
                disabled={saving}
                className="px-2.5 py-1 text-xs font-mono text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : notes ? (
          <div className="space-y-1.5">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
            {fmtAt && (
              <p className="text-[10px] text-gray-400 font-mono">
                {byName ? `Added by ${byName} on ` : "Added on "}{fmtAt}
                {" · "}
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-gray-500 hover:text-gray-700 underline underline-offset-2"
                >
                  Edit
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-gray-500 hover:text-red-600 underline underline-offset-2"
                >
                  Delete
                </button>
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={startAdd}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            + Add note
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function SubmissionModal({ sub, role, onClose, onAdminNotesUpdate }: {
  sub: Submission;
  role: string;
  onClose: () => void;
  onAdminNotesUpdate?: (id: string, notes: string | null, byName: string | null, at: string | null) => void;
}) {
  const s1  = sub.section1;
  const s2a = sub.section2_allergen;
  const s3  = sub.section3;
  const s4raw = sub.section4 ?? [];
  const s5  = sub.section5;
  const s6  = sub.section6;

  const bowlsCount = s3?.bowls_produced ?? s3?.bowls_planned;
  // Derive hasExpirationDate from the joined template; default true for backward compat
  const hasExpirationDate = sub.template?.hasExpirationDate !== false;
  // Base production unit snapshot — missing on older submissions defaults to "Bowl"
  const baseUnitName = sub.baseUnitName || "Bowl";
  const baseUnitIsFinished = sub.baseUnitIsFinished ?? false;

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
            {hasExpirationDate && (
              <div>
                <KV label="Expiry Date" value={fmtDate(sub.expirationDate)} />
                {s1?.expiration_date_auto && (
                  <p className="text-[10px] text-blue-600 font-mono mt-0.5">
                    Auto-calculated{s1.shelf_life_months_used != null ? ` (${s1.shelf_life_months_used} mo shelf life)` : ""}
                  </p>
                )}
              </div>
            )}
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

          {/* Section 2 — Allergen Changeover */}
          <div className="card overflow-hidden">
            <SectionHdr n={2} title="Allergen Changeover" />
            {s2a ? (
              <AllergenSectionView data={s2a} />
            ) : (
              <p className="p-4 text-xs text-gray-400 font-mono">No allergen changeover data recorded.</p>
            )}
          </div>

          {/* Section 3 — Batch Recipe */}
          {s3 && (
            <div className="card overflow-hidden">
              <SectionHdr n={3} title="Batch Recipe" />
              <div className="p-4 space-y-4">
                <KV label={baseUnitName} value={bowlsCount} />
                <div className="overflow-x-auto">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-mono mb-1">Ingredients</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {["Ingredient", `Qty/${baseUnitName}`, "Total", "Supplier", "Lot #"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(() => {
                        // If a recipe snapshot exists, merge by ingredient id so order and names
                        // reflect the product recipe (sorted by order field), not JSONB array order.
                        const snapshot = sub.recipeSnapshot;
                        if (snapshot && snapshot.length > 0) {
                          const s3ById = new Map(s3.ingredients.map((ing) => [ing.id, ing]));
                          return [...snapshot]
                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                            .map((snap) => s3ById.has(snap.id) ? { ...s3ById.get(snap.id)!, name: snap.materialName } : null)
                            .filter((x): x is IngRow => x !== null);
                        }
                        return s3.ingredients;
                      })().map((ing) => {
                        const isModified = (ing.override_type ?? "none") !== "none";
                        const qtyPerBowl = ing.qty_per_bowl_used ?? ing.quantity_per_bowl ?? 0;
                        const totalQty = ing.total_qty_used !== undefined
                          ? ing.total_qty_used
                          : (bowlsCount ? qtyPerBowl * (bowlsCount as number) : null);
                        return (
                          <tr key={ing.id} className={isModified ? "border-l-4 border-amber-400 bg-amber-50/40" : ""}>
                            <td className="px-3 py-2 font-medium text-gray-800">
                              {ing.name}
                              {isModified && (
                                <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wide">Modified</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-500 font-mono text-xs">{qtyPerBowl} {ing.unit}</td>
                            <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">
                              <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${isModified ? "bg-amber-100 text-amber-800" : "bg-[#FAE8E8] text-[#C04040]"}`}>
                                {totalQty != null ? `${typeof totalQty === "number" ? formatQty(totalQty) : totalQty} ${ing.unit}` : "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600 text-xs">
                              {ing.lots?.length ? (
                                <div className="space-y-0.5">
                                  {ing.lots.map((l, li) => {
                                    const isOther = l.supplier_source === "other" || l.supplier_source === "free_text";
                                    return (
                                      <div key={li} className="flex items-center gap-1">
                                        {ing.lots!.length > 1 && <span className="text-[9px] text-gray-400 font-mono">L{li + 1}</span>}
                                        <span className={isOther ? "text-amber-600" : undefined}>
                                          {l.brand_name ? `${l.brand_name} (${l.supplier_name || "—"})` : (l.supplier_name || "—")}
                                        </span>
                                        {l.supplier_source === "linked" && (
                                          <span className="text-[9px] text-emerald-600 font-mono bg-emerald-50 px-1 py-0.5 rounded">approved</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <>
                                  <span className={(ing.supplier_source === "other" || ing.supplier_source === "free_text") ? "text-amber-600" : undefined}>
                                    {ing.supplier || "—"}
                                  </span>
                                  {ing.supplier_source === "linked" && (
                                    <span className="ml-1.5 text-[9px] text-emerald-600 font-mono bg-emerald-50 px-1 py-0.5 rounded">via approved list</span>
                                  )}
                                  {ing.supplier_source === "other" && (
                                    <span className="ml-1.5 text-[9px] text-gray-400 font-mono bg-gray-100 px-1 py-0.5 rounded">other supplier</span>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                              {(() => {
                                const displayLots = ing.lots?.length
                                  ? ing.lots.map((l) => ({ lot_number: l.lot_number, qty: l.qty_used_from_this_lot }))
                                  : ing.inventory_lots?.length
                                  ? ing.inventory_lots.map((l) => ({ lot_number: l.lot_number, qty: l.qty_used ?? null }))
                                  : null;
                                if (displayLots?.length) {
                                  return (
                                    <div className="space-y-0.5">
                                      {displayLots.map((l, li) => (
                                        <div key={li} className="flex items-center gap-1">
                                          {displayLots.length > 1 && <span className="text-[9px] text-gray-400 font-mono">L{li + 1}</span>}
                                          <span>{l.lot_number || "—"}</span>
                                          {l.qty != null && l.qty > 0 && <span className="text-[9px] text-gray-400">({l.qty})</span>}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }
                                return <span>{ing.lot_number || "—"}</span>;
                              })()}
                              {ing.is_wip && ing.wip_lot_verified && ing.wip_source_submission_id && (
                                <a
                                  href={`/dashboard/supervisor/batch-sheet/records?submission=${ing.wip_source_submission_id}`}
                                  className="block mt-0.5 text-[9px] text-blue-600 hover:text-blue-800 font-mono underline"
                                >
                                  View PreMix batch sheet →
                                </a>
                              )}
                              {ing.is_wip && ing.wip_lot_verified === false && (
                                <span className="block mt-0.5 text-[9px] text-amber-600 font-mono">⚠ lot unverified</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Recipe Deviations Summary */}
                {s3.ingredients.some((ing) => (ing.override_type ?? "none") !== "none") && (
                  <div className="border border-amber-300 rounded-lg bg-amber-50 overflow-hidden">
                    <div className="px-4 py-2 bg-amber-100 flex items-center gap-2 border-b border-amber-300">
                      <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">⚠ Recipe Deviations</span>
                    </div>
                    <div className="divide-y divide-amber-100">
                      {s3.ingredients
                        .filter((ing) => (ing.override_type ?? "none") !== "none")
                        .map((ing) => {
                          const label = ing.override_type === "qty_per_bowl" ? "Qty/Bowl override" : "Total Qty override";
                          const reason = ing.override_reason ?? "—";
                          const reasonOther = ing.override_reason_other;
                          return (
                            <div key={ing.id} className="px-4 py-2 text-xs">
                              <div className="font-semibold text-gray-800">
                                {ing.name}{" "}
                                <span className="font-normal text-amber-700">({label})</span>
                              </div>
                              <div className="text-gray-600 mt-0.5">
                                Reason:{" "}
                                <span className="font-medium">
                                  {reason === "Other (explain below)" && reasonOther
                                    ? `Other — ${reasonOther}`
                                    : reason}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
                {/* New presentation format */}
                {s3.presentations && s3.presentations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-mono mb-2">Packaging Materials</p>
                    {s3.presentations.some((p) => p.selected && p.materials.some((m) => m.food_contact && m.lots?.some((l) => l.inventory_lot_id && l.qty_used == null))) && (
                      <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        <span className="font-semibold">⚠ Packaging quantities were not recorded for some materials in this batch sheet.</span>{" "}
                        Inventory deductions for those packaging lots could not be applied.
                      </div>
                    )}
                    <div className="space-y-3">
                      {s3.presentations.filter((p) => p.selected).map((pres) => (
                        <div key={pres.presentation_id} className="border border-emerald-100 rounded-lg overflow-hidden">
                          <div className="bg-emerald-50/50 px-3 py-2 flex items-center gap-2 border-b border-emerald-100">
                            <span className="text-xs font-semibold text-gray-700">{pres.presentation_name}</span>
                            <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">Selected</span>
                          </div>
                          <div className="p-3 space-y-3">
                            {pres.materials.map((mat) => {
                              const isFC = mat.food_contact;
                              const hasLots = mat.lots && mat.lots.length > 0;
                              // Legacy flat format fallback
                              const legacyQty = mat.qty_used ?? null;
                              const legacySupplier = mat.brand_name
                                ? `${mat.brand_name} (${mat.supplier || "—"})`
                                : (mat.supplier || null);
                              return (
                                <div key={mat.id} className="border border-gray-100 rounded-lg overflow-hidden">
                                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/80 border-b border-gray-100">
                                    <span className="font-semibold text-xs text-gray-800">{mat.name}</span>
                                    {isFC && <span className="badge bg-blue-100 text-blue-700 text-[9px]">Food Contact</span>}
                                  </div>
                                  <div className="px-3 py-2 space-y-1">
                                    {hasLots ? (
                                      <>
                                        {mat.lots!.map((lot, li) => {
                                          const missingQty = isFC && lot.inventory_lot_id && lot.qty_used == null;
                                          return (
                                          <div key={li} className="text-xs text-gray-700">
                                            {isFC ? (
                                              <span>
                                                <span className="font-mono text-gray-500 mr-1">Lot {li + 1}:</span>
                                                <span className="font-mono">{lot.lot_number || "—"}</span>
                                                {(lot.supplier_name || lot.brand_name) && (
                                                  <span className={`ml-1 ${(lot.supplier_source === "other" || lot.supplier_source === "free_text") ? "text-amber-600" : "text-gray-500"}`}>
                                                    — {lot.brand_name ? `${lot.brand_name} (${lot.supplier_name || "—"})` : lot.supplier_name}
                                                    {(lot.supplier_source === "inventory" || lot.supplier_source === "linked") && (
                                                      <span className="ml-1 text-[9px] text-emerald-600 font-mono bg-emerald-50 px-1 py-0.5 rounded">via approved list</span>
                                                    )}
                                                  </span>
                                                )}
                                                {lot.qty_used != null ? (
                                                  <span className="text-gray-500 ml-1">— {lot.qty_used}{lot.unit ? ` ${lot.unit}` : ""}</span>
                                                ) : missingQty ? (
                                                  <span className="ml-1 text-amber-600 font-mono text-[10px]">⚠ No qty recorded</span>
                                                ) : null}
                                              </span>
                                            ) : (
                                              <span>
                                                {mat.lots!.length > 1 && <span className="text-gray-500 font-mono mr-1">Qty {li + 1}:</span>}
                                                <span className="font-mono">{lot.qty_used ?? "—"}{lot.unit ? ` ${lot.unit}` : ""}</span>
                                              </span>
                                            )}
                                          </div>
                                          );
                                        })}
                                        {mat.total_qty_used != null && mat.lots!.length > 1 && (
                                          <div className="text-xs font-mono font-semibold text-gray-700 pt-0.5">
                                            Total: {mat.total_qty_used}{mat.lots!.find(l => l.unit)?.unit ? ` ${mat.lots!.find(l => l.unit)!.unit}` : ""}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      // Legacy flat-field display
                                      <div className="text-xs text-gray-700">
                                        {isFC ? (
                                          <>
                                            {mat.lot_number && <span className="font-mono mr-1">{mat.lot_number}</span>}
                                            {legacySupplier && (
                                              <span className={(mat.supplier_source === "other" || mat.supplier_source === "free_text") ? "text-amber-600" : "text-gray-500"}>
                                                — {legacySupplier}
                                              </span>
                                            )}
                                            {legacyQty != null && <span className="text-gray-500 ml-1">— {legacyQty}</span>}
                                          </>
                                        ) : (
                                          <span className="font-mono">{legacyQty ?? "—"}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Old flat packaging format */}
                {!s3.presentations && s3.packaging && s3.packaging.length > 0 && (
                  <div className="overflow-x-auto">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-mono mb-1">Packaging Materials</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {["Material", "Qty Used", "Food Contact", "Supplier", "Lot #"].map((h) => (
                            <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {s3.packaging.map((pkg) => {
                          const qtyUsed = pkg.qty_used ?? pkg.quantity_needed ?? "—";
                          const isFC = pkg.food_contact ?? true;
                          return (
                            <tr key={pkg.id} className={isFC ? "bg-emerald-50/20" : ""}>
                              <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{pkg.name}</td>
                              <td className="px-3 py-2 font-mono text-gray-700">{qtyUsed}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {isFC
                                  ? <span className="badge bg-emerald-100 text-emerald-700 text-xs">Food Contact</span>
                                  : <span className="badge bg-gray-100 text-gray-500 text-xs">Non-Food Contact</span>
                                }
                              </td>
                              <td className="px-3 py-2 text-gray-600 text-xs">{isFC ? ((pkg as {brand_name?: string | null}).brand_name ? `${(pkg as {brand_name?: string | null}).brand_name} (${pkg.supplier || "—"})` : (pkg.supplier || "—")) : "—"}</td>
                              <td className="px-3 py-2 text-gray-600 font-mono text-xs">{isFC ? (pkg.lot_number || "—") : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 4 — CCP */}
          {s4raw.length > 0 && (
            <div className="card overflow-hidden">
              {isNewV2Ccp(s4raw) ? (
                <>
                  <SectionHdr n={4} title="CCP Monitoring" />
                  <div className="p-4 space-y-4">
                    {(s4raw as CcpGroupEntry[]).map((group, gi) => (
                      <div key={gi} className="space-y-2">
                        <div className="flex items-center gap-2 pt-2 first:pt-0 border-t border-gray-100 first:border-0">
                          <h3 className="text-sm font-semibold text-gray-800">{group.check_name}</h3>
                          {group.unit && <span className="text-xs text-gray-400 font-mono">({group.unit})</span>}
                          <span className="text-xs text-gray-400 font-mono">— {group.num_sessions} Session{group.num_sessions !== 1 ? "s" : ""}</span>
                        </div>
                        {group.sessions.map((sess, si) => (
                          <div key={si} className="border border-gray-100 rounded-lg overflow-hidden">
                            <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 border-b border-gray-100">
                              <span className="text-sm font-semibold text-gray-700">Session {sess.session_number}</span>
                              {sess.check_time && <span className="text-xs text-gray-400 font-mono">— {sess.check_time}</span>}
                              {sess.initials && <span className="text-xs text-gray-400 font-mono">— {sess.initials}</span>}
                              {sess.pass === false && <span className="badge bg-red-100 text-red-700 text-[10px]">Issue</span>}
                              {sess.pass === true && <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">Pass</span>}
                            </div>
                            <div className="p-3 space-y-2">
                              {group.check_type === "visual" ? (
                                <p className="text-xs text-gray-500">
                                  {sess.visual_result === "pass" ? "✓ Pass" : sess.visual_result === "issue" ? "⚠ Issue Found" : "—"}
                                  {sess.visual_notes && <span className="ml-2 text-amber-700">{sess.visual_notes}</span>}
                                </p>
                              ) : (
                                <p className="text-xs text-gray-500 font-mono">
                                  {sess.readings.filter(Boolean).map((r) => group.unit ? `${r} ${group.unit}` : r).join(" / ") || "—"}
                                </p>
                              )}
                              {sess.corrective_action && (
                                <p className="text-xs text-red-600">{sess.corrective_action}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              ) : isNewCcp(s4raw) ? (
                <>
                  <SectionHdr n={4} title="CCP Monitoring" />
                  <div className="p-4 space-y-4">
                    {(s4raw as CcpSession[]).map((session, si) => (
                      <div key={si} className="border border-gray-100 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 border-b border-gray-100">
                          <span className="text-sm font-semibold text-gray-700">
                            Check Session {session.session_number}
                            {session.check_time && (
                              <span className="ml-2 text-xs font-normal text-gray-500 font-mono">— {fmt12h(session.check_time)}</span>
                            )}
                          </span>
                          {session.initials && <span className="text-xs text-gray-400 font-mono">— {session.initials}</span>}
                          {session.checks.some((c) => c.pass === false) && (
                            <span className="badge bg-red-100 text-red-700 text-[10px]">Issues</span>
                          )}
                        </div>
                        <div className="p-4 space-y-3">
                          {session.checks.map((check, ci) => (
                            <div key={ci} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-semibold text-gray-600">{check.label || check.type}</p>
                                <PassChip pass={check.pass} />
                              </div>
                              {check.type === "visual" ? (
                                <p className="text-xs text-gray-500 mt-1">
                                  {check.visual_result === "pass" ? "✓ Pass" : check.visual_result === "issue" ? "⚠ Issue Found" : "—"}
                                  {check.visual_notes && <span className="ml-2 text-amber-700">{check.visual_notes}</span>}
                                </p>
                              ) : (
                                <p className="text-xs text-gray-500 font-mono mt-1">
                                  {check.readings.filter(Boolean).join(" / ") || "—"}
                                </p>
                              )}
                              {check.corrective_action && (
                                <p className="text-xs text-red-600 mt-1">{check.corrective_action}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <SectionHdr n={4} title="CCP Monitoring Per Bowl" />
                  <div className="p-4 space-y-3">
                    {(s4raw as BowlEntry[]).map((bowl, i) => (
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
                            {bowl.temp_corrective_action && <p className="text-xs text-red-600 mt-1">{bowl.temp_corrective_action}</p>}
                          </div>
                          <div>
                            <p className="label">Weight (oz)</p>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-gray-700">{bowl.weight1 || "—"} / {bowl.weight2 || "—"}</span>
                              <PassChip pass={bowl.weight_pass} />
                            </div>
                            {bowl.weight_corrective_action && <p className="text-xs text-red-600 mt-1">{bowl.weight_corrective_action}</p>}
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
                </>
              )}
            </div>
          )}

          {/* Section 5 — EOP */}
          {s5 && (
            <div className="card overflow-hidden">
              <SectionHdr n={5} title="End of Production Summary" />
              <div className="p-4 space-y-4">
                {isEopNew(s5) ? (
                  <div className="space-y-4">
                    {/* Unit production block — new per-presentation format */}
                    {(s5 as EopNew).presentation_units && (s5 as EopNew).presentation_units!.length > 0 && (() => {
                      const s5n = s5 as EopNew;
                      const presBaseUnitName = s5n.base_unit_name || baseUnitName;
                      const presBaseUnitIsFinished = s5n.base_unit_is_finished ?? baseUnitIsFinished;
                      // Deduplicate by presentation_name: a linked product and its template may
                      // both have an entry for the same presentation (same name, different ID).
                      const seenNames = new Set<string>();
                      const produced = s5n.presentation_units!.filter((pu) => {
                        if (!pu.was_produced) return false;
                        const key = normPresName(pu.presentation_name ?? "") || pu.presentation_id;
                        if (seenNames.has(key)) return false;
                        seenNames.add(key);
                        return true;
                      });
                      return (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Unit Production</p>
                          {produced.length === 0 ? (
                            <p className="text-xs text-amber-600 font-mono">No presentations were produced today.</p>
                          ) : (
                            <div className="space-y-3">
                              {produced.map((pu) => (
                                <div key={pu.presentation_id} className="space-y-2 border-b border-amber-200 pb-3 last:border-0 last:pb-0">
                                  <p className="text-xs font-semibold text-amber-800">{pu.presentation_name}</p>
                                  {presBaseUnitIsFinished || pu.finished_unit_count != null ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                      {pu.finished_unit_count != null && (
                                        <KV label={`${presBaseUnitName}s Produced`} value={String(pu.finished_unit_count)} />
                                      )}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                      {pu.total_produced != null && pu.primary_unit_name && (
                                        <KV label={`Total ${pu.primary_unit_name}`} value={String(pu.total_produced)} />
                                      )}
                                      {pu.has_internal_units && pu.extra_internal != null && pu.internal_unit_name && (
                                        <KV label={`Extra ${pu.internal_unit_name}`} value={String(pu.extra_internal)} />
                                      )}
                                      {pu.yield_per_bowl != null && pu.primary_unit_name && (
                                        <div>
                                          <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Yield per {presBaseUnitName}</p>
                                          <p className="text-sm font-mono font-semibold text-emerald-700">
                                            {`${formatQty(pu.yield_per_bowl)} ${pu.primary_unit_name} per ${presBaseUnitName}`}
                                          </p>
                                          {pu.has_internal_units && pu.internal_unit_name && pu.internal_units_per_primary && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">
                                              {`≈ ${formatQty(pu.yield_per_bowl * pu.internal_units_per_primary)} ${pu.internal_unit_name} per ${presBaseUnitName}`}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* Unit production block — legacy single-block format (backward compat) */}
                    {!(s5 as EopNew).presentation_units && (s5 as EopNew).primary_unit_name && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Unit Production</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          {(s5 as EopNew).total_units_produced != null && (
                            <KV
                              label={`Total ${(s5 as EopNew).primary_unit_name} Produced`}
                              value={String((s5 as EopNew).total_units_produced)}
                            />
                          )}
                          {(s5 as EopNew).has_internal_units && (s5 as EopNew).extra_internal_units != null && (s5 as EopNew).internal_unit_name && (
                            <KV
                              label={`Extra ${(s5 as EopNew).internal_unit_name} Produced`}
                              value={String((s5 as EopNew).extra_internal_units)}
                            />
                          )}
                          {(s5 as EopNew).yield_per_bowl != null && (
                            <div>
                              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Yield per {baseUnitName}</p>
                              <p className="text-sm font-mono font-semibold text-emerald-700">
                                {(() => {
                                  const y = (s5 as EopNew).yield_per_bowl!;
                                  return `${formatQty(y)} ${(s5 as EopNew).primary_unit_name} per ${baseUnitName}`;
                                })()}
                              </p>
                              {(s5 as EopNew).has_internal_units && (s5 as EopNew).internal_unit_name && (s5 as EopNew).internal_units_per_primary && (
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {(() => {
                                    const y = (s5 as EopNew).yield_per_bowl!;
                                    const r = (s5 as EopNew).internal_units_per_primary!;
                                    const v = y * r;
                                    return `≈ ${formatQty(v)} ${(s5 as EopNew).internal_unit_name} per ${baseUnitName}`;
                                  })()}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Packaging Verification block */}
                    {(s5 as EopNew).packaging_verification && (() => {
                      const pv = (s5 as EopNew).packaging_verification!;
                      // Normalise — handle both legacy "entered" format and new "confirmed" format
                      const isNewFmt = "confirmed" in (pv.product_label as object);
                      const allOk = isNewFmt ? (pv.all_confirmed ?? false) : (pv.all_match ?? false);

                      // Extract display values from either format
                      function getLabelValue(): string {
                        if (isNewFmt) {
                          const f = pv.product_label as PkgVerifyFieldNew;
                          return f.confirmed ? f.expected : (f.discrepancy_value || "—");
                        }
                        return (pv.product_label as PkgVerifyFieldLegacy).entered || "—";
                      }
                      function getLotValue(): string {
                        if (isNewFmt) {
                          const f = pv.lot_number as PkgVerifyFieldNew;
                          return f.confirmed ? f.expected : (f.discrepancy_value || "—");
                        }
                        return (pv.lot_number as PkgVerifyFieldLegacy).entered || "—";
                      }
                      function getExpValue(): string {
                        if (isNewFmt) {
                          const f = pv.expiration_date as PkgVerifyFieldNew;
                          return f.confirmed ? fmtDate(f.expected) : (f.discrepancy_value ? fmtDate(f.discrepancy_value) : "—");
                        }
                        return fmtDate((pv.expiration_date as PkgVerifyFieldLegacy).entered) || "—";
                      }
                      function getAllergenValue(): string {
                        const entered = isNewFmt
                          ? (pv.allergens as PkgVerifyAllergenNew).entered
                          : (pv.allergens as PkgVerifyAllergenLegacy).entered;
                        return entered.length === 0 ? "None" : entered.join(", ");
                      }
                      function getConfirmedBadge(field: PkgVerifyFieldNew | PkgVerifyFieldLegacy) {
                        if (!isNewFmt) {
                          const f = field as PkgVerifyFieldLegacy;
                          return f.match
                            ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">✓ CONFIRMED</span>
                            : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#D64D4D] bg-red-50 border border-[#D64D4D]/30 px-1.5 py-0.5 rounded">✗ DISCREPANCY</span>;
                        }
                        const f = field as PkgVerifyFieldNew;
                        return f.confirmed
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">✓ CONFIRMED</span>
                          : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#D64D4D] bg-red-50 border border-[#D64D4D]/30 px-1.5 py-0.5 rounded">✗ DISCREPANCY</span>;
                      }
                      function getAllergenBadge() {
                        return pv.allergens.match
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">✓ CONFIRMED</span>
                          : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#D64D4D] bg-red-50 border border-[#D64D4D]/30 px-1.5 py-0.5 rounded">✗ DISCREPANCY</span>;
                      }

                      return (
                        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Packaging Verification</p>
                            {allOk
                              ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">✓ All Verified</span>
                              : <span className="text-[10px] font-semibold text-[#D64D4D] bg-red-50 border border-[#D64D4D]/30 px-2 py-0.5 rounded">⚠ Issues Detected</span>
                            }
                          </div>
                          {!allOk && (
                            <div className="flex items-start gap-2 rounded bg-red-50 border border-[#D64D4D]/30 px-3 py-2">
                              <AlertCircle className="w-4 h-4 text-[#D64D4D] shrink-0 mt-0.5" />
                              <p className="text-xs text-[#D64D4D] font-medium">Packaging discrepancy reported — review flagged fields.</p>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Product Label */}
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">Product Labeled As</p>
                              <p className="text-[10px] text-gray-400 font-mono">Expected: <span className="text-gray-600">{pv.product_label.expected}</span></p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-gray-800">{getLabelValue()}</span>
                                {getConfirmedBadge(pv.product_label)}
                              </div>
                            </div>
                            {/* Lot Number */}
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">Lot on Package</p>
                              <p className="text-[10px] text-gray-400 font-mono">Expected: <span className="text-gray-600">{pv.lot_number.expected || "—"}</span></p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-gray-800">{getLotValue()}</span>
                                {getConfirmedBadge(pv.lot_number)}
                              </div>
                            </div>
                            {/* Expiration Date */}
                            {hasExpirationDate && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">Expiration Date on Package</p>
                                <p className="text-[10px] text-gray-400 font-mono">Expected: <span className="text-gray-600">{fmtDate(pv.expiration_date.expected)}</span></p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm text-gray-800">{getExpValue()}</span>
                                  {getConfirmedBadge(pv.expiration_date)}
                                </div>
                              </div>
                            )}
                            {/* Allergens */}
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">Allergens on Package</p>
                              <p className="text-[10px] text-gray-400 font-mono">Expected: <span className="text-gray-600">{pv.allergens.expected.length === 0 ? "None" : pv.allergens.expected.join(", ")}</span></p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-gray-800">{getAllergenValue()}</span>
                                {getAllergenBadge()}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Dynamic EOP fields */}
                    {(s5 as EopNew).fields.filter((f) => f.value).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {(s5 as EopNew).fields.map((field) => (
                          field.value ? (
                            <KV key={field.field_id} label={field.label} value={formatEopValue(field)} />
                          ) : null
                        ))}
                      </div>
                    )}
                  </div>
                ) : isNewEop(s5) ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {(s5 as EopField[]).map((field) => (
                      field.value ? (
                        <KV key={field.field_id} label={field.label} value={formatEopValue(field)} />
                      ) : null
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {(s5 as EopOld).bowls_produced && <KV label="Bowls Produced" value={(s5 as EopOld).bowls_produced} />}
                      {(s5 as EopOld).total_boxes    && <KV label="Total Boxes"    value={(s5 as EopOld).total_boxes} />}
                      {(s5 as EopOld).extra_bags     && <KV label="Extra Bags"     value={(s5 as EopOld).extra_bags} />}
                      {(s5 as EopOld).yield_per_bowl && <KV label="Yield / Bowl"   value={(s5 as EopOld).yield_per_bowl} />}
                      {(s5 as EopOld).waste          && <KV label="Waste"          value={(s5 as EopOld).waste} />}
                      {(s5 as EopOld).bake_date      && <KV label="Bake Date"      value={fmtDate((s5 as EopOld).bake_date)} />}
                      {(s5 as EopOld).prod_hours     && <KV label="Prod Hours"     value={(s5 as EopOld).prod_hours} />}
                    </div>
                    {(s5 as EopOld).quality && (
                      <div>
                        <p className="label">Quality Check</p>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {[
                            { k: "Color",   v: (s5 as EopOld).quality!.color },
                            { k: "Shape",   v: (s5 as EopOld).quality!.shape },
                            { k: "Smell",   v: (s5 as EopOld).quality!.smell },
                            { k: "Taste",   v: (s5 as EopOld).quality!.taste },
                            { k: "Overall", v: (s5 as EopOld).quality!.overall },
                          ].map(({ k, v }) => v ? (
                            <div key={k} className="text-xs font-mono">
                              <span className="text-gray-400">{k}: </span>
                              <span className="font-semibold capitalize text-gray-700">{v}</span>
                            </div>
                          ) : null)}
                        </div>
                        {(s5 as EopOld).quality!.comments && <p className="text-sm text-gray-600 mt-2">{(s5 as EopOld).quality!.comments}</p>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Section 6 — Product Release Dashboard */}
          {s6 && (
            <div className="card overflow-hidden">
              <SectionHdr n={6} title="Product Release Dashboard" />
              <div className="p-4 space-y-3">
                {/* New auto-status items */}
                {s6.items && s6.items.length > 0 ? (
                  <>
                    <div className="space-y-1.5">
                      {s6.items.map((item) => {
                        const statusMap: Record<string, { label: string; cls: string; dot: string }> = {
                          complete:        { label: "Complete",       cls: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" },
                          pass_with_issues:{ label: "Pass w/ Issues", cls: "bg-orange-50 border-orange-200 text-orange-700",   dot: "bg-orange-400" },
                          in_progress:     { label: "In Progress",    cls: "bg-amber-50 border-amber-200 text-amber-700",      dot: "bg-amber-400"  },
                          not_started:     { label: "Not Started",    cls: "bg-gray-50 border-gray-200 text-gray-500",         dot: "bg-gray-300"   },
                          not_applicable:  { label: "N/A",            cls: "bg-gray-50 border-gray-100 text-gray-400",         dot: "bg-gray-200"   },
                        };
                        const cfg = statusMap[item.status] ?? statusMap.not_applicable;
                        return (
                          <div key={item.id} className={cn("rounded-lg border px-3 py-2 space-y-1.5", cfg.cls)}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
                                <span className="text-sm font-medium text-gray-800">{item.label}</span>
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-wider">{cfg.label}</span>
                            </div>
                            {item.subItems && item.subItems.length > 0 && (
                              <div className="ml-4 space-y-1 pt-1 border-t border-current/10">
                                {item.subItems.map((sub) => {
                                  const sCfg = statusMap[sub.status] ?? statusMap.not_applicable;
                                  return (
                                    <div key={sub.id} className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", sCfg.dot)} />
                                        <span className="text-xs text-gray-600">{sub.label}</span>
                                      </div>
                                      <span className="text-[9px] font-bold uppercase tracking-wider">{sCfg.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Release statement */}
                    {s6.release_status && (
                      <div className={cn(
                        "rounded-lg border px-3 py-2 flex items-start gap-2",
                        s6.release_status === "ready" ? "bg-emerald-50 border-emerald-200"
                          : s6.release_status === "ready_with_issues" ? "bg-orange-50 border-orange-200"
                          : "bg-amber-50 border-amber-200"
                      )}>
                        {s6.release_status === "ready"
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          : <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        }
                        <p className={cn("text-xs font-medium",
                          s6.release_status === "ready" ? "text-emerald-800"
                            : s6.release_status === "ready_with_issues" ? "text-orange-800"
                            : "text-amber-800"
                        )}>
                          {s6.release_status === "ready" ? "Product verified — ready for release."
                            : s6.release_status === "ready_with_issues" ? "Released with issues — reviewed before release."
                            : "Batch sheet was pending completion at time of submission."}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  /* Legacy checklist format */
                  <div className="space-y-1">
                    {(s6.checklist ?? []).map((item, i) => (
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
                )}

                {/* Signature */}
                {s6?.supervisor_signature && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-mono mb-2">PRODUCTION MANAGER SIGNATURE</p>
                    {s6.supervisor_signature.startsWith("data:image") ? (
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white" style={{ height: 160 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s6.supervisor_signature} alt="Production manager signature" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      </div>
                    ) : (
                      <p className="text-base italic text-gray-700">{s6.supervisor_signature}</p>
                    )}
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
            Submitted by {sub.submittedBy.name} · {new Date(sub.submittedAt).toLocaleString("en-US")}
          </div>

          {/* Admin notes — visible to admins only */}
          {role === "ADMIN" && (
            <AdminNotesSection
              submissionId={sub.id}
              initialNotes={sub.adminNotes ?? null}
              initialUpdatedByName={sub.adminNotesUpdatedByName ?? null}
              initialUpdatedAt={sub.adminNotesUpdatedAt ?? null}
              onUpdate={(notes, byName, at) => onAdminNotesUpdate?.(sub.id, notes, byName, at)}
            />
          )}
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

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

function DeleteRecordModal({
  sub,
  onCancel,
  onConfirm,
  deleting,
}: {
  sub: Submission;
  onCancel: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-start gap-3 px-6 pt-6 pb-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-[#D64D4D]" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 font-garamond text-lg">Delete Batch Sheet Record</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">This action cannot be undone.</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-4">
          <p className="text-sm text-gray-700 mb-3">You are about to permanently delete this record:</p>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-1.5 text-sm font-mono">
            <div className="flex gap-2">
              <span className="text-gray-400 w-24 shrink-0">Product</span>
              <span className="text-gray-800 font-semibold">{sub.templateName}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 w-24 shrink-0">Date</span>
              <span className="text-gray-800">{fmtDate(sub.productionDate)}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 w-24 shrink-0">Lot</span>
              <span className="text-gray-800">{sub.productionLot || "—"}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-400 w-24 shrink-0">Submitted by</span>
              <span className="text-gray-800">{sub.supervisorName}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            This will remove the record from all logs. Are you sure?
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="btn-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D64D4D] hover:bg-[#c44] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {deleting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Delete Record
              </>
            )}
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

  const [submissions, setSubmissions]   = useState<Submission[]>([]);
  const [drafts, setDrafts]             = useState<DraftSummary[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState<Submission | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [toast, setToast]               = useState<string | null>(null);

  const role = (session?.user as { role?: string })?.role ?? "";

  function loadData() {
    return Promise.all([
      fetch("/api/batch-sheet").then((r) => r.ok ? r.json() : []),
      fetch("/api/batch-sheet/draft").then((r) => r.ok ? r.json() : []),
    ]).then(([subs, draftList]) => {
      setSubmissions(subs);
      setDrafts(Array.isArray(draftList) ? draftList : []);
    }).catch((e) => console.error("Failed to load batch sheets:", e));
  }

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "SUPERVISOR" && role !== "ADMIN") { setLoading(false); return; }
    loadData().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, role]);

  async function handleDiscardDraft(id: string) {
    if (!confirm("Discard this draft? This cannot be undone.")) return;
    setDiscardingId(id);
    try {
      const r = await fetch(`/api/batch-sheet/draft/${id}`, { method: "DELETE" });
      if (r.ok) setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      console.error("Failed to discard draft:", e);
    } finally {
      setDiscardingId(null);
    }
  }

  async function handleDeleteRecord() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/batch-sheet/${deleteTarget.id}`, { method: "DELETE" });
      if (r.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        setDeleteTarget(null);
        setToast("Record deleted successfully.");
        setTimeout(() => setToast(null), 3500);
      } else {
        const err = await r.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete record.");
      }
    } catch (e) {
      console.error("Failed to delete record:", e);
      alert("An unexpected error occurred.");
    } finally {
      setDeleting(false);
    }
  }

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
      {selected && (
        <SubmissionModal
          sub={selected}
          role={role}
          onClose={() => setSelected(null)}
          onAdminNotesUpdate={(id, notes, byName, at) => {
            setSubmissions((prev) =>
              prev.map((s) =>
                s.id === id
                  ? { ...s, adminNotes: notes, adminNotesUpdatedByName: byName, adminNotesUpdatedAt: at }
                  : s
              )
            );
            setSelected((prev) =>
              prev && prev.id === id
                ? { ...prev, adminNotes: notes, adminNotesUpdatedByName: byName, adminNotesUpdatedAt: at }
                : prev
            );
          }}
        />
      )}
      {deleteTarget && (
        <DeleteRecordModal
          sub={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteRecord}
          deleting={deleting}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {toast}
        </div>
      )}

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
            <ChevronLeft className="w-4 h-4" /> Back to Form
          </button>
        </div>

        {/* ── In-Progress Drafts ─────────────────────────────────────────── */}
        {drafts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-600" />
              <h2 className="text-sm font-semibold text-gray-700">In Progress</h2>
              <span className="badge bg-yellow-100 text-yellow-700">{drafts.length}</span>
            </div>
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-yellow-50 border-b border-yellow-100">
                    {["Date", "Product", "Supervisor", "Last Saved", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-yellow-700 font-mono uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {drafts.map((draft) => {
                    const lastSaved = draft.lastSavedAt
                      ? new Date(draft.lastSavedAt).toLocaleString("en-US", {
                          month: "2-digit", day: "2-digit", year: "numeric",
                          hour: "numeric", minute: "2-digit", hour12: true,
                        })
                      : "—";
                    return (
                      <tr key={draft.id} className="hover:bg-yellow-50/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-gray-700 whitespace-nowrap">
                          {fmtDate(draft.productionDate)}
                        </td>
                        <td className="px-5 py-3 text-gray-800 font-medium whitespace-nowrap">{draft.templateName}</td>
                        <td className="px-5 py-3 text-gray-700">{draft.supervisorName}</td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">{lastSaved}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status="DRAFT" />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => router.push(`/dashboard/supervisor/batch-sheet?resume=${draft.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono border border-yellow-300 rounded hover:bg-yellow-50 text-yellow-700 transition-colors"
                            >
                              Continue
                            </button>
                            <button
                              onClick={() => handleDiscardDraft(draft.id)}
                              disabled={discardingId === draft.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono border border-gray-200 rounded hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-gray-500 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Discard
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Completed Records ──────────────────────────────────────────── */}
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
                  {["Date", "Product", "Lot", "Supervisor", "Bowls", "Allergen", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((sub) => {
                  const allergen = sub.section2_allergen;
                  return (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-gray-700 whitespace-nowrap">
                        {fmtDate(sub.productionDate)}
                      </td>
                      <td className="px-5 py-3 text-gray-800 font-medium whitespace-nowrap">{sub.templateName}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{sub.productionLot || "—"}</td>
                      <td className="px-5 py-3 text-gray-700">{sub.supervisorName}</td>
                      <td className="px-5 py-3 text-gray-600 font-mono">
                        {sub.section3?.bowls_produced ?? sub.section3?.bowls_planned ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        {!allergen ? (
                          <span className="text-gray-300 text-xs font-mono">—</span>
                        ) : allergen.final_result === "not_required" ? (
                          <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">Not Required</span>
                        ) : allergen.final_result === "pass" ? (
                          <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">Cleared</span>
                        ) : (
                          <span className="badge bg-red-100 text-red-700 text-[10px]">Incomplete</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {role === "ADMIN" && sub.adminNotes && (
                            <span title="Admin note attached" className="text-gray-400 cursor-default">
                              <Lock className="w-3 h-3" />
                            </span>
                          )}
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
                          {role === "ADMIN" && (
                            <button
                              onClick={() => setDeleteTarget(sub)}
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
    </>
  );
}
