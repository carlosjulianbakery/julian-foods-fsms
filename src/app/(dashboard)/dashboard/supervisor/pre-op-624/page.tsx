"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckCircle2, AlertTriangle, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPacificToday } from "@/lib/pacific-time";
import { FormHeader624 } from "@/components/forms624/FormHeader624";
import { OkNotOkRow } from "@/components/forms624/OkNotOkRow";
import type { RowSnapshot, RowCondition } from "@/components/forms624/types";
import { FRIDGE_MAX_F, FREEZER_MAX_F, ATP_MAX_RLU } from "@/components/forms624/types";

// ─── Checklist definition ─────────────────────────────────────────────────────

interface RowDef {
  key: string;
  label: string;
  section: string;
  tempLimit?: number;  // present = temperature row; value = limit in °F
  atpLimit?: number;   // present = ATP row; value = RLU limit
}

const ROWS: RowDef[] = [
  // Personnel & Hygiene
  { key: "hairnet",        label: "Hair nets / beard nets worn",             section: "Personnel & Hygiene" },
  { key: "gloves",         label: "Gloves in good condition, changed between tasks", section: "Personnel & Hygiene" },
  { key: "uniforms",       label: "Clean uniforms / aprons",                 section: "Personnel & Hygiene" },
  // Equipment & Surfaces
  { key: "surfaces",       label: "Food-contact surfaces clean & sanitized", section: "Equipment & Surfaces" },
  { key: "equipment",      label: "Equipment in good repair, no damage",     section: "Equipment & Surfaces" },
  { key: "utensils",       label: "Utensils clean & stored properly",        section: "Equipment & Surfaces" },
  // Temperature
  { key: "fridge_temp",    label: `Refrigerator temp (OK ≤ ${FRIDGE_MAX_F}°F)`, section: "Temperature", tempLimit: FRIDGE_MAX_F },
  { key: "freezer_temp",   label: `Freezer temp (OK ≤ ${FREEZER_MAX_F}°F)`, section: "Temperature", tempLimit: FREEZER_MAX_F },
  // Facility
  { key: "pests",          label: "No evidence of pests",                    section: "Facility" },
  { key: "trash",          label: "Trash cans emptied & lined",              section: "Facility" },
  { key: "floors",         label: "Floors clean & dry",                      section: "Facility" },
  // Supplies & Labels
  { key: "sanitizer",      label: "Sanitizer buckets at correct concentration", section: "Supplies & Labels" },
  { key: "labels",         label: "Products properly labeled / dated",       section: "Supplies & Labels" },
  // ATP
  { key: "atp_swab",       label: `ATP swab result (OK ≤ ${ATP_MAX_RLU} RLU)`, section: "ATP Swab", atpLimit: ATP_MAX_RLU },
];

const SECTIONS = Array.from(new Set(ROWS.map((r) => r.section)));

const DRAFT_KEY = "preop_624_draft";

// ─── Initial row state ────────────────────────────────────────────────────────

