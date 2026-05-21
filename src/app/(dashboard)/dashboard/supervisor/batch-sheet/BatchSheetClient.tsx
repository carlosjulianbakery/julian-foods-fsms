"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CcpSettings = { min_temp_f: number; min_weight_oz: number; max_weight_oz: number };
type IngTpl = { id: string; name: string; quantity_per_bowl: number; unit: string };
type PkgTpl = { id: string; name: string; units_per_n_flatbreads: number };

export type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  ingredients: IngTpl[];
  packaging: PkgTpl[];
  ovensAvailable: string[];
  calibrationWeights: { label: string }[];
  ccpSettings: CcpSettings;
  releaseChecklistItems: string[];
};

type CalibRow  = { label: string; reading: string; pass: boolean | null; corrective_action: string };
type IngRow    = IngTpl & { supplier: string; lot_number: string };
type PkgRow    = PkgTpl & { supplier: string; lot_number: string };
type BowlEntry = {
  bowl_number: number;
  temp1: string; temp2: string; temp_pass: boolean | null; temp_corrective_action: string;
  weight1: string; weight2: string; weight_pass: boolean | null; weight_corrective_action: string;
  visual_pass: boolean | null; visual_notes: string; initials: string;
};
type QualityRating = "excellent" | "satisfactory" | "fair" | "bad" | "";

type FormState = {
  productionDate: string; productionLot: string; expirationDate: string;
  shift: "AM" | "PM"; supervisorName: string; numEmployees: string;
  ovensUsed: string[]; calibration: CalibRow[]; s1Initials: string;
  bowlsPlanned: string; ingredients: IngRow[]; packaging: PkgRow[];
  bowls: BowlEntry[];
  bowlsProduced: string; totalBoxes: string; extraBags: string;
  yieldPerBowl: string; waste: string; bakeDate: string; prodHours: string;
  packLabeledAs: string; packLot: string; packExpDate: string; packReviewer: string; packComments: string;
  qualityColor: QualityRating; qualityShape: QualityRating; qualitySmell: QualityRating;
  qualityTaste: QualityRating; qualityOverall: QualityRating; qualityComments: string;
  checklist: { label: string; checked: boolean; initials: string }[];
  supervisorSignature: string; notes: string;
};

function initForm(t: Template, supervisorName: string): FormState {
  const today = new Date().toISOString().split("T")[0];
  return {
    productionDate: today, productionLot: "", expirationDate: "",
    shift: "AM", supervisorName, numEmployees: "",
    ovensUsed: [],
    calibration: t.calibrationWeights.map((w) => ({ label: w.label, reading: "", pass: null, corrective_action: "" })),
    s1Initials: "",
    bowlsPlanned: "",
    ingredients: t.ingredients.map((i) => ({ ...i, supplier: "", lot_number: "" })),
    packaging:   t.packaging.map((p) => ({ ...p, supplier: "", lot_number: "" })),
    bowls: [newBowl(1)],
    bowlsProduced: "", totalBoxes: "", extraBags: "",
    yieldPerBowl: "", waste: "", bakeDate: today, prodHours: "",
    packLabeledAs: t.name, packLot: "", packExpDate: "", packReviewer: "", packComments: "",
    qualityColor: "", qualityShape: "", qualitySmell: "", qualityTaste: "", qualityOverall: "",
    qualityComments: "",
    checklist: t.releaseChecklistItems.map((label) => ({ label, checked: false, initials: "" })),
    supervisorSignature: "", notes: "",
  };
}

