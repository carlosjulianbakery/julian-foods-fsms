"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import dynamic from "next/dynamic";
import type { SignaturePadHandle } from "@/components/SignaturePad";

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
  presentations: Presentation[];   // mapped from DB packaging field
  ovensAvailable: string[];
  calibrationWeights: { label: string }[];
  ccpChecks: CcpCheck[];           // mapped from DB ccpSettings field
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

// ─── Pass/fail helper ─────────────────────────────────────────────────────────

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
        check_id:       check.id,
        label:          check.label,
        type:           check.type,
        readings:       Array(check.num_readings).fill(""),
        pass:           null,
        corrective_action: "",
        visual_result:  null,
        visual_notes:   "",
      })),
    })),
    eopValues: {},
    checklist: t.releaseChecklistItems.map((label) => ({ label, checked: false, initials: "" })),
    notes: "",
  };
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
}: {
  templates: Template[];
  supervisorName: string;
}) {
  const router = useRouter();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function selectTemplate(t: Template) {
    setSelected(t);
    setForm(initForm(t, supervisorName));
    setSubmitError("");
  }

  function backToTemplates() { setSelected(null); setForm(null); }

  const sf = (patch: Partial<FormState>) => setForm((f) => f ? { ...f, ...patch } : f);

  const bowlsNum = parseInt(form?.bowlsProduced ?? "") || 0;

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
    const pass = ccpTemplate
      ? computeCheckPass(ccpTemplate, readings, check.visual_result)
      : null;

    checks[checkIdx] = { ...check, readings, pass };
    session.checks = checks;
    sessions[sessionIdx] = session;
    sf({ ccpSessions: sessions });
  }

  function updateVisualResult(sessionIdx: number, checkIdx: number, result: "pass" | "issue") {
    if (!form || !selected) return;
    const sessions = [...form.ccpSessions];
    const session = { ...sessions[sessionIdx] };
    const checks = [...session.checks];
    const check = { ...checks[checkIdx] };
    const ccpTemplate = selected.ccpChecks.find((c) => c.id === check.check_id);
    const pass = ccpTemplate
      ? computeCheckPass(ccpTemplate, check.readings, result)
      : null;
    checks[checkIdx] = { ...check, visual_result: result, pass };
    session.checks = checks;
    sessions[sessionIdx] = session;
    sf({ ccpSessions: sessions });
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
        return {
          ...p,
          materials: p.materials.map((m) =>
            m.id === mid ? { ...m, [field]: value } : m
          ),
        };
      }),
    });
  }

  // ── EOP value update ──────────────────────────────────────────────────────────

  function setEopValue(fieldId: string, value: string) {
    if (!form) return;
    sf({ eopValues: { ...form.eopValues, [fieldId]: value } });
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!form || !selected) return;
    if (!sigRef.current || sigRef.current.isEmpty()) { setSubmitError("Supervisor signature is required."); return; }
    const unchecked = form.checklist.some((c) => !c.checked);
    if (unchecked) { setSubmitError("All release checklist items must be checked."); return; }
    if (selected.ccpRequireTimestamp) {
      const missingTime = form.ccpSessions.some((s) => !s.check_time);
      if (missingTime) { setSubmitError("Time of check is required for all CCP sessions."); return; }
    }

    // Validate required EOP fields
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

      // Build section4 as array of field entries
      const section4 = selected.endOfProductionFields.map((field, i) => ({
        field_id:   field.id,
        label:      field.label,
        field_type: field.field_type,
        value:      form.eopValues[field.id] ?? "",
        order:      i,
      }));

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
          section2: {
            bowls_produced: parseInt(form.bowlsProduced) || 0,
            ingredients:    form.ingredients,
            presentations:  form.presentations.map((pres) => ({
              presentation_id:   pres.presentation_id,
              presentation_name: pres.presentation_name,
              selected:          pres.selected,
              materials:         pres.materials.map((m) => ({
                id:          m.id,
                name:        m.name,
                qty_per_bowl: m.qty_per_bowl,
                qty_used:    parseFloat(m.qty_used) || 0,
                food_contact: m.food_contact,
                ...(m.food_contact ? { supplier: m.supplier, lot_number: m.lot_number } : {}),
              })),
            })),
          },
          section3: form.ccpSessions,
          section4,
          section5: {
            checklist:            form.checklist,
            supervisor_signature: sigRef.current?.toDataURL() ?? "",
            all_passed:           status === "PASS",
          },
          notes: form.notes || null,
          status,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Submit failed");
      router.push("/dashboard/supervisor/batch-sheet/records");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

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
                  <button onClick={() => selectTemplate(t)} className="btn-primary mt-auto">
                    Start Batch Sheet
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── 5-section form ────────────────────────────────────────────────────────

  const sectionHdr = (n: number, title: string) => (
    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2">
        <span className="w-6 h-6 bg-[#D64D4D] text-white rounded-full text-xs flex items-center justify-center font-bold shrink-0">{n}</span>
        {title}
      </h2>
    </div>
  );

  const inp = "input";

  // Sort EOP fields by order
  const sortedEopFields = [...selected.endOfProductionFields].sort((a, b) => a.order - b.order);

  return (
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
      <div className="card">
        {sectionHdr(1, "Pre-Production Setup")}
        <div className="p-6 space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Production Date *</label>
              <input type="date" className={inp} value={form.productionDate} placeholder="MM/DD/YYYY"
                onChange={(e) => sf({ productionDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Production Lot</label>
              <input className={inp} value={form.productionLot} placeholder="e.g. LOT-001"
                onChange={(e) => sf({ productionLot: e.target.value })} />
            </div>
            <div>
              <label className="label">Expiration Date</label>
              <input type="date" className={inp} value={form.expirationDate} placeholder="MM/DD/YYYY"
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

          {/* Scale Calibration — auto pass/fail */}
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

      {/* ── SECTION 2 — Batch Recipe ── */}
      <div className="card">
        {sectionHdr(2, "Batch Recipe")}
        <div className="p-6 space-y-5">
          <div>
            <label className="label">Bowls Produced *</label>
            <input type="number" className={`${inp} w-36`} min="1" value={form.bowlsProduced}
              onChange={(e) => sf({ bowlsProduced: e.target.value })} placeholder="e.g. 10" />
          </div>

          {/* Ingredients */}
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

          {/* Presentations */}
          {form.presentations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Packaging Materials</h3>
              <div className="space-y-4">
                {form.presentations.map((pres) => (
                  <div key={pres.presentation_id}
                    className={`border rounded-lg overflow-hidden ${pres.selected ? "border-emerald-200 bg-emerald-50/20" : "border-gray-200 bg-gray-50/30 opacity-70"}`}>
                    {/* Presentation header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white/60">
                      <input type="checkbox"
                        className="w-4 h-4 accent-emerald-600"
                        checked={pres.selected}
                        onChange={(e) => togglePresentation(pres.presentation_id, e.target.checked)} />
                      <span className="font-semibold text-sm text-gray-800">{pres.presentation_name}</span>
                      {pres.selected && (
                        <span className="badge bg-emerald-100 text-emerald-700 text-[10px] ml-1">Selected</span>
                      )}
                      {!pres.selected && (
                        <span className="text-xs text-gray-400 font-mono ml-1">
                          {pres.materials.length} material{pres.materials.length !== 1 ? "s" : ""} (not used)
                        </span>
                      )}
                    </div>

                    {/* Materials table — only show when selected */}
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
                                  {mat.food_contact ? (
                                    <input className={inp} value={mat.supplier} placeholder="Supplier"
                                      onChange={(e) => updateMaterialField(pres.presentation_id, mat.id, "supplier", e.target.value)} />
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {mat.food_contact ? (
                                    <input className={inp} value={mat.lot_number} placeholder="Lot #"
                                      onChange={(e) => updateMaterialField(pres.presentation_id, mat.id, "lot_number", e.target.value)} />
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
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

      {/* ── SECTION 3 — CCP Monitoring ── */}
      <div className="card">
        {sectionHdr(3, "CCP Monitoring")}
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
                  <div className="px-0 pt-0">
                    <label className="label">Time of Check</label>
                    <input
                      type="time"
                      className="input w-36"
                      value={session.check_time}
                      onChange={(e) => updateSessionField(sessionIdx, "check_time", e.target.value)}
                    />
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

                      {/* Temperature / Weight / Custom — show num_readings inputs */}
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

                          {/* Threshold hint */}
                          {ccpTemplate && check.type === "temperature" && ccpTemplate.min_value !== null && (
                            <p className="text-[10px] text-gray-400 font-mono mt-1">
                              Min: {ccpTemplate.min_value}{ccpTemplate.unit}
                            </p>
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

                      {/* Visual Inspection */}
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

                {/* Session initials */}
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

      {/* ── SECTION 4 — End of Production Summary ── */}
      <div className="card">
        {sectionHdr(4, "End of Production Summary")}
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
                      <textarea
                        className={inp}
                        rows={3}
                        value={value}
                        onChange={(e) => setEopValue(field.id, e.target.value)}
                      />
                    </div>
                  );
                }

                if (field.field_type === "yes_no") {
                  return (
                    <div key={field.id}>
                      {labelEl}
                      <div className="flex rounded-md overflow-hidden border border-gray-200 w-fit">
                        <button
                          type="button"
                          onClick={() => setEopValue(field.id, value === "yes" ? "" : "yes")}
                          className={`px-4 py-1.5 text-sm font-medium transition-colors ${value === "yes" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setEopValue(field.id, value === "no" ? "" : "no")}
                          className={`px-4 py-1.5 text-sm font-medium border-l border-gray-200 transition-colors ${value === "no" ? "bg-red-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                }

                if (field.field_type === "checkbox") {
                  return (
                    <div key={field.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[#D64D4D]"
                        checked={value === "true"}
                        onChange={(e) => setEopValue(field.id, e.target.checked ? "true" : "false")}
                      />
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
                      <input
                        type="date"
                        className={inp}
                        value={value}
                        placeholder="MM/DD/YYYY"
                        onChange={(e) => setEopValue(field.id, e.target.value)}
                      />
                    </div>
                  );
                }

                if (field.field_type === "number") {
                  return (
                    <div key={field.id}>
                      {labelEl}
                      <input
                        type="number"
                        className={inp}
                        step="any"
                        min="0"
                        value={value}
                        onChange={(e) => setEopValue(field.id, e.target.value)}
                      />
                    </div>
                  );
                }

                // Default: text
                return (
                  <div key={field.id}>
                    {labelEl}
                    <input
                      type="text"
                      className={inp}
                      value={value}
                      onChange={(e) => setEopValue(field.id, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 5 — Product Release Checklist ── */}
      <div className="card">
        {sectionHdr(5, "Product Release Checklist")}
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            {form.checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <input type="checkbox" className="w-4 h-4 accent-brand-600 shrink-0"
                  checked={item.checked}
                  onChange={(e) => {
                    const c = [...form.checklist]; c[i] = { ...c[i], checked: e.target.checked }; sf({ checklist: c });
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
            <SignaturePad ref={sigRef} label="Supervisor Signature" />
          </div>

          <div>
            <label className="label">Additional Notes</label>
            <textarea className={`${inp} resize-none`} rows={3} value={form.notes}
              onChange={(e) => sf({ notes: e.target.value })} />
          </div>

          {submitError && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {submitError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || form.checklist.some((c) => !c.checked)}
            className="btn-primary"
          >
            {submitting ? "Submitting…" : "Submit Batch Sheet"}
          </button>

          {form.checklist.some((c) => !c.checked) && (
            <p className="text-xs text-gray-400 font-mono">All checklist items must be checked before submitting.</p>
          )}
        </div>
      </div>
    </div>
  );
}
