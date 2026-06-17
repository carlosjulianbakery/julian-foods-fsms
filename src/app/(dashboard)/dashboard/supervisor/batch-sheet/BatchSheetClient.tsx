"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Info, Lock, Pencil, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { DateInput } from "@/components/DateInput";
import { cn } from "@/lib/utils";
import { toUpperCaseInput } from "@/lib/formatters";

const SignaturePad = dynamic(() => import("@/components/SignaturePad"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type CcpCheck = {
  id: string; type: string;
  label?: string;        // legacy field — kept for backward compat
  custom_name?: string;  // v2 field for custom type
  num_readings: number;
  num_sessions: number;
  min_value: number | null; max_value: number | null; unit: string | null;
};

function checkDisplayName(check: CcpCheck): string {
  if (check.type === "custom") return check.custom_name || check.label || "Custom Check";
  const map: Record<string, string> = {
    temperature: "Internal Temperature",
    weight:      "Weight Check",
    visual:      "Visual Inspection",
  };
  return map[check.type] ?? check.label ?? check.type;
}

type IngTpl = { id: string; materialId?: string; name: string; quantity_per_bowl: number; unit: string; materialType?: string; sourceProductId?: string | null };

/** Normalize legacy unit aliases (e.g. "lb" → "lbs") so display is consistent. */
function normalizeUnit(u: string): string {
  const aliases: Record<string, string> = {
    lb: "lbs",
    gram: "g", grams: "g",
    kilogram: "kg", kilograms: "kg",
    ounce: "oz", ounces: "oz",
    litre: "L", liter: "L", litres: "L", liters: "L",
  };
  return aliases[(u ?? "").toLowerCase().trim()] ?? u;
}

type PresentationMaterial = { id: string; name: string; qty_per_bowl?: number; food_contact: boolean };
type Presentation = {
  presentation_id: string;
  presentation_name: string;
  materials: PresentationMaterial[];
  // Legacy per-presentation unit config — only used as a fallback when no Product is linked.
  // When a Product is linked, unit config is sourced from ProductPresentationForSubmission instead.
  primary_unit_name?: string | null;
  has_internal_units?: boolean;
  internal_unit_name?: string | null;
  internal_units_per_primary?: number | null;
};

/** Unit config + packaging materials sourced from the linked Product's presentations (single source of truth). */
type ProductPresentationForSubmission = {
  id: string; name: string; upc: string;
  primary_unit_name: string | null;
  has_internal_units: boolean;
  internal_unit_name: string | null;
  internal_units_per_primary: number | null;
  packaging_materials: Array<{ id: string; material_id: string; material_name: string; food_contact: boolean }>;
};

type UnitConfig = {
  primary_unit_name: string | null;
  has_internal_units: boolean;
  internal_unit_name: string | null;
  internal_units_per_primary: number | null;
};

/**
 * Resolve the effective unit config for a presentation. When a Product is linked, its
 * presentations (matched by id) are the single source of truth; otherwise fall back to
 * legacy unit config baked into the template's presentations.
 */
function effectiveUnitConfig(
  pres: { presentation_id: string; primary_unit_name?: string | null; has_internal_units?: boolean; internal_unit_name?: string | null; internal_units_per_primary?: number | null },
  productPresentations: ProductPresentationForSubmission[] | null,
): UnitConfig {
  if (productPresentations && productPresentations.length > 0) {
    const pp = productPresentations.find((p) => p.id === pres.presentation_id);
    return {
      primary_unit_name:          pp?.primary_unit_name ?? null,
      has_internal_units:         pp?.has_internal_units ?? false,
      internal_unit_name:         pp?.internal_unit_name ?? null,
      internal_units_per_primary: pp?.internal_units_per_primary ?? null,
    };
  }
  return {
    primary_unit_name:          pres.primary_unit_name ?? null,
    has_internal_units:         pres.has_internal_units ?? false,
    internal_unit_name:         pres.internal_unit_name ?? null,
    internal_units_per_primary: pres.internal_units_per_primary ?? null,
  };
}

type EopField = {
  id: string;
  label: string;
  field_type: "text" | "number" | "yes_no" | "checkbox" | "date" | "textarea";
  required: boolean;
  order: number;
};

export type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  productCode: string | null;
  updatedAt: string;   // ISO string — shows when admin last saved changes
  ingredients: IngTpl[];
  presentations: Presentation[];  // unit config is embedded per-presentation
  ovensAvailable: string[];
  calibrationWeights: { label: string }[];
  ccpChecks: CcpCheck[];
  ccpNumSessions?: number;  // legacy — optional for backward compat
  ccpRequireTimestamp: boolean;
  endOfProductionFields: EopField[];
  // Allergen declaration
  declaredAllergens: string[];
  // Whether the product has a set expiration date
  hasExpirationDate: boolean;
  // Linked Product (master recipe)
  productId?: string | null;
  // Base production unit — replaces the hardcoded "Bowl" label throughout the batch sheet
  baseUnitName: string;
  baseUnitIsFinished: boolean;
};

type CalibRow = {
  label: string; reading: string; pass: boolean | null;
  deviation: number | null; corrective_action: string;
};

type InventoryLotSelection = {
  lotId: string;           // inventory lot id; "" = free text mode; "__other__" = other lot (when dropdown shown)
  lotNumber: string;
  qtyUsed: string;
  maxAvailable: number;
  unit: string;
  expirationDate: string | null;
  supplierName: string;
  supplierId: string | null;
  supplierSource: "inventory" | "linked" | "other" | "free_text";
  supplierApprovalStatus: string | null;
  supplierIsOther: boolean;
};

type AvailableLot = {
  id: string; lotNumber: string; quantityRemaining: number; unit: string;
  expirationDate: string | null; status: string;
  supplierName: string; supplierId: string | null;
};

type IngRow = IngTpl & {
  supplier: string;
  supplier_id: string | null;
  supplier_is_other: boolean;
  supplier_approval_status: string | null;
  lot_number: string;
  // Multi-lot inventory tracking
  use_inventory: boolean;
  inventory_lots: InventoryLotSelection[];
  // Override tracking
  override_type: "none" | "qty_per_bowl" | "total_qty";
  qty_per_bowl_override: string;   // editable when override_type === "qty_per_bowl"
  total_qty_override: string;       // editable when override_type === "total_qty"
  override_reason: string;
  override_reason_other: string;
  // WIP tracking
  is_wip: boolean;
  wip_lot_verified: boolean | null;
  wip_source_submission_id: string | null;
  wip_production_date: string | null;
  wip_bowls_produced: number | null;
  wip_validation_state: "idle" | "checking" | "found" | "not_found";
};

const OVERRIDE_REASONS = [
  "Recipe adjustment for ingredient consistency",
  "Ingredient shortage — substituted quantity",
  "Supervisor discretion",
  "Other (explain below)",
] as const;

type MaterialState = {
  id: string; name: string; qty_per_bowl?: number; food_contact: boolean;
  qty_used: string; supplier: string; lot_number: string;
  supplier_id: string | null;
  supplier_is_other: boolean;
  supplier_approval_status: string | null;
  supplier_source: "linked" | "other" | "free_text";
};
type PresentationState = {
  presentation_id: string; presentation_name: string; selected: boolean; materials: MaterialState[];
};

type CcpCheckResult = {
  check_id: string; label: string; type: string;
  readings: string[];
  pass: boolean | null;
  corrective_action: string;
  visual_result: "pass" | "issue" | null;
  visual_notes: string;
};
type CcpSession = { session_number: number; initials: string; check_time: string; checks: CcpCheckResult[] };

// v2 — per-check-type independent sessions
type CcpGroupSession = {
  session_number: number;
  initials: string;
  check_time: string;
  readings: string[];
  pass: boolean | null;
  corrective_action: string;
  visual_result: "pass" | "issue" | null;
  visual_notes: string;
};
type CcpGroupEntry = {
  check_id: string;
  check_name: string;
  check_type: string;
  unit: string | null;
  num_sessions: number;
  sessions: CcpGroupSession[];
};

// ─── Allergen types ───────────────────────────────────────────────────────────

const ALLERGEN_LIST = [
  "Egg",
  "Peanut",
  "Milk (Whey, Cheese)",
  "Sesame",
  "Tree Nut (Coconut, Almond)",
] as const;

const ALLERGEN_OPTIONS_PKG = [...ALLERGEN_LIST, "None"] as const;

type SwabAttempt = {
  equipment_swabbed: string;
  time_recorded: string;
  result: "pass" | "fail" | null;
  initials: string;
  locked: boolean;
};

type AllergenState = {
  changeover_required: boolean | null;
  previous_product_name: string;
  previous_product_allergens: string[];
  swab_attempts: SwabAttempt[];
  instructions_open: boolean;
};

interface DraftRecord {
  id: string;
  templateId: string;
  templateName: string;
  productionDate: string | null;
  productionLot: string | null;
  expirationDate: string | null;
  shift: string;
  supervisorName: string;
  numEmployees: number | null;
  section1: unknown;
  section2_allergen: unknown;
  section3: unknown;
  section4: unknown;
  section5: unknown;
  section6: unknown;
  notes: string | null;
  lastSavedAt: string;
  lastActiveSection: number | null;
}

function initAllergen(): AllergenState {
  return {
    changeover_required: null,
    previous_product_name: "",
    previous_product_allergens: [],
    swab_attempts: [{ equipment_swabbed: "", time_recorded: "", result: null, initials: "", locked: false }],
    instructions_open: false,
  };
}

function allergenComplete(a: AllergenState): boolean {
  if (a.changeover_required === null) return false;
  if (!a.changeover_required) return true;
  return a.swab_attempts.some((att) => att.result === "pass" && att.locked);
}

function captureTimestamp(): string {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ─── Form state ───────────────────────────────────────────────────────────────

type PresentationUnitState = {
  wasProduced: boolean;
  totalProduced: string;
  extraInternal: string;
};

type FormState = {
  productionDate: string; productionLot: string; productionNumber: string; expirationDate: string;
  shift: "AM" | "PM"; supervisorName: string; numEmployees: string;
  ovensUsed: string[];
  calibration: CalibRow[];
  s1Initials: string;
  bowlsProduced: string;
  ingredients: IngRow[];
  presentations: PresentationState[];
  ccpGroups: CcpGroupEntry[];
  eopValues: Record<string, string>;
  // Per-presentation unit production tracking (keyed by presentation_id)
  presentationUnits: Record<string, PresentationUnitState>;
  // Packaging verification — confirm/flag approach
  pkgLabelChoice: "confirmed" | "discrepancy" | null;
  pkgLabelDiscrepancy: string;
  pkgAllergenConfirmed: boolean;
  pkgAllergenEdited: string[];
  pkgLotState: "confirmed" | "discrepancy" | null;
  pkgLotDiscrepancy: string;
  pkgExpState: "confirmed" | "discrepancy" | null;
  pkgExpDiscrepancy: string;
  notes: string;
};

// ─── 12-hour time formatter ───────────────────────────────────────────────────

function fmt12h(time24: string): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ─── CCP pass/fail helper ─────────────────────────────────────────────────────

function computeCheckPass(
  check: CcpCheck,
  readings: string[],
  visualResult: "pass" | "issue" | null
): boolean | null {
  if (check.type === "visual") {
    return visualResult === "pass" ? true : visualResult === "issue" ? false : null;
  }
  if (check.type === "custom") return null;
  const vals = readings.map((r) => parseFloat(r)).filter((v) => !isNaN(v));
  if (vals.length < check.num_readings) return null;
  if (check.type === "temperature") {
    return vals.every((v) => check.min_value !== null && v >= check.min_value);
  }
  if (check.type === "weight") {
    return vals.every(
      (v) =>
        (check.min_value === null || v >= check.min_value) &&
        (check.max_value === null || v <= check.max_value)
    );
  }
  return null;
}

function emptyLotEntry(unit: string): InventoryLotSelection {
  return {
    lotId: "", lotNumber: "", qtyUsed: "", maxAvailable: 0, unit,
    expirationDate: null, supplierName: "", supplierId: null,
    supplierSource: "free_text", supplierApprovalStatus: null, supplierIsOther: false,
  };
}

// ─── initForm ────────────────────────────────────────────────────────────────

function initForm(t: Template, supervisorName: string, productPresentations: ProductPresentationForSubmission[] | null = null): FormState {
  const today = new Date().toISOString().split("T")[0];
  return {
    productionDate: today, productionLot: "", productionNumber: "", expirationDate: "",
    shift: "AM", supervisorName, numEmployees: "",
    ovensUsed: [],
    calibration: t.calibrationWeights.map((w) => ({
      label: w.label, reading: "", pass: null, deviation: null, corrective_action: "",
    })),
    s1Initials: "",
    bowlsProduced: "",
    ingredients: t.ingredients.map((i) => ({
      ...i,
      unit: normalizeUnit(i.unit),
      supplier: "",
      supplier_id: null,
      supplier_is_other: false,
      supplier_approval_status: null,
      lot_number: "",
      use_inventory: i.materialType !== "wip",
      inventory_lots: i.materialType !== "wip" ? [emptyLotEntry(normalizeUnit(i.unit))] : [],
      override_type: "none" as const,
      qty_per_bowl_override: "",
      total_qty_override: "",
      override_reason: "",
      override_reason_other: "",
      is_wip: i.materialType === "wip",
      wip_lot_verified: null,
      wip_source_submission_id: null,
      wip_production_date: null,
      wip_bowls_produced: null,
      wip_validation_state: "idle" as const,
    })),
    presentations: t.presentations.map((pres) => ({
      presentation_id:   pres.presentation_id,
      presentation_name: pres.presentation_name,
      selected:          t.presentations.length === 1,
      materials: pres.materials.map((m) => ({
        ...m,
        qty_used:   "",
        supplier:   "",
        lot_number: "",
        supplier_id: null,
        supplier_is_other: false,
        supplier_approval_status: null,
        supplier_source: "free_text" as const,
      })),
    })),
    ccpGroups: t.ccpChecks.map((check) => {
      const ns = check.num_sessions ?? t.ccpNumSessions ?? 1;
      return {
        check_id:   check.id,
        check_name: checkDisplayName(check),
        check_type: check.type,
        unit:       check.unit ?? null,
        num_sessions: ns,
        sessions: Array.from({ length: ns }, (_, i) => ({
          session_number:    i + 1,
          initials:          "",
          check_time:        "",
          readings:          Array(check.num_readings).fill("") as string[],
          pass:              null,
          corrective_action: "",
          visual_result:     null,
          visual_notes:      "",
        })),
      };
    }),
    eopValues: {},
    presentationUnits: (() => {
      const withUnits = t.presentations.filter((p) => effectiveUnitConfig(p, productPresentations).primary_unit_name);
      const defaultProduced = withUnits.length === 1;
      // Track ALL presentations so Section 5 can show product presentations without unit config
      return Object.fromEntries(
        t.presentations.map((p) => [
          p.presentation_id,
          { wasProduced: defaultProduced && !!effectiveUnitConfig(p, productPresentations).primary_unit_name, totalProduced: "", extraInternal: "" },
        ])
      );
    })(),
    pkgLabelChoice: null,
    pkgLabelDiscrepancy: "",
    pkgAllergenConfirmed: false,
    pkgAllergenEdited: t.declaredAllergens.length > 0 ? [...t.declaredAllergens] : [],
    pkgLotState: null,
    pkgLotDiscrepancy: "",
    pkgExpState: null,
    pkgExpDiscrepancy: "",
    notes: "",
  };
}

// ─── initFormFromDraft ────────────────────────────────────────────────────────

function initFormFromDraft(draft: DraftRecord, template: Template, productPresentations: ProductPresentationForSubmission[] | null = null): { form: FormState; allergen: AllergenState } {
  const s1  = draft.section1 as { ovens_used?: string[]; calibration?: { label: string; reading: string; pass: boolean | null; corrective_action?: string }[]; initials?: string } | null;
  const s2a = draft.section2_allergen as { changeover_required?: boolean | null; previous_product_name?: string; previous_product_allergens?: string[]; swab_attempts?: Array<{ equipment_swabbed: string; time_recorded: string; result: "pass" | "fail" | null; initials: string }> } | null;
  const s3  = draft.section3 as { bowls_produced?: number; ingredients?: Array<{ id: string; name: string; quantity_per_bowl: number; unit: string; supplier?: string; lot_number?: string; supplier_id?: string | null; supplier_source?: "linked" | "other" | "free_text"; supplier_approval_status?: string | null; override_type?: "none" | "qty_per_bowl" | "total_qty"; qty_per_bowl_override?: string; total_qty_override?: string; override_reason?: string; override_reason_other?: string; use_inventory?: boolean; inventory_lots?: InventoryLotSelection[] }>; presentations?: Array<{ presentation_id: string; presentation_name: string; selected: boolean; materials?: Array<{ id: string; qty_used?: number; supplier?: string; lot_number?: string; supplier_id?: string | null; supplier_source?: "linked" | "other" | "free_text"; supplier_approval_status?: string | null }> }> } | null;
  const s4  = draft.section4 as CcpGroupEntry[] | CcpSession[] | null;
  const s5  = draft.section5 as Array<{ field_id: string; value: string }> | null;

  const savedCalib = s1?.calibration ?? [];
  const calibration: CalibRow[] = template.calibrationWeights.map((w) => {
    const saved = savedCalib.find((c) => c.label === w.label);
    if (!saved?.reading) return { label: w.label, reading: "", pass: null, deviation: null, corrective_action: "" };
    const target = parseFloat(w.label.replace(/[^0-9.]/g, ""));
    const val = parseFloat(saved.reading);
    let pass: boolean | null = null;
    let deviation: number | null = null;
    if (!isNaN(target) && target > 0 && !isNaN(val)) {
      deviation = Math.abs(val - target) / target * 100;
      pass = deviation <= 2;
    }
    return { label: w.label, reading: saved.reading, pass, deviation, corrective_action: saved.corrective_action ?? "" };
  });

  const eopValues: Record<string, string> = {};
  // s5 can be the new object format or the old EopField[]
  const s5IsNewFormat = s5 && !Array.isArray(s5) && "fields" in (s5 as object);
  const s5Fields = s5IsNewFormat
    ? ((s5 as { fields?: Array<{ field_id: string; value: string }> }).fields ?? [])
    : (Array.isArray(s5) ? s5 as Array<{ field_id: string; value: string }> : []);
  for (const f of s5Fields) eopValues[f.field_id] = f.value ?? "";

  const s5Obj = s5IsNewFormat ? (s5 as {
    total_units_produced?: number | null;
    extra_internal_units?: number | null;
    presentation_units?: Array<{
      presentation_id: string;
      was_produced: boolean;
      total_produced?: number | null;
      extra_internal?: number | null;
      finished_unit_count?: number | null;
    }>;
    packaging_verification?: {
      // new format
      product_label?: { confirmed?: boolean; discrepancy_value?: string | null };
      allergens?: { confirmed?: boolean; entered?: string[] };
      lot_number?: { confirmed?: boolean; discrepancy_value?: string | null };
      expiration_date?: { confirmed?: boolean; discrepancy_value?: string | null };
    };
  }) : null;

  const savedPresentationUnits = s5Obj?.presentation_units ?? null;
  // Backward compat: if old single-block format, restore into first presentation
  const oldTotalUnits = s5Obj?.total_units_produced != null ? String(s5Obj.total_units_produced) : "";
  const oldExtraUnits = s5Obj?.extra_internal_units  != null ? String(s5Obj.extra_internal_units)  : "";

  const savedPkgV = s5Obj?.packaging_verification;
  const savedPkgLabelChoice    = savedPkgV?.product_label?.confirmed != null
    ? (savedPkgV.product_label!.confirmed ? "confirmed" : "discrepancy")
    : null as "confirmed" | "discrepancy" | null;
  const savedPkgLabelDiscrep   = savedPkgV?.product_label?.discrepancy_value ?? "";
  const savedPkgAllergenConf   = savedPkgV?.allergens?.confirmed ?? false;
  const savedPkgAllergenEdited = savedPkgV?.allergens?.entered ?? (template.declaredAllergens.length > 0 ? [...template.declaredAllergens] : []);
  const savedPkgLotState       = savedPkgV?.lot_number?.confirmed != null
    ? (savedPkgV.lot_number!.confirmed ? "confirmed" : "discrepancy")
    : null as "confirmed" | "discrepancy" | null;
  const savedPkgLotDiscrep     = savedPkgV?.lot_number?.discrepancy_value ?? "";
  const savedPkgExpState       = savedPkgV?.expiration_date?.confirmed != null
    ? (savedPkgV.expiration_date!.confirmed ? "confirmed" : "discrepancy")
    : null as "confirmed" | "discrepancy" | null;
  const savedPkgExpDiscrep     = savedPkgV?.expiration_date?.discrepancy_value ?? "";

  const savedPresentations = s3?.presentations ?? [];
  const presentations: PresentationState[] = template.presentations.map((pres) => {
    const saved = savedPresentations.find((p) => p.presentation_id === pres.presentation_id);
    return {
      presentation_id:   pres.presentation_id,
      presentation_name: pres.presentation_name,
      selected:          saved ? saved.selected : template.presentations.length === 1,
      materials: pres.materials.map((m) => {
        const sm = saved?.materials?.find((x) => x.id === m.id);
        return {
          ...m,
          qty_used:   sm?.qty_used != null ? String(sm.qty_used) : "",
          supplier:   sm?.supplier   ?? "",
          lot_number: sm?.lot_number ?? "",
          supplier_id:             sm?.supplier_id             ?? null,
          supplier_is_other:       sm?.supplier_source         === "other",
          supplier_approval_status: sm?.supplier_approval_status ?? null,
          supplier_source:         (sm?.supplier_source         ?? "free_text") as "linked" | "other" | "free_text",
        };
      }),
    };
  });

  const savedIngredients = s3?.ingredients ?? [];
  const ingredients: IngRow[] = template.ingredients.map((ing) => {
    const saved = savedIngredients.find((i) => i.id === ing.id) ?? savedIngredients.find((i) => i.name === ing.name);
    const savedWip = saved as { is_wip?: boolean; wip_lot_verified?: boolean | null; wip_source_submission_id?: string | null } | undefined;
    return {
      ...ing,
      unit: normalizeUnit(ing.unit),
      supplier:                saved?.supplier                ?? "",
      supplier_id:             saved?.supplier_id             ?? null,
      supplier_is_other:       saved?.supplier_source         === "other",
      supplier_approval_status: saved?.supplier_approval_status ?? null,
      lot_number:              saved?.lot_number              ?? "",
      use_inventory:           ing.materialType !== "wip",
      inventory_lots:          (() => {
        if (ing.materialType === "wip") return [];
        const savedLots = saved?.inventory_lots;
        if (savedLots?.length) {
          return savedLots.map((l: InventoryLotSelection) => ({ ...emptyLotEntry(normalizeUnit(ing.unit)), ...l }));
        }
        if (saved?.lot_number) {
          const src = saved.supplier_source ?? "free_text";
          return [{
            ...emptyLotEntry(normalizeUnit(ing.unit)),
            lotNumber: saved.lot_number,
            supplierName: saved.supplier ?? "",
            supplierId: saved.supplier_id ?? null,
            supplierSource: (src === "linked" ? "linked" : src === "other" ? "other" : "free_text") as InventoryLotSelection["supplierSource"],
            supplierApprovalStatus: saved.supplier_approval_status ?? null,
            supplierIsOther: src === "other",
          }];
        }
        return [emptyLotEntry(normalizeUnit(ing.unit))];
      })(),
      override_type:           saved?.override_type           ?? "none",
      qty_per_bowl_override:   saved?.qty_per_bowl_override   ?? "",
      total_qty_override:      saved?.total_qty_override      ?? "",
      override_reason:         saved?.override_reason         ?? "",
      override_reason_other:   saved?.override_reason_other   ?? "",
      is_wip:                  savedWip?.is_wip               ?? (ing.materialType === "wip"),
      wip_lot_verified:        savedWip?.wip_lot_verified      ?? null,
      wip_source_submission_id: savedWip?.wip_source_submission_id ?? null,
      wip_production_date:     null,
      wip_bowls_produced:      null,
      wip_validation_state:    "idle" as const,
    };
  });

  // Detect v2 format: array with check_id + sessions fields
  const isV2 = Array.isArray(s4) && s4.length > 0 && "sessions" in (s4[0] as object) && "check_id" in (s4[0] as object);
  const savedGroups: CcpGroupEntry[] = isV2 ? (s4 as CcpGroupEntry[]) : [];

  // Always rebuild ccpGroups from the LATEST template so any admin changes
  // (thresholds, added/removed checks, num_sessions, unit) are reflected.
  // Preserve previously recorded session data where the check still exists.
  const ccpGroups: CcpGroupEntry[] = template.ccpChecks.map((check) => {
    const ns = check.num_sessions ?? template.ccpNumSessions ?? 1;
    const savedGroup = savedGroups.find((g) => g.check_id === check.id);
    return {
      check_id:     check.id,
      check_name:   checkDisplayName(check),
      check_type:   check.type,
      unit:         check.unit ?? null,
      num_sessions: ns,
      sessions: Array.from({ length: ns }, (_, i) => {
        const saved = savedGroup?.sessions[i];
        if (saved) {
          // Keep recorded data but ensure readings array matches current num_readings
          const readings = Array(check.num_readings).fill("") as string[];
          saved.readings.forEach((r, ri) => { if (ri < check.num_readings) readings[ri] = r; });
          return { ...saved, session_number: i + 1, readings };
        }
        return {
          session_number:    i + 1,
          initials:          "",
          check_time:        "",
          readings:          Array(check.num_readings).fill("") as string[],
          pass:              null,
          corrective_action: "",
          visual_result:     null,
          visual_notes:      "",
        };
      }),
    };
  });

  const savedAttempts = s2a?.swab_attempts ?? [];
  const allergen: AllergenState = {
    changeover_required: s2a?.changeover_required ?? null,
    previous_product_name: s2a?.previous_product_name ?? "",
    previous_product_allergens: s2a?.previous_product_allergens ?? [],
    swab_attempts:
      savedAttempts.length > 0
        ? [
            ...savedAttempts.map((a) => ({ equipment_swabbed: a.equipment_swabbed, time_recorded: a.time_recorded, result: a.result, initials: a.initials, locked: a.result !== null })),
            ...(savedAttempts[savedAttempts.length - 1]?.result === "fail"
              ? [{ equipment_swabbed: "", time_recorded: "", result: null as null, initials: "", locked: false }]
              : []),
          ]
        : [{ equipment_swabbed: "", time_recorded: "", result: null, initials: "", locked: false }],
    instructions_open: false,
  };

  // Restore productionNumber for split lot input (when template has a productCode)
  const restoredLot = draft.productionLot ?? "";
  const restoredNumber = (() => {
    if (!template.productCode || !restoredLot) return "";
    const prefix = template.productCode.toUpperCase() + "-";
    return restoredLot.startsWith(prefix) ? restoredLot.slice(prefix.length) : "";
  })();

  const form: FormState = {
    productionDate:  draft.productionDate ? new Date(draft.productionDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    productionLot:   restoredLot,
    productionNumber: restoredNumber,
    expirationDate:  draft.expirationDate ? new Date(draft.expirationDate).toISOString().slice(0, 10) : "",
    shift:           (draft.shift as "AM" | "PM") ?? "AM",
    supervisorName:  draft.supervisorName ?? "",
    numEmployees:    draft.numEmployees ? String(draft.numEmployees) : "",
    ovensUsed:       s1?.ovens_used ?? [],
    calibration,
    s1Initials:      s1?.initials ?? "",
    bowlsProduced:   s3?.bowls_produced ? String(s3.bowls_produced) : "",
    ingredients,
    presentations,
    ccpGroups,
    eopValues,
    presentationUnits: (() => {
      const withUnits = template.presentations.filter((p) => effectiveUnitConfig(p, productPresentations).primary_unit_name);
      const defaultProduced = withUnits.length === 1;
      // Track ALL presentations (product-linked templates may have presentations without unit config)
      return Object.fromEntries(
        template.presentations.map((p, idx) => {
          const hasUnits = !!effectiveUnitConfig(p, productPresentations).primary_unit_name;
          if (savedPresentationUnits) {
            const sv = savedPresentationUnits.find((pu) => pu.presentation_id === p.presentation_id);
            const savedCount = sv?.total_produced ?? sv?.finished_unit_count;
            return [p.presentation_id, {
              wasProduced: sv?.was_produced ?? (defaultProduced && hasUnits),
              totalProduced: savedCount != null ? String(savedCount) : "",
              extraInternal: sv?.extra_internal != null ? String(sv.extra_internal) : "",
            }];
          }
          // Backward compat: restore old single-block values into first unit-tracked presentation
          const isFirst = idx === 0 && hasUnits;
          return [p.presentation_id, {
            wasProduced: isFirst && !!oldTotalUnits ? true : defaultProduced && isFirst,
            totalProduced: isFirst ? oldTotalUnits : "",
            extraInternal: isFirst ? oldExtraUnits : "",
          }];
        })
      );
    })(),
    pkgLabelChoice:      savedPkgLabelChoice,
    pkgLabelDiscrepancy: savedPkgLabelDiscrep,
    pkgAllergenConfirmed: savedPkgAllergenConf,
    pkgAllergenEdited:   savedPkgAllergenEdited,
    pkgLotState:         savedPkgLotState,
    pkgLotDiscrepancy:   savedPkgLotDiscrep,
    pkgExpState:         savedPkgExpState,
    pkgExpDiscrepancy:   savedPkgExpDiscrep,
    notes:           draft.notes ?? "",
  };

  return { form, allergen };
}

// ─── Section 5 payload builder ────────────────────────────────────────────────

function computeYieldPerBowl(
  totalUnits: string,
  extraInternal: string,
  bowlsProduced: string,
  hasInternalUnits: boolean,
  internalUnitsPerPrimary: number | null
): number | null {
  const bowls = parseFloat(bowlsProduced);
  if (!bowls || bowls <= 0) return null;
  const total = parseFloat(totalUnits);
  if (isNaN(total)) return null;
  if (!hasInternalUnits) {
    return total / bowls;
  }
  const ratio = internalUnitsPerPrimary ?? 1;
  const extra = parseFloat(extraInternal) || 0;
  const totalInternalUnits = total * ratio + extra;
  return totalInternalUnits / bowls / ratio;
}

type PkgVerification = {
  product_label:   { expected: string; confirmed: boolean; discrepancy_value: string | null; match: boolean };
  allergens:       { expected: string[]; confirmed: boolean; entered: string[]; match: boolean };
  lot_number:      { expected: string; confirmed: boolean; discrepancy_value: string | null; match: boolean };
  expiration_date: { expected: string; confirmed: boolean; discrepancy_value: string | null; match: boolean };
  all_confirmed:   boolean;
};

function computePkgVerification(form: FormState, selected: Template): PkgVerification {
  const expectedLabel     = selected.name;
  const expectedAllergens = [...(selected.declaredAllergens ?? [])].sort();
  const expectedLot       = (form.productionLot ?? "").trim();
  const expectedExpDate   = form.expirationDate ?? "";

  // Field 1 — Product Label
  const labelConfirmed = form.pkgLabelChoice === "confirmed";
  const labelMatch     = labelConfirmed;

  // Field 2 — Allergens (confirmed toggle; if not confirmed, compare edited to expected)
  const editedAllergens   = form.pkgAllergenEdited.includes("None") ? [] : [...form.pkgAllergenEdited];
  const sortedEdited      = [...editedAllergens].sort();
  const allergenEditMatch =
    sortedEdited.length === expectedAllergens.length &&
    sortedEdited.every((v, i) => v === expectedAllergens[i]);
  const allergenConfirmed = form.pkgAllergenConfirmed;
  const allergenMatch     = allergenConfirmed && allergenEditMatch;

  // Field 3 — Lot number
  const lotConfirmed = form.pkgLotState === "confirmed";
  const lotMatch     = lotConfirmed;

  // Field 4 — Expiration date (skip for products without one)
  const expConfirmed = selected.hasExpirationDate ? form.pkgExpState === "confirmed" : true;
  const expMatch     = expConfirmed;

  const allConfirmed = labelMatch && allergenMatch && lotMatch && expMatch;

  return {
    product_label:   {
      expected:          expectedLabel,
      confirmed:         labelConfirmed,
      discrepancy_value: form.pkgLabelChoice === "discrepancy" ? (form.pkgLabelDiscrepancy || null) : null,
      match:             labelMatch,
    },
    allergens:       {
      expected:  expectedAllergens,
      confirmed: allergenConfirmed,
      entered:   editedAllergens,
      match:     allergenMatch,
    },
    lot_number:      {
      expected:          expectedLot,
      confirmed:         lotConfirmed,
      discrepancy_value: form.pkgLotState === "discrepancy" ? (form.pkgLotDiscrepancy || null) : null,
      match:             lotMatch,
    },
    expiration_date: {
      expected:          expectedExpDate,
      confirmed:         expConfirmed,
      discrepancy_value: (selected.hasExpirationDate && form.pkgExpState === "discrepancy") ? (form.pkgExpDiscrepancy || null) : null,
      match:             expMatch,
    },
    all_confirmed:   allConfirmed,
  };
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function buildSection5Payload(
  selected: Template,
  form: FormState,
  productPresentations: ProductPresentationForSubmission[] | null,
) {
  const packagingVerification = computePkgVerification(form, selected);

  // Finished Unit mode — the base unit count IS the finished unit count, no yield calc.
  const presentationUnits = selected.baseUnitIsFinished
    ? (() => {
        const isSingle = selected.presentations.length === 1;
        return selected.presentations.map((pres) => {
          const pu = form.presentationUnits[pres.presentation_id];
          const wasProduced = isSingle ? true : !!pu?.wasProduced;
          return {
            presentation_id: pres.presentation_id,
            presentation_name: pres.presentation_name,
            was_produced: wasProduced,
            finished_unit_count: (wasProduced && pu?.totalProduced) ? parseFloat(pu.totalProduced) : null,
            base_unit_name: selected.baseUnitName,
          };
        });
      })()
    : (() => {
        // Build per-presentation unit records — include ALL presentations so product-linked
        // presentations without unit config are still captured in the submission snapshot.
        // Yield calculation only considers presentations that have unit config (primary_unit_name).
        // Unit config is resolved from the linked Product when available, else legacy template config.
        const presentationsWithUnits = selected.presentations.filter(
          (p) => effectiveUnitConfig(p, productPresentations).primary_unit_name
        );
        const producedCount = presentationsWithUnits.filter(
          (p) => form.presentationUnits[p.presentation_id]?.wasProduced
        ).length;
        const showYield = producedCount === 1;

        return selected.presentations.map((pres) => {
          const uc = effectiveUnitConfig(pres, productPresentations);
          const pu = form.presentationUnits[pres.presentation_id];
          if (!pu?.wasProduced) {
            return {
              presentation_id: pres.presentation_id,
              presentation_name: pres.presentation_name,
              was_produced: false,
              total_produced: null,
              extra_internal: null,
              yield_per_bowl: null,
              primary_unit_name: uc.primary_unit_name,
              has_internal_units: uc.has_internal_units,
              internal_unit_name: uc.internal_unit_name,
              internal_units_per_primary: uc.internal_units_per_primary,
            };
          }
          const yieldPerBowl = (showYield && uc.primary_unit_name)
            ? computeYieldPerBowl(
                pu.totalProduced,
                pu.extraInternal,
                form.bowlsProduced,
                uc.has_internal_units,
                uc.internal_units_per_primary
              )
            : null;
          return {
            presentation_id: pres.presentation_id,
            presentation_name: pres.presentation_name,
            was_produced: true,
            total_produced: pu.totalProduced ? parseFloat(pu.totalProduced) : null,
            extra_internal: pu.extraInternal ? parseFloat(pu.extraInternal) : null,
            yield_per_bowl: yieldPerBowl,
            primary_unit_name: uc.primary_unit_name,
            has_internal_units: uc.has_internal_units,
            internal_unit_name: uc.internal_unit_name,
            internal_units_per_primary: uc.internal_units_per_primary,
          };
        });
      })();

  return {
    presentation_units: presentationUnits,
    packaging_verification: packagingVerification,
    base_unit_name: selected.baseUnitName,
    base_unit_is_finished: selected.baseUnitIsFinished,
    fields: selected.endOfProductionFields.map((field, i) => ({
      field_id:   field.id,
      label:      field.label,
      field_type: field.field_type,
      value:      form.eopValues[field.id] ?? "",
      order:      i,
    })),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function passChip(pass: boolean | null) {
  if (pass === null) return <span className="badge bg-gray-100 text-gray-400">—</span>;
  return pass
    ? <span className="badge bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />PASS</span>
    : <span className="badge bg-red-100 text-red-700 flex items-center gap-1"><XCircle className="w-3 h-3" />FAIL</span>;
}

function computeStatus(groups: CcpGroupEntry[]): string {
  if (!groups.length) return "COMPLETE";
  const allSessions = groups.flatMap((g) => g.sessions);
  if (allSessions.length === 0) return "COMPLETE";
  const hasIssue = allSessions.some((s) => s.pass === false);
  if (!hasIssue) return "PASS";
  const failedSessions = groups.flatMap((g) =>
    g.sessions.filter((s) => s.pass === false)
  );
  const allCorrected = failedSessions.every((s) =>
    s.corrective_action.trim() !== "" || s.visual_notes.trim() !== ""
  );
  return allCorrected ? "PASS_WITH_ISSUES" : "FAIL";
}

// ─── Section 6 auto-status helpers ───────────────────────────────────────────

export type S6StatusKind = "not_applicable" | "not_started" | "in_progress" | "pass_with_issues" | "complete";

export interface S6Item {
  id: string;
  label: string;
  present: boolean;
  status: S6StatusKind;
  subItems?: { id: string; label: string; status: S6StatusKind }[];
}

function worstStatus(a: S6StatusKind, b: S6StatusKind): S6StatusKind {
  const rank: Record<S6StatusKind, number> = {
    not_applicable: 0,
    complete: 1,
    pass_with_issues: 2,
    in_progress: 3,
    not_started: 4,
  };
  return rank[a] >= rank[b] ? a : b;
}

function ccpTypeStatus(
  groups: CcpGroupEntry[],
  type: string
): S6StatusKind {
  const matching = groups.filter((g) => g.check_type === type);
  if (matching.length === 0) return "not_applicable";

  const allSessions = matching.flatMap((g) => g.sessions);
  if (allSessions.length === 0) return "not_started";

  const hasSomeData = allSessions.some((s) => {
    if (type === "visual") return s.visual_result !== null;
    return s.readings.some((r) => r.trim() !== "");
  });
  if (!hasSomeData) return "not_started";

  const allDone = allSessions.every((s) => {
    if (type === "visual") return s.visual_result !== null;
    return s.readings.every((r) => r.trim() !== "");
  });
  if (!allDone) return "in_progress";

  // All sessions done — check pass/fail
  const allPass = allSessions.every((s) => s.pass === true);
  if (allPass) return "complete";
  const allFail = allSessions.some((s) => s.pass === false);
  if (allFail) return "pass_with_issues";
  return "in_progress";
}

function computeSection6Items(
  form: FormState,
  allergen: AllergenState,
  selected: Template
): S6Item[] {
  // 1. Batch Sheet Traceability (Section 3)
  const hasBowls = form.bowlsProduced.trim() !== "" && parseFloat(form.bowlsProduced) > 0;
  // WIP ingredients with a non-empty lot that haven't been verified yet count as "in progress"
  const wipUnverified = form.ingredients.filter(
    (ing) => ing.is_wip && ing.lot_number.trim() !== "" && ing.wip_lot_verified === false
  );
  const allIngTraceable = form.ingredients.every((ing) => {
    if (ing.is_wip) return ing.lot_number.trim() !== "";
    return ing.inventory_lots.length > 0 && ing.inventory_lots.every(
      (l) => (l.lotNumber.trim() !== "" || (l.lotId !== "" && l.lotId !== "__other__"))
          && l.qtyUsed.trim() !== ""
          && l.supplierName.trim() !== ""
    );
  }) && wipUnverified.length === 0;
  const someIngTraceable = form.ingredients.some((ing) => {
    if (ing.is_wip) return ing.lot_number.trim() !== "";
    return ing.inventory_lots.some((l) => l.lotNumber.trim() !== "" || (l.lotId !== "" && l.lotId !== "__other__"));
  });
  // All override ingredients must have a reason documented
  const allOverrideReasoned = form.ingredients
    .filter((ing) => ing.override_type !== "none")
    .every((ing) => {
      if (!ing.override_reason) return false;
      if (ing.override_reason === "Other (explain below)") return !!ing.override_reason_other.trim();
      return true;
    });
  const anyOverride = form.ingredients.some((ing) => ing.override_type !== "none");
  let traceStatus: S6StatusKind = "not_started";
  if (hasBowls && allIngTraceable && allOverrideReasoned) traceStatus = "complete";
  else if (hasBowls || someIngTraceable || anyOverride || wipUnverified.length > 0) traceStatus = "in_progress";

  // 2. Calibration Verification (Section 1)
  const calib = form.calibration;
  let calibStatus: S6StatusKind = "not_applicable";
  if (calib.length > 0) {
    const doneCount = calib.filter((r) => r.reading.trim() !== "").length;
    if (doneCount === 0) calibStatus = "not_started";
    else if (doneCount < calib.length) calibStatus = "in_progress";
    else {
      const allPass = calib.every((r) => r.pass === true);
      const anyFail = calib.some((r) => r.pass === false);
      if (allPass) calibStatus = "complete";
      else if (anyFail) calibStatus = "pass_with_issues";
      else calibStatus = "in_progress";
    }
  }

  // 3. CCP Temperature Verification
  const tempStatus = ccpTypeStatus(form.ccpGroups, "temperature");

  // 4. Net Weight Compliance
  const weightStatus = ccpTypeStatus(form.ccpGroups, "weight");

  // 5. CCP Visual Inspection
  const visualStatus = ccpTypeStatus(form.ccpGroups, "visual");

  // 6. Allergen Security (two sub-items)
  // Sub-item A: Section 2 — Changeover Verification
  let changeoverStatus: S6StatusKind;
  if (allergen.changeover_required === null) {
    changeoverStatus = "not_started";
  } else if (!allergen.changeover_required) {
    changeoverStatus = "complete";
  } else {
    const hasPassed = allergen.swab_attempts.some((a) => a.result === "pass" && a.locked);
    const hasAny = allergen.swab_attempts.some((a) => a.equipment_swabbed.trim() !== "" || a.result !== null);
    if (hasPassed) changeoverStatus = "complete";
    else if (hasAny) changeoverStatus = "in_progress";
    else changeoverStatus = "not_started";
  }

  // Sub-item B: Section 5 — Package Allergen Declaration
  const declaredAllergens = selected.declaredAllergens ?? [];
  const allergenEdited = form.pkgAllergenEdited ?? [];
  const allergenMismatch = !form.pkgAllergenConfirmed && (() => {
    const sorted = [...allergenEdited].sort().join(",");
    const expected = [...declaredAllergens].sort().join(",");
    return sorted !== expected;
  })();
  let pkgAllergenStatus: S6StatusKind;
  if (form.pkgAllergenConfirmed) pkgAllergenStatus = "complete";
  else if (allergenMismatch) pkgAllergenStatus = "pass_with_issues";
  else if (form.pkgAllergenEdited.length > 0) pkgAllergenStatus = "in_progress";
  else pkgAllergenStatus = "not_started";

  const allergenStatus: S6StatusKind = worstStatus(changeoverStatus, pkgAllergenStatus);

  return [
    { id: "traceability", label: "Batch Sheet Traceability", present: true, status: traceStatus },
    { id: "calibration",  label: "Calibration Verification", present: calib.length > 0, status: calibStatus },
    { id: "temperature",  label: "CCP Temperature Verification", present: tempStatus !== "not_applicable", status: tempStatus },
    { id: "weight",       label: "Net Weight Compliance", present: weightStatus !== "not_applicable", status: weightStatus },
    { id: "visual",       label: "CCP Visual Inspection", present: visualStatus !== "not_applicable", status: visualStatus },
    {
      id: "allergen",
      label: "Allergen Security",
      present: true,
      status: allergenStatus,
      subItems: [
        { id: "changeover", label: "Changeover Verification (Sec. 2)", status: changeoverStatus },
        { id: "pkg_allergen", label: "Package Allergen Declaration (Sec. 5)", status: pkgAllergenStatus },
      ],
    },
  ];
}

const STATUS_CONFIG: Record<S6StatusKind, { label: string; bg: string; text: string; border: string; dot: string }> = {
  not_applicable:  { label: "N/A",              bg: "bg-gray-100",   text: "text-gray-400",   border: "border-gray-200", dot: "bg-gray-300"   },
  not_started:     { label: "Not Started",       bg: "bg-gray-50",    text: "text-gray-500",   border: "border-gray-200", dot: "bg-gray-300"   },
  in_progress:     { label: "In Progress",       bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",dot: "bg-amber-400"  },
  pass_with_issues:{ label: "Pass w/ Issues",    bg: "bg-orange-50",  text: "text-orange-700", border: "border-orange-200",dot: "bg-orange-400"},
  complete:        { label: "Complete",          bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200",dot: "bg-emerald-500"},
};

// ─── Supplier dropdown ────────────────────────────────────────────────────────

/** Class applied to every inline text input in the form. */
const FIELD_CLS = "input";

type LinkedSupplier = { id: string; name: string; status: string };

function statusBadgeForSupplier(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    APPROVED:      { label: "✓ Approved",  cls: "text-emerald-700 bg-emerald-50" },
    EXPIRING_SOON: { label: "⚠ Expiring", cls: "text-amber-700 bg-amber-50" },
    EXPIRED:       { label: "✗ Expired",   cls: "text-red-700 bg-red-50" },
    PENDING:       { label: "○ Pending",   cls: "text-yellow-700 bg-yellow-50" },
    INACTIVE:      { label: "○ Inactive",  cls: "text-gray-500 bg-gray-100" },
  };
  const s = map[status] ?? { label: status, cls: "text-gray-500 bg-gray-100" };
  return (
    <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

type SupplierSelectProps = {
  ing: IngRow;
  idx: number;
  /** null = loading; empty array = loaded but none linked */
  linkedSuppliers: LinkedSupplier[] | null;
  allSuppliers: LinkedSupplier[];
  supplierStatuses: Record<string, { status: string | null; found: boolean }>;
  onSelectLinked: (idx: number, supplier: LinkedSupplier) => void;
  onSelectOther:  (idx: number) => void;
  onFreeTextChange: (idx: number, value: string) => void;
  onFreeTextBlur:   (idx: number, value: string) => void;
};

function SupplierSelect({
  ing, idx, linkedSuppliers, allSuppliers, supplierStatuses,
  onSelectLinked, onSelectOther, onFreeTextChange, onFreeTextBlur,
}: SupplierSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen]     = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // No materialId → legacy free-text input (template-only ingredient)
  if (!ing.materialId) {
    return (
      <div className="space-y-1">
        <input
          className={FIELD_CLS}
          value={ing.supplier}
          placeholder="Supplier"
          onChange={(e) => onFreeTextChange(idx, toUpperCaseInput(e.target.value))}
          onBlur={(e)  => onFreeTextBlur(idx, e.target.value)}
        />
      </div>
    );
  }

  // Still loading
  if (linkedSuppliers === null) {
    return <div className="text-xs text-gray-400 font-mono py-2">Loading suppliers…</div>;
  }

  const hasLinked  = linkedSuppliers.length > 0;
  const options    = hasLinked ? linkedSuppliers : allSuppliers;
  const filtered   = search
    ? options.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedOption = options.find((s) => s.id === ing.supplier_id);
  const displayValue   = ing.supplier_is_other
    ? "Other supplier…"
    : (selectedOption?.name ?? "");

  return (
    <div ref={rootRef} className="relative space-y-1">
      {!hasLinked && (
        <p className="text-[10px] text-amber-600 font-mono">No linked suppliers — showing all</p>
      )}

      {/* Trigger */}
      <button
        type="button"
        className={`${FIELD_CLS} w-full flex items-center gap-1.5 text-left`}
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        aria-expanded={open}
      >
        <span className={`flex-1 text-sm truncate ${!displayValue ? "text-gray-400" : "text-gray-800"}`}>
          {displayValue || "Select supplier…"}
        </span>
        <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-full min-w-[260px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              className="w-full text-sm px-2 py-2 border border-gray-200 rounded outline-none focus:border-gray-400"
              placeholder="Search suppliers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] text-left hover:bg-gray-50 transition-colors gap-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelectLinked(idx, s); setOpen(false); setSearch(""); }}
              >
                <span className="text-sm font-medium text-gray-800 truncate">{s.name}</span>
                {statusBadgeForSupplier(s.status)}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-400 font-mono">No results</p>
            )}
          </div>

          {/* "Other" option */}
          <div className="border-t border-gray-100">
            <button
              type="button"
              className="w-full px-3 py-2.5 min-h-[44px] text-left text-sm text-gray-500 hover:bg-gray-50 italic transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelectOther(idx); setOpen(false); setSearch(""); }}
            >
              Other supplier…
            </button>
          </div>
        </div>
      )}

      {/* Free-text when "Other" selected */}
      {ing.supplier_is_other && (
        <div className="space-y-0.5">
          <input
            className={FIELD_CLS}
            value={ing.supplier}
            placeholder="Enter supplier name"
            onChange={(e) => onFreeTextChange(idx, toUpperCaseInput(e.target.value))}
            onBlur={(e)  => onFreeTextBlur(idx, e.target.value)}
          />
          <p className="text-[10px] text-amber-600 font-mono">Not in approved list</p>
        </div>
      )}

      {/* Status badge — linked supplier */}
      {!ing.supplier_is_other && selectedOption && (
        <div>{statusBadgeForSupplier(selectedOption.status)}</div>
      )}

      {/* Status badge — "Other" free-text entry (checked on blur) */}
      {ing.supplier_is_other && ing.supplier.trim() && (() => {
        const info = supplierStatuses[ing.supplier.trim()];
        if (!info) return null;
        if (!info.found) return <span className="text-[10px] text-gray-400 font-mono">Not in registry</span>;
        return statusBadgeForSupplier(info.status ?? "PENDING");
      })()}
    </div>
  );
}

// ─── Packaging supplier dropdown ──────────────────────────────────────────────

type PackagingSupplierSelectProps = {
  mat: MaterialState;
  presId: string;
  /** null = loading; empty array = loaded but none linked */
  linkedSuppliers: LinkedSupplier[] | null;
  allSuppliers: LinkedSupplier[];
  supplierStatuses: Record<string, { status: string | null; found: boolean }>;
  onSelectLinked:   (presId: string, matId: string, supplier: LinkedSupplier) => void;
  onSelectOther:    (presId: string, matId: string) => void;
  onFreeTextChange: (presId: string, matId: string, value: string) => void;
  onFreeTextBlur:   (presId: string, matId: string, value: string) => void;
};

function PackagingSupplierSelect({
  mat, presId, linkedSuppliers, allSuppliers, supplierStatuses,
  onSelectLinked, onSelectOther, onFreeTextChange, onFreeTextBlur,
}: PackagingSupplierSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen]     = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (linkedSuppliers === null) {
    return <div className="text-xs text-gray-400 font-mono py-2">Loading suppliers…</div>;
  }

  const hasLinked  = linkedSuppliers.length > 0;
  const options    = hasLinked ? linkedSuppliers : allSuppliers;
  const filtered   = search
    ? options.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedOption = options.find((s) => s.id === mat.supplier_id);
  const displayValue   = mat.supplier_is_other
    ? "Other supplier…"
    : (selectedOption?.name ?? "");

  return (
    <div ref={rootRef} className="relative space-y-1">
      {!hasLinked && (
        <p className="text-[10px] text-amber-600 font-mono">No linked suppliers — showing all</p>
      )}

      <button
        type="button"
        className={`${FIELD_CLS} w-full flex items-center gap-1.5 text-left`}
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        aria-expanded={open}
      >
        <span className={`flex-1 text-sm truncate ${!displayValue ? "text-gray-400" : "text-gray-800"}`}>
          {displayValue || "Select supplier…"}
        </span>
        <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-full min-w-[260px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              className="w-full text-sm px-2 py-2 border border-gray-200 rounded outline-none focus:border-gray-400"
              placeholder="Search suppliers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] text-left hover:bg-gray-50 transition-colors gap-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelectLinked(presId, mat.id, s); setOpen(false); setSearch(""); }}
              >
                <span className="text-sm font-medium text-gray-800 truncate">{s.name}</span>
                {statusBadgeForSupplier(s.status)}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-400 font-mono">No results</p>
            )}
          </div>
          <div className="border-t border-gray-100">
            <button
              type="button"
              className="w-full px-3 py-2.5 min-h-[44px] text-left text-sm text-gray-500 hover:bg-gray-50 italic transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelectOther(presId, mat.id); setOpen(false); setSearch(""); }}
            >
              Other supplier…
            </button>
          </div>
        </div>
      )}

      {mat.supplier_is_other && (
        <div className="space-y-0.5">
          <input
            className={FIELD_CLS}
            value={mat.supplier}
            placeholder="Enter supplier name"
            onChange={(e) => onFreeTextChange(presId, mat.id, toUpperCaseInput(e.target.value))}
            onBlur={(e)  => onFreeTextBlur(presId, mat.id, e.target.value)}
          />
          <p className="text-[10px] text-amber-600 font-mono">Not in approved list</p>
        </div>
      )}

      {!mat.supplier_is_other && selectedOption && (
        <div>{statusBadgeForSupplier(selectedOption.status)}</div>
      )}

      {mat.supplier_is_other && mat.supplier.trim() && (() => {
        const info = supplierStatuses[mat.supplier.trim()];
        if (!info) return null;
        if (!info.found) return <span className="text-[10px] text-gray-400 font-mono">Not in registry</span>;
        return statusBadgeForSupplier(info.status ?? "PENDING");
      })()}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BatchSheetClient({
  templates,
  supervisorName,
  lastSwabEquipment,
}: {
  templates: Template[];
  supervisorName: string;
  lastSwabEquipment: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Template | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [allergen, setAllergen] = useState<AllergenState>(initAllergen());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Draft / save-progress state
  const [sigDataUrl, setSigDataUrl] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [lastActiveSection, setLastActiveSection] = useState(1);
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  const [existingDraft, setExistingDraft] = useState<DraftRecord | null>(null);
  const [checkingDraft, setCheckingDraft] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Supplier approval status cache: supplierName → { status, found }
  const [supplierStatuses, setSupplierStatuses] = useState<Record<string, { status: string | null; found: boolean }>>({});
  // Supplier dropdown data: per-material linked suppliers, and an "all suppliers" fallback
  const [materialSuppliers, setMaterialSuppliers] = useState<Record<string, LinkedSupplier[] | null>>({});
  const [allSuppliers, setAllSuppliers] = useState<LinkedSupplier[]>([]);
  // Available inventory lots per material (for multi-lot selection)
  const [availableLots, setAvailableLots] = useState<Record<string, AvailableLot[]>>({});
  const requestedAvailableLots = useRef<Set<string>>(new Set());
  const requestedMaterials   = useRef<Set<string>>(new Set());
  const allSuppliersRequested = useRef(false);
  const prevBowlsRef = useRef<number>(0);
  const [productForSubmission, setProductForSubmission] = useState<{
    id: string;
    recipe: unknown;
    shelfLifeMonths: number | null;
    productPresentations: ProductPresentationForSubmission[];
  } | null>(null);
  const [expirationAutoFilled, setExpirationAutoFilled] = useState(false);
  const [expirationManuallyOverridden, setExpirationManuallyOverridden] = useState(false);

  // (packaging verification state is now per-field in FormState)

  async function checkSupplierStatus(name: string) {
    const trimmed = name.trim();
    if (!trimmed || supplierStatuses[trimmed] !== undefined) return;
    try {
      const res = await fetch(`/api/supplier-management/check-supplier?name=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        setSupplierStatuses((prev) => ({ ...prev, [trimmed]: { status: data.status, found: data.found } }));
      }
    } catch { /* silent */ }
  }

  // Load per-material linked suppliers whenever the ingredient list changes
  useEffect(() => {
    if (!form) return;
    const materialIds = Array.from(
      new Set(form.ingredients.map((i) => i.materialId).filter((m): m is string => !!m)),
    );
    const newIds = materialIds.filter((mid) => !requestedMaterials.current.has(mid));
    if (newIds.length > 0) {
      for (const mid of newIds) requestedMaterials.current.add(mid);
      setMaterialSuppliers((prev) => {
        const next = { ...prev };
        for (const mid of newIds) next[mid] = null; // null = loading
        return next;
      });
      for (const mid of newIds) {
        fetch(`/api/supplier-management/materials/${mid}/suppliers`)
          .then((r) => r.json())
          .then((data: LinkedSupplier[]) => {
            setMaterialSuppliers((prev) => ({ ...prev, [mid]: data }));
            // Auto-fill WIP supplier if the ingredient is WIP and has no supplier set
            if (!form) return;
            const idx = form.ingredients.findIndex((ing) => ing.materialId === mid);
            if (idx === -1) return;
            const ing = form.ingredients[idx];
            if (ing.is_wip && !ing.supplier_id && data.length > 0) {
              const internalSupplier = data.find((s) => s.name.includes("Julian Bakery")) ?? data[0];
              if (internalSupplier) {
                setForm((f) => {
                  if (!f) return f;
                  const a = [...f.ingredients];
                  a[idx] = {
                    ...a[idx],
                    supplier: internalSupplier.name,
                    supplier_id: internalSupplier.id,
                    supplier_is_other: false,
                    supplier_approval_status: internalSupplier.status,
                  };
                  return { ...f, ingredients: a };
                });
              }
            }
          })
          .catch(() => {
            setMaterialSuppliers((prev) => ({ ...prev, [mid]: [] }));
          });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.ingredients]);

  // Load per-material linked suppliers for packaging materials
  useEffect(() => {
    if (!form) return;
    const pkgIds = Array.from(
      new Set(form.presentations.flatMap((p) => p.materials.map((m) => m.id)).filter(Boolean)),
    );
    const newIds = pkgIds.filter((mid) => !requestedMaterials.current.has(mid));
    if (newIds.length === 0) return;
    for (const mid of newIds) requestedMaterials.current.add(mid);
    setMaterialSuppliers((prev) => {
      const next = { ...prev };
      for (const mid of newIds) next[mid] = null;
      return next;
    });
    for (const mid of newIds) {
      fetch(`/api/supplier-management/materials/${mid}/suppliers`)
        .then((r) => r.json())
        .then((data: LinkedSupplier[]) => setMaterialSuppliers((prev) => ({ ...prev, [mid]: data })))
        .catch(() => setMaterialSuppliers((prev) => ({ ...prev, [mid]: [] })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.presentations]);

  // Load all suppliers once as fallback for materials with no linked suppliers
  useEffect(() => {
    if (allSuppliersRequested.current) return;
    allSuppliersRequested.current = true;
    fetch("/api/supplier-management/suppliers/brief")
      .then((r) => r.json())
      .then((data: LinkedSupplier[]) => setAllSuppliers(data))
      .catch(() => {});
  }, []);

  // Load available inventory lots per ingredient material
  useEffect(() => {
    if (!form) return;
    const materialIds = Array.from(
      new Set(form.ingredients.map((i) => i.materialId).filter((m): m is string => !!m)),
    );
    const newIds = materialIds.filter((mid) => !requestedAvailableLots.current.has(mid));
    if (newIds.length === 0) return;
    for (const mid of newIds) requestedAvailableLots.current.add(mid);
    for (const mid of newIds) {
      fetch(`/api/inventory/available-lots?material_id=${mid}`)
        .then((r) => r.json())
        .then((data: AvailableLot[]) => setAvailableLots((prev) => ({ ...prev, [mid]: data })))
        .catch(() => setAvailableLots((prev) => ({ ...prev, [mid]: [] })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.ingredients]);

  // Auto-fill single-lot Qty Used when bowls produced changes
  useEffect(() => {
    if (!form) return;
    const bowlsNum = parseInt(form.bowlsProduced) || 0;
    if (bowlsNum === prevBowlsRef.current) return;
    prevBowlsRef.current = bowlsNum;
    if (bowlsNum <= 0) return;
    const updated = form.ingredients.map((ing) => {
      if (ing.is_wip || ing.inventory_lots.length !== 1) return ing;
      const eQpb = ing.override_type === "qty_per_bowl"
        ? (parseFloat(ing.qty_per_bowl_override) || ing.quantity_per_bowl)
        : ing.quantity_per_bowl;
      const total = ing.override_type === "total_qty"
        ? (parseFloat(ing.total_qty_override) || 0)
        : eQpb * bowlsNum;
      const newQty = total > 0 ? total.toFixed(3) : "";
      if (ing.inventory_lots[0].qtyUsed === newQty) return ing;
      return { ...ing, inventory_lots: [{ ...ing.inventory_lots[0], qtyUsed: newQty }] };
    });
    sf({ ingredients: updated });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.bowlsProduced]);

  /** Patch multiple fields on one packaging material in a single state update. */
  function patchMaterial(pid: string, mid: string, patch: Partial<MaterialState>) {
    if (!form) return;
    sf({
      presentations: form.presentations.map((p) => {
        if (p.presentation_id !== pid) return p;
        return { ...p, materials: p.materials.map((m) => m.id === mid ? { ...m, ...patch } : m) };
      }),
    });
  }

  /** Patch multiple fields on one ingredient in a single state update. */
  function patchIngredient(i: number, patch: Partial<IngRow>) {
    if (!form) return;
    const a = [...form.ingredients];
    a[i] = { ...a[i], ...patch };
    sf({ ingredients: a });
    setLastActiveSection(3);
  }

  function patchLot(ingIdx: number, lotIdx: number, patch: Partial<InventoryLotSelection>) {
    if (!form) return;
    const a = [...form.ingredients];
    const lots = [...a[ingIdx].inventory_lots];
    lots[lotIdx] = { ...lots[lotIdx], ...patch };
    a[ingIdx] = { ...a[ingIdx], inventory_lots: lots };
    sf({ ingredients: a });
    setLastActiveSection(3);
  }

  function ingTotal(ing: IngRow): number {
    const bowls = parseInt(form?.bowlsProduced ?? "") || 0;
    const eQpb = ing.override_type === "qty_per_bowl"
      ? (parseFloat(ing.qty_per_bowl_override) || ing.quantity_per_bowl)
      : ing.quantity_per_bowl;
    return ing.override_type === "total_qty"
      ? (parseFloat(ing.total_qty_override) || 0)
      : (bowls > 0 ? eQpb * bowls : 0);
  }

  function handleLotQtyChange(ingIdx: number, lotIdx: number, newQty: string) {
    if (!form) return;
    const ing = form.ingredients[ingIdx];
    const lots = ing.inventory_lots.map((l) => ({ ...l }));
    lots[lotIdx] = { ...lots[lotIdx], qtyUsed: newQty };
    const total = ingTotal(ing);
    const editedQty = parseFloat(newQty) || 0;
    if (lots.length === 2) {
      const otherIdx = 1 - lotIdx;
      const remainder = total - editedQty;
      lots[otherIdx] = { ...lots[otherIdx], qtyUsed: remainder >= 0 ? remainder.toFixed(3) : "0" };
    } else if (lots.length > 2 && lotIdx < lots.length - 1) {
      const sumOthers = lots.slice(0, -1).reduce((s, l) => s + (parseFloat(l.qtyUsed) || 0), 0);
      const remainder = total - sumOthers;
      lots[lots.length - 1] = { ...lots[lots.length - 1], qtyUsed: remainder >= 0 ? remainder.toFixed(3) : "0" };
    }
    patchIngredient(ingIdx, { inventory_lots: lots });
  }

  function addSplitLot(ingIdx: number) {
    if (!form) return;
    const ing = form.ingredients[ingIdx];
    const total = ingTotal(ing);
    const sumExisting = ing.inventory_lots.reduce((s, l) => s + (parseFloat(l.qtyUsed) || 0), 0);
    const remainder = total - sumExisting;
    patchIngredient(ingIdx, {
      inventory_lots: [...ing.inventory_lots, { ...emptyLotEntry(ing.unit), qtyUsed: remainder >= 0 ? remainder.toFixed(3) : "0" }],
    });
  }

  function deleteLot(ingIdx: number, lotIdx: number) {
    if (!form) return;
    const ing = form.ingredients[ingIdx];
    const deletedQty = parseFloat(ing.inventory_lots[lotIdx].qtyUsed) || 0;
    const newLots = ing.inventory_lots.filter((_, j) => j !== lotIdx);
    if (newLots.length > 0 && deletedQty > 0) {
      const lastIdx = newLots.length - 1;
      const lastQty = parseFloat(newLots[lastIdx].qtyUsed) || 0;
      newLots[lastIdx] = { ...newLots[lastIdx], qtyUsed: (lastQty + deletedQty).toFixed(3) };
    }
    patchIngredient(ingIdx, { inventory_lots: newLots });
  }

  /** Validate a WIP lot number against completed batch sheet records. */
  async function validateWipLot(idx: number, lotNumber: string, sourceProductId: string) {
    if (!sourceProductId || !lotNumber.trim()) return;
    patchIngredient(idx, { wip_validation_state: "checking" });
    try {
      const res = await fetch(
        `/api/batch-sheet/validate-wip-lot?product_id=${encodeURIComponent(sourceProductId)}&lot_number=${encodeURIComponent(lotNumber.trim())}`
      );
      if (res.ok) {
        const data = await res.json() as { found: boolean; submission_id: string | null; production_date: string | null; bowls_produced: number | null };
        if (data.found) {
          patchIngredient(idx, {
            wip_lot_verified:         true,
            wip_source_submission_id: data.submission_id,
            wip_production_date:      data.production_date,
            wip_bowls_produced:       data.bowls_produced,
            wip_validation_state:     "found",
          });
        } else {
          patchIngredient(idx, {
            wip_lot_verified:         false,
            wip_source_submission_id: null,
            wip_production_date:      null,
            wip_bowls_produced:       null,
            wip_validation_state:     "not_found",
          });
        }
      }
    } catch {
      patchIngredient(idx, { wip_validation_state: "idle" });
    }
  }

  function SupplierStatusBadge({ name }: { name: string }) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const info = supplierStatuses[trimmed];
    if (!info) return null;
    if (!info.found) return <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">Not in registry</span>;
    const map: Record<string, { label: string; cls: string }> = {
      APPROVED:      { label: "✓ Approved",      cls: "text-emerald-700 bg-emerald-50" },
      EXPIRING_SOON: { label: "⚠ Expiring Soon", cls: "text-amber-700 bg-amber-50" },
      EXPIRED:       { label: "✗ Expired",        cls: "text-red-700 bg-red-50" },
      PENDING:       { label: "○ Pending",        cls: "text-yellow-700 bg-yellow-50" },
      INACTIVE:      { label: "○ Inactive",       cls: "text-gray-500 bg-gray-100" },
    };
    const style = map[info.status ?? ""] ?? { label: info.status, cls: "text-gray-500 bg-gray-100" };
    return (
      <span className={`inline-block text-[10px] font-mono font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${style.cls}`}>
        {style.label}
      </span>
    );
  }

  async function selectTemplate(t: Template) {
    let templateToUse = t;
    let productPresentations: ProductPresentationForSubmission[] | null = null;
    setProductForSubmission(null);

    // If the template is linked to a Product, override its ingredients and product code
    // with the live values from the Products registry.
    if (t.productId) {
      try {
        const res = await fetch(`/api/products/${t.productId}`);
        if (res.ok) {
          const prod = await res.json() as {
            id: string;
            productCode: string | null;
            shelfLifeMonths: number | null;
            recipe: Array<{ id: string; materialId?: string; materialName: string; quantity: number; unit: string; materialType?: string; sourceProductId?: string | null }>;
            presentations: ProductPresentationForSubmission[];
          };
          const mappedIngs: IngTpl[] = (prod.recipe ?? []).map((r) => ({
            id: r.id,
            materialId: r.materialId,
            name: r.materialName,
            quantity_per_bowl: r.quantity,
            unit: r.unit,
            materialType: r.materialType ?? "raw",
            sourceProductId: r.sourceProductId ?? null,
          }));
          // Map product presentations → Template Presentation format (identity + materials only —
          // unit config is sourced from productPresentations directly, the Product is the single
          // source of truth for it).
          const mappedPresentations: Presentation[] = (prod.presentations ?? []).map((pp) => ({
            presentation_id: pp.id,
            presentation_name: pp.name,
            materials: pp.packaging_materials.map((m) => ({
              id: m.material_id,
              name: m.material_name,
              food_contact: m.food_contact,
            })),
          }));
          // productCode and presentations come from the linked product
          templateToUse = {
            ...t,
            ingredients: mappedIngs,
            productCode: prod.productCode,
            presentations: mappedPresentations.length > 0 ? mappedPresentations : t.presentations,
          };
          productPresentations = prod.presentations ?? [];
          setProductForSubmission({
            id: prod.id,
            recipe: prod.recipe,
            shelfLifeMonths: prod.shelfLifeMonths ?? null,
            productPresentations,
          });
        }
      } catch {
        // Fall back to template's own ingredients and productCode
      }
    }

    setSelected(templateToUse);
    setForm(initForm(templateToUse, supervisorName, productPresentations));
    setAllergen(initAllergen());
    setExpirationAutoFilled(false);
    setExpirationManuallyOverridden(false);
    setSubmitError("");
  }

  async function handleTemplateSelect(t: Template) {
    setCheckingDraft(true);
    try {
      const res = await fetch(`/api/batch-sheet/draft?template_id=${t.id}`);
      if (res.ok) {
        const draft = await res.json();
        if (draft) {
          setPendingTemplate(t);
          setExistingDraft(draft);
          setCheckingDraft(false);
          return;
        }
      }
    } catch { /* ignore */ }
    setCheckingDraft(false);
    selectTemplate(t);
  }

  function backToTemplates() {
    setSelected(null);
    setForm(null);
    setDraftId(null);
    setLastSavedAt(null);
    setSigDataUrl("");
  }

  const sf = (patch: Partial<FormState>) => setForm((f) => f ? { ...f, ...patch } : f);
  const sa = (patch: Partial<AllergenState>) => setAllergen((a) => ({ ...a, ...patch }));

  const bowlsNum = parseInt(form?.bowlsProduced ?? "") || 0;
  const isAllergenDone = allergenComplete(allergen);

  // ── Calibration: auto pass/fail ──────────────────────────────────────────────

  function updateCalibReading(i: number, reading: string) {
    if (!form) return;
    const c = [...form.calibration];
    const target = parseFloat(c[i].label.replace(/[^0-9.]/g, ""));
    const val = parseFloat(reading);
    let pass: boolean | null = null;
    let deviation: number | null = null;
    if (!isNaN(target) && target > 0 && reading.trim() !== "" && !isNaN(val)) {
      deviation = Math.abs(val - target) / target * 100;
      pass = deviation <= 2;
    }
    c[i] = { ...c[i], reading, pass, deviation };
    sf({ calibration: c });
    setLastActiveSection(1);
  }

  // ── CCP Group/Session updates ─────────────────────────────────────────────────

  function updateGroupReading(groupIdx: number, sessionIdx: number, readingIdx: number, value: string) {
    if (!form || !selected) return;
    const groups = form.ccpGroups.map((g, gi) => {
      if (gi !== groupIdx) return g;
      const sessions = g.sessions.map((s, si) => {
        if (si !== sessionIdx) return s;
        const readings = [...s.readings];
        readings[readingIdx] = value;
        const ccpTpl = selected.ccpChecks.find((c) => c.id === g.check_id);
        const pass = ccpTpl ? computeCheckPass(ccpTpl, readings, s.visual_result) : null;
        return { ...s, readings, pass };
      });
      return { ...g, sessions };
    });
    sf({ ccpGroups: groups });
    setLastActiveSection(4);
  }

  function updateGroupVisual(groupIdx: number, sessionIdx: number, result: "pass" | "issue") {
    if (!form || !selected) return;
    const groups = form.ccpGroups.map((g, gi) => {
      if (gi !== groupIdx) return g;
      const sessions = g.sessions.map((s, si) => {
        if (si !== sessionIdx) return s;
        const ccpTpl = selected.ccpChecks.find((c) => c.id === g.check_id);
        const pass = ccpTpl ? computeCheckPass(ccpTpl, s.readings, result) : null;
        return { ...s, visual_result: result, pass };
      });
      return { ...g, sessions };
    });
    sf({ ccpGroups: groups });
    setLastActiveSection(4);
  }

  function updateGroupSession(groupIdx: number, sessionIdx: number, patch: Partial<CcpGroupSession>) {
    if (!form) return;
    const groups = form.ccpGroups.map((g, gi) => {
      if (gi !== groupIdx) return g;
      const sessions = g.sessions.map((s, si) => si === sessionIdx ? { ...s, ...patch } : s);
      return { ...g, sessions };
    });
    sf({ ccpGroups: groups });
  }

  function recordGroupSession(groupIdx: number, sessionIdx: number) {
    const now = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    updateGroupSession(groupIdx, sessionIdx, { check_time: now });
  }

  // ── Presentations ────────────────────────────────────────────────────────────

  function togglePresentation(pid: string, checked: boolean) {
    if (!form) return;
    sf({
      presentations: form.presentations.map((p) =>
        p.presentation_id === pid ? { ...p, selected: checked } : p
      ),
    });
  }

  function updateMaterialField(pid: string, mid: string, field: "qty_used" | "supplier" | "lot_number", value: string) {
    if (!form) return;
    sf({
      presentations: form.presentations.map((p) => {
        if (p.presentation_id !== pid) return p;
        return { ...p, materials: p.materials.map((m) => m.id === mid ? { ...m, [field]: value } : m) };
      }),
    });
  }

  // ── Ingredient overrides ─────────────────────────────────────────────────────

  function updateIngField<K extends keyof IngRow>(i: number, field: K, value: IngRow[K]) {
    if (!form) return;
    const a = [...form.ingredients];
    a[i] = { ...a[i], [field]: value };
    sf({ ingredients: a });
    setLastActiveSection(3);
  }

  function activateIngOverride(i: number, type: "qty_per_bowl" | "total_qty") {
    if (!form) return;
    const a = [...form.ingredients];
    const ing = a[i];
    const bn = parseInt(form.bowlsProduced) || 0;
    a[i] = {
      ...ing,
      override_type: type,
      qty_per_bowl_override: type === "qty_per_bowl" ? String(ing.quantity_per_bowl) : "",
      total_qty_override: type === "total_qty"
        ? (bn > 0 ? (ing.quantity_per_bowl * bn).toFixed(3) : "")
        : "",
      override_reason: "",
      override_reason_other: "",
    };
    sf({ ingredients: a });
    setLastActiveSection(3);
  }

  function restoreIngOriginal(i: number) {
    if (!form) return;
    const a = [...form.ingredients];
    a[i] = {
      ...a[i],
      override_type: "none",
      qty_per_bowl_override: "",
      total_qty_override: "",
      override_reason: "",
      override_reason_other: "",
    };
    sf({ ingredients: a });
    setLastActiveSection(3);
  }

  // ── EOP value update ──────────────────────────────────────────────────────────

  function setEopValue(fieldId: string, value: string) {
    if (!form) return;
    sf({ eopValues: { ...form.eopValues, [fieldId]: value } });
    setLastActiveSection(5);
  }

  // ── Allergen helpers ──────────────────────────────────────────────────────────

  function toggleAllergen(name: string) {
    const prev = allergen.previous_product_allergens;
    sa({
      previous_product_allergens: prev.includes(name)
        ? prev.filter((a) => a !== name)
        : [...prev, name],
    });
  }

  function updateSwabField(idx: number, field: keyof Pick<SwabAttempt, "equipment_swabbed" | "initials">, value: string) {
    const attempts = [...allergen.swab_attempts];
    attempts[idx] = { ...attempts[idx], [field]: value };
    sa({ swab_attempts: attempts });
  }

  function selectSwabResult(idx: number, result: "pass" | "fail") {
    const attempts = [...allergen.swab_attempts];
    attempts[idx] = { ...attempts[idx], result };
    sa({ swab_attempts: attempts });
  }

  function recordSwabResult(idx: number) {
    const att = allergen.swab_attempts[idx];
    if (!att.equipment_swabbed.trim() || !att.initials.trim() || att.result === null) return;
    const attempts = [...allergen.swab_attempts];
    attempts[idx] = { ...attempts[idx], time_recorded: captureTimestamp(), locked: true };
    if (att.result === "fail") {
      attempts.push({ equipment_swabbed: "", time_recorded: "", result: null, initials: "", locked: false });
    }
    sa({ swab_attempts: attempts });
  }

  // ── Draft helpers ─────────────────────────────────────────────────────────────

  function buildDraftPayload() {
    if (!form || !selected) return null;
    const lockedAttempts = allergen.swab_attempts
      .filter((a) => a.locked)
      .map((a, i) => ({ attempt_number: i + 1, equipment_swabbed: a.equipment_swabbed, time_recorded: a.time_recorded, result: a.result as "pass" | "fail", initials: a.initials }));
    return {
      templateId:          selected.id,
      templateName:        selected.name,
      productionDate:      form.productionDate,
      productionLot:       form.productionLot || null,
      expirationDate:      form.expirationDate || null,
      expirationDateAuto:  expirationAutoFilled && !expirationManuallyOverridden,
      shelfLifeMonthsUsed: productForSubmission?.shelfLifeMonths ?? null,
      shift:               form.shift,
      supervisorName:      form.supervisorName,
      numEmployees:        form.numEmployees || null,
      section1: { ovens_used: form.ovensUsed, calibration: form.calibration, initials: form.s1Initials },
      section2_allergen: {
        changeover_required:        allergen.changeover_required,
        previous_product_name:      allergen.changeover_required ? allergen.previous_product_name : null,
        previous_product_allergens: allergen.changeover_required ? allergen.previous_product_allergens : null,
        swab_attempts:              allergen.changeover_required ? lockedAttempts : null,
        final_result:               allergen.changeover_required ? (lockedAttempts.some((a) => a.result === "pass") ? "pass" : null) : "not_required",
      },
      section3: {
        bowls_produced: parseInt(form.bowlsProduced) || 0,
        ingredients: form.ingredients.map((ing) => ({
          ...ing,
          use_inventory: ing.use_inventory,
          inventory_lots: ing.inventory_lots,
          lots: ing.is_wip ? [] : ing.inventory_lots.map((l) => ({
            lot_number:             l.lotNumber,
            inventory_lot_id:       l.lotId && l.lotId !== "__other__" ? l.lotId : null,
            supplier_name:          l.supplierName || null,
            supplier_id:            l.supplierId ?? null,
            supplier_source:        l.supplierSource,
            supplier_approval_status: l.supplierApprovalStatus ?? null,
            qty_used_from_this_lot: parseFloat(l.qtyUsed) || 0,
          })),
        })),
        presentations: form.presentations.map((pres) => ({
          presentation_id: pres.presentation_id, presentation_name: pres.presentation_name, selected: pres.selected,
          materials: pres.materials.map((m) => ({
            id: m.id, name: m.name, qty_used: parseFloat(m.qty_used) || 0, food_contact: m.food_contact,
            ...(m.food_contact ? {
              supplier: m.supplier,
              supplier_id: m.supplier_id ?? null,
              supplier_source: m.supplier_is_other ? "other" : (m.supplier_id ? "linked" : "free_text"),
              supplier_approval_status: m.supplier_is_other
                ? (supplierStatuses[m.supplier.trim()]?.status ?? null)
                : (m.supplier_approval_status ?? null),
              lot_number: m.lot_number,
            } : {}),
          })),
        })),
      },
      section4: form.ccpGroups,
      section5: buildSection5Payload(selected, form, productForSubmission?.productPresentations ?? null),
      section6: (() => {
        const items = computeSection6Items(form, allergen, selected);
        const presentItems = items.filter((it) => it.present);
        const allResolved = presentItems.every(
          (it) => it.status === "complete" || it.status === "pass_with_issues"
        );
        const anyIssues = presentItems.some((it) => it.status === "pass_with_issues");
        return {
          items,
          all_present_items_resolved: allResolved,
          release_status: allResolved ? (anyIssues ? "ready_with_issues" : "ready") : "not_ready",
          supervisor_signature: "",
        };
      })(),
      notes: form.notes || null,
      lastActiveSection,
      baseUnitName:       selected.baseUnitName,
      baseUnitIsFinished: selected.baseUnitIsFinished,
    };
  }

  const saveDraft = useCallback(async (silent = false) => {
    if (!silent) setIsSaving(true);
    try {
      const payload = buildDraftPayload();
      if (!payload) return;
      const res = await fetch("/api/batch-sheet/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id: draftId ?? undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!draftId) setDraftId(data.id);
        setLastSavedAt(new Date(data.lastSavedAt));
        if (!silent) {
          setShowSaveToast(true);
          setTimeout(() => setShowSaveToast(false), 4000);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("[saveDraft] API error", res.status, err);
        if (!silent) setSubmitError(`Save failed: ${err.detail ?? err.error ?? res.status}`);
      }
    } catch (e) {
      console.error("[saveDraft] unexpected error", e);
      if (!silent) setSubmitError("Save failed — check your connection and try again.");
    } finally {
      if (!silent) setIsSaving(false);
    }
  }, [form, allergen, selected, draftId, lastActiveSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save every 3 minutes when form has content
  useEffect(() => {
    if (!form || !selected) return;
    const hasContent = !!(form.productionLot || form.s1Initials || form.bowlsProduced || allergen.changeover_required !== null);
    if (!hasContent) return;
    const timer = setInterval(() => { saveDraft(true); }, 3 * 60 * 1000);
    return () => clearInterval(timer);
  }, [saveDraft, form, selected, allergen.changeover_required]);

  // Resume from URL param
  useEffect(() => {
    const resumeId = searchParams.get("resume");
    if (!resumeId || templates.length === 0) return;
    async function tryResume() {
      for (const t of templates) {
        const res = await fetch(`/api/batch-sheet/draft?template_id=${t.id}`);
        if (!res.ok) continue;
        const draft: DraftRecord | null = await res.json();
        if (draft && draft.id === resumeId) {
          // Enrich template with live product presentations (same logic as selectTemplate),
          // so resumed form uses product's canonical presentations — not stale template copies.
          let templateToUse = t;
          let productPresentations: ProductPresentationForSubmission[] | null = null;
          if (t.productId) {
            try {
              const prodRes = await fetch(`/api/products/${t.productId}`);
              if (prodRes.ok) {
                const prod = await prodRes.json() as {
                  id: string;
                  productCode: string | null;
                  shelfLifeMonths: number | null;
                  recipe: Array<{ id: string; materialId?: string; materialName: string; quantity: number; unit: string; materialType?: string; sourceProductId?: string | null }>;
                  presentations: ProductPresentationForSubmission[];
                };
                const mappedPres: Presentation[] = (prod.presentations ?? []).map((pp) => ({
                  presentation_id: pp.id,
                  presentation_name: pp.name,
                  materials: pp.packaging_materials.map((m) => ({
                    id: m.material_id, name: m.material_name, food_contact: m.food_contact,
                  })),
                }));
                templateToUse = {
                  ...t,
                  productCode: prod.productCode,
                  presentations: mappedPres.length > 0 ? mappedPres : t.presentations,
                };
                productPresentations = prod.presentations ?? [];
                setProductForSubmission({
                  id: prod.id,
                  recipe: prod.recipe,
                  shelfLifeMonths: prod.shelfLifeMonths ?? null,
                  productPresentations,
                });
              }
            } catch { /* fall back to template presentations */ }
          }
          const { form: f, allergen: a } = initFormFromDraft(draft, templateToUse, productPresentations);
          setSelected(templateToUse);
          setForm(f);
          setAllergen(a);
          setDraftId(draft.id);
          setLastSavedAt(new Date(draft.lastSavedAt));
          setLastActiveSection(draft.lastActiveSection ?? 1);
          setTimeout(() => {
            document.getElementById(`section-${draft.lastActiveSection ?? 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 400);
          return;
        }
      }
    }
    tryResume();
  }, [searchParams, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill expiration date from production date + product shelf life months
  useEffect(() => {
    if (!form || !selected) return;
    if (!selected.hasExpirationDate) return;
    if (expirationManuallyOverridden) return;
    const slm = productForSubmission?.shelfLifeMonths ?? null;
    if (slm === null) return;
    const prodDate = form.productionDate;
    if (!prodDate) return;
    const d = new Date(prodDate);
    if (isNaN(d.getTime())) return;
    d.setMonth(d.getMonth() + slm);
    const expStr = d.toISOString().slice(0, 10);
    if (form.expirationDate !== expStr) {
      sf({ expirationDate: expStr });
      setExpirationAutoFilled(true);
    }
  }, [form?.productionDate, productForSubmission?.shelfLifeMonths, selected?.hasExpirationDate, expirationManuallyOverridden]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!form || !selected) return;

    // Allergen section must be complete
    if (!isAllergenDone) {
      setSubmitError("Complete the Allergen Changeover section (Section 2) before submitting.");
      return;
    }
    // If changeover required, need at least one PASS
    if (allergen.changeover_required) {
      if (!allergen.previous_product_name.trim()) {
        setSubmitError("Section 2: Previously produced product name is required.");
        return;
      }
      if (allergen.previous_product_allergens.length === 0) {
        setSubmitError("Section 2: Select at least one allergen from the previous product.");
        return;
      }
    }

    if (!sigDataUrl) { setSubmitError("Production Manager signature is required."); return; }

    // Validate ingredient override reasons
    const ingsMissingReason = form.ingredients.filter((ing) => {
      if (ing.override_type === "none") return false;
      if (!ing.override_reason) return true;
      if (ing.override_reason === "Other (explain below)" && !ing.override_reason_other.trim()) return true;
      return false;
    });
    if (ingsMissingReason.length > 0) {
      setSubmitError(`Reason for change is required for modified ingredients: ${ingsMissingReason.map((i) => i.name).join(", ")}.`);
      return;
    }

    // All present section 6 items must be complete or pass_with_issues
    const s6Items = computeSection6Items(form, allergen, selected);
    const pendingItems = s6Items.filter(
      (it) => it.present && it.status !== "complete" && it.status !== "pass_with_issues"
    );
    if (pendingItems.length > 0) {
      setSubmitError(`Complete all sections before submitting. Pending: ${pendingItems.map((it) => it.label).join(", ")}.`);
      return;
    }

    if (selected.ccpRequireTimestamp) {
      const missingTime = form.ccpGroups.some((g) => g.sessions.some((s) => !s.check_time));
      if (missingTime) { setSubmitError("Click 'Record Session' to record the time for all CCP sessions before submitting."); return; }
    }

    // Validate per-presentation unit fields
    if (selected.baseUnitIsFinished) {
      const isSingle = selected.presentations.length === 1;
      for (const pres of selected.presentations) {
        const pu = form.presentationUnits[pres.presentation_id];
        const wasProduced = isSingle ? true : pu?.wasProduced;
        if (wasProduced && !pu?.totalProduced.trim()) {
          setSubmitError(`"${selected.baseUnitName} Produced" is required for ${pres.presentation_name}.`);
          return;
        }
      }
    } else {
      const productPresentationsForValidation = productForSubmission?.productPresentations ?? null;
      for (const pres of selected.presentations) {
        const uc = effectiveUnitConfig(pres, productPresentationsForValidation);
        if (!uc.primary_unit_name) continue;
        const pu = form.presentationUnits[pres.presentation_id];
        if (pu?.wasProduced && !pu.totalProduced.trim()) {
          setSubmitError(`"Total ${uc.primary_unit_name} Produced" is required for ${pres.presentation_name}.`);
          return;
        }
      }
    }

    const missingRequired = selected.endOfProductionFields
      .filter((f) => f.required && !form.eopValues[f.id]?.trim());
    if (missingRequired.length > 0) {
      setSubmitError(`Required fields missing: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }

    // Packaging verification — all four fields must be actively confirmed or flagged
    const missingPkg: string[] = [];
    if (form.pkgLabelChoice === null) missingPkg.push("Product Label");
    if (!form.pkgAllergenConfirmed) missingPkg.push("Allergen Declaration");
    if (form.pkgLotState === null) missingPkg.push("Lot on Package");
    if (selected.hasExpirationDate && form.pkgExpState === null) missingPkg.push("Expiration Date on Package");
    if (missingPkg.length > 0) {
      setSubmitError(`Packaging Verification (Section 5): confirm or flag all fields — ${missingPkg.join(", ")}.`);
      return;
    }
    // Discrepancy text required when flagged
    if (form.pkgLabelChoice === "discrepancy" && !form.pkgLabelDiscrepancy.trim()) {
      setSubmitError("Packaging Verification: enter what the label says when flagging a discrepancy.");
      return;
    }
    if (form.pkgLotState === "discrepancy" && !form.pkgLotDiscrepancy.trim()) {
      setSubmitError("Packaging Verification: enter the lot shown on the package when flagging a discrepancy.");
      return;
    }
    if (selected.hasExpirationDate && form.pkgExpState === "discrepancy" && !form.pkgExpDiscrepancy.trim()) {
      setSubmitError("Packaging Verification: enter the expiration date shown on the package when flagging a discrepancy.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const section5 = buildSection5Payload(selected, form, productForSubmission?.productPresentations ?? null);
      const pkgAllMatch = section5.packaging_verification.all_confirmed;
      let status = computeStatus(form.ccpGroups);
      // Downgrade PASS to PASS_WITH_ISSUES if any packaging field mismatches
      if (status === "PASS" && !pkgAllMatch) status = "PASS_WITH_ISSUES";

      const lockedAttempts = allergen.swab_attempts
        .filter((a) => a.locked)
        .map((a, i) => ({
          attempt_number:   i + 1,
          equipment_swabbed: a.equipment_swabbed,
          time_recorded:    a.time_recorded,
          result:           a.result as "pass" | "fail",
          initials:         a.initials,
        }));

      const section2_allergen = {
        changeover_required:        allergen.changeover_required,
        previous_product_name:      allergen.changeover_required ? allergen.previous_product_name : null,
        previous_product_allergens: allergen.changeover_required ? allergen.previous_product_allergens : null,
        swab_attempts:              allergen.changeover_required ? lockedAttempts : null,
        final_result:               allergen.changeover_required
          ? (lockedAttempts.some((a) => a.result === "pass") ? "pass" : null)
          : "not_required",
      };

      const res = await fetch("/api/batch-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId:          selected.id,
          templateName:        selected.name,
          productId:           productForSubmission?.id ?? null,
          recipeSnapshot:      productForSubmission?.recipe ?? null,
          productionDate:      form.productionDate,
          productionLot:       form.productionLot || null,
          expirationDate:      form.expirationDate || null,
          expirationDateAuto:  expirationAutoFilled && !expirationManuallyOverridden,
          shelfLifeMonthsUsed: productForSubmission?.shelfLifeMonths ?? null,
          shift:               form.shift,
          supervisorName:      form.supervisorName,
          numEmployees:        form.numEmployees || null,
          packagingSnapshot:   productForSubmission?.productPresentations ?? null,
          section1: {
            ovens_used:  form.ovensUsed,
            calibration: form.calibration,
            initials:    form.s1Initials,
          },
          section2_allergen,
          section3: {
            bowls_produced: parseInt(form.bowlsProduced) || 0,
            ingredients: (() => {
              const bn = parseInt(form.bowlsProduced) || 0;
              return form.ingredients.map((ing) => {
                const effectiveQpb = ing.override_type === "qty_per_bowl"
                  ? (parseFloat(ing.qty_per_bowl_override) || ing.quantity_per_bowl)
                  : ing.quantity_per_bowl;
                const totalCalc = bn > 0 ? ing.quantity_per_bowl * bn : null;
                const totalUsed = ing.override_type === "total_qty"
                  ? (parseFloat(ing.total_qty_override) || null)
                  : (bn > 0 ? effectiveQpb * bn : null);
                const supplierSource = ing.supplier_is_other
                  ? "other"
                  : (ing.supplier_id ? "linked" : "free_text");
                const supplierApprovalStatus = ing.supplier_is_other
                  ? (supplierStatuses[ing.supplier.trim()]?.status ?? null)
                  : (ing.supplier_approval_status ?? null);
                return {
                  id:                   ing.id,
                  name:                 ing.name,
                  qty_per_bowl_template: ing.quantity_per_bowl,
                  qty_per_bowl_used:    effectiveQpb,
                  total_qty_calculated: totalCalc,
                  total_qty_used:       totalUsed,
                  unit:                 ing.unit,
                  supplier:             ing.is_wip ? ing.supplier : (ing.inventory_lots[0]?.supplierName ?? ""),
                  supplier_id:          ing.is_wip ? (ing.supplier_id ?? null) : (ing.inventory_lots[0]?.supplierId ?? null),
                  supplier_source:      ing.is_wip ? supplierSource : (ing.inventory_lots[0]?.supplierSource ?? "free_text"),
                  supplier_approval_status: ing.is_wip ? supplierApprovalStatus : (ing.inventory_lots[0]?.supplierApprovalStatus ?? null),
                  lot_number:           ing.is_wip ? ing.lot_number : ing.inventory_lots.map((l) => l.lotNumber).filter(Boolean).join(", "),
                  use_inventory:        ing.use_inventory,
                  inventory_lots:       ing.use_inventory
                    ? ing.inventory_lots.map((l) => ({
                        lot_id:     l.lotId && l.lotId !== "__other__" ? l.lotId : null,
                        lot_number: l.lotNumber,
                        qty_used:   parseFloat(l.qtyUsed) || 0,
                        unit:       l.unit,
                      }))
                    : [],
                  lots: ing.is_wip ? [] : ing.inventory_lots.map((l) => ({
                    lot_number:             l.lotNumber,
                    inventory_lot_id:       l.lotId && l.lotId !== "__other__" ? l.lotId : null,
                    supplier_name:          l.supplierName || null,
                    supplier_id:            l.supplierId ?? null,
                    supplier_source:        l.supplierSource,
                    supplier_approval_status: l.supplierApprovalStatus ?? null,
                    qty_used_from_this_lot: parseFloat(l.qtyUsed) || 0,
                  })),
                  override_type:        ing.override_type,
                  override_reason:      ing.override_type !== "none" ? (ing.override_reason || null) : null,
                  override_reason_other: (ing.override_type !== "none" && ing.override_reason === "Other (explain below)")
                    ? (ing.override_reason_other || null) : null,
                  is_wip:                       ing.is_wip,
                  wip_lot_verified:             ing.is_wip ? (ing.wip_lot_verified ?? null) : null,
                  wip_source_submission_id:     ing.is_wip ? (ing.wip_source_submission_id ?? null) : null,
                };
              });
            })(),
            presentations:  form.presentations.map((pres) => ({
              presentation_id:   pres.presentation_id,
              presentation_name: pres.presentation_name,
              selected:          pres.selected,
              materials:         pres.materials.map((m) => ({
                id:           m.id,
                name:         m.name,
                qty_used:     parseFloat(m.qty_used) || 0,
                food_contact: m.food_contact,
                ...(m.food_contact ? {
                  supplier:                 m.supplier,
                  supplier_id:              m.supplier_id ?? null,
                  supplier_source:          m.supplier_is_other ? "other" : (m.supplier_id ? "linked" : "free_text"),
                  supplier_approval_status: m.supplier_is_other
                    ? (supplierStatuses[m.supplier.trim()]?.status ?? null)
                    : (m.supplier_approval_status ?? null),
                  lot_number:               m.lot_number,
                } : {}),
              })),
            })),
          },
          section4: form.ccpGroups,
          section5,
          section6: (() => {
            const items = computeSection6Items(form, allergen, selected);
            const presentItems = items.filter((it) => it.present);
            const allResolved = presentItems.every(
              (it) => it.status === "complete" || it.status === "pass_with_issues"
            );
            const anyIssues = presentItems.some((it) => it.status === "pass_with_issues");
            return {
              items,
              all_present_items_resolved: allResolved,
              release_status: allResolved
                ? (anyIssues ? "ready_with_issues" : "ready")
                : "not_ready",
              supervisor_signature: sigDataUrl,
            };
          })(),
          notes: form.notes || null,
          status,
          id: draftId ?? undefined,
          baseUnitName:       selected.baseUnitName,
          baseUnitIsFinished: selected.baseUnitIsFinished,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Submit failed");
      setDraftId(null);
      setSigDataUrl("");
      setLastSavedAt(null);
      router.push("/dashboard/supervisor/batch-sheet/records");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Modals (rendered at component top level so they overlay both screens) ──

  const modals = (
    <>
      {/* Draft check loading indicator */}
      {checkingDraft && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg px-6 py-5 shadow-lg flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
            <span className="text-sm font-mono text-gray-600">Checking for saved drafts…</span>
          </div>
        </div>
      )}

      {/* Existing draft found modal */}
      {existingDraft && pendingTemplate && !confirmDiscard && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="font-bold text-gray-900 text-lg font-garamond">Unfinished Batch Sheet Found</h2>
            <p className="text-sm text-gray-600">
              You have an unfinished batch sheet for <span className="font-semibold">{pendingTemplate.name}</span>.
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 font-mono">
              Last saved: {new Date(existingDraft.lastSavedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} at {new Date(existingDraft.lastSavedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={async () => {
                  // If template is linked to a product, fetch product so submission can record snapshot
                  // and override productCode with the live value from the Products registry.
                  let enrichedTemplate = pendingTemplate;
                  let productPresentations: ProductPresentationForSubmission[] | null = null;
                  if (pendingTemplate.productId) {
                    try {
                      const res = await fetch(`/api/products/${pendingTemplate.productId}`);
                      if (res.ok) {
                        const prod = await res.json() as {
                          id: string;
                          productCode: string | null;
                          shelfLifeMonths: number | null;
                          recipe: Array<{ id: string; materialId?: string; materialName: string; quantity: number; unit: string }>;
                          presentations: ProductPresentationForSubmission[];
                        };
                        productPresentations = prod.presentations ?? [];
                        setProductForSubmission({
                          id: prod.id,
                          recipe: prod.recipe,
                          shelfLifeMonths: prod.shelfLifeMonths ?? null,
                          productPresentations,
                        });
                        const draftMappedIngs: IngTpl[] = (prod.recipe ?? []).map((r) => ({
                          id: r.id, materialId: r.materialId, name: r.materialName, quantity_per_bowl: r.quantity, unit: r.unit,
                          materialType: (r as { materialType?: string }).materialType ?? "raw",
                          sourceProductId: (r as { sourceProductId?: string | null }).sourceProductId ?? null,
                        }));
                        const draftMappedPres: Presentation[] = (prod.presentations ?? []).map((pp) => ({
                          presentation_id: pp.id,
                          presentation_name: pp.name,
                          materials: pp.packaging_materials.map((m) => ({
                            id: m.material_id, name: m.material_name, food_contact: m.food_contact,
                          })),
                        }));
                        enrichedTemplate = {
                          ...pendingTemplate,
                          ingredients: draftMappedIngs,
                          productCode: prod.productCode,
                          presentations: draftMappedPres.length > 0 ? draftMappedPres : pendingTemplate.presentations,
                        };
                      }
                    } catch { /* ignore */ }
                  }
                  const { form: f, allergen: a } = initFormFromDraft(existingDraft, enrichedTemplate, productPresentations);
                  setSelected(enrichedTemplate);
                  setForm(f);
                  setAllergen(a);
                  setDraftId(existingDraft.id);
                  setLastSavedAt(new Date(existingDraft.lastSavedAt));
                  setLastActiveSection(existingDraft.lastActiveSection ?? 1);
                  setExistingDraft(null);
                  setPendingTemplate(null);
                  setTimeout(() => {
                    document.getElementById(`section-${existingDraft.lastActiveSection ?? 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 400);
                }}
              >
                Continue Draft
              </button>
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setConfirmDiscard(true)}
              >
                Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm discard modal */}
      {confirmDiscard && existingDraft && pendingTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h2 className="font-bold text-gray-900 font-garamond">Discard Draft?</h2>
            <p className="text-sm text-gray-600">
              Are you sure? Your saved draft will be permanently lost.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="btn-primary flex-1 bg-[#D64D4D] border-[#D64D4D]"
                onClick={async () => {
                  await fetch(`/api/batch-sheet/draft/${existingDraft.id}`, { method: "DELETE" });
                  const t = pendingTemplate;
                  setExistingDraft(null);
                  setPendingTemplate(null);
                  setConfirmDiscard(false);
                  selectTemplate(t);
                }}
              >
                Yes, Discard Draft
              </button>
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setConfirmDiscard(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save toast */}
      {showSaveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-lg shadow-lg">
          Progress saved. You can continue this batch sheet later.
        </div>
      )}
    </>
  );

  // ─── Template selection screen ──────────────────────────────────────────────

  if (!selected || !form) {
    const catOrder: string[] = [];
    const catGroups = new Map<string, Template[]>();
    for (const t of templates) {
      const key = t.category?.trim() || "Other";
      if (!catGroups.has(key)) { catGroups.set(key, []); catOrder.push(key); }
      catGroups.get(key)!.push(t);
    }
    const sortedCats = [
      ...catOrder.filter((k) => k !== "Other"),
      ...catOrder.filter((k) => k === "Other"),
    ];

    return (
      <>
        {modals}
        <div className="max-w-5xl space-y-8">
          <div className="page-header">
            <div>
              <h1 className="page-title">Batch Sheet</h1>
              <p className="page-subtitle">Select a template to begin</p>
            </div>
            <button onClick={() => router.push("/dashboard/supervisor/batch-sheet/records")} type="button" className="btn-secondary">
              View Records
            </button>
          </div>
          {templates.length === 0 && (
            <div className="card p-10 text-center">
              <p className="text-sm text-gray-400 font-mono">No active templates. Ask an admin to create one.</p>
            </div>
          )}
          {sortedCats.map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">{cat}</h2>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catGroups.get(cat)!.map((t) => (
                  <div key={t.id} className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                    <div>
                      <h2 className="font-semibold text-gray-900">{t.name}</h2>
                      {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400 font-mono">
                      <span>{t.ingredients.length} ingredients</span>
                      <span>{t.presentations.length} presentation{t.presentations.length !== 1 ? "s" : ""}</span>
                    </div>
                    <p className="text-[10px] text-gray-300 font-mono">
                      Updated {new Date(t.updatedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} {new Date(t.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </p>
                    <button onClick={() => handleTemplateSelect(t)} className="btn-primary mt-auto">
                      Start Batch Sheet
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // ─── 6-section form ────────────────────────────────────────────────────────

  const sectionHdr = (n: number, title: string) => (
    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2">
        <span className="w-6 h-6 bg-[#D64D4D] text-white rounded-full text-xs flex items-center justify-center font-bold shrink-0">{n}</span>
        {title}
      </h2>
    </div>
  );

  const inp = "input";

  const sortedEopFields = [...selected.endOfProductionFields].sort((a, b) => a.order - b.order);

  // Locked overlay for sections that require allergen section to be complete first
  const lockedOverlay = (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-b-lg">
      <div className="flex items-center gap-2 text-sm text-gray-400 font-mono">
        <Lock className="w-4 h-4" />
        Complete Section 2 — Allergen Changeover to unlock
      </div>
    </div>
  );

  // Last passing swab attempt for current session (shown in green banner)
  const lastPass = allergen.swab_attempts.findLast?.((a) => a.result === "pass" && a.locked)
    ?? allergen.swab_attempts.filter((a) => a.result === "pass" && a.locked).at(-1);

  return (
    <>
      {modals}
      <div className="max-w-5xl space-y-5 pb-10">

        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-3">
            <button onClick={backToTemplates} className="text-gray-400 hover:text-gray-700 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="page-title">{selected.name} — Batch Sheet</h1>
              <p className="page-subtitle">Fill all sections and submit to record</p>
            </div>
          </div>
          <button onClick={() => router.push("/dashboard/supervisor/batch-sheet/records")} type="button" className="btn-secondary">
            View Records
          </button>
        </div>

        {/* ── SECTION 1 — Pre-Production Setup ── */}
        <div id="section-1" className="card">
          {sectionHdr(1, "Pre-Production Setup")}
          <div className="p-6 space-y-5">

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="label">Production Date *</label>
                <DateInput className={inp} value={form.productionDate}
                  onChange={(v) => sf({ productionDate: v })} required />
              </div>
              {/* Production Lot — split UI when template has a productCode */}
              {selected.productCode ? (
                <div>
                  <label className="label">Production Lot *</label>
                  <div className="flex items-center gap-2">
                    {/* Left: read-only product code box */}
                    <div className={cn(inp, "w-24 shrink-0 bg-gray-100 text-gray-500 cursor-not-allowed select-none font-mono text-center")}>
                      {selected.productCode.toUpperCase()}
                    </div>
                    <span className="text-gray-500 font-semibold text-lg select-none">-</span>
                    {/* Right: production number input */}
                    <input
                      type="number"
                      className={cn(inp, "w-32")}
                      min="1"
                      step="1"
                      placeholder="e.g. 501"
                      value={form.productionNumber}
                      onChange={(e) => {
                        const num = e.target.value.replace(/[^0-9]/g, "");
                        const lot = num ? `${selected.productCode!.toUpperCase()}-${num}` : "";
                        sf({ productionNumber: num, productionLot: lot });
                      }}
                    />
                  </div>
                  {form.productionNumber && (
                    <p className="mt-1.5 text-xs font-mono text-gray-500">
                      Lot: <span className="font-semibold text-gray-800">{form.productionLot}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="label">Production Lot</label>
                  {selected.productId && (
                    <p className="text-xs text-amber-600 font-mono mb-1.5">
                      Product code not set — contact admin
                    </p>
                  )}
                  <input className={inp} value={form.productionLot} placeholder="e.g. LOT-001"
                    onChange={(e) => sf({ productionLot: toUpperCaseInput(e.target.value) })} />
                </div>
              )}
              {selected.hasExpirationDate && (
                <div>
                  <label className="label">Expiration Date</label>
                  <DateInput className={inp} value={form.expirationDate}
                    onChange={(v) => {
                      sf({ expirationDate: v });
                      setExpirationManuallyOverridden(true);
                      setExpirationAutoFilled(false);
                    }} />
                  {expirationAutoFilled && !expirationManuallyOverridden && (
                    <p className="text-[10px] text-blue-600 font-mono mt-1">
                      Auto-calculated from shelf life ({productForSubmission?.shelfLifeMonths} months). Tap to override.
                    </p>
                  )}
                  {expirationManuallyOverridden && (
                    <p className="text-[10px] text-amber-600 font-mono mt-1">⚠ Manually overridden</p>
                  )}
                </div>
              )}
              <div>
                <label className="label">Shift *</label>
                <select className={inp} value={form.shift}
                  onChange={(e) => sf({ shift: e.target.value as "AM" | "PM" })}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Supervisor Name *</label>
                <input className={inp} value={form.supervisorName}
                  onChange={(e) => sf({ supervisorName: toUpperCaseInput(e.target.value) })} />
              </div>
              <div>
                <label className="label">Number of Employees</label>
                <input type="number" className={inp} min="1" value={form.numEmployees}
                  onChange={(e) => sf({ numEmployees: e.target.value })} />
              </div>
            </div>

            {selected.ovensAvailable.length > 0 && (
              <div>
                <label className="label">Ovens Used</label>
                <div className="flex flex-wrap gap-3">
                  {selected.ovensAvailable.map((oven) => (
                    <label key={oven} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-brand-600"
                        checked={form.ovensUsed.includes(oven)}
                        onChange={(e) => sf({
                          ovensUsed: e.target.checked
                            ? [...form.ovensUsed, oven]
                            : form.ovensUsed.filter((o) => o !== oven),
                        })} />
                      <span className="text-sm text-gray-700">{oven}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.calibration.length > 0 && (
              <div>
                <label className="label">Scale Calibration</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Weight</th>
                        <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-32">Reading</th>
                        <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-32">Result</th>
                        <th className="text-left py-2 text-xs font-mono text-gray-400 font-normal">Corrective Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {form.calibration.map((row, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-3 font-medium text-gray-700">{row.label}</td>
                          <td className="py-2 pr-3">
                            <input className={inp} value={row.reading} placeholder="e.g. 10.01"
                              onChange={(e) => updateCalibReading(i, e.target.value)} />
                            {row.deviation !== null && (
                              <p className={`text-[10px] font-mono mt-0.5 ${row.pass ? "text-emerald-600" : "text-red-600"}`}>
                                {row.deviation.toFixed(1)}% — {row.pass ? "PASS" : "FAIL"}
                              </p>
                            )}
                          </td>
                          <td className="py-2 pr-3">{passChip(row.pass)}</td>
                          <td className="py-2">
                            {row.pass === false && (
                              <input className={inp} value={row.corrective_action}
                                placeholder="Corrective action taken"
                                onChange={(e) => {
                                  const c = [...form.calibration];
                                  c[i] = { ...c[i], corrective_action: e.target.value };
                                  sf({ calibration: c });
                                }} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <label className="label">Initials</label>
              <input className={`${inp} w-24`} value={form.s1Initials} placeholder="JD"
                onChange={(e) => sf({ s1Initials: e.target.value })} />
            </div>
          </div>
        </div>

        {/* ── SECTION 2 — Allergen Changeover ── */}
        <div id="section-2" className="card">
          {sectionHdr(2, "Allergen Changeover")}
          <div className="p-6 space-y-5">

            {/* Initial question */}
            <div className="space-y-3">
              <p className="text-sm text-gray-800 leading-relaxed">
                Has production of a product containing one or more allergens different from the current product
                been conducted since the last Allergen Changeover Swabbing Procedure?
              </p>

              <div className="flex gap-3">
                <button type="button"
                  onClick={() => { sa({ changeover_required: true }); setLastActiveSection(2); }}
                  className={`px-6 py-2 rounded-md text-sm font-semibold border-2 transition-colors ${
                    allergen.changeover_required === true
                      ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#D64D4D]"
                  }`}>
                  YES
                </button>
                <button type="button"
                  onClick={() => { sa({ changeover_required: false }); setLastActiveSection(2); }}
                  className={`px-6 py-2 rounded-md text-sm font-semibold border-2 transition-colors ${
                    allergen.changeover_required === false
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-emerald-600"
                  }`}>
                  NO
                </button>
              </div>

              {/* Facility allergen info box — always visible */}
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-100">
                <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Allergens managed in this facility: </span>
                  EGG · PEANUT · MILK (Whey, Cheese) · SESAME · TREE NUT (Coconut, Almond)
                </p>
              </div>
            </div>

            {/* NO branch — green confirmation */}
            {allergen.changeover_required === false && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800 font-medium">
                  No allergen changeover required. Proceed to Batch Recipe.
                </p>
              </div>
            )}

            {/* YES branch */}
            {allergen.changeover_required === true && (
              <div className="space-y-5">

                {/* Step 1 — Previous Product */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 font-mono">Step 1 — Previous Product</p>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="label">Name of Previously Produced Product *</label>
                      <input className={inp} value={allergen.previous_product_name}
                        placeholder="e.g. Almond Coconut Bar"
                        onChange={(e) => sa({ previous_product_name: toUpperCaseInput(e.target.value) })} />
                    </div>
                    <div>
                      <label className="label">Allergen(s) Present in That Product * <span className="text-gray-400 font-normal normal-case">(select all that apply)</span></label>
                      <div className="space-y-2 mt-1">
                        {ALLERGEN_LIST.map((name) => (
                          <label key={name} className="flex items-center gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-[#D64D4D]"
                              checked={allergen.previous_product_allergens.includes(name)}
                              onChange={() => toggleAllergen(name)}
                            />
                            <span className="text-sm text-gray-700 group-hover:text-gray-900">{name}</span>
                          </label>
                        ))}
                      </div>
                      {allergen.previous_product_allergens.length > 0 && (
                        <p className="text-xs text-[#D64D4D] font-mono mt-2">
                          Selected: {allergen.previous_product_allergens.join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 2 — Swab Test Instructions (collapsible) */}
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => sa({ instructions_open: !allergen.instructions_open })}
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-700 font-mono">Step 2 — Swab Testing Instructions</p>
                      <p className="text-xs text-amber-600 mt-0.5">How to Perform the Allergen Swab Test</p>
                    </div>
                    {allergen.instructions_open
                      ? <ChevronUp className="w-4 h-4 text-amber-600 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-amber-600 shrink-0" />
                    }
                  </button>
                  {allergen.instructions_open && (
                    <div className="p-5 bg-amber-50/50 border-t border-amber-200">
                      <ol className="space-y-2">
                        {[
                          "Bring test kit to room temperature.",
                          "Swab a 10 × 10 cm area thoroughly.",
                          "Return swab to tube.",
                          "Snap valve and squeeze bulb twice.",
                          "Shake for 5–10 seconds.",
                          "Incubate at 37 °C for 30 minutes.",
                          null, // special case for result
                        ].map((step, i) => {
                          if (step === null) {
                            return (
                              <li key={i} className="flex gap-3 items-start">
                                <span className="text-xs font-bold text-amber-700 font-mono w-4 shrink-0 mt-0.5">{i + 1}.</span>
                                <span className="text-sm text-amber-900">
                                  Read result:
                                  <br />
                                  <span className="inline-flex items-center gap-1 mt-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                                    <span className="font-semibold text-emerald-800">Green = Pass</span>
                                    <span className="text-amber-600 mx-1">—</span>
                                    <span className="text-amber-700">no allergen detected</span>
                                  </span>
                                  <br />
                                  <span className="inline-flex items-center gap-1 mt-0.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                                    <span className="font-semibold text-purple-800">Purple = Fail</span>
                                    <span className="text-amber-600 mx-1">—</span>
                                    <span className="text-amber-700">allergen detected — re-clean and retest</span>
                                  </span>
                                </span>
                              </li>
                            );
                          }
                          return (
                            <li key={i} className="flex gap-3 items-start">
                              <span className="text-xs font-bold text-amber-700 font-mono w-4 shrink-0 mt-0.5">{i + 1}.</span>
                              <span className="text-sm text-amber-900">{step}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>

                {/* Step 3 — Swab Attempt Log */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 font-mono">Step 3 — Swab Attempt Log</p>
                  </div>
                  <div className="p-4 space-y-4">

                    {/* Equipment rotation hint */}
                    {lastSwabEquipment && !lastPass && (
                      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100">
                        <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800">
                          Last changeover swabbing was performed on:{" "}
                          <span className="font-semibold">{lastSwabEquipment}</span>.
                          Please swab a different shared surface this time.
                        </p>
                      </div>
                    )}

                    {/* Swab attempt cards */}
                    {allergen.swab_attempts.map((att, idx) => {
                      const isLocked = att.locked;
                      const canRecord = att.equipment_swabbed.trim() && att.initials.trim() && att.result !== null;
                      const resultIsFail = att.result === "fail" && isLocked;
                      const resultIsPass = att.result === "pass" && isLocked;

                      return (
                        <div key={idx} className={`border rounded-lg overflow-hidden ${
                          resultIsPass ? "border-emerald-200" :
                          resultIsFail ? "border-purple-200" :
                          "border-gray-200"
                        }`}>
                          <div className={`px-4 py-3 border-b flex items-center justify-between ${
                            resultIsPass ? "bg-emerald-50 border-emerald-200" :
                            resultIsFail ? "bg-purple-50 border-purple-200" :
                            "bg-gray-50 border-gray-200"
                          }`}>
                            <span className="text-sm font-semibold text-gray-700">
                              Swab Attempt #{idx + 1}
                            </span>
                            {isLocked && att.time_recorded && (
                              <span className="text-xs text-gray-400 font-mono">{att.time_recorded}</span>
                            )}
                          </div>

                          <div className="p-4 space-y-3">
                            <div>
                              <label className="label">Equipment / Surface Swabbed *</label>
                              {isLocked
                                ? <p className="text-sm text-gray-800 font-medium">{att.equipment_swabbed}</p>
                                : <input className={inp} value={att.equipment_swabbed}
                                    placeholder="e.g. Mixer bowl, conveyor belt, work table"
                                    onChange={(e) => updateSwabField(idx, "equipment_swabbed", toUpperCaseInput(e.target.value))} />
                              }
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="label">Result</label>
                                {isLocked ? (
                                  <span className={`badge font-semibold ${
                                    att.result === "pass"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-purple-100 text-purple-700"
                                  }`}>
                                    {att.result === "pass" ? "✓ PASS" : "✗ FAIL"}
                                  </span>
                                ) : (
                                  <div className="flex gap-2">
                                    <button type="button"
                                      onClick={() => selectSwabResult(idx, "pass")}
                                      className={`px-4 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                                        att.result === "pass"
                                          ? "bg-emerald-600 text-white border-emerald-600"
                                          : "bg-white text-gray-600 border-gray-200 hover:border-emerald-500"
                                      }`}>
                                      ✓ PASS
                                    </button>
                                    <button type="button"
                                      onClick={() => selectSwabResult(idx, "fail")}
                                      className={`px-4 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                                        att.result === "fail"
                                          ? "bg-purple-600 text-white border-purple-600"
                                          : "bg-white text-gray-600 border-gray-200 hover:border-purple-500"
                                      }`}>
                                      ✗ FAIL
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="label">Tested By — Initials *</label>
                                {isLocked
                                  ? <p className="text-sm text-gray-800 font-mono font-semibold">{att.initials}</p>
                                  : <input className={`${inp} w-24`} value={att.initials} placeholder="JD"
                                      onChange={(e) => updateSwabField(idx, "initials", toUpperCaseInput(e.target.value))} />
                                }
                              </div>
                            </div>

                            {!isLocked && (
                              <button type="button"
                                onClick={() => recordSwabResult(idx)}
                                disabled={!canRecord}
                                className={`btn-primary text-xs py-1.5 ${!canRecord ? "opacity-40 cursor-not-allowed" : ""}`}>
                                Record Result
                              </button>
                            )}
                          </div>

                          {/* Result banners */}
                          {resultIsPass && (
                            <div className="mx-4 mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-100 border border-emerald-200">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <p className="text-sm text-emerald-800 font-medium">
                                Swab passed. Area cleared. You may proceed to Batch Recipe.
                              </p>
                            </div>
                          )}
                          {resultIsFail && (
                            <div className="mx-4 mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-50 border border-purple-200">
                              <XCircle className="w-4 h-4 text-purple-600 shrink-0" />
                              <p className="text-sm text-purple-800">
                                Allergen detected. Re-clean the area thoroughly and perform a new swab test before proceeding.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTIONS 3–6 locked until allergen done ── */}

        {/* ── SECTION 3 — Batch Recipe ── */}
        <div id="section-3" className="card relative">
          {!isAllergenDone && lockedOverlay}
          {sectionHdr(3, "Batch Recipe")}
          <div className="p-6 space-y-5">
            <div>
              <label className="label">{selected.baseUnitName} Produced *</label>
              <input type="number" className={`${inp} w-36`} min="1" value={form.bowlsProduced}
                onChange={(e) => { sf({ bowlsProduced: e.target.value }); setLastActiveSection(3); }} placeholder="e.g. 10" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Ingredients</h3>
              {selected?.productId && productForSubmission && (
                <p className="text-xs text-gray-500 mb-2">Recipe: {selected.name}</p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Ingredient", `Qty / ${selected.baseUnitName}`, "Unit", "Total Qty"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.ingredients.map((ing, i) => {
                      const isModified = ing.override_type !== "none";
                      const effectiveQpb = ing.override_type === "qty_per_bowl"
                        ? (parseFloat(ing.qty_per_bowl_override) || ing.quantity_per_bowl)
                        : ing.quantity_per_bowl;
                      const totalStr = ing.override_type === "total_qty"
                        ? (ing.total_qty_override || "—")
                        : (bowlsNum > 0 ? (effectiveQpb * bowlsNum).toFixed(3) : "—");
                      const isOtherReason = ing.override_reason === "Other (explain below)";
                      const missingReason = isModified && !ing.override_reason;
                      return (
                        <React.Fragment key={ing.id}>
                          <tr className={cn(
                            "border-b border-gray-50",
                            isModified ? "bg-amber-50/40" : ""
                          )}>
                            {/* Ingredient name — left amber accent when modified */}
                            <td className={cn(
                              "px-3 py-2 font-medium text-gray-800 whitespace-nowrap",
                              isModified && "border-l-4 border-amber-400"
                            )}>
                              <div className="flex flex-col gap-0.5">
                                {isModified && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded w-fit">Modified</span>
                                )}
                                <span>{ing.name}</span>
                              </div>
                            </td>

                            {/* Qty per Bowl — editable when override_type === "qty_per_bowl" */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              {ing.override_type === "qty_per_bowl" ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    className={cn(inp, "w-20 border-amber-300 bg-amber-50/40")}
                                    step="any"
                                    min="0"
                                    value={ing.qty_per_bowl_override}
                                    onChange={(e) => updateIngField(i, "qty_per_bowl_override", e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => restoreIngOriginal(i)}
                                    className="flex items-center gap-0.5 text-[10px] text-amber-600 hover:text-amber-800 underline whitespace-nowrap"
                                    title="Restore original"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" /> Restore
                                  </button>
                                </div>
                              ) : (
                                <div className="group flex items-center gap-1">
                                  <span className="text-gray-600">{ing.quantity_per_bowl}</span>
                                  <button
                                    type="button"
                                    onClick={() => activateIngOverride(i, "qty_per_bowl")}
                                    className={cn(
                                      "text-gray-300 hover:text-gray-500 transition-colors",
                                      "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                    )}
                                    title={`Override Qty per ${selected.baseUnitName}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Unit */}
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{ing.unit}</td>

                            {/* Total Qty — editable when override_type === "total_qty" */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              {ing.override_type === "total_qty" ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      className={cn(inp, "w-24 border-amber-300 bg-amber-50/40")}
                                      step="any"
                                      min="0"
                                      value={ing.total_qty_override}
                                      onChange={(e) => updateIngField(i, "total_qty_override", e.target.value)}
                                    />
                                    <span className="text-xs text-gray-500">{ing.unit}</span>
                                    <button
                                      type="button"
                                      onClick={() => restoreIngOriginal(i)}
                                      className="flex items-center gap-0.5 text-[10px] text-amber-600 hover:text-amber-800 underline whitespace-nowrap"
                                      title="Restore original"
                                    >
                                      <RotateCcw className="w-2.5 h-2.5" /> Restore
                                    </button>
                                  </div>
                                  {bowlsNum > 0 && (
                                    <p className="text-[10px] text-amber-600">
                                      ⚠ Total set manually — verify vs bowl count
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="group flex items-center gap-1">
                                  <span className="font-semibold text-gray-800">
                                    {totalStr}{bowlsNum > 0 && totalStr !== "—" ? ` ${ing.unit}` : ""}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => activateIngOverride(i, "total_qty")}
                                    className={cn(
                                      "text-gray-300 hover:text-gray-500 transition-colors",
                                      "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                    )}
                                    title="Override Total Qty"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>

                          </tr>

                          {/* Lots section sub-row — always shown below main ingredient row */}
                          <tr className={cn(isModified ? "bg-amber-50/20" : "bg-gray-50/40")}>
                            <td colSpan={4} className={cn("px-3 pt-1.5 pb-3", isModified && "border-l-4 border-amber-400")}>
                              {ing.is_wip ? (
                                <div className="space-y-1 max-w-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">INTERNAL</span>
                                    <span className="text-xs text-gray-500">{ing.supplier || "Julian Bakery"}</span>
                                  </div>
                                  <p className="text-[9px] text-blue-600 font-mono">Production lot (from completed batch sheet)</p>
                                  <input
                                    className={cn(inp, "max-w-[200px]")}
                                    value={ing.lot_number}
                                    placeholder="e.g. PMV-001"
                                    onChange={(e) => updateIngField(i, "lot_number", toUpperCaseInput(e.target.value))}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim();
                                      if (!val) return;
                                      validateWipLot(i, val, ing.sourceProductId ?? "");
                                    }}
                                  />
                                  {ing.wip_validation_state === "checking" && (
                                    <p className="text-[10px] text-gray-400 font-mono">Checking…</p>
                                  )}
                                  {ing.wip_validation_state === "found" && (
                                    <p className="text-[10px] text-emerald-700 font-mono">
                                      ✓ Verified — produced {ing.wip_production_date ?? "—"}, {ing.wip_bowls_produced ?? "?"} bowls
                                    </p>
                                  )}
                                  {ing.wip_validation_state === "not_found" && (
                                    <p className="text-[10px] text-amber-600 font-mono">
                                      ⚠ Lot not found in completed batch sheet records. Verify before release.
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-2 max-w-3xl">
                                  {(() => {
                                    const hasInvLots = ing.materialId ? (availableLots[ing.materialId]?.length ?? 0) > 0 : false;
                                    const lotOptions = ing.materialId ? (availableLots[ing.materialId] ?? []) : [];

                                    function LotDropdown({ li, lot }: { li: number; lot: InventoryLotSelection }) {
                                      return hasInvLots ? (
                                        <>
                                          <select className={cn(inp, "text-xs")} value={lot.lotId}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (val === "__other__") {
                                                patchLot(i, li, { lotId: "__other__", lotNumber: "", supplierName: "", supplierId: null, supplierSource: "other", supplierIsOther: false, supplierApprovalStatus: null });
                                              } else if (val) {
                                                const chosen = lotOptions.find((l) => l.id === val);
                                                if (chosen) patchLot(i, li, { lotId: chosen.id, lotNumber: chosen.lotNumber, maxAvailable: chosen.quantityRemaining, unit: chosen.unit, expirationDate: chosen.expirationDate ?? null, supplierName: chosen.supplierName ?? "", supplierId: chosen.supplierId ?? null, supplierSource: "inventory", supplierIsOther: false, supplierApprovalStatus: null });
                                              } else {
                                                patchLot(i, li, { lotId: "", lotNumber: "", supplierName: "", supplierId: null, supplierSource: "free_text", supplierIsOther: false });
                                              }
                                            }}>
                                            <option value="">Select lot…</option>
                                            {lotOptions.map((l) => (
                                              <option key={l.id} value={l.id}>
                                                {l.lotNumber} — {l.supplierName || "?"} ({l.quantityRemaining} {l.unit}{l.expirationDate ? ` · exp ${l.expirationDate.split("T")[0]}` : ""})
                                              </option>
                                            ))}
                                            <option value="__other__">Other lot…</option>
                                          </select>
                                          {lot.lotId === "__other__" && (
                                            <input className={cn(inp, "text-xs mt-1")} placeholder="Enter lot #" value={lot.lotNumber}
                                              onChange={(e) => patchLot(i, li, { lotNumber: toUpperCaseInput(e.target.value) })} />
                                          )}
                                        </>
                                      ) : (
                                        <input className={cn(inp, "text-xs")} placeholder="Lot #" value={lot.lotNumber}
                                          onChange={(e) => patchLot(i, li, { lotNumber: toUpperCaseInput(e.target.value) })} />
                                      );
                                    }

                                    function LotSupplier({ li, lot }: { li: number; lot: InventoryLotSelection }) {
                                      const isInvLot = !!lot.lotId && lot.lotId !== "__other__";
                                      return isInvLot ? (
                                        <div className="px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded text-gray-600 truncate">
                                          {lot.supplierName || "—"}
                                        </div>
                                      ) : (
                                        <SupplierSelect
                                          ing={{ ...ing, supplier: lot.supplierName, supplier_id: lot.supplierId, supplier_is_other: lot.supplierIsOther, supplier_approval_status: lot.supplierApprovalStatus }}
                                          idx={i}
                                          linkedSuppliers={ing.materialId ? (materialSuppliers[ing.materialId] ?? null) : null}
                                          allSuppliers={allSuppliers}
                                          supplierStatuses={supplierStatuses}
                                          onSelectLinked={(_, s) => {
                                            patchLot(i, li, { supplierName: s.name, supplierId: s.id, supplierIsOther: false, supplierApprovalStatus: s.status, supplierSource: "linked" });
                                            setSupplierStatuses((prev) => ({ ...prev, [s.name]: { status: s.status, found: true } }));
                                          }}
                                          onSelectOther={(_) => patchLot(i, li, { supplierName: "", supplierId: null, supplierIsOther: true, supplierApprovalStatus: null, supplierSource: "other" })}
                                          onFreeTextChange={(_, value) => patchLot(i, li, { supplierName: value, supplierSource: "free_text" })}
                                          onFreeTextBlur={(_, value) => checkSupplierStatus(value)}
                                        />
                                      );
                                    }

                                    if (ing.inventory_lots.length === 1) {
                                      const lot = ing.inventory_lots[0];
                                      return (
                                        <>
                                          {ing.materialId && availableLots[ing.materialId] !== undefined && !hasInvLots && (
                                            <p className="text-[10px] text-gray-400 font-mono italic">No inventory lots on file — enter manually.</p>
                                          )}
                                          <div className="flex items-start gap-x-3 flex-wrap">
                                            <span className="text-[10px] text-gray-400 font-mono w-14 shrink-0 pt-1.5">Lot:</span>
                                            <div className="flex-1 min-w-[160px]"><LotDropdown li={0} lot={lot} /></div>
                                          </div>
                                          <div className="flex items-start gap-x-3 flex-wrap">
                                            <span className="text-[10px] text-gray-400 font-mono w-14 shrink-0 pt-1.5">Supplier:</span>
                                            <div className="flex-1 min-w-[160px]"><LotSupplier li={0} lot={lot} /></div>
                                          </div>
                                          <div className="flex items-center gap-x-3 flex-wrap">
                                            <span className="text-[10px] text-gray-400 font-mono w-14 shrink-0">Qty Used:</span>
                                            <div className="flex items-center gap-1">
                                              <input type="number" min="0" step="any" className={cn(inp, "w-24 text-xs")} placeholder="Qty" value={lot.qtyUsed}
                                                onChange={(e) => handleLotQtyChange(i, 0, e.target.value)} />
                                              <span className="text-[11px] text-gray-400">{ing.unit}</span>
                                            </div>
                                            <button type="button" className="text-[11px] text-gray-400 hover:text-gray-600 font-mono ml-1"
                                              onClick={() => addSplitLot(i)}>+ Split lot</button>
                                          </div>
                                        </>
                                      );
                                    }

                                    // Multi-lot split layout
                                    const splitExpected = ing.override_type === "total_qty"
                                      ? (parseFloat(ing.total_qty_override) || null)
                                      : (bowlsNum > 0 ? effectiveQpb * bowlsNum : null);
                                    const totalUsed = ing.inventory_lots.reduce((s, l) => s + (parseFloat(l.qtyUsed) || 0), 0);
                                    const isMatch = splitExpected !== null && Math.abs(totalUsed - splitExpected) < 0.001;
                                    return (
                                      <>
                                        {ing.inventory_lots.map((lot, li) => {
                                          const isLastLot = li === ing.inventory_lots.length - 1;
                                          const isRemainderLot = isLastLot && ing.inventory_lots.length > 2;
                                          return (
                                            <div key={li} className="space-y-1">
                                              <div className="flex items-start gap-2 flex-wrap">
                                                <span className="text-[10px] text-gray-400 font-mono w-10 shrink-0 pt-1.5">Lot {li + 1}</span>
                                                <div className="flex flex-col gap-1 min-w-[140px] flex-1">
                                                  <LotDropdown li={li} lot={lot} />
                                                </div>
                                                <div className="flex-1 min-w-[120px]">
                                                  <LotSupplier li={li} lot={lot} />
                                                </div>
                                                {li > 0 && (
                                                  <button type="button" className="text-gray-300 hover:text-red-500 transition-colors mt-1.5 shrink-0"
                                                    onClick={() => deleteLot(i, li)}>✕</button>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 pl-12">
                                                <span className="text-[10px] text-gray-400 font-mono">Qty:</span>
                                                <input type="number" min="0" step="any"
                                                  className={cn(inp, "w-24 text-xs", isRemainderLot ? "bg-gray-50 text-gray-500" : "")}
                                                  readOnly={isRemainderLot}
                                                  placeholder="Qty" value={lot.qtyUsed}
                                                  onChange={(e) => handleLotQtyChange(i, li, e.target.value)} />
                                                <span className="text-[11px] text-gray-400">{ing.unit}</span>
                                                {isRemainderLot && <span className="text-[10px] text-gray-400 font-mono italic">remainder</span>}
                                              </div>
                                            </div>
                                          );
                                        })}
                                        <div className="flex items-center justify-between pt-1">
                                          <button type="button" className="text-[11px] text-gray-400 hover:text-gray-600 font-mono"
                                            onClick={() => addSplitLot(i)}>+ Split lot</button>
                                          {(totalUsed > 0 || splitExpected !== null) && (
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[10px] text-gray-400 font-mono">Total:</span>
                                              <span className={cn("text-xs font-mono font-semibold", isMatch ? "text-emerald-700" : "text-amber-600")}>
                                                {totalUsed.toFixed(3)} {ing.unit}
                                              </span>
                                              {splitExpected !== null && (isMatch
                                                ? <span className="text-[10px] text-emerald-600">✓</span>
                                                : <span className="text-[10px] text-amber-600">⚠ expected {splitExpected.toFixed(3)}</span>)}
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Override reason row */}
                          {isModified && (
                            <tr className={cn("border-b border-amber-100 bg-amber-50/20")}>
                              <td colSpan={4} className="px-3 pb-3 pt-1 border-l-4 border-amber-400">
                                <div className="space-y-2 max-w-md">
                                  <label className="text-xs font-semibold text-amber-800">
                                    Reason for change <span className="text-red-500">*</span>
                                  </label>
                                  <select
                                    className={cn(inp, "text-xs", missingReason && "border-red-300")}
                                    value={ing.override_reason}
                                    onChange={(e) => {
                                      const newReason = e.target.value;
                                      if (!form) return;
                                      const a = [...form.ingredients];
                                      a[i] = {
                                        ...a[i],
                                        override_reason: newReason,
                                        override_reason_other: newReason !== "Other (explain below)" ? "" : a[i].override_reason_other,
                                      };
                                      sf({ ingredients: a });
                                      setLastActiveSection(3);
                                    }}
                                  >
                                    <option value="">— Select reason —</option>
                                    {OVERRIDE_REASONS.map((r) => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                  {isOtherReason && (
                                    <input
                                      className={cn(inp, "text-xs")}
                                      placeholder="Describe the reason for this change…"
                                      value={ing.override_reason_other}
                                      onChange={(e) => updateIngField(i, "override_reason_other", e.target.value)}
                                    />
                                  )}
                                  {missingReason && (
                                    <p className="text-[10px] text-red-600">Reason for change is required for modified ingredients.</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Recipe Deviations Summary */}
              {(() => {
                const deviations = form.ingredients.filter((ing) => ing.override_type !== "none");
                if (deviations.length === 0) return null;
                return (
                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200 bg-amber-100/60">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">⚠ Recipe Deviations This Batch</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-amber-100/40 border-b border-amber-200">
                            {["Ingredient", `Orig Qty/${selected.baseUnitName}`, `Used Qty/${selected.baseUnitName}`, "Orig Total", "Used Total", "Reason"].map((h) => (
                              <th key={h} className="text-left px-3 py-2 font-semibold text-amber-800 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {deviations.map((ing) => {
                            const effectiveQpb = ing.override_type === "qty_per_bowl"
                              ? (parseFloat(ing.qty_per_bowl_override) || ing.quantity_per_bowl)
                              : ing.quantity_per_bowl;
                            const origTotal = bowlsNum > 0 ? (ing.quantity_per_bowl * bowlsNum).toFixed(3) : "—";
                            const usedTotal = ing.override_type === "total_qty"
                              ? (ing.total_qty_override || "—")
                              : (bowlsNum > 0 ? (effectiveQpb * bowlsNum).toFixed(3) : "—");
                            const reasonLabel = ing.override_reason === "Other (explain below)"
                              ? (ing.override_reason_other || "Other")
                              : (ing.override_reason || "—");
                            return (
                              <tr key={ing.id} className="border-b border-amber-100 last:border-0">
                                <td className="px-3 py-2 font-medium text-gray-800">{ing.name}</td>
                                <td className="px-3 py-2 text-gray-600">{ing.quantity_per_bowl} {ing.unit}</td>
                                <td className="px-3 py-2 font-semibold text-amber-800">{effectiveQpb} {ing.unit}</td>
                                <td className="px-3 py-2 text-gray-600">{origTotal !== "—" ? `${origTotal} ${ing.unit}` : "—"}</td>
                                <td className="px-3 py-2 font-semibold text-amber-800">{usedTotal !== "—" ? `${usedTotal} ${ing.unit}` : "—"}</td>
                                <td className="px-3 py-2 text-gray-600 max-w-[200px]">{reasonLabel}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {(() => {
              // Prefer product presentations (from linked product) over template presentations
              const prodPres = productForSubmission?.productPresentations ?? [];
              const useProductPres = prodPres.length > 0;

              // Build a merged list: for each product presentation, find or create a form.presentations entry
              const presSource = useProductPres
                ? prodPres.map((pp) => {
                    const existing = form.presentations.find((p) => p.presentation_id === pp.id);
                    return {
                      presentation_id: pp.id,
                      presentation_name: pp.name,
                      upc: pp.upc,
                      selected: existing?.selected ?? true,
                      materials: pp.packaging_materials.map((mat) => {
                        const existingMat = existing?.materials.find((m) => m.id === mat.id || m.id === mat.material_id);
                        return {
                          id: mat.material_id,
                          name: mat.material_name,
                          food_contact: mat.food_contact,
                          qty_used:   existingMat?.qty_used   ?? "",
                          supplier:   existingMat?.supplier   ?? "",
                          lot_number: existingMat?.lot_number ?? "",
                          supplier_id:             existingMat?.supplier_id             ?? null,
                          supplier_is_other:       existingMat?.supplier_is_other       ?? false,
                          supplier_approval_status: existingMat?.supplier_approval_status ?? null,
                          supplier_source:         existingMat?.supplier_source         ?? ("free_text" as const),
                        };
                      }),
                    };
                  })
                : form.presentations.map((p) => ({ ...p, upc: "" }));

              if (presSource.length === 0) return null;

              return (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Packaging Materials</h3>
                  {useProductPres && (
                    <p className="text-xs text-blue-600 font-mono mb-3">Presentations sourced from linked product.</p>
                  )}
                  <div className="space-y-4">
                    {presSource.map((pres) => (
                      <div key={pres.presentation_id}
                        className={`border rounded-lg overflow-hidden ${pres.selected ? "border-emerald-200 bg-emerald-50/20" : "border-gray-200 bg-gray-50/30 opacity-70"}`}>
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white/60">
                          <input type="checkbox" className="w-4 h-4 accent-emerald-600"
                            checked={pres.selected}
                            onChange={(e) => togglePresentation(pres.presentation_id, e.target.checked)} />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm text-gray-800">{pres.presentation_name}</span>
                            {pres.upc && (
                              <span className="ml-2 text-xs text-gray-400 font-mono">UPC: {pres.upc}</span>
                            )}
                          </div>
                          {pres.selected
                            ? <span className="badge bg-emerald-100 text-emerald-700 text-[10px] ml-1">Selected</span>
                            : <span className="text-xs text-gray-400 font-mono ml-1">{pres.materials.length} material{pres.materials.length !== 1 ? "s" : ""} (not used)</span>
                          }
                        </div>
                        {pres.selected && pres.materials.length > 0 && (
                          <div className="p-4 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                  {["Material", "Qty Used", "Food Contact", "Supplier", "Lot #"].map((h) => (
                                    <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {pres.materials.map((mat) => (
                                  <tr key={mat.id} className={mat.food_contact ? "bg-emerald-50/30" : ""}>
                                    <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{mat.name}</td>
                                    <td className="px-3 py-2 w-28">
                                      <input type="number" className={inp} min="0" step="0.01" placeholder="Enter qty" value={mat.qty_used}
                                        onChange={(e) => updateMaterialField(pres.presentation_id, mat.id, "qty_used", e.target.value)} />
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      {mat.food_contact
                                        ? <span className="badge bg-emerald-100 text-emerald-700 text-xs font-medium">Food Contact</span>
                                        : <span className="badge bg-gray-100 text-gray-500 text-xs font-medium">Non-Food Contact</span>
                                      }
                                    </td>
                                    <td className="px-3 py-2">
                                      {mat.food_contact
                                        ? <PackagingSupplierSelect
                                            mat={mat as MaterialState}
                                            presId={pres.presentation_id}
                                            linkedSuppliers={materialSuppliers[mat.id] ?? null}
                                            allSuppliers={allSuppliers}
                                            supplierStatuses={supplierStatuses}
                                            onSelectLinked={(pid, mid, supplier) => patchMaterial(pid, mid, {
                                              supplier: supplier.name,
                                              supplier_id: supplier.id,
                                              supplier_is_other: false,
                                              supplier_approval_status: supplier.status,
                                              supplier_source: "linked",
                                            })}
                                            onSelectOther={(pid, mid) => patchMaterial(pid, mid, {
                                              supplier: "",
                                              supplier_id: null,
                                              supplier_is_other: true,
                                              supplier_approval_status: null,
                                              supplier_source: "other",
                                            })}
                                            onFreeTextChange={(pid, mid, value) => patchMaterial(pid, mid, { supplier: value })}
                                            onFreeTextBlur={(_pid, _mid, value) => checkSupplierStatus(value)}
                                          />
                                        : <span className="text-gray-300 text-xs">—</span>
                                      }
                                    </td>
                                    <td className="px-3 py-2">
                                      {mat.food_contact
                                        ? <input className={inp} value={mat.lot_number} placeholder="Lot #"
                                            onChange={(e) => updateMaterialField(pres.presentation_id, mat.id, "lot_number", toUpperCaseInput(e.target.value))} />
                                        : <span className="text-gray-300 text-xs">—</span>
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── SECTION 4 — CCP Monitoring ── */}
        <div id="section-4" className="card relative">
          {!isAllergenDone && lockedOverlay}
          {sectionHdr(4, "CCP Monitoring")}
          <div className="p-6 space-y-5">
            {form.ccpGroups.length === 0 && (
              <p className="text-xs text-gray-400 font-mono">No CCP checks configured for this template.</p>
            )}
            {form.ccpGroups.map((group, groupIdx) => (
              <div key={group.check_id} className="space-y-3">
                {/* Group header */}
                <div className="flex items-center gap-2 pt-2 first:pt-0 border-t border-gray-100 first:border-0">
                  <h3 className="text-sm font-semibold text-gray-800">{group.check_name}</h3>
                  <span className="text-xs text-gray-400 font-mono">— {group.num_sessions} Session{group.num_sessions !== 1 ? "s" : ""}</span>
                </div>
                {/* Session cards for this check type */}
                {group.sessions.map((session, sessionIdx) => (
                  <div key={sessionIdx} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Session header */}
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-700">
                        Session {session.session_number}
                        {session.check_time && (
                          <span className="ml-2 text-xs font-normal text-gray-500 font-mono">— Recorded at {session.check_time}</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {session.pass === false && <span className="badge bg-red-100 text-red-700 text-[10px]">Issue</span>}
                        {session.pass === true && <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">Pass</span>}
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Readings / visual */}
                      {(group.check_type === "temperature" || group.check_type === "weight" || group.check_type === "custom") && (
                        <>
                          <div className="flex flex-wrap items-center gap-3">
                            {session.readings.map((reading, ri) => (
                              <div key={ri} className="flex items-center gap-2">
                                <label className="text-xs text-gray-500">
                                  {group.check_type === "weight" ? `Weight ${ri + 1}` : `Reading ${ri + 1}`}
                                  {group.unit ? ` (${group.unit})` : ""}
                                </label>
                                <input
                                  type={group.check_type === "custom" ? "text" : "number"}
                                  className={`${inp} w-28`}
                                  step={group.check_type === "temperature" ? "0.1" : "0.01"}
                                  value={reading}
                                  placeholder={group.unit ?? ""}
                                  onChange={(e) => updateGroupReading(groupIdx, sessionIdx, ri, e.target.value)}
                                />
                              </div>
                            ))}
                            {group.check_type !== "custom" && passChip(session.pass)}
                          </div>
                          {/* Range hint */}
                          {(() => {
                            const tpl = selected.ccpChecks.find((c) => c.id === group.check_id);
                            if (!tpl) return null;
                            if (group.check_type === "temperature" && tpl.min_value !== null)
                              return <p className="text-[10px] text-gray-400 font-mono mt-1">Min: {tpl.min_value}{group.unit}</p>;
                            if (group.check_type === "weight")
                              return <p className="text-[10px] text-gray-400 font-mono mt-1">Range: {tpl.min_value ?? "—"}–{tpl.max_value ?? "—"} {group.unit}</p>;
                            return null;
                          })()}
                          {session.pass === false && (
                            <div className="mt-2">
                              <input className={inp} value={session.corrective_action}
                                placeholder="Corrective action taken"
                                onChange={(e) => updateGroupSession(groupIdx, sessionIdx, { corrective_action: e.target.value })} />
                              {!session.corrective_action && (
                                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Corrective action required
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {group.check_type === "visual" && (
                        <>
                          <div className="flex gap-2">
                            <button type="button"
                              onClick={() => updateGroupVisual(groupIdx, sessionIdx, "pass")}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${session.visual_result === "pass" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                              ✓ Pass
                            </button>
                            <button type="button"
                              onClick={() => updateGroupVisual(groupIdx, sessionIdx, "issue")}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${session.visual_result === "issue" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-200 hover:border-red-400"}`}>
                              ⚠ Issue Found
                            </button>
                            {passChip(session.pass)}
                          </div>
                          {session.visual_result === "issue" && (
                            <input className={inp} value={session.visual_notes}
                              placeholder="Describe findings and corrective action"
                              onChange={(e) => updateGroupSession(groupIdx, sessionIdx, { visual_notes: e.target.value })} />
                          )}
                        </>
                      )}
                      {/* Initials + Record Session button */}
                      <div className="flex items-end gap-3">
                        <div>
                          <label className="label">Initials</label>
                          <input className={`${inp} w-20`} value={session.initials} placeholder="JD"
                            onChange={(e) => updateGroupSession(groupIdx, sessionIdx, { initials: toUpperCaseInput(e.target.value) })} />
                        </div>
                        {selected.ccpRequireTimestamp && !session.check_time && (
                          <button type="button"
                            onClick={() => recordGroupSession(groupIdx, sessionIdx)}
                            className="px-3 py-2 rounded-md text-xs font-medium bg-[#D64D4D] text-white hover:bg-[#c04040] transition-colors">
                            Record Session
                          </button>
                        )}
                        {selected.ccpRequireTimestamp && session.check_time && (
                          <span className="text-xs text-gray-500 font-mono pb-2">Recorded at {session.check_time}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 5 — End of Production Summary ── */}
        <div id="section-5" className="card relative">
          {!isAllergenDone && lockedOverlay}
          {sectionHdr(5, "End of Production Summary")}
          <div className="p-6 space-y-5">
            {/* ── Per-Presentation Unit Production Blocks ── */}
            {(() => {
              // Unit config is sourced from the linked Product's presentations (matched by id) —
              // the single source of truth. Without a linked product, fall back to legacy
              // unit config baked into the template's presentations.
              const productPresentations = productForSubmission?.productPresentations ?? null;
              const useProductPres = (productPresentations?.length ?? 0) > 0;

              // ── Finished Unit mode: the base unit count IS the finished unit count — no yield calc ──
              if (selected.baseUnitIsFinished) {
                const presSource = selected.presentations;
                if (presSource.length === 0) return null;
                const isSingle = presSource.length === 1;
                const prodPresMap = new Map((productPresentations ?? []).map((pp) => [pp.id, pp.upc]));

                return (
                  <div className="space-y-3">
                    {useProductPres && (
                      <p className="text-xs text-blue-600 font-mono">Presentations sourced from linked product.</p>
                    )}
                    {presSource.map((pres) => {
                      const pu = form.presentationUnits[pres.presentation_id] ?? { wasProduced: false, totalProduced: "", extraInternal: "" };
                      const upc = prodPresMap.get(pres.presentation_id) ?? "";
                      const wasProduced = isSingle ? true : pu.wasProduced;

                      return (
                        <div key={pres.presentation_id} className={`rounded-lg border p-4 space-y-4 ${wasProduced ? "border-amber-200 bg-amber-50/60" : "border-gray-200 bg-gray-50/40 opacity-70"}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{pres.presentation_name}</p>
                              {upc && <p className="text-[10px] text-gray-500 font-mono mt-0.5">UPC: {upc}</p>}
                            </div>
                            {!isSingle && (
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 accent-[#D64D4D]"
                                  checked={pu.wasProduced}
                                  onChange={(e) => {
                                    const pid = pres.presentation_id;
                                    sf({ presentationUnits: { ...form.presentationUnits, [pid]: { ...pu, wasProduced: e.target.checked } } });
                                  }}
                                />
                                <span className="text-sm text-gray-700">Produced today</span>
                              </label>
                            )}
                          </div>

                          {wasProduced && (
                            <div>
                              <label className="label">
                                {isSingle
                                  ? `${selected.baseUnitName} Produced`
                                  : `${selected.baseUnitName}s Produced — ${pres.presentation_name}`}
                                <span className="text-[#D64D4D] ml-0.5">*</span>
                              </label>
                              <input
                                type="number"
                                className={`${inp} w-48`}
                                step="any"
                                min="0"
                                placeholder="e.g. 120"
                                value={pu.totalProduced}
                                onChange={(e) => {
                                  const pid = pres.presentation_id;
                                  sf({ presentationUnits: { ...form.presentationUnits, [pid]: { ...pu, totalProduced: e.target.value, wasProduced: true } } });
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-gray-400 font-mono italic">
                      Each {selected.baseUnitName} is the finished unit — no yield calculation applied.
                    </p>
                  </div>
                );
              }

              // ── Production Vessel mode (default) — yield is calculated per base unit ──
              const presentationsWithUnits = selected.presentations.filter(
                (p) => effectiveUnitConfig(p, productPresentations).primary_unit_name
              );
              const presSource = useProductPres ? selected.presentations : presentationsWithUnits;

              if (presSource.length === 0) return null;

              // Yield: only count unit-tracked presentations that were produced
              const producedCount = presentationsWithUnits.filter(
                (p) => form.presentationUnits[p.presentation_id]?.wasProduced
              ).length;
              const showYield = producedCount === 1;

              // UPC: product presentation IDs now match selected.presentations IDs (after product fix)
              const prodPresMap = new Map(
                (productPresentations ?? []).map((pp) => [pp.id, pp.upc])
              );

              return (
                <div className="space-y-3">
                  {useProductPres && (
                    <p className="text-xs text-blue-600 font-mono">Presentations sourced from linked product.</p>
                  )}
                  {presSource.map((pres) => {
                    const uc = effectiveUnitConfig(pres, productPresentations);
                    const pu = form.presentationUnits[pres.presentation_id] ?? { wasProduced: false, totalProduced: "", extraInternal: "" };
                    const primaryLabel = uc.primary_unit_name;
                    const internalLabel = uc.internal_unit_name;
                    const ratio = uc.internal_units_per_primary;
                    const upc = prodPresMap.get(pres.presentation_id) ?? "";
                    const yieldVal = (pu.wasProduced && showYield && primaryLabel)
                      ? computeYieldPerBowl(
                          pu.totalProduced, pu.extraInternal, form.bowlsProduced,
                          uc.has_internal_units, uc.internal_units_per_primary
                        )
                      : null;

                    return (
                      <div key={pres.presentation_id} className={`rounded-lg border p-4 space-y-4 ${pu.wasProduced ? "border-amber-200 bg-amber-50/60" : "border-gray-200 bg-gray-50/40 opacity-70"}`}>
                        {/* Header: presentation name + UPC + produced-today toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{pres.presentation_name}</p>
                            {upc && <p className="text-[10px] text-gray-500 font-mono mt-0.5">UPC: {upc}</p>}
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-[#D64D4D]"
                              checked={pu.wasProduced}
                              onChange={(e) => {
                                const pid = pres.presentation_id;
                                sf({
                                  presentationUnits: {
                                    ...form.presentationUnits,
                                    [pid]: { ...pu, wasProduced: e.target.checked },
                                  },
                                });
                              }}
                            />
                            <span className="text-sm text-gray-700">Produced today</span>
                          </label>
                        </div>

                        {pu.wasProduced && (
                          primaryLabel ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Total Primary Units */}
                              <div>
                                <label className="label">
                                  Total {primaryLabel} Produced <span className="text-[#D64D4D] ml-0.5">*</span>
                                </label>
                                <input
                                  type="number"
                                  className={inp}
                                  step="any"
                                  min="0"
                                  placeholder="e.g. 120"
                                  value={pu.totalProduced}
                                  onChange={(e) => {
                                    const pid = pres.presentation_id;
                                    sf({ presentationUnits: { ...form.presentationUnits, [pid]: { ...pu, totalProduced: e.target.value } } });
                                  }}
                                />
                              </div>

                              {/* Extra Internal Units (only when has_internal_units) */}
                              {uc.has_internal_units && internalLabel && (
                                <div>
                                  <label className="label">
                                    Extra {internalLabel} Produced
                                    {ratio && (
                                      <span className="ml-1 text-[10px] text-gray-400 font-normal normal-case">
                                        (1 {primaryLabel} = {ratio} {internalLabel})
                                      </span>
                                    )}
                                  </label>
                                  <input
                                    type="number"
                                    className={inp}
                                    step="any"
                                    min="0"
                                    placeholder="e.g. 5"
                                    value={pu.extraInternal}
                                    onChange={(e) => {
                                      const pid = pres.presentation_id;
                                      sf({ presentationUnits: { ...form.presentationUnits, [pid]: { ...pu, extraInternal: e.target.value } } });
                                    }}
                                  />
                                </div>
                              )}

                              {/* Yield per [base unit] — shown only when exactly one presentation is produced */}
                              {showYield && (
                                <div>
                                  <label className="label">Yield per {selected.baseUnitName}</label>
                                  <div className={`rounded-md border px-3 py-2 text-sm font-mono ${
                                    yieldVal !== null
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                      : "border-gray-200 bg-gray-50 text-gray-400"
                                  }`}>
                                    {yieldVal !== null
                                      ? `${yieldVal % 1 === 0 ? yieldVal.toFixed(0) : yieldVal.toFixed(2)} ${primaryLabel} per ${selected.baseUnitName}`
                                      : "—"}
                                  </div>
                                  {uc.has_internal_units && yieldVal !== null && ratio && internalLabel && (
                                    <p className="mt-1 text-[10px] text-gray-400">
                                      ≈ {(yieldVal * ratio % 1 === 0 ? (yieldVal * ratio).toFixed(0) : (yieldVal * ratio).toFixed(1))} {internalLabel} per {selected.baseUnitName}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-amber-600 font-mono">
                              Unit configuration not set — admin must add Primary Unit Name to this presentation in the Products registry.
                            </p>
                          )
                        )}
                      </div>
                    );
                  })}
                  {producedCount > 1 && (
                    <p className="text-[11px] text-gray-400 font-mono">
                      Yield per {selected.baseUnitName} is not shown when multiple presentations are produced simultaneously.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* ── Packaging Verification Block ── */}
            {(() => {
              const pkgV = computePkgVerification(form, selected);
              const expectedAllergenLabel = selected.declaredAllergens.length === 0
                ? "None"
                : selected.declaredAllergens.join(", ");

              // Derived: any field actively flagged (supervisor chose "discrepancy")
              const anyFlagged =
                form.pkgLabelChoice === "discrepancy" ||
                form.pkgLotState === "discrepancy" ||
                (selected.hasExpirationDate && form.pkgExpState === "discrepancy") ||
                (form.pkgAllergenConfirmed && !pkgV.allergens.match);

              // Banner visible once at least one field has been interacted with
              const anyInteracted =
                form.pkgLabelChoice !== null ||
                form.pkgAllergenConfirmed ||
                form.pkgLotState !== null ||
                (selected.hasExpirationDate ? form.pkgExpState !== null : false);

              // Allergen mismatch (for the not-yet-confirmed warning)
              const allergenEdited = form.pkgAllergenEdited;
              const allergenEditedLabel = allergenEdited.length === 0 || allergenEdited.includes("None")
                ? "None"
                : allergenEdited.join(", ");
              const allergenMismatch = form.pkgAllergenConfirmed
                ? false
                : (() => {
                    const exp = [...selected.declaredAllergens].sort();
                    const ent = allergenEdited.includes("None") ? [] : [...allergenEdited].sort();
                    return ent.length !== exp.length || ent.some((v, i) => v !== exp[i]);
                  })();

              function PkgConfirmButtons({
                state, onConfirm, onFlag,
              }: { state: "confirmed" | "discrepancy" | null; onConfirm: () => void; onFlag: () => void }) {
                return (
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={onConfirm}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors",
                        state === "confirmed"
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-emerald-400 text-emerald-700 bg-white hover:bg-emerald-50"
                      )}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {state === "confirmed" ? "Confirmed — matches package" : "Confirm — matches package"}
                    </button>
                    <button
                      type="button"
                      onClick={onFlag}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors",
                        state === "discrepancy"
                          ? "bg-[#D64D4D] border-[#D64D4D] text-white"
                          : "border-[#D64D4D]/50 text-[#D64D4D] bg-white hover:bg-red-50"
                      )}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Flag discrepancy
                    </button>
                  </div>
                );
              }

              return (
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Packaging Verification</p>

                  {/* Overall banner */}
                  {anyInteracted && (
                    pkgV.all_confirmed ? (
                      <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs text-emerald-800 font-semibold">✓ All packaging verified and confirmed.</span>
                      </div>
                    ) : anyFlagged ? (
                      <div className="flex items-start gap-2 rounded-md bg-red-50 border border-[#D64D4D]/30 px-3 py-2">
                        <AlertTriangle className="w-4 h-4 text-[#D64D4D] shrink-0 mt-0.5" />
                        <div className="text-xs text-[#D64D4D]">
                          <p className="font-bold">⚠ Packaging discrepancy reported.</p>
                          <p className="font-normal mt-0.5">Review flagged fields before releasing product.</p>
                        </div>
                      </div>
                    ) : null
                  )}

                  <div className="space-y-4">
                    {/* Field 1 — Product Labeled As */}
                    <div className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
                      <label className="label mb-0">
                        Product Labeled As <span className="text-[#D64D4D] ml-0.5">*</span>
                      </label>
                      <p className="text-[11px] text-gray-500 font-mono">
                        Expected: <span className="font-semibold text-gray-700">{selected.name}</span>
                      </p>
                      <select
                        className={cn(
                          inp,
                          form.pkgLabelChoice === "confirmed" ? "border-emerald-400 bg-emerald-50/30" :
                          form.pkgLabelChoice === "discrepancy" ? "border-[#D64D4D] bg-red-50/30" : ""
                        )}
                        value={form.pkgLabelChoice ?? ""}
                        onChange={(e) => {
                          const v = e.target.value as "confirmed" | "discrepancy" | "";
                          sf({ pkgLabelChoice: v === "" ? null : v, pkgLabelDiscrepancy: "" });
                          setLastActiveSection(5);
                        }}
                      >
                        <option value="">— Select —</option>
                        <option value="confirmed">{selected.name}</option>
                        <option value="discrepancy">Other / Discrepancy</option>
                      </select>
                      {form.pkgLabelChoice === "confirmed" && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Label confirmed
                        </p>
                      )}
                      {form.pkgLabelChoice === "discrepancy" && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            className={inp}
                            placeholder="What does the label say?"
                            value={form.pkgLabelDiscrepancy}
                            onChange={(e) => { sf({ pkgLabelDiscrepancy: toUpperCaseInput(e.target.value) }); setLastActiveSection(5); }}
                          />
                          <div className="rounded border border-[#D64D4D]/30 bg-red-50 p-2 text-[11px] text-[#D64D4D] space-y-0.5">
                            <p className="font-bold">⚠ Label does not match product name.</p>
                            <p><span className="font-semibold">Expected:</span> {selected.name}</p>
                            <p>Do not release product. Notify admin.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Field 2 — Allergens Declared on Package */}
                    <div className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
                      <label className="label mb-0">
                        Allergens Declared on Package <span className="text-[#D64D4D] ml-0.5">*</span>
                      </label>
                      <p className="text-[11px] text-gray-500 font-mono">
                        Expected from recipe: <span className="font-semibold text-gray-700">{expectedAllergenLabel}</span>
                      </p>

                      {/* Confirm toggle */}
                      <label className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors",
                        form.pkgAllergenConfirmed
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                      )}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-emerald-600"
                          checked={form.pkgAllergenConfirmed}
                          onChange={(e) => { sf({ pkgAllergenConfirmed: e.target.checked }); setLastActiveSection(5); }}
                        />
                        <span className="text-sm text-gray-700">I confirm the allergens on the physical package match the list above.</span>
                      </label>

                      {form.pkgAllergenConfirmed ? (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Allergen declaration confirmed
                        </p>
                      ) : (
                        <>
                          {/* Editable checkboxes when not yet confirmed */}
                          <div className={cn(
                            "rounded-md border p-3 grid grid-cols-2 sm:grid-cols-3 gap-2",
                            allergenMismatch ? "border-[#D64D4D]/40 bg-red-50/30" : "border-gray-200 bg-white"
                          )}>
                            {ALLERGEN_OPTIONS_PKG.map((allergenOpt) => {
                              const isNone = allergenOpt === "None";
                              const checked = isNone
                                ? allergenEdited.length === 0 || allergenEdited.includes("None")
                                : allergenEdited.includes(allergenOpt);
                              return (
                                <label key={allergenOpt} className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-[#D64D4D]"
                                    checked={checked}
                                    onChange={(e) => {
                                      let next: string[];
                                      if (isNone) {
                                        next = e.target.checked ? [] : allergenEdited.filter((a) => a !== "None");
                                      } else {
                                        const cur = allergenEdited.filter((a) => a !== "None");
                                        next = e.target.checked ? [...cur, allergenOpt] : cur.filter((a) => a !== allergenOpt);
                                      }
                                      sf({ pkgAllergenEdited: next });
                                      setLastActiveSection(5);
                                    }}
                                  />
                                  <span className="text-sm text-gray-700">{allergenOpt}</span>
                                </label>
                              );
                            })}
                          </div>
                          {allergenMismatch && (
                            <div className="rounded border border-[#D64D4D]/30 bg-red-50 p-2 text-[11px] text-[#D64D4D] space-y-0.5">
                              <p className="font-bold">⚠ Allergen declaration does not match product recipe.</p>
                              <p><span className="font-semibold">Expected:</span> {expectedAllergenLabel}</p>
                              <p><span className="font-semibold">On package:</span> {allergenEditedLabel}</p>
                              <p>Do not release product. Verify packaging and notify admin.</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Field 3 — Lot on Package */}
                    <div className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
                      <label className="label mb-0">
                        Lot on Package <span className="text-[#D64D4D] ml-0.5">*</span>
                      </label>
                      <div className={cn(
                        "rounded-md border px-3 py-2 text-sm font-mono",
                        form.pkgLotState === "confirmed" ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : form.pkgLotState === "discrepancy" ? "border-[#D64D4D]/40 bg-red-50/30 text-gray-700"
                          : "border-gray-200 bg-gray-50 text-gray-700"
                      )}>
                        {form.productionLot || <span className="text-gray-400 italic">Production lot not yet entered (Section 1)</span>}
                      </div>
                      <PkgConfirmButtons
                        state={form.pkgLotState}
                        onConfirm={() => { sf({ pkgLotState: "confirmed", pkgLotDiscrepancy: "" }); setLastActiveSection(5); }}
                        onFlag={() => { sf({ pkgLotState: "discrepancy" }); setLastActiveSection(5); }}
                      />
                      {form.pkgLotState === "confirmed" && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Lot confirmed
                        </p>
                      )}
                      {form.pkgLotState === "discrepancy" && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            className={inp}
                            placeholder="What lot is shown on the package?"
                            value={form.pkgLotDiscrepancy}
                            onChange={(e) => { sf({ pkgLotDiscrepancy: toUpperCaseInput(e.target.value) }); setLastActiveSection(5); }}
                          />
                          <div className="rounded border border-[#D64D4D]/30 bg-red-50 p-2 text-[11px] text-[#D64D4D] space-y-0.5">
                            <p className="font-bold">⚠ Lot on package does not match production lot.</p>
                            <p><span className="font-semibold">Expected:</span> {form.productionLot || "—"}</p>
                            <p>Do not release product. Verify lot number on packaging.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Field 4 — Expiration Date on Package (hidden for products without expiration dates) */}
                    {selected.hasExpirationDate && (
                      <div className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
                        <label className="label mb-0">
                          Expiration Date on Package <span className="text-[#D64D4D] ml-0.5">*</span>
                        </label>
                        <div className={cn(
                          "rounded-md border px-3 py-2 text-sm font-mono",
                          form.pkgExpState === "confirmed" ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : form.pkgExpState === "discrepancy" ? "border-[#D64D4D]/40 bg-red-50/30 text-gray-700"
                            : "border-gray-200 bg-gray-50 text-gray-700"
                        )}>
                          {form.expirationDate ? fmtDateShort(form.expirationDate) : <span className="text-gray-400 italic">Expiration date not yet entered (Section 1)</span>}
                        </div>
                        <PkgConfirmButtons
                          state={form.pkgExpState}
                          onConfirm={() => { sf({ pkgExpState: "confirmed", pkgExpDiscrepancy: "" }); setLastActiveSection(5); }}
                          onFlag={() => { sf({ pkgExpState: "discrepancy" }); setLastActiveSection(5); }}
                        />
                        {form.pkgExpState === "confirmed" && (
                          <p className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3 h-3" /> Expiration date confirmed
                          </p>
                        )}
                        {form.pkgExpState === "discrepancy" && (
                          <div className="space-y-2">
                            <DateInput
                              className={inp}
                              value={form.pkgExpDiscrepancy}
                              onChange={(v) => { sf({ pkgExpDiscrepancy: v }); setLastActiveSection(5); }}
                            />
                            <div className="rounded border border-[#D64D4D]/30 bg-red-50 p-2 text-[11px] text-[#D64D4D] space-y-0.5">
                              <p className="font-bold">⚠ Expiration date on package does not match production record.</p>
                              <p><span className="font-semibold">Expected:</span> {fmtDateShort(form.expirationDate)}</p>
                              <p>Do not release product. Verify expiration date on packaging.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {sortedEopFields.length === 0 ? (
              <p className="text-xs text-gray-400 font-mono">No end-of-production fields configured for this template.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sortedEopFields.map((field) => {
                  const value = form.eopValues[field.id] ?? "";
                  const labelEl = (
                    <label className="label">
                      {field.label}{field.required && <span className="text-[#D64D4D] ml-0.5">*</span>}
                    </label>
                  );
                  if (field.field_type === "textarea") {
                    return (
                      <div key={field.id} className="sm:col-span-2">
                        {labelEl}
                        <textarea className={inp} rows={3} value={value}
                          onChange={(e) => setEopValue(field.id, e.target.value)} />
                      </div>
                    );
                  }
                  if (field.field_type === "yes_no") {
                    return (
                      <div key={field.id}>
                        {labelEl}
                        <div className="flex rounded-md overflow-hidden border border-gray-200 w-fit">
                          <button type="button"
                            onClick={() => setEopValue(field.id, value === "yes" ? "" : "yes")}
                            className={`px-4 py-1.5 text-sm font-medium transition-colors ${value === "yes" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                            Yes
                          </button>
                          <button type="button"
                            onClick={() => setEopValue(field.id, value === "no" ? "" : "no")}
                            className={`px-4 py-1.5 text-sm font-medium border-l border-gray-200 transition-colors ${value === "no" ? "bg-red-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                            No
                          </button>
                        </div>
                      </div>
                    );
                  }
                  if (field.field_type === "checkbox") {
                    return (
                      <div key={field.id} className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4 accent-[#D64D4D]"
                          checked={value === "true"}
                          onChange={(e) => setEopValue(field.id, e.target.checked ? "true" : "false")} />
                        <label className="text-sm text-gray-700">
                          {field.label}{field.required && <span className="text-[#D64D4D] ml-0.5">*</span>}
                        </label>
                      </div>
                    );
                  }
                  if (field.field_type === "date") {
                    return (
                      <div key={field.id}>
                        {labelEl}
                        <DateInput className={inp} value={value}
                          onChange={(v) => setEopValue(field.id, v)} />
                      </div>
                    );
                  }
                  if (field.field_type === "number") {
                    return (
                      <div key={field.id}>
                        {labelEl}
                        <input type="number" className={inp} step="any" min="0" value={value}
                          onChange={(e) => setEopValue(field.id, e.target.value)} />
                      </div>
                    );
                  }
                  return (
                    <div key={field.id}>
                      {labelEl}
                      <input type="text" className={inp} value={value}
                        onChange={(e) => setEopValue(field.id, toUpperCaseInput(e.target.value))} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 6 — Product Release Dashboard ── */}
        {(() => {
          const s6Items = computeSection6Items(form, allergen, selected);
          const presentItems = s6Items.filter((it) => it.present);
          const pendingCount = presentItems.filter(
            (it) => it.status !== "complete" && it.status !== "pass_with_issues"
          ).length;
          const anyIssues = presentItems.some((it) => it.status === "pass_with_issues");
          const allResolved = pendingCount === 0;
          const canSubmit = allResolved && isAllergenDone;

          return (
            <div id="section-6" className="card relative">
              {!isAllergenDone && lockedOverlay}
              {sectionHdr(6, "Product Release Dashboard")}
              <div className="p-6 space-y-5">

                {/* Status items grid */}
                <div className="space-y-2">
                  {s6Items.map((item) => {
                    const cfg = STATUS_CONFIG[item.status];
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-lg border p-3 space-y-2 transition-colors",
                          cfg.border, cfg.bg
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
                            <span className={cn("text-sm font-medium", item.present ? "text-gray-800" : "text-gray-400")}>
                              {item.label}
                            </span>
                          </div>
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0",
                            cfg.text, cfg.border, cfg.bg
                          )}>
                            {cfg.label}
                          </span>
                        </div>

                        {/* Sub-items */}
                        {item.subItems && item.subItems.length > 0 && (
                          <div className="ml-4 space-y-1 pt-1 border-t border-current/10">
                            {item.subItems.map((sub) => {
                              const sCfg = STATUS_CONFIG[sub.status];
                              return (
                                <div key={sub.id} className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", sCfg.dot)} />
                                    <span className="text-xs text-gray-600">{sub.label}</span>
                                  </div>
                                  <span className={cn(
                                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full",
                                    sCfg.text, "bg-white/60"
                                  )}>
                                    {sCfg.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Release Statement */}
                {allResolved ? (
                  anyIssues ? (
                    <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-orange-800">Release with Issues</p>
                        <p className="text-xs text-orange-700 mt-0.5">
                          All sections reviewed. Some checks have discrepancies — review before releasing product.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">Product Verified — Ready for Release</p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          All sections completed and verified. Product may be released.
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Pending</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        {pendingCount} section{pendingCount !== 1 ? "s" : ""} still need{pendingCount === 1 ? "s" : ""} to be completed before product can be released.
                      </p>
                    </div>
                  </div>
                )}

                {/* Signature */}
                <div>
                  <SignaturePad label="Production Manager Signature" onDataUrl={setSigDataUrl} />
                </div>

                {/* Notes */}
                <div>
                  <label className="label">Additional Notes</label>
                  <textarea className={`${inp} resize-none`} rows={3} value={form.notes}
                    onChange={(e) => sf({ notes: e.target.value })} />
                </div>

                {/* Save Progress */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveDraft(false)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? "Saving…" : "Save Progress"}
                  </button>
                  {lastSavedAt && (
                    <span className="text-xs text-gray-400 font-mono">
                      Last saved at {lastSavedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  )}
                </div>

                {submitError && (
                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {submitError}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => { backToTemplates(); }} className="btn-secondary">
                    ← Back to Templates
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit}
                    className="btn-primary"
                  >
                    {submitting ? "Submitting…" : "Submit Batch Sheet"}
                  </button>
                </div>

                {!isAllergenDone && (
                  <p className="text-xs text-amber-600 font-mono flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Complete Section 2 — Allergen Changeover before submitting.
                  </p>
                )}
                {isAllergenDone && !allResolved && (
                  <p className="text-xs text-gray-400 font-mono">
                    Complete all sections above before submitting.
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