function makeInitialRows(conductedBy: string): RowSnapshot[] {
  return ROWS.map((def) => ({
    key:              def.key,
    label:            def.label,
    condition:        "OK" as RowCondition,
    initials:         conductedBy,
    correctiveAction: "",
    reInspected:      false,
    reInspectedAt:    null,
    tempValue:        null,
    tempLimit:        def.tempLimit ?? null,
    reInspectTempValue: null,
    atpRlu:           null,
    atpLimit:         def.atpLimit ?? null,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreOp624Page() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskInstanceId = searchParams.get("taskId") ?? undefined;

  const today = getPacificToday();
  const nowTime = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  const [date, setDate] = useState(today);
  const [time, setTime] = useState(nowTime);
  const [conductedBy, setConductedBy] = useState("");
  const [rows, setRows] = useState<RowSnapshot[]>(() => makeInitialRows(""));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const draftTimer = useRef<NodeJS.Timeout | null>(null);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        date: string; time: string; conductedBy: string; rows: RowSnapshot[];
      };
      if (draft.rows?.length === ROWS.length) {
        setDate(draft.date);
        setTime(draft.time);
        setConductedBy(draft.conductedBy);
        setRows(draft.rows);
      }
    } catch {
      // corrupted draft — ignore
    }
  }, []);

  // Auto-save draft 1s after last change
  const saveDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ date, time, conductedBy, rows }));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch {}
    }, 1000);
  }, [date, time, conductedBy, rows]);

  useEffect(() => { saveDraft(); }, [date, time, conductedBy, rows, saveDraft]);

  // Apply global initials to all rows when conductedBy changes
  function handleConductedByChange(val: string) {
    setConductedBy(val);
    setRows((prev) => prev.map((r) => ({ ...r, initials: val })));
  }

  function patchRow(key: string, patch: Partial<Omit<RowSnapshot, "key" | "label">>) {
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, ...patch } : r));
  }

  const hasNotOk = rows.some((r) => r.condition === "NOT_OK");
  const notOkRows = rows.filter((r) => r.condition === "NOT_OK");
  const allReinspected = notOkRows.every((r) => r.reInspected);
  const missingCorrectiveAction = notOkRows.filter((r) => !r.correctiveAction.trim());

  async function handleSubmit() {
    if (!conductedBy.trim()) {
      setError("Enter your initials at the top before submitting.");
      return;
    }
    if (missingCorrectiveAction.length > 0) {
      setError(`Fill in corrective actions for: ${missingCorrectiveAction.map((r) => r.label).join(", ")}.`);
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/pre-op-624", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, conductedBy, rows, taskInstanceId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Submission failed — please try again.");
        return;
      }
      // Clear draft
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      setSubmitted(true);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-4">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-xl font-semibold">Pre-Op Inspection Submitted</h2>
        <p className="text-gray-500 text-sm">
          {hasNotOk
            ? allReinspected
              ? "Issues were noted and all corrective actions confirmed."
              : "Issues were noted — ensure corrective actions are completed."
            : "All items passed inspection."}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { setSubmitted(false); setRows(makeInitialRows(conductedBy)); setDate(today); }} className="btn btn-secondary">
            New Inspection
          </button>
          <button onClick={() => router.push("/dashboard/supervisor/pre-op-624/records")} className="btn btn-primary">
            View Records
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pre-Op Inspection — 624</h1>
          <p className="page-subtitle">Complete all 14 items. Rows default to OK.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {draftSaved && (
            <span className="flex items-center gap-1 text-emerald-600">
              <Save className="w-3 h-3" /> Draft saved
            </span>
          )}
          <button
            onClick={() => router.push("/dashboard/supervisor/pre-op-624/records")}
            className="btn btn-secondary text-xs py-1"
          >
            Records
          </button>
        </div>
      </div>

      {/* Form header */}
      <FormHeader624
        date={date} time={time} conductedBy={conductedBy}
        onDateChange={setDate}
        onTimeChange={setTime}
        onConductedByChange={handleConductedByChange}
      />

      {/* Checklist sections */}
      {SECTIONS.map((section) => (
        <div key={section} className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">{section}</h2>
          {ROWS.filter((r) => r.section === section).map((def) => {
            const row = rows.find((r) => r.key === def.key)!;
            return (
              <OkNotOkRow
                key={def.key}
                rowKey={def.key}
                label={row.label}
                condition={row.condition}
                initials={row.initials}
                correctiveAction={row.correctiveAction}
                reInspected={row.reInspected}
                reInspectedAt={row.reInspectedAt}
                tempValue={row.tempValue}
                tempLimit={row.tempLimit}
                reInspectTempValue={row.reInspectTempValue}
                atpRlu={row.atpRlu}
                atpLimit={row.atpLimit}
                onChange={(patch) => patchRow(def.key, patch)}
              />
            );
          })}
        </div>
      ))}

      {/* Sticky summary bar */}
      <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 -mx-4 md:-mx-6">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          {hasNotOk ? (
            <div className="flex-1 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-amber-700 dark:text-amber-400">
                {notOkRows.length} item{notOkRows.length !== 1 ? "s" : ""} Not OK
                {allReinspected ? " — all re-inspected" : ` — ${notOkRows.filter((r) => !r.reInspected).length} pending re-inspection`}
              </span>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>All items OK</span>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 font-mono flex-1">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !conductedBy.trim()}
            className="btn btn-primary"
          >
            {submitting ? "Submitting…" : "Submit Inspection"}
          </button>
        </div>
      </div>
    </div>
  );
}