function newBowl(n: number): BowlEntry {
  return {
    bowl_number: n, temp1: "", temp2: "", temp_pass: null, temp_corrective_action: "",
    weight1: "", weight2: "", weight_pass: null, weight_corrective_action: "",
    visual_pass: null, visual_notes: "", initials: "",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function passChip(pass: boolean | null) {
  if (pass === null) return <span className="badge bg-gray-100 text-gray-400">—</span>;
  return pass
    ? <span className="badge bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />PASS</span>
    : <span className="badge bg-red-100 text-red-700 flex items-center gap-1"><XCircle className="w-3 h-3" />FAIL</span>;
}

const qualityOptions: QualityRating[] = ["excellent", "satisfactory", "fair", "bad"];
const qualityLabel: Record<string, string> = {
  excellent: "Excellent", satisfactory: "Satisfactory", fair: "Fair", bad: "Bad",
};
const qualityColor: Record<string, string> = {
  excellent: "bg-emerald-100 text-emerald-700", satisfactory: "bg-blue-100 text-blue-700",
  fair: "bg-yellow-100 text-yellow-700", bad: "bg-red-100 text-red-700",
};

function computeStatus(bowls: BowlEntry[]): string {
  if (!bowls.length) return "COMPLETE";
  const anyFail = bowls.some((b) => b.temp_pass === false || b.weight_pass === false || b.visual_pass === false);
  if (!anyFail) return "PASS";
  const allCorrected = bowls.every((b) => {
    if (b.temp_pass === false   && !b.temp_corrective_action?.trim())   return false;
    if (b.weight_pass === false && !b.weight_corrective_action?.trim()) return false;
    if (b.visual_pass === false && !b.visual_notes?.trim())             return false;
    return true;
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
  const ccp = selected?.ccpSettings ?? { min_temp_f: 190, min_weight_oz: 3.5, max_weight_oz: 4.2 };
  const bowlsNum = parseInt(form?.bowlsPlanned ?? "") || 0;

  // Bowl CCP auto-calc
  function updateBowl(idx: number, field: string, value: string | boolean | null) {
    if (!form) return;
    const updated = form.bowls.map((b, i) => {
      if (i !== idx) return b;
      const nb = { ...b, [field]: value };
      if (field === "temp1" || field === "temp2") {
        const t1 = parseFloat(field === "temp1" ? value as string : b.temp1);
        const t2 = parseFloat(field === "temp2" ? value as string : b.temp2);
        nb.temp_pass = !isNaN(t1) && !isNaN(t2) ? (t1 >= ccp.min_temp_f && t2 >= ccp.min_temp_f) : null;
      }
      if (field === "weight1" || field === "weight2") {
        const w1 = parseFloat(field === "weight1" ? value as string : b.weight1);
        const w2 = parseFloat(field === "weight2" ? value as string : b.weight2);
        nb.weight_pass = !isNaN(w1) && !isNaN(w2)
          ? (w1 >= ccp.min_weight_oz && w1 <= ccp.max_weight_oz && w2 >= ccp.min_weight_oz && w2 <= ccp.max_weight_oz)
          : null;
      }
      return nb;
    });
    sf({ bowls: updated });
  }

  function addBowl() {
    if (!form) return;
    sf({ bowls: [...form.bowls, newBowl(form.bowls.length + 1)] });
  }

  async function handleSubmit() {
    if (!form || !selected) return;
    if (!form.supervisorSignature.trim()) { setSubmitError("Supervisor signature is required."); return; }
    const unchecked = form.checklist.some((c) => !c.checked);
    if (unchecked) { setSubmitError("All release checklist items must be checked."); return; }

    setSubmitting(true);
    setSubmitError("");
    try {
      const status = computeStatus(form.bowls);
      const res = await fetch("/api/batch-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selected.id,
          templateName: selected.name,
          productionDate: form.productionDate,
          productionLot:  form.productionLot || null,
          expirationDate: form.expirationDate || null,
          shift: form.shift,
          supervisorName: form.supervisorName,
          numEmployees: form.numEmployees || null,
          section1: {
            ovens_used: form.ovensUsed,
            calibration: form.calibration,
            initials: form.s1Initials,
          },
          section2: {
            bowls_planned: bowlsNum,
            ingredients: form.ingredients,
            packaging: form.packaging.map((p) => ({
              ...p,
              quantity_needed: bowlsNum > 0 ? Math.ceil(bowlsNum / p.units_per_n_flatbreads) : 0,
            })),
          },
          section3: form.bowls,
          section4: {
            bowls_produced: form.bowlsProduced, total_boxes: form.totalBoxes,
            extra_bags: form.extraBags, yield_per_bowl: form.yieldPerBowl,
            waste: form.waste, bake_date: form.bakeDate, prod_hours: form.prodHours,
            packaging_review: {
              product_labeled_as: form.packLabeledAs, lot_on_package: form.packLot,
              exp_date_on_package: form.packExpDate, reviewer: form.packReviewer, comments: form.packComments,
            },
            quality: {
              color: form.qualityColor, shape: form.qualityShape, smell: form.qualitySmell,
              taste: form.qualityTaste, overall: form.qualityOverall, comments: form.qualityComments,
            },
          },
          section5: {
            checklist: form.checklist,
            supervisor_signature: form.supervisorSignature,
            all_passed: status === "PASS",
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
    // Group templates by category
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
                    <span>{t.packaging.length} packaging items</span>
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
  const fieldRow = "flex flex-col sm:flex-row sm:items-center gap-1";

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

      {/* ── SECTION 1 ── */}
      <div className="card">
        {sectionHdr(1, "Pre-Production Setup")}
        <div className="p-6 space-y-5">

          {/* Date / lot / shift row */}
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
              <select className={inp} value={form.shift} onChange={(e) => sf({ shift: e.target.value as "AM" | "PM" })}>
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

          {/* Ovens */}
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

          {/* Calibration */}
          {form.calibration.length > 0 && (
            <div>
              <label className="label">Scale Calibration</label>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal">Weight</th>
                      <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-32">Reading</th>
                      <th className="text-left py-2 pr-3 text-xs font-mono text-gray-400 font-normal w-24">Pass/Fail</th>
                      <th className="text-left py-2 text-xs font-mono text-gray-400 font-normal">Corrective Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {form.calibration.map((row, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 font-medium text-gray-700">{row.label}</td>
                        <td className="py-1.5 pr-3">
                          <input className={inp} value={row.reading} placeholder="e.g. 10.01"
                            onChange={(e) => {
                              const c = [...form.calibration]; c[i] = { ...c[i], reading: e.target.value }; sf({ calibration: c });
                            }} />
                        </td>
                        <td className="py-1.5 pr-3">
                          <select className={inp} value={row.pass === null ? "" : row.pass ? "pass" : "fail"}
                            onChange={(e) => {
                              const c = [...form.calibration];
                              c[i] = { ...c[i], pass: e.target.value === "" ? null : e.target.value === "pass" };
                              sf({ calibration: c });
                            }}>
                            <option value="">—</option>
                            <option value="pass">Pass</option>
                            <option value="fail">Fail</option>
                          </select>
                        </td>
                        <td className="py-1.5">
                          {row.pass === false && (
                            <input className={inp} value={row.corrective_action} placeholder="Corrective action taken"
                              onChange={(e) => {
                                const c = [...form.calibration]; c[i] = { ...c[i], corrective_action: e.target.value }; sf({ calibration: c });
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

      {/* ── SECTION 2 ── */}
      <div className="card">
        {sectionHdr(2, "Batch Recipe")}
        <div className="p-6 space-y-5">
          <div>
            <label className="label">Bowls Planned *</label>
            <input type="number" className={`${inp} w-36`} min="1" value={form.bowlsPlanned}
              onChange={(e) => sf({ bowlsPlanned: e.target.value })} placeholder="e.g. 10" />
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

          {/* Packaging */}
          {form.packaging.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Packaging Materials</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Material", "Every N flatbreads", "Qty Needed", "Supplier", "Lot #"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-mono text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {form.packaging.map((pkg, i) => {
                      const qty = bowlsNum > 0 ? Math.ceil(bowlsNum / pkg.units_per_n_flatbreads) : "—";
                      return (
                        <tr key={pkg.id}>
                          <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{pkg.name}</td>
                          <td className="px-3 py-2 text-gray-600 text-center">{pkg.units_per_n_flatbreads}</td>
                          <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{qty}</td>
                          <td className="px-3 py-2">
                            <input className={inp} value={pkg.supplier} placeholder="Supplier"
                              onChange={(e) => {
                                const a = [...form.packaging]; a[i] = { ...a[i], supplier: e.target.value }; sf({ packaging: a });
                              }} />
                          </td>
                          <td className="px-3 py-2">
                            <input className={inp} value={pkg.lot_number} placeholder="Lot #"
                              onChange={(e) => {
                                const a = [...form.packaging]; a[i] = { ...a[i], lot_number: e.target.value }; sf({ packaging: a });
                              }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 3 ── */}
      <div className="card">
        {sectionHdr(3, "CCP Monitoring Per Bowl")}
        <div className="p-6 space-y-4">
          <div className="text-xs text-gray-400 font-mono">
            CCP limits — Temp: ≥ {ccp.min_temp_f}°F &nbsp;|&nbsp; Weight: {ccp.min_weight_oz}–{ccp.max_weight_oz} oz
          </div>

          {form.bowls.map((bowl, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-700">Bowl {bowl.bowl_number}</span>
                {bowl.temp_pass === false && <span className="badge bg-red-100 text-red-700 text-[10px]">Temp Fail</span>}
                {bowl.weight_pass === false && <span className="badge bg-red-100 text-red-700 text-[10px]">Weight Fail</span>}
                {bowl.visual_pass === false && <span className="badge bg-amber-100 text-amber-700 text-[10px]">Visual Issue</span>}
              </div>
              <div className="p-4 space-y-4">

                {/* Temperature */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider mb-2">Internal Temperature (°F)</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Reading 1</label>
                      <input type="number" className={`${inp} w-24`} step="0.1" value={bowl.temp1}
                        onChange={(e) => updateBowl(idx, "temp1", e.target.value)} placeholder="°F" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Reading 2</label>
                      <input type="number" className={`${inp} w-24`} step="0.1" value={bowl.temp2}
                        onChange={(e) => updateBowl(idx, "temp2", e.target.value)} placeholder="°F" />
                    </div>
                    {passChip(bowl.temp_pass)}
                  </div>
                  {bowl.temp_pass === false && (
                    <div className="mt-2">
                      <input className={inp} value={bowl.temp_corrective_action} placeholder="Corrective action taken"
                        onChange={(e) => updateBowl(idx, "temp_corrective_action", e.target.value)} />
                    </div>
                  )}
                  {bowl.temp1 && bowl.temp2 && bowl.temp_pass === false && !bowl.temp_corrective_action && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Corrective action required for temp failure
                    </p>
                  )}
                </div>

                {/* Weight */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider mb-2">Net Weight (oz)</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Reading 1</label>
                      <input type="number" className={`${inp} w-24`} step="0.01" value={bowl.weight1}
                        onChange={(e) => updateBowl(idx, "weight1", e.target.value)} placeholder="oz" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Reading 2</label>
                      <input type="number" className={`${inp} w-24`} step="0.01" value={bowl.weight2}
                        onChange={(e) => updateBowl(idx, "weight2", e.target.value)} placeholder="oz" />
                    </div>
                    {passChip(bowl.weight_pass)}
                  </div>
                  {bowl.weight_pass === false && (
                    <div className="mt-2">
                      <input className={inp} value={bowl.weight_corrective_action} placeholder="Corrective action taken"
                        onChange={(e) => updateBowl(idx, "weight_corrective_action", e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Visual */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider mb-2">Visual Inspection</p>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => updateBowl(idx, "visual_pass", true)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${bowl.visual_pass === true ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                      ✓ Pass
                    </button>
                    <button type="button"
                      onClick={() => updateBowl(idx, "visual_pass", false)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${bowl.visual_pass === false ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-200 hover:border-red-400"}`}>
                      ⚠ Foreign Material Found
                    </button>
                  </div>
                  {bowl.visual_pass === false && (
                    <div className="mt-2">
                      <input className={inp} value={bowl.visual_notes} placeholder="Describe findings and corrective action"
                        onChange={(e) => updateBowl(idx, "visual_notes", e.target.value)} />
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Initials</label>
                  <input className={`${inp} w-20`} value={bowl.initials} placeholder="JD"
                    onChange={(e) => updateBowl(idx, "initials", e.target.value)} />
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={addBowl} className="btn-secondary">
            <Plus className="w-4 h-4" /> Add Bowl
          </button>
        </div>
      </div>

      {/* ── SECTION 4 ── */}
      <div className="card">
        {sectionHdr(4, "End of Production Summary")}
        <div className="p-6 space-y-5">

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label: "Bowls Produced", key: "bowlsProduced" },
              { label: "Total Boxes",    key: "totalBoxes" },
              { label: "Extra Bags",     key: "extraBags" },
              { label: "Yield / Bowl",   key: "yieldPerBowl" },
              { label: "Waste",          key: "waste" },
              { label: "Production Hours", key: "prodHours" },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input type="number" className={inp} step="0.01" min="0"
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => sf({ [key]: e.target.value } as Partial<FormState>)} />
              </div>
            ))}
            <div>
              <label className="label">Bake Date</label>
              <input type="date" className={inp} value={form.bakeDate} onChange={(e) => sf({ bakeDate: e.target.value })} />
            </div>
          </div>

          {/* Packaging Review */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Packaging Review</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Product Labeled As", key: "packLabeledAs" },
                { label: "Lot on Package",     key: "packLot" },
                { label: "Exp Date on Package",key: "packExpDate" },
                { label: "Reviewed By",        key: "packReviewer" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input className={inp} value={(form as Record<string, string>)[key]}
                    onChange={(e) => sf({ [key]: e.target.value } as Partial<FormState>)} />
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="label">Comments</label>
                <input className={inp} value={form.packComments} onChange={(e) => sf({ packComments: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Quality Check */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Quality Check</h3>
            <div className="overflow-x-auto">
              <table className="text-sm w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-xs font-mono text-gray-400 font-normal">Attribute</th>
                    {qualityOptions.map((o) => (
                      <th key={o} className="text-center py-2 px-3 text-xs font-mono text-gray-400 font-normal capitalize whitespace-nowrap">{qualityLabel[o]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(["qualityColor","qualityShape","qualitySmell","qualityTaste","qualityOverall"] as const).map((field) => {
                    const label = field.replace("quality","").charAt(0).toUpperCase() + field.replace("quality","").slice(1);
                    return (
                      <tr key={field}>
                        <td className="py-2 pr-4 font-medium text-gray-700">{label}</td>
                        {qualityOptions.map((o) => (
                          <td key={o} className="py-2 px-3 text-center">
                            <input type="radio" name={field} value={o} checked={form[field] === o}
                              onChange={() => sf({ [field]: o } as Partial<FormState>)}
                              className="w-4 h-4 accent-brand-600" />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <label className="label">Quality Comments</label>
              <input className={inp} value={form.qualityComments} onChange={(e) => sf({ qualityComments: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 5 ── */}
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
            <label className="label">Supervisor Signature (full name) *</label>
            <input className={`${inp} max-w-sm`} value={form.supervisorSignature}
              onChange={(e) => sf({ supervisorSignature: e.target.value })}
              placeholder="Type full name as signature" />
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
            disabled={submitting || form.checklist.some((c) => !c.checked) || !form.supervisorSignature.trim()}
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
