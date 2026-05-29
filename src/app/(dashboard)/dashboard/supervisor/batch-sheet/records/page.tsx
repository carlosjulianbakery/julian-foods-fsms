"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FolderOpen, ChevronLeft, Download, Eye, X,
  CheckCircle2, XCircle, AlertCircle, Clock, Trash2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate as fmtDateUtil } from "@/lib/dateUtils";

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
interface IngRow    { id: string; name: string; quantity_per_bowl: number; unit: string; supplier: string; lot_number: string }

interface PkgRow {
  id: string; name: string;
  qty_per_bowl?: number; qty_used?: number; food_contact?: boolean;
  units_per_n_flatbreads?: number; quantity_needed?: number;
  supplier?: string; lot_number?: string;
}
interface PresentationMaterial {
  id: string; name: string; qty_per_bowl: number; food_contact: boolean;
  qty_used?: number; supplier?: string; lot_number?: string;
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
  previous_product_name: string | null;
  previous_product_allergens: string[] | null;
  swab_attempts: SwabAttemptRecord[] | null;
  final_result: "pass" | "not_required" | null;
}

interface Section1    { ovens_used: string[]; calibration: CalibRow[]; initials: string }
interface Section3Rec {              // batch recipe (was section2)
  bowls_planned?: number;
  bowls_produced?: number;
  ingredients: IngRow[];
  packaging?: PkgRow[];
  presentations?: PresentationData[];
}
type Section4Rec = BowlEntry[] | CcpSession[] | CcpGroupEntry[];  // CCP (was section3)
type Section5Rec = EopField[] | EopOld;          // EOP (was section4)
interface Section6Rec {               // release checklist (was section5)
  checklist: ChecklistItem[];
  supervisor_signature: string;
  all_passed: boolean;
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

  const statusLabel = { DRAFT: "DRAFT", PASS: "PASS", FAIL: "FAIL", PASS_WITH_ISSUES: "PASS WITH ISSUES", COMPLETE: "COMPLETE", IN_PROGRESS: "IN PROGRESS" }[sub.status] ?? sub.status;
  const statusColor = { DRAFT: "#B45309", PASS: "#059669", FAIL: "#D64D4D", PASS_WITH_ISSUES: "#D97706", COMPLETE: "#2563EB", IN_PROGRESS: "#6B7280" }[sub.status] ?? "#6B7280";

  const bowlsCount = s3?.bowls_produced ?? s3?.bowls_planned ?? "—";

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
      s2aHtml = `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 2 — Allergen Changeover</h3>
<div style="font-family:monospace;font-size:11px;margin-bottom:8px">
  <span style="color:#9CA3AF">Previous Product: </span><strong>${s2a.previous_product_name ?? "—"}</strong>
  &nbsp;&nbsp;
  <span style="color:#9CA3AF">Allergens: </span><strong>${(s2a.previous_product_allergens ?? []).join(", ") || "—"}</strong>
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
  const ingRows = (s3?.ingredients ?? []).map((ing) => `
    <tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:4px 8px;font-size:11px">${ing.name}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center">${ing.quantity_per_bowl} ${ing.unit}</td>
      <td style="padding:4px 8px;font-size:11px;text-align:center;font-weight:600;color:#D64D4D">
        ${(s3?.bowls_produced ?? s3?.bowls_planned) ? (ing.quantity_per_bowl * ((s3?.bowls_produced ?? s3?.bowls_planned) as number)).toFixed(3) : "—"} ${ing.unit}
      </td>
      <td style="padding:4px 8px;font-size:11px">${ing.supplier || "—"}</td>
      <td style="padding:4px 8px;font-size:11px;font-family:monospace">${ing.lot_number || "—"}</td>
    </tr>`).join("");

  let pkgHtml = "";
  if (s3?.presentations && s3.presentations.length > 0) {
    s3.presentations.filter((p) => p.selected).forEach((pres) => {
      pkgHtml += `<tr><td colspan="5" style="padding:4px 8px;font-size:10px;font-weight:bold;color:#D64D4D;background:#FEF2F2">${pres.presentation_name}</td></tr>`;
      pres.materials.forEach((mat) => {
        const isFC = mat.food_contact;
        pkgHtml += `
          <tr style="border-bottom:1px solid #F3F4F6;background:${isFC ? "#F0FDF4" : "transparent"}">
            <td style="padding:4px 8px;font-size:11px;padding-left:20px">${mat.name}</td>
            <td style="padding:4px 8px;font-size:11px;text-align:center">${mat.qty_used ?? "—"}</td>
            <td style="padding:4px 8px;font-size:11px;text-align:center">
              <span style="padding:1px 6px;border-radius:9999px;font-size:10px;background:${isFC ? "#DCFCE7" : "#F3F4F6"};color:${isFC ? "#166534" : "#6B7280"}">${isFC ? "Food Contact" : "Non-Food"}</span>
            </td>
            <td style="padding:4px 8px;font-size:11px">${isFC ? (mat.supplier || "—") : "—"}</td>
            <td style="padding:4px 8px;font-size:11px;font-family:monospace">${isFC ? (mat.lot_number || "—") : "—"}</td>
          </tr>`;
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
          <td style="padding:4px 8px;font-size:11px">${isFC ? (pkg.supplier || "—") : "—"}</td>
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
  <div><span style="color:#9CA3AF">BOWLS</span><br/><strong>${bowlsCount}</strong></div>
</div>

${s2aHtml}

${(s3?.ingredients.length ?? 0) > 0 ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 3 — Ingredients</h3>
<table style="margin-bottom:16px">
  <thead><tr><th>Ingredient</th><th>Per Bowl</th><th>Total</th><th>Supplier</th><th>Lot #</th></tr></thead>
  <tbody>${ingRows}</tbody>
</table>` : ""}

