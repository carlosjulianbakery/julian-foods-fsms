"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2, ChevronDown, ChevronUp, AlertCircle, ClipboardList, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FormHeader624 } from "@/components/forms624/FormHeader624";
import { DoneNaRow624 } from "@/components/forms624/DoneNaRow624";
import { saveDraft624, loadDraft624, clearDraft624 } from "@/components/forms624/draftStorage624";
import { deriveInitials } from "@/components/forms624/initialsHelper";
import { ACTIVITIES, CHEMICAL_MAP, INSTRUCTIONS_TEXT, INSTRUCTIONS_VER } from "./config";
import type { RowState, CleaningRowSnapshot } from "@/components/forms624/types";

const FORM_PREFIX = "daily_cleaning_624";

function getPTNow(): { dateYMD: string; time24: string } {
  const now = new Date();
  const pt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const year = pt.getFullYear();
  const month = String(pt.getMonth() + 1).padStart(2, "0");
  const day = String(pt.getDate()).padStart(2, "0");
  const hours = String(pt.getHours()).padStart(2, "0");
  const mins = String(pt.getMinutes()).padStart(2, "0");
  return { dateYMD: `${year}-${month}-${day}`, time24: `${hours}:${mins}` };
}

interface RowEntry {
  key: string;
  labelEn: string;
  labelEs: string;
  chemical: string | null;
  state: RowState;
  reason: string;
}

function buildRows(): RowEntry[] {
  return ACTIVITIES.map((a) => ({
    key: a.key,
    labelEn: a.en,
    labelEs: a.es,
    chemical: CHEMICAL_MAP[a.key] ?? null,
    state: "UNTOUCHED" as RowState,
    reason: "",
  }));
}

interface DraftData {
  date: string;
  time: string;
  initials: string;
  rows: RowEntry[];
  notes: string;
}

