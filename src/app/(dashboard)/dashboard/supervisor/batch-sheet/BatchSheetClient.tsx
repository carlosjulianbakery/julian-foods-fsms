"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Info, Lock } from "lucide-react";
import dynamic from "next/dynamic";

const SignaturePad = dynamic(() => import("@/components/SignaturePad"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type CcpCheck = {
  id: string; type: string; label: string;
  num_readings: number; min_value: number | null; max_value: number | null; unit: string | null;
};

type IngTpl = { id: string; name: string; quantity_per_bowl: number; unit: string };

type PresentationMaterial = { id: string; name: string; qty_per_bowl: number; food_contact: boolean };
type Presentation = { presentation_id: string; presentation_name: string; materials: PresentationMaterial[] };

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
  ingredients: IngTpl[];
  presentations: Presentation[];
  ovensAvailable: string[];
  calibrationWeights: { label: string }[];
  ccpChecks: CcpCheck[];
  ccpNumSessions: number;
  ccpRequireTimestamp: boolean;
  endOfProductionFields: EopField[];
  releaseChecklistItems: string[];
};

type CalibRow = {
  label: string; reading: string; pass: boolean | null;
  deviation: number | null; corrective_action: string;
};

type IngRow = IngTpl & { supplier: string; lot_number: string };

type MaterialState = {
  id: string; name: string; qty_per_bowl: number; food_contact: boolean;
  qty_used: string; supplier: string; lot_number: string;
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

// ─── Allergen types ───────────────────────────────────────────────────────────

const ALLERGEN_LIST = [
  "Egg",
  "Peanut",
  "Milk (Whey, Cheese)",
  "Sesame",
  "Tree Nut (Coconut, Almond)",
] as const;

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

type FormState = {
  productionDate: string; productionLot: string; expirationDate: string;
  shift: "AM" | "PM"; supervisorName: string; numEmployees: string;
  ovensUsed: string[];
  calibration: CalibRow[];
  s1Initials: string;
  bowlsProduced: string;
  ingredients: IngRow[];
  presentations: PresentationState[];
  ccpSessions: CcpSession[];
  eopValues: Record<string, string>;
  checklist: { label: string; checked: boolean; initials: string }[];
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

// ─── initForm ────────────────────────────────────────────────────────────────

function initForm(t: Template, supervisorName: string): FormState {
  const today = new Date().toISOString().split("T")[0];
  const numSessions = t.ccpNumSessions || 1;
  return {
    productionDate: today, productionLot: "", expirationDate: "",
    shift: "AM", supervisorName, numEmployees: "",
    ovensUsed: [],
    calibration: t.calibrationWeights.map((w) => ({
      label: w.label, reading: "", pass: null, deviation: null, corrective_action: "",
    })),
    s1Initials: "",
    bowlsProduced: "",
    ingredients: t.ingredients.map((i) => ({ ...i, supplier: "", lot_number: "" })),
    presentations: t.presentations.map((pres) => ({
      presentation_id:   pres.presentation_id,
      presentation_name: pres.presentation_name,
      selected:          t.presentations.length === 1,
      materials: pres.materials.map((m) => ({
        ...m,
        qty_used:   String(m.qty_per_bowl),
        supplier:   "",
        lot_number: "",
      })),
    })),
    ccpSessions: Array.from({ length: numSessions }, (_, i) => ({
      session_number: i + 1,
      initials: "",
      check_time: "",
      checks: t.ccpChecks.map((check) => ({
        check_id:          check.id,
        label:             check.label,
        type:              check.type,
        readings:          Array(check.num_readings).fill(""),
        pass:              null,
        corrective_action: "",
        visual_result:     null,
        visual_notes:      "",
      })),
    })),
    eopValues: {},
    checklist: t.releaseChecklistItems.map((label) => ({ label, checked: false, initials: "" })),
    notes: "",
  };
}

// ─── initFormFromDraft ────────────────────────────────────────────────────────

function initFormFromDraft(draft: DraftRecord, template: Template): { form: FormState; allergen: AllergenState } {
  const s1  = draft.section1 as { ovens_used?: string[]; calibration?: { label: string; reading: string; pass: boolean | null; corrective_action?: string }[]; initials?: string } | null;
  const s2a = draft.section2_allergen as { changeover_required?: boolean | null; previous_product_name?: string; previous_product_allergens?: string[]; swab_attempts?: Array<{ equipment_swabbed: string; time_recorded: string; result: "pass" | "fail" | null; initials: string }> } | null;
  const s3  = draft.section3 as { bowls_produced?: number; ingredients?: Array<{ id: string; name: string; quantity_per_bowl: number; unit: string; supplier?: string; lot_number?: string }>; presentations?: Array<{ presentation_id: string; presentation_name: string; selected: boolean; materials?: Array<{ id: string; qty_used?: number; supplier?: string; lot_number?: string }> }> } | null;
  const s4  = draft.section4 as CcpSession[] | null;
  const s5  = draft.section5 as Array<{ field_id: string; value: string }> | null;
  const s6  = draft.section6 as { checklist?: Array<{ label: string; checked: boolean; initials: string }> } | null;

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
  if (s5 && Array.isArray(s5)) {
    for (const f of s5) eopValues[f.field_id] = f.value ?? "";
  }

  const savedPresentations = s3?.presentations ?? [];
  const presentations: PresentationState[] = template.presentations.map((pres) => {
    const saved = savedPresentations.find((p) => p.presentation_id === pres.presentation_id);
    return {
      presentation_id:   pres.presentation_id,
      presentation_name: pres.presentation_name,
      selected:          saved ? saved.selected : template.presentations.length === 1,
      materials: pres.materials.map((m) => {
        const sm = saved?.materials?.find((x) => x.id === m.id);
        return { ...m, qty_used: sm?.qty_used != null ? String(sm.qty_used) : String(m.qty_per_bowl), supplier: sm?.supplier ?? "", lot_number: sm?.lot_number ?? "" };
      }),
    };
  });

  const savedIngredients = s3?.ingredients ?? [];
  const ingredients: IngRow[] = template.ingredients.map((ing) => {
    const saved = savedIngredients.find((i) => i.id === ing.id) ?? savedIngredients.find((i) => i.name === ing.name);
    return { ...ing, supplier: saved?.supplier ?? "", lot_number: saved?.lot_number ?? "" };
  });

  const numSessions = template.ccpNumSessions || 1;
  const savedSessions = s4 ?? [];
  const ccpSessions: CcpSession[] = Array.from({ length: numSessions }, (_, i) => {
    const saved = savedSessions[i];
    return {
      session_number: i + 1,
      initials:   saved?.initials ?? "",
      check_time: saved?.check_time ?? "",
      checks: template.ccpChecks.map((check) => {
        const sc = saved?.checks?.find((c) => c.check_id === check.id);
        return {
          check_id:          check.id,
          label:             check.label,
          type:              check.type,
          readings:          sc?.readings ?? Array(check.num_readings).fill(""),
          pass:              sc?.pass ?? null,
          corrective_action: sc?.corrective_action ?? "",
          visual_result:     sc?.visual_result ?? null,
          visual_notes:      sc?.visual_notes ?? "",
        };
      }),
    };
  });

  const savedChecklist = s6?.checklist ?? [];
  const checklist = template.releaseChecklistItems.map((label) => {
    const saved = savedChecklist.find((c) => c.label === label);
    return { label, checked: saved?.checked ?? false, initials: saved?.initials ?? "" };
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

  const form: FormState = {
    productionDate:  draft.productionDate ? new Date(draft.productionDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    productionLot:   draft.productionLot ?? "",
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
    ccpSessions,
    eopValues,
    checklist,
    notes:           draft.notes ?? "",
  };

  return { form, allergen };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function passChip(pass: boolean | null) {
  if (pass === null) return <span className="badge bg-gray-100 text-gray-400">—</span>;
  return pass
    ? <span className="badge bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />PASS</span>
    : <span className="badge bg-red-100 text-red-700 flex items-center gap-1"><XCircle className="w-3 h-3" />FAIL</span>;
}

function computeStatus(sessions: CcpSession[]): string {
  if (!sessions.length) return "COMPLETE";
  const allChecks = sessions.flatMap((s) => s.checks);
  const anyFail = allChecks.some((c) => c.pass === false);
  if (!anyFail) return "PASS";
  const allCorrected = allChecks.every((c) => {
    if (c.pass !== false) return true;
    if (c.type === "visual") return c.visual_notes?.trim().length > 0;
    return c.corrective_action?.trim().length > 0;
  });
  return allCorrected ? "PASS_WITH_ISSUES" : "FAIL";
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

  function selectTemplate(t: Template) {
    setSelected(t);
    setForm(initForm(t, supervisorName));
    setAllergen(initAllergen());
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

  // ── CCP Session updates ───────────────────────────────────────────────────────

  function updateCheckReading(sessionIdx: number, checkIdx: number, readingIdx: number, value: string) {
    if (!form || !selected) return;
    const sessions = [...form.ccpSessions];
    const session = { ...sessions[sessionIdx] };
    const checks = [...session.checks];
    const check = { ...checks[checkIdx] };
    const readings = [...check.readings];
    readings[readingIdx] = value;
    const ccpTemplate = selected.ccpChecks.find((c) => c.id === check.check_id);
    const pass = ccpTemplate ? computeCheckPass(ccpTemplate, readings, check.visual_result) : null;
    checks[checkIdx] = { ...check, readings, pass };
    session.checks = checks;
    sessions[sessionIdx] = session;
    sf({ ccpSessions: sessions });
    setLastActiveSection(4);
  }

  function updateVisualResult(sessionIdx: number, checkIdx: number, result: "pass" | "issue") {
    if (!form || !selected) return;
    const sessions = [...form.ccpSessions];
    const session = { ...sessions[sessionIdx] };
    const checks = [...session.checks];
    const check = { ...checks[checkIdx] };
    const ccpTemplate = selected.ccpChecks.find((c) => c.id === check.check_id);
    const pass = ccpTemplate ? computeCheckPass(ccpTemplate, check.readings, result) : null;
    checks[checkIdx] = { ...check, visual_result: result, pass };
    session.checks = checks;
    sessions[sessionIdx] = session;
    sf({ ccpSessions: sessions });
    setLastActiveSection(4);
  }

  function updateCheckField(
    sessionIdx: number, checkIdx: number,
    field: "corrective_action" | "visual_notes" | "initials_override",
    value: string
  ) {
    if (!form) return;
    const sessions = [...form.ccpSessions];
    const session = { ...sessions[sessionIdx] };
    const checks = [...session.checks];
    checks[checkIdx] = { ...checks[checkIdx], [field]: value };
    session.checks = checks;
    sessions[sessionIdx] = session;
    sf({ ccpSessions: sessions });
  }

  function updateSessionInitials(sessionIdx: number, initials: string) {
    if (!form) return;
    const sessions = [...form.ccpSessions];
    sessions[sessionIdx] = { ...sessions[sessionIdx], initials };
    sf({ ccpSessions: sessions });
  }

  function updateSessionField(sessionIdx: number, field: "initials" | "check_time", value: string) {
    if (!form) return;
    const sessions = [...form.ccpSessions];
    sessions[sessionIdx] = { ...sessions[sessionIdx], [field]: value };
    sf({ ccpSessions: sessions });
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
      templateId:   selected.id,
      templateName: selected.name,
      productionDate:  form.productionDate,
      productionLot:   form.productionLot || null,
      expirationDate:  form.expirationDate || null,
      shift:           form.shift,
      supervisorName:  form.supervisorName,
      numEmployees:    form.numEmployees || null,
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
        ingredients: form.ingredients,
        presentations: form.presentations.map((pres) => ({
          presentation_id: pres.presentation_id, presentation_name: pres.presentation_name, selected: pres.selected,
          materials: pres.materials.map((m) => ({ id: m.id, name: m.name, qty_per_bowl: m.qty_per_bowl, qty_used: parseFloat(m.qty_used) || 0, food_contact: m.food_contact, ...(m.food_contact ? { supplier: m.supplier, lot_number: m.lot_number } : {}) })),
        })),
      },
      section4: form.ccpSessions,
      section5: selected.endOfProductionFields.map((field, i) => ({ field_id: field.id, label: field.label, field_type: field.field_type, value: form.eopValues[field.id] ?? "", order: i })),
      section6: { checklist: form.checklist, supervisor_signature: "", all_passed: false },
      notes: form.notes || null,
      lastActiveSection,
    };
  }

  const saveDraft = useCallback(async (silent = false) => {
    const payload = buildDraftPayload();
    if (!payload) return;
    if (!silent) setIsSaving(true);
    try {
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
      }
    } catch { /* ignore */ }
    if (!silent) setIsSaving(false);
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
          const { form: f, allergen: a } = initFormFromDraft(draft, t);
          setSelected(t);
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

    if (!sigDataUrl) { setSubmitError("Supervisor signature is required."); return; }
    const unchecked = form.checklist.some((c) => !c.checked);
    if (unchecked) { setSubmitError("All release checklist items must be checked."); return; }
    if (selected.ccpRequireTimestamp) {
      const missingTime = form.ccpSessions.some((s) => !s.check_time);
      if (missingTime) { setSubmitError("Time of check is required for all CCP sessions."); return; }
    }

    const missingRequired = selected.endOfProductionFields
      .filter((f) => f.required && !form.eopValues[f.id]?.trim());
    if (missingRequired.length > 0) {
      setSubmitError(`Required fields missing: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const status = computeStatus(form.ccpSessions);

      const section5 = selected.endOfProductionFields.map((field, i) => ({
        field_id:   field.id,
        label:      field.label,
        field_type: field.field_type,
        value:      form.eopValues[field.id] ?? "",
        order:      i,
      }));

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
          templateId:     selected.id,
          templateName:   selected.name,
          productionDate: form.productionDate,
          productionLot:  form.productionLot || null,
          expirationDate: form.expirationDate || null,
          shift:          form.shift,
          supervisorName: form.supervisorName,
          numEmployees:   form.numEmployees || null,
          section1: {
            ovens_used:  form.ovensUsed,
            calibration: form.calibration,
            initials:    form.s1Initials,
          },
          section2_allergen,
          section3: {
            bowls_produced: parseInt(form.bowlsProduced) || 0,
            ingredients:    form.ingredients,
            presentations:  form.presentations.map((pres) => ({
              presentation_id:   pres.presentation_id,
              presentation_name: pres.presentation_name,
              selected:          pres.selected,
              materials:         pres.materials.map((m) => ({
                id:           m.id,
                name:         m.name,
                qty_per_bowl: m.qty_per_bowl,
                qty_used:     parseFloat(m.qty_used) || 0,
                food_contact: m.food_contact,
                ...(m.food_contact ? { supplier: m.supplier, lot_number: m.lot_number } : {}),
              })),
            })),
          },
          section4: form.ccpSessions,
          section5,
          section6: {
            checklist:            form.checklist,
            supervisor_signature: sigDataUrl,
            all_passed:           status === "PASS",
          },
          notes: form.notes || null,
          status,
          id: draftId ?? undefined,
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
                onClick={() => {
                  const { form: f, allergen: a } = initFormFromDraft(existingDraft, pendingTemplate);
                  setSelected(pendingTemplate);
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
          <div>
            <h1 className="page-title">Batch Sheet</h1>
            <p className="page-subtitle">Select a template to begin</p>
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
        <div className="flex items-center gap-3">
          <button onClick={backToTemplates} className="text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="page-title">{selected.name} — Batch Sheet</h1>
            <p className="page-subtitle">Fill all sections and submit to record</p>
          </div>
        </div>

        {/* ── SECTION 1 — Pre-Production Setup ── */}
        <div id="section-1" className="card">
          {sectionHdr(1, "Pre-Production Setup")}
          <div className="p-6 space-y-5">

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="label">Production Date *</label>
                <input type="date" className={inp} value={form.productionDate}
                  onChange={(e) => sf({ productionDate: e.target.value })} />
              </div>
              <div>
                <label className="label">Production Lot</label>
                <input className={inp} value={form.productionLot} placeholder="e.g. LOT-001"
                  onChange={(e) => sf({ productionLot: e.target.value })} />
              </div>
              <div>
                <label className="label">Expiration Date</label>
                <input type="date" className={inp} value={form.expirationDate}
                  onChange={(e) => sf({ expirationDate: e.target.value })} />
              </div>
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
                  onChange={(e) => sf({ supervisorName: e.target.value })} />
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
                        onChange={(e) => sa({ previous_product_name: e.target.value })} />
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
                                    onChange={(e) => updateSwabField(idx, "equipment_swabbed", e.target.value)} />
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
                                      onChange={(e) => updateSwabField(idx, "initials", e.target.value)} />
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
              <label className="label">Bowls Produced *</label>
              <input type="number" className={`${inp} w-36`} min="1" value={form.bowlsProduced}
                onChange={(e) => { sf({ bowlsProduced: e.target.value }); setLastActiveSection(3); }} placeholder="e.g. 10" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Ingredients</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Ingredient", "Qty / Bowl", "Unit", "Total Qty", "Supplier", "Lot #"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {form.ingredients.map((ing, i) => {
                      const total = bowlsNum > 0 ? (ing.quantity_per_bowl * bowlsNum).toFixed(3) : "—";
                      return (
                        <tr key={ing.id}>
                          <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{ing.name}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{ing.quantity_per_bowl}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{ing.unit}</td>
                          <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{total} {ing.unit}</td>
                          <td className="px-3 py-2">
                            <input className={inp} value={ing.supplier} placeholder="Supplier"
                              onChange={(e) => {
                                const a = [...form.ingredients]; a[i] = { ...a[i], supplier: e.target.value }; sf({ ingredients: a });
                              }} />
                          </td>
                          <td className="px-3 py-2">
                            <input className={inp} value={ing.lot_number} placeholder="Lot #"
                              onChange={(e) => {
                                const a = [...form.ingredients]; a[i] = { ...a[i], lot_number: e.target.value }; sf({ ingredients: a });
                              }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {form.presentations.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Packaging Materials</h3>
                <div className="space-y-4">
                  {form.presentations.map((pres) => (
                    <div key={pres.presentation_id}
                      className={`border rounded-lg overflow-hidden ${pres.selected ? "border-emerald-200 bg-emerald-50/20" : "border-gray-200 bg-gray-50/30 opacity-70"}`}>
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white/60">
                        <input type="checkbox" className="w-4 h-4 accent-emerald-600"
                          checked={pres.selected}
                          onChange={(e) => togglePresentation(pres.presentation_id, e.target.checked)} />
                        <span className="font-semibold text-sm text-gray-800">{pres.presentation_name}</span>
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
                                    <input type="number" className={inp} min="0" step="0.01" value={mat.qty_used}
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
                                      ? <input className={inp} value={mat.supplier} placeholder="Supplier"
                                          onChange={(e) => updateMaterialField(pres.presentation_id, mat.id, "supplier", e.target.value)} />
                                      : <span className="text-gray-300 text-xs">—</span>
                                    }
                                  </td>
                                  <td className="px-3 py-2">
                                    {mat.food_contact
                                      ? <input className={inp} value={mat.lot_number} placeholder="Lot #"
                                          onChange={(e) => updateMaterialField(pres.presentation_id, mat.id, "lot_number", e.target.value)} />
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
            )}
          </div>
        </div>

        {/* ── SECTION 4 — CCP Monitoring ── */}
        <div id="section-4" className="card relative">
          {!isAllergenDone && lockedOverlay}
          {sectionHdr(4, "CCP Monitoring")}
          <div className="p-6 space-y-5">
            {form.ccpSessions.length === 0 && (
              <p className="text-xs text-gray-400 font-mono">No CCP sessions configured for this template.</p>
            )}
            {form.ccpSessions.map((session, sessionIdx) => (
              <div key={sessionIdx} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-700">
                    Check Session {session.session_number}
                    {session.check_time && (
                      <span className="ml-2 text-xs font-normal text-gray-500 font-mono">— {fmt12h(session.check_time)}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {session.checks.some((c) => c.pass === false) && (
                      <span className="badge bg-red-100 text-red-700 text-[10px]">Issues Found</span>
                    )}
                    {session.checks.length > 0 && session.checks.every((c) => c.pass === true) && (
                      <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">All Pass</span>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-5">
                  {selected.ccpRequireTimestamp && (
                    <div>
                      <label className="label">Time of Check</label>
                      <input type="time" className="input w-36" value={session.check_time}
                        onChange={(e) => updateSessionField(sessionIdx, "check_time", e.target.value)} />
                      <p className="text-xs text-gray-400 font-mono mt-0.5">Required for this session</p>
                    </div>
                  )}
                  {session.checks.map((check, checkIdx) => {
                    const ccpTemplate = selected.ccpChecks.find((c) => c.id === check.check_id);
                    return (
                      <div key={check.check_id} className="border-b border-gray-50 last:border-0 pb-4 last:pb-0">
                        <p className="text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider mb-2">
                          {check.label}
                          {ccpTemplate?.unit && <span className="ml-1 normal-case">({ccpTemplate.unit})</span>}
                        </p>
                        {(check.type === "temperature" || check.type === "weight" || check.type === "custom") && (
                          <>
                            <div className="flex flex-wrap items-center gap-3">
                              {check.readings.map((reading, ri) => (
                                <div key={ri} className="flex items-center gap-2">
                                  <label className="text-xs text-gray-500">Reading {ri + 1}</label>
                                  <input
                                    type={check.type === "custom" ? "text" : "number"}
                                    className={`${inp} w-28`}
                                    step={check.type === "temperature" ? "0.1" : "0.01"}
                                    value={reading}
                                    placeholder={ccpTemplate?.unit ?? ""}
                                    onChange={(e) => updateCheckReading(sessionIdx, checkIdx, ri, e.target.value)}
                                  />
                                </div>
                              ))}
                              {check.type !== "custom" && passChip(check.pass)}
                            </div>
                            {ccpTemplate && check.type === "temperature" && ccpTemplate.min_value !== null && (
                              <p className="text-[10px] text-gray-400 font-mono mt-1">Min: {ccpTemplate.min_value}{ccpTemplate.unit}</p>
                            )}
                            {ccpTemplate && check.type === "weight" && (
                              <p className="text-[10px] text-gray-400 font-mono mt-1">
                                Range: {ccpTemplate.min_value ?? "—"}–{ccpTemplate.max_value ?? "—"} {ccpTemplate.unit}
                              </p>
                            )}
                            {check.pass === false && (
                              <div className="mt-2">
                                <input className={inp} value={check.corrective_action}
                                  placeholder="Corrective action taken"
                                  onChange={(e) => updateCheckField(sessionIdx, checkIdx, "corrective_action", e.target.value)} />
                                {!check.corrective_action && (
                                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Corrective action required
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        )}
                        {check.type === "visual" && (
                          <>
                            <div className="flex gap-2">
                              <button type="button"
                                onClick={() => updateVisualResult(sessionIdx, checkIdx, "pass")}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${check.visual_result === "pass" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                                ✓ Pass
                              </button>
                              <button type="button"
                                onClick={() => updateVisualResult(sessionIdx, checkIdx, "issue")}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${check.visual_result === "issue" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-200 hover:border-red-400"}`}>
                                ⚠ Issue Found
                              </button>
                              {passChip(check.pass)}
                            </div>
                            {check.visual_result === "issue" && (
                              <div className="mt-2">
                                <input className={inp} value={check.visual_notes}
                                  placeholder="Describe findings and corrective action"
                                  onChange={(e) => updateCheckField(sessionIdx, checkIdx, "visual_notes", e.target.value)} />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div>
                    <label className="label">Initials</label>
                    <input className={`${inp} w-20`} value={session.initials} placeholder="JD"
                      onChange={(e) => updateSessionInitials(sessionIdx, e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 5 — End of Production Summary ── */}
        <div id="section-5" className="card relative">
          {!isAllergenDone && lockedOverlay}
          {sectionHdr(5, "End of Production Summary")}
          <div className="p-6 space-y-5">
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
                        <input type="date" className={inp} value={value}
                          onChange={(e) => setEopValue(field.id, e.target.value)} />
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
                        onChange={(e) => setEopValue(field.id, e.target.value)} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 6 — Product Release Checklist ── */}
        <div id="section-6" className="card relative">
          {!isAllergenDone && lockedOverlay}
          {sectionHdr(6, "Product Release Checklist")}
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              {form.checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <input type="checkbox" className="w-4 h-4 accent-brand-600 shrink-0"
                    checked={item.checked}
                    onChange={(e) => {
                      const c = [...form.checklist]; c[i] = { ...c[i], checked: e.target.checked }; sf({ checklist: c });
                      setLastActiveSection(6);
                    }} />
                  <span className={`flex-1 text-sm ${item.checked ? "text-gray-600 line-through" : "text-gray-800"}`}>
                    {item.label}
                  </span>
                  <input className="input w-20" value={item.initials} placeholder="Initials"
                    onChange={(e) => {
                      const c = [...form.checklist]; c[i] = { ...c[i], initials: e.target.value }; sf({ checklist: c });
                    }} />
                </div>
              ))}
            </div>

            <div>
              <SignaturePad label="Supervisor Signature" onDataUrl={setSigDataUrl} />
            </div>

            <div>
              <label className="label">Additional Notes</label>
              <textarea className={`${inp} resize-none`} rows={3} value={form.notes}
                onChange={(e) => sf({ notes: e.target.value })} />
            </div>

            {/* Save Progress area */}
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
                disabled={submitting || !isAllergenDone || form.checklist.some((c) => !c.checked)}
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
            {isAllergenDone && form.checklist.some((c) => !c.checked) && (
              <p className="text-xs text-gray-400 font-mono">All checklist items must be checked before submitting.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