${pkgHtml ? `
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 3 — Packaging Materials</h3>
<table style="margin-bottom:16px">
  <thead><tr><th>Material</th><th>Qty Used</th><th>Food Contact</th><th>Supplier</th><th>Lot #</th></tr></thead>
  <tbody>${pkgHtml}</tbody>
</table>` : ""}

${s4Html}

${s5 ? (() => {
  if (isNewEop(s5)) {
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
<h3 style="font-size:12px;font-weight:bold;margin:14px 0 4px">Section 6 — Release Checklist</h3>
<div style="margin-bottom:12px">
  ${s6.checklist.map((c) => `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid #F3F4F6">
    <span style="color:${c.checked ? "#059669" : "#D64D4D"}">${c.checked ? "☑" : "☐"}</span>
    <span style="margin-left:6px">${c.label}</span>
    ${c.initials ? `<span style="margin-left:8px;color:#9CA3AF;font-family:monospace">${c.initials}</span>` : ""}
  </div>`).join("")}
</div>
${s6?.supervisor_signature ? `
<div style="margin-top:16px;padding-top:10px;border-top:1px solid #E5E7EB">
  <div style="font-size:10px;color:#9CA3AF;font-family:monospace">SUPERVISOR SIGNATURE</div>
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

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <KV label="Previous Product" value={data.previous_product_name} />
        <KV label="Allergens Present" value={(data.previous_product_allergens ?? []).join(", ") || "—"} />
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

// ─── Detail modal ─────────────────────────────────────────────────────────────

function SubmissionModal({ sub, onClose }: { sub: Submission; onClose: () => void }) {
  const s1  = sub.section1;
  const s2a = sub.section2_allergen;
  const s3  = sub.section3;
  const s4raw = sub.section4 ?? [];
  const s5  = sub.section5;
  const s6  = sub.section6;

  const bowlsCount = s3?.bowls_produced ?? s3?.bowls_planned;

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
                <KV label="Bowls" value={bowlsCount} />
                <div className="overflow-x-auto">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-mono mb-1">Ingredients</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {["Ingredient", "Qty/Bowl", "Total", "Supplier", "Lot #"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {s3.ingredients.map((ing) => (
                        <tr key={ing.id}>
                          <td className="px-3 py-2 font-medium text-gray-800">{ing.name}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-xs">{ing.quantity_per_bowl} {ing.unit}</td>
                          <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">
                            <span className="bg-[#FAE8E8] text-[#C04040] font-mono text-xs px-1.5 py-0.5 rounded">
                              {bowlsCount ? (ing.quantity_per_bowl * (bowlsCount as number)).toFixed(3) : "—"} {ing.unit}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 text-xs">{ing.supplier || "—"}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono text-xs">{ing.lot_number || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* New presentation format */}
                {s3.presentations && s3.presentations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-mono mb-2">Packaging Materials</p>
                    <div className="space-y-3">
                      {s3.presentations.filter((p) => p.selected).map((pres) => (
                        <div key={pres.presentation_id} className="border border-emerald-100 rounded-lg overflow-hidden">
                          <div className="bg-emerald-50/50 px-3 py-2 flex items-center gap-2 border-b border-emerald-100">
                            <span className="text-xs font-semibold text-gray-700">{pres.presentation_name}</span>
                            <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">Selected</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                  {["Material", "Qty Used", "Food Contact", "Supplier", "Lot #"].map((h) => (
                                    <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {pres.materials.map((mat) => {
                                  const isFC = mat.food_contact;
                                  return (
                                    <tr key={mat.id} className={isFC ? "bg-emerald-50/20" : ""}>
                                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{mat.name}</td>
                                      <td className="px-3 py-2 font-mono text-gray-700">{mat.qty_used ?? "—"}</td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        {isFC
                                          ? <span className="badge bg-emerald-100 text-emerald-700 text-xs">Food Contact</span>
                                          : <span className="badge bg-gray-100 text-gray-500 text-xs">Non-Food Contact</span>
                                        }
                                      </td>
                                      <td className="px-3 py-2 text-gray-600 text-xs">{isFC ? (mat.supplier || "—") : "—"}</td>
                                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">{isFC ? (mat.lot_number || "—") : "—"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
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
                              <td className="px-3 py-2 text-gray-600 text-xs">{isFC ? (pkg.supplier || "—") : "—"}</td>
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
                {isNewEop(s5) ? (
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

          {/* Section 6 — Release Checklist */}
          {s6 && (
            <div className="card overflow-hidden">
              <SectionHdr n={6} title="Product Release Checklist" />
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  {s6.checklist.map((item, i) => (
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
                {s6?.supervisor_signature && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-mono mb-2">SUPERVISOR SIGNATURE</p>
                    {s6.supervisor_signature.startsWith("data:image") ? (
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white" style={{ height: 160 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s6.supervisor_signature} alt="Supervisor signature" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
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
      {selected && <SubmissionModal sub={selected} onClose={() => setSelected(null)} />}
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
            <ChevronLeft className="w-4 h-4" /> New Batch Sheet
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
                    {["Date Started", "Product", "Supervisor", "Last Saved", "Status", ""].map((h) => (
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
