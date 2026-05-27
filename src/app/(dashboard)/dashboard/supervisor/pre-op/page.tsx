"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { SignaturePadHandle } from "@/components/SignaturePad";

const SignaturePad = dynamic(() => import("@/components/SignaturePad"), { ssr: false });

// ─── Inspection sections ───────────────────────────────────────────────────────

const SECTIONS = [
  {
    label: "Personnel & Hygiene",
    items: [
      "All personnel wearing proper PPE (hair nets, gloves, aprons)",
      "Hands washed and sanitized before handling food",
      "No jewelry, nail polish, or false nails observed",
      "Personnel with illness or open wounds excluded from production",
    ],
  },
  {
    label: "Facility & Grounds",
    items: [
      "Production area free from debris, pests, or standing water",
      "Drains clean and functioning properly",
      "Doors, windows, and screens in good condition",
      "Lighting adequate and all fixtures protected",
    ],
  },
  {
    label: "Equipment & Utensils",
    items: [
      "All equipment cleaned and sanitized since last use",
      "No damaged or cracked equipment in use",
      "Utensils stored properly (inverted, covered, or elevated)",
      "Cutting surfaces sanitized and in good condition",
    ],
  },
  {
    label: "Sanitation Supplies",
    items: [
      "Sanitizer solution at correct concentration (200–400 ppm)",
      "Color-coded cleaning tools in correct zones",
      "Cleaning chemicals properly labeled and stored",
      "Sanitizing logs completed for previous shift",
    ],
  },
  {
    label: "Temperature & Storage",
    items: [
      "Refrigerators at or below 41°F / 5°C",
      "Freezers at or below 0°F / -18°C",
      "Raw and ready-to-eat foods properly separated",
      "All products labeled with date and allergen information",
    ],
  },
  {
    label: "Corrective Actions",
    items: [
      "Previous shift corrective actions resolved",
      "Non-conforming products properly quarantined or disposed",
      "Corrective action log up to date",
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Result = "PASS" | "FAIL" | "NA";

interface SectionItem {
  section: string;
  item: string;
  result: Result;
  notes: string;
}

interface AtpAttempt {
  attempt_number: number;
  area_swabbed: string;
  rlu_result: string;   // string for input binding; converted to number on submit
  result: "pass" | "warning" | "fail" | null;
  initials: string;
  time_recorded: string;
  locked: boolean;       // UI-only flag; stripped before submission
}

interface AtpSwabState {
  attempts: AtpAttempt[];
  final_result: "pass" | "warning" | "fail" | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInitialItems(): SectionItem[] {
  return SECTIONS.flatMap((s) =>
    s.items.map((item) => ({ section: s.label, item, result: "PASS" as Result, notes: "" }))
  );
}

function initAtpSwab(): AtpSwabState {
  return {
    attempts: [{
      attempt_number: 1,
      area_swabbed: "",
      rlu_result: "",
      result: null,
      initials: "",
      time_recorded: "",
      locked: false,
    }],
    final_result: null,
  };
}

function calcAtpResult(rlu: string): "pass" | "warning" | "fail" | null {
  const n = parseFloat(rlu);
  if (isNaN(n) || rlu.trim() === "") return null;
  if (n <= 10)  return "pass";
  if (n <= 29)  return "warning";
  return "fail";
}

function captureTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// ─── Small Components ─────────────────────────────────────────────────────────

function ResultButton({ value, active, onClick }: { value: Result; active: boolean; onClick: () => void }) {
  const config = {
    PASS: { icon: CheckCircle2, label: "Pass", active: "bg-emerald-600 text-white border-emerald-600", inactive: "border-gray-200 text-gray-400 hover:border-emerald-400 hover:text-emerald-600" },
    FAIL: { icon: XCircle,      label: "Fail", active: "bg-[#D64D4D] text-white border-[#D64D4D]",   inactive: "border-gray-200 text-gray-400 hover:border-red-400 hover:text-[#D64D4D]" },
    NA:   { icon: MinusCircle,  label: "N/A",  active: "bg-gray-500 text-white border-gray-500",      inactive: "border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600" },
  }[value];
  const Icon = config.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-mono font-medium transition-colors",
        active ? config.active : config.inactive
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </button>
  );
}

function AtpResultBadge({ result }: { result: "pass" | "warning" | "fail" | null }) {
  if (!result) return null;
  const cfg = {
    pass:    "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    fail:    "bg-red-100 text-red-700",
  }[result];
  const label = { pass: "PASS", warning: "WARNING", fail: "FAIL" }[result];
  return <span className={cn("badge text-[10px] font-mono font-bold", cfg)}>{label}</span>;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PreOpFormPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const sigRef = useRef<SignaturePadHandle>(null);
  const [date,             setDate]             = useState(() => new Date().toISOString().slice(0, 10));
  const [shift,            setShift]            = useState<"AM" | "PM">("AM");
  const [items,            setItems]            = useState<SectionItem[]>(buildInitialItems);
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [sigDataUrl,       setSigDataUrl]       = useState("");
  const [error,            setError]            = useState("");
  const [loading,          setLoading]          = useState(false);
  const [success,          setSuccess]          = useState(false);

  // ATP Swab state
  const [atpSwab,             setAtpSwab]             = useState<AtpSwabState>(initAtpSwab);
  const [atpInstructionsOpen, setAtpInstructionsOpen] = useState(false);
  const [lastAtpArea,         setLastAtpArea]         = useState<string | null>(null);

  // Fetch last ATP area for rotation hint
  useEffect(() => {
    const role = (session?.user as { role?: string })?.role ?? "";
    if (status === "loading" || (role !== "SUPERVISOR" && role !== "ADMIN")) return;
    fetch("/api/pre-op")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Array<{ atpSwab?: { attempts: AtpAttempt[]; final_result: string | null } }>) => {
        const last = Array.isArray(data) && data[0];
        if (!last || !last.atpSwab?.attempts?.length) return;
        const passing = last.atpSwab.attempts.find(
          (a) => a.result === "pass" || a.result === "warning"
        );
        if (passing) setLastAtpArea(passing.area_swabbed);
      })
      .catch(() => {});
  }, [status, session]);

  // ── Early returns (after all hooks) ──────────────────────────────────────────
  if (status === "loading") return null;

  const role = (session?.user as { role?: string })?.role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return (
      <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm">
        <AlertCircle className="w-4 h-4" /> Access restricted to supervisors and administrators.
      </div>
    );
  }

  // ── Checklist handlers ────────────────────────────────────────────────────────

  function setResult(idx: number, result: Result) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, result } : item)));
  }

  function setNotes(idx: number, notes: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, notes } : item)));
  }

  // ── ATP Swab handlers ─────────────────────────────────────────────────────────

  function updateAtpAttempt(idx: number, field: keyof AtpAttempt, value: string) {
    setAtpSwab((prev) => ({
      ...prev,
      attempts: prev.attempts.map((a, i) => {
        if (i !== idx) return a;
        const updated = { ...a, [field]: value };
        if (field === "rlu_result") updated.result = calcAtpResult(value);
        return updated;
      }),
    }));
  }

  function recordAtpResult(idx: number) {
    const attempt = atpSwab.attempts[idx];
    const result  = calcAtpResult(attempt.rlu_result);
    if (!result || !attempt.area_swabbed.trim() || !attempt.initials.trim()) return;

    const time_recorded = captureTime();

    setAtpSwab((prev) => {
      const locked = prev.attempts.map((a, i) =>
        i === idx ? { ...a, result, time_recorded, locked: true } : a
      );

      if (result === "fail") {
        return {
          attempts: [
            ...locked,
            {
              attempt_number: locked.length + 1,
              area_swabbed:   "",
              rlu_result:     "",
              result:         null,
              initials:       "",
              time_recorded:  "",
              locked:         false,
            },
          ],
          final_result: null,
        };
      }

      return { attempts: locked, final_result: result };
    });
  }

  // ── Derived state ──────────────────────────────────────────────────────────────

  const hasFail  = items.some((i) => i.result === "FAIL");
  const atpDone  = atpSwab.final_result === "pass" || atpSwab.final_result === "warning";

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (hasFail && !correctiveAction.trim()) {
      setError("Corrective action is required when one or more items fail.");
      return;
    }

    if (!atpDone) {
      setError("ATP Swab test must be completed (Pass or Warning) before submitting.");
      return;
    }

    if (!sigDataUrl) {
      setError("Supervisor signature is required.");
      return;
    }

    // Build clean ATP payload (strip UI-only fields, convert rlu to number)
    const atpPayload = {
      attempts: atpSwab.attempts
        .filter((a) => a.locked)
        .map(({ locked: _locked, rlu_result, ...a }) => ({
          ...a,
          rlu_result: parseFloat(rlu_result) || 0,
        })),
      final_result: atpSwab.final_result,
    };

    setLoading(true);
    try {
      const res = await fetch("/api/pre-op", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          shift,
          sections: items,
          atpSwab:  atpPayload,
          correctiveAction,
          supervisorSignature: sigDataUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Submission failed. Please try again.");
        setError(msg);
        return;
      }

      setSuccess(true);
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center space-y-4">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold font-garamond text-gray-900">Inspection Submitted</h2>
        <p className="text-sm text-gray-500 font-mono">Your Pre-Op inspection has been recorded.</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => {
              setItems(buildInitialItems());
              setAtpSwab(initAtpSwab());
              setCorrectiveAction("");
              setSigDataUrl("");
              sigRef.current?.clear();
              setSuccess(false);
            }}
            className="btn-secondary"
          >
            New Inspection
          </button>
          <button onClick={() => router.push("/dashboard/supervisor/pre-op/records")} className="btn-primary">
            View Records <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Group items for rendering ──────────────────────────────────────────────────

  const grouped = SECTIONS.map((s) => ({
    label: s.label,
    items: items.map((item, idx) => ({ ...item, idx })).filter((item) => item.section === s.label),
  }));

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-[#D64D4D]" />
            Pre-Operation Inspection
          </h1>
          <p className="page-subtitle">Complete all items before production begins</p>
        </div>
        <button onClick={() => router.push("/dashboard/supervisor/pre-op/records")} type="button" className="btn-secondary">
          View Records
        </button>
      </div>

      {/* Date + Shift */}
      <div className="card p-5 grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="date">Inspection Date</label>
          <input
            id="date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Shift</label>
          <div className="flex gap-2 mt-1">
            {(["AM", "PM"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShift(s)}
                className={cn(
                  "flex-1 py-2 rounded border text-sm font-mono font-medium transition-colors",
                  shift === s
                    ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                    : "bg-white text-gray-600 border-gray-300 hover:border-[#D64D4D] hover:text-[#D64D4D]"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inspection sections */}
      {grouped.map((section) => (
        <div key={section.label} className="card overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 font-mono">{section.label}</h2>
          </div>

          {/* Checklist items */}
          <div className="divide-y divide-gray-100">
            {section.items.map(({ idx, item, result, notes }) => (
              <div key={idx} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-gray-700 leading-snug flex-1">{item}</p>
                  <div className="flex gap-1.5 shrink-0">
                    {(["PASS", "FAIL", "NA"] as Result[]).map((r) => (
                      <ResultButton key={r} value={r} active={result === r} onClick={() => setResult(idx, r)} />
                    ))}
                  </div>
                </div>
                {result === "FAIL" && (
                  <div className="mt-2">
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Describe the issue…"
                      value={notes}
                      onChange={(e) => setNotes(idx, e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ATP Swab subsection — injected within Equipment & Utensils */}
          {section.label === "Equipment & Utensils" && (
            <div className="border-t border-gray-200">
              {/* Subsection header */}
              <div className="px-5 py-2.5 bg-gray-50/60">
                <p className="text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">
                  ATP Swab Test
                </p>
              </div>

              {/* Equipment rotation hint */}
              {lastAtpArea && (
                <div className="mx-5 mt-3 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                  <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 font-mono">
                    Last ATP swab was performed on: <strong>{lastAtpArea}</strong>. Consider swabbing a different surface today.
                  </p>
                </div>
              )}

              {/* Collapsible UltraSnap instructions */}
              <div className="mx-5 mt-3 border border-amber-200 rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAtpInstructionsOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100/80 transition-colors"
                >
                  <span className="text-sm font-semibold text-amber-800 font-mono">
                    UltraSnap ATP Swab Instructions
                  </span>
                  <ChevronDown
                    className={cn("w-4 h-4 text-amber-600 transition-transform duration-200", atpInstructionsOpen && "rotate-180")}
                  />
                </button>

                {atpInstructionsOpen && (
                  <div className="px-4 py-4 bg-amber-50/40 space-y-3">
                    <ol className="space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
                      <li>Swab a 4 × 4 in. cleaned surface using crisscross motions while rotating swab.</li>
                      <li>Return swab to tube.</li>
                      <li>Snap bulb, squeeze twice, and shake 5–10 seconds.</li>
                      <li>Read in luminometer within 30 seconds.</li>
                    </ol>
                    <div className="pt-1 space-y-1">
                      <p className="text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider mb-1.5">RLU Limits</p>
                      <p className="text-xs font-mono text-emerald-700">
                        ● 0–10 RLU: Pass — Production may start.
                      </p>
                      <p className="text-xs font-mono text-amber-700">
                        ● 11–29 RLU: Warning — Supervisor must communicate with production team to improve cleaning.
                      </p>
                      <p className="text-xs font-mono text-[#D64D4D]">
                        ● 30+ RLU: Fail — Re-clean and re-test before production starts.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Attempt cards */}
              <div className="mx-5 my-3 space-y-3">
                {atpSwab.attempts.map((attempt, idx) => {
                  const liveResult = attempt.locked ? attempt.result : calcAtpResult(attempt.rlu_result);
                  const canRecord  = !attempt.locked
                    && attempt.area_swabbed.trim() !== ""
                    && attempt.rlu_result.trim() !== ""
                    && calcAtpResult(attempt.rlu_result) !== null
                    && attempt.initials.trim() !== "";

                  return (
                    <div key={idx}>
                      <div
                        className={cn(
                          "border rounded-md overflow-hidden",
                          attempt.locked
                            ? attempt.result === "fail"
                              ? "border-red-200 bg-red-50/30"
                              : attempt.result === "warning"
                              ? "border-amber-200 bg-amber-50/30"
                              : "border-emerald-200 bg-emerald-50/30"
                            : "border-gray-200 bg-white"
                        )}
                      >
                        {/* Card header */}
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <span className="text-xs font-mono font-semibold text-gray-700">
                            ATP Swab Attempt #{attempt.attempt_number}
                          </span>
                          <AtpResultBadge result={liveResult} />
                        </div>

                        {/* Locked view */}
                        {attempt.locked ? (
                          <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono text-gray-700">
                            <div>
                              <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Area Swabbed</p>
                              <p>{attempt.area_swabbed}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">RLU Result</p>
                              <p>{attempt.rlu_result}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Initials</p>
                              <p>{attempt.initials}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Time Recorded</p>
                              <p>{attempt.time_recorded}</p>
                            </div>
                          </div>
                        ) : (
                          /* Editable view */
                          <div className="px-4 py-3 space-y-3">
                            <div>
                              <label className="label text-xs">Area Swabbed <span className="text-[#D64D4D]">*</span></label>
                              <input
                                type="text"
                                className="input text-sm"
                                placeholder="e.g. Mixer bowl, conveyor belt, prep table"
                                value={attempt.area_swabbed}
                                onChange={(e) => updateAtpAttempt(idx, "area_swabbed", e.target.value)}
                              />
                            </div>

                            <div>
                              <label className="label text-xs">RLU Result <span className="text-[#D64D4D]">*</span></label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  className="input text-sm w-36"
                                  placeholder="Enter RLU reading"
                                  value={attempt.rlu_result}
                                  min={0}
                                  onChange={(e) => updateAtpAttempt(idx, "rlu_result", e.target.value)}
                                />
                                <AtpResultBadge result={liveResult} />
                              </div>
                              <p className="text-[10px] text-gray-400 font-mono mt-1">
                                RLU Limits: 0–10 = Pass · 11–29 = Warning · 30+ = Fail
                              </p>
                            </div>

                            <div>
                              <label className="label text-xs">Tested By — Initials <span className="text-[#D64D4D]">*</span></label>
                              <input
                                type="text"
                                className="input text-sm w-24 uppercase"
                                placeholder="e.g. JS"
                                maxLength={4}
                                value={attempt.initials}
                                onChange={(e) => updateAtpAttempt(idx, "initials", e.target.value.toUpperCase())}
                              />
                            </div>

                            <button
                              type="button"
                              disabled={!canRecord}
                              onClick={() => recordAtpResult(idx)}
                              className={cn(
                                "btn-primary text-sm w-full",
                                !canRecord && "opacity-40 cursor-not-allowed"
                              )}
                            >
                              Record Result
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Fail alert between locked FAIL and next attempt */}
                      {attempt.locked && attempt.result === "fail" && idx < atpSwab.attempts.length - 1 && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 mt-2">
                          <XCircle className="w-4 h-4 text-[#D64D4D] shrink-0 mt-0.5" />
                          <p className="text-xs text-red-700 font-mono">
                            ATP reading exceeds acceptable threshold (30+ RLU). Re-clean the area and perform a new swab test before proceeding.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Final result banner */}
              {atpSwab.final_result === "pass" && (
                <div className="mx-5 mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-700 font-mono">
                    ✓ ATP Swab Passed. Equipment cleared for production.
                  </p>
                </div>
              )}
              {atpSwab.final_result === "warning" && (
                <div className="mx-5 mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 font-mono">
                    ⚠ ATP result in warning range. Supervisor must communicate with production team to improve cleaning.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Corrective Action */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 font-mono">
          Corrective Action
          {hasFail && <span className="ml-2 text-[#D64D4D] text-xs">(required — one or more items failed)</span>}
        </h2>
        <textarea
          className="input min-h-[80px] resize-y"
          placeholder={hasFail ? "Describe corrective actions taken before proceeding…" : "Optional — note any items deferred or monitored"}
          value={correctiveAction}
          onChange={(e) => setCorrectiveAction(e.target.value)}
          required={hasFail}
        />
      </div>

      {/* Supervisor signature */}
      <div className="card p-5">
        <SignaturePad
          ref={sigRef}
          label="Supervisor Signature"
          onDataUrl={setSigDataUrl}
        />
        <p className="text-xs text-gray-400 font-mono mt-2">By signing, you certify the facility meets pre-operation requirements.</p>
      </div>

      {/* ATP swab incomplete notice */}
      {!atpDone && atpSwab.attempts.some((a) => a.locked) && (
        <div className="flex items-center gap-2.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          ATP Swab test must reach Pass or Warning before the form can be submitted.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <button
          type="button"
          onClick={() => { setItems(buildInitialItems()); setAtpSwab(initAtpSwab()); }}
          className="btn-secondary"
        >
          Reset
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit Inspection"}
        </button>
      </div>
    </form>
  );
}