export default function DailyCleaning624Page() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams?.get("taskId") ?? null;

  const { dateYMD: todayYMD, time24: nowTime } = getPTNow();

  const [date, setDate] = useState(todayYMD);
  const [time, setTime] = useState(nowTime);
  const [initials, setInitials] = useState("");
  const [rows, setRows] = useState<RowEntry[]>(buildRows);
  const [notes, setNotes] = useState("");
  const [instrOpen, setInstrOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [draftResumed, setDraftResumed] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [existsToday, setExistsToday] = useState(false);
  const draftLoadedRef = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefill initials from session
  useEffect(() => {
    if (!session?.user) return;
    if (!initials) setInitials(deriveInitials(session.user.name, session.user.email));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.name, session?.user?.email]);

  // Load draft once session is available
  useEffect(() => {
    if (!session?.user?.id || draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    const draft = loadDraft624<DraftData>(FORM_PREFIX, session.user.id, todayYMD);
    if (draft && draft.rows?.length === ACTIVITIES.length) {
      setDate(draft.date);
      setTime(draft.time);
      setInitials(draft.initials ?? "");
      setRows(draft.rows);
      setNotes(draft.notes ?? "");
      setDraftResumed(true);
    }
  }, [session?.user?.id, todayYMD]);

  // Auto-save draft 1s after last change
  useEffect(() => {
    if (!session?.user?.id) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft624(FORM_PREFIX, session.user.id!, todayYMD, {
        date, time, initials, rows, notes,
      });
      setDraftSaved(true);
    }, 1000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [date, time, initials, rows, notes, session?.user?.id, todayYMD]);

  useEffect(() => {
    fetch(`/api/daily-cleaning-624?date=${todayYMD}`)
      .then((r) => r.json())
      .then((data: unknown) => setExistsToday(Array.isArray(data) && (data as unknown[]).length > 0))
      .catch(() => {});
  }, [todayYMD]);

  const updateRow = useCallback((key: string, state: RowState, reason: string) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, state, reason } : r))
    );
  }, []);

  const markAllDone = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, state: "DONE" as RowState, reason: "" })));
  }, []);

  const doneCount     = rows.filter((r) => r.state === "DONE").length;
  const naCount       = rows.filter((r) => r.state === "NA").length;
  const notDoneCount  = rows.filter((r) => r.state === "NOT_DONE").length;
  const untouched     = rows.filter((r) => r.state === "UNTOUCHED").length;
  const needsReason   = rows.filter((r) => r.state === "NOT_DONE" && !r.reason.trim()).length;
  const totalAnswered = doneCount + naCount + notDoneCount;

  const canSubmit = untouched === 0 && needsReason === 0;

  let submitBlockMsg = "";
  if (untouched > 0) submitBlockMsg = `${untouched} item${untouched === 1 ? "" : "s"} still need${untouched === 1 ? "s" : ""} an answer`;
  else if (needsReason > 0) submitBlockMsg = `${needsReason} "Not done" item${needsReason === 1 ? "" : "s"} still need${needsReason === 1 ? "s" : ""} a reason`;

  const firstIncompleteRef = useRef<HTMLDivElement | null>(null);

  function scrollToFirst() {
    firstIncompleteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) { scrollToFirst(); return; }
    setError("");
    setSubmitting(true);

    const payload = {
      date,
      time,
      initials: initials.trim().toUpperCase(),
      rows: rows.map((r): CleaningRowSnapshot => ({
        key: r.key,
        labelEn: r.labelEn,
        labelEs: r.labelEs,
        state: r.state as Exclude<RowState, "UNTOUCHED">,
        reason: r.reason.trim() || null,
        chemical: r.chemical,
      })),
      notes: notes.trim() || null,
      instructionsVer: INSTRUCTIONS_VER,
      ...(taskId ? { taskId } : {}),
    };

    try {
      const res = await fetch("/api/daily-cleaning-624", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; refId?: string };
        if (data.error === "save_failed" && data.refId) {
          throw new Error(`Could not save — reference ${data.refId}, tell your admin.`);
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (session?.user?.id) clearDraft624(FORM_PREFIX, session.user.id, date);
      window.dispatchEvent(new CustomEvent("task-action"));
      router.push("/dashboard/supervisor/daily-cleaning-624/records");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  let firstIncompleteIdx = -1;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title leading-tight">Daily Cleaning and Sanitation — 624</h1>
            <p className="page-subtitle">624 Facility · Food Safety Management</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/supervisor/daily-cleaning-624/records")}
          className="btn-secondary"
        >
          View Records
        </button>
      </div>

      {existsToday && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">
            A Daily Cleaning record for today already exists —{" "}
            <button
              type="button"
              className="underline font-medium"
              onClick={() => router.push("/dashboard/supervisor/daily-cleaning-624/records")}
            >
              view records
            </button>
            . You may still submit a new one.
          </span>
        </div>
      )}

      {draftResumed && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Resumed saved draft —{" "}
            <button
              type="button"
              className="underline font-medium"
              onClick={() => {
                if (session?.user?.id) clearDraft624(FORM_PREFIX, session.user.id, todayYMD);
                setRows(buildRows());
                setNotes("");
                setInitials(deriveInitials(session?.user?.name, session?.user?.email));
                setDraftResumed(false);
              }}
            >
              Start fresh
            </button>
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <FormHeader624
          date={date}
          time={time}
          initials={initials}
          onDateChange={setDate}
          onTimeChange={setTime}
          onInitialsChange={setInitials}
        />

        <div className="border border-amber-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setInstrOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
          >
            <span className="text-sm font-semibold text-amber-900">Instructions</span>
            {instrOpen
              ? <ChevronUp className="w-4 h-4 text-amber-600 shrink-0" />
              : <ChevronDown className="w-4 h-4 text-amber-600 shrink-0" />
            }
          </button>
          {instrOpen && (
            <div className="bg-amber-50/50 px-5 py-4">
              <p className="text-sm text-amber-900 leading-relaxed">{INSTRUCTIONS_TEXT}</p>
            </div>
          )}
        </div>

        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur card px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Progress</span>
                <span className={cn(
                  "text-xs font-mono font-bold",
                  totalAnswered === ACTIVITIES.length ? "text-emerald-600" : "text-gray-500"
                )}>
                  {totalAnswered} of {ACTIVITIES.length} answered
                </span>
              </div>
              <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    totalAnswered === ACTIVITIES.length && notDoneCount === 0
                      ? "bg-emerald-500"
                      : notDoneCount > 0
                      ? "bg-amber-400"
                      : "bg-blue-400"
                  )}
                  style={{ width: `${Math.round((totalAnswered / ACTIVITIES.length) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {doneCount} done · {naCount} N/A · {notDoneCount} not done
              </p>
            </div>
            <button
              type="button"
              onClick={markAllDone}
              className="shrink-0 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold border border-emerald-200 hover:bg-emerald-100 transition-colors min-h-[44px]"
            >
              Mark all Done
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row) => {
            const isFirstIncomplete =
              firstIncompleteIdx === -1 &&
              (row.state === "UNTOUCHED" || (row.state === "NOT_DONE" && !row.reason.trim()));
            if (isFirstIncomplete) firstIncompleteIdx++;

            return (
              <div key={row.key} ref={isFirstIncomplete ? (el) => { firstIncompleteRef.current = el; } : undefined}>
                <DoneNaRow624
                  rowKey={row.key}
                  labelEn={row.labelEn}
                  labelEs={row.labelEs}
                  chemical={row.chemical}
                  state={row.state}
                  reason={row.reason}
                  onChange={(state, reason) => updateRow(row.key, state, reason)}
                />
              </div>
            );
          })}
        </div>

        <div className="card p-4 space-y-2">
          <label className="label">Notes / issues found</label>
          <textarea
            className="input resize-none h-20"
            placeholder="Optional observations…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {submitBlockMsg && (
          <div
            className="flex items-center gap-2 text-amber-700 text-sm font-mono bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5 cursor-pointer"
            onClick={scrollToFirst}
          >
            <AlertCircle className="w-4 h-4 shrink-0" /> {submitBlockMsg} — tap to scroll
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-700 text-sm font-mono bg-red-50 border border-red-200 rounded-md px-4 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="w-full btn-primary py-3 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Submit Daily Cleaning Record
            </>
          )}
        </button>

        {draftSaved && !draftResumed && (
          <p className="text-center text-xs text-gray-400">Draft auto-saved</p>
        )}
      </form>
    </div>
  );
}
