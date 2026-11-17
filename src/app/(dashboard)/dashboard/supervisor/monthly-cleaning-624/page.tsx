"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2, ChevronDown, ChevronUp, AlertCircle, CalendarCheck, Info, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MonthlyRow624 } from "@/components/forms624/MonthlyRow624";
import { deriveInitials } from "@/components/forms624/initialsHelper";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import { buildMonthlyPdfHtml624 } from "@/components/forms624/pdfBuilders624";
import {
  MONTHLY_ACTIVITIES, MONTHLY_CHEMICAL_MAP, INSTRUCTIONS_TEXT_MONTHLY, INSTRUCTIONS_VER_MONTHLY,
} from "./config";
import type { RowState, MonthlyClean624Record, MonthlyClean624LineEntry } from "@/components/forms624/types";
import { navigateAfterSubmit } from "@/lib/afterSubmit";
import { formatMonthKeyLabel, lastDayOfMonth } from "@/lib/pacific-time";

function getPTToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function getPacificMonthKey(): string {
  const today = getPTToday();
  return today.slice(0, 7);
}

function buildLocalLines(serverLines: MonthlyClean624Record["lines"]): MonthlyClean624LineEntry[] {
  return MONTHLY_ACTIVITIES.map((a) => {
    const srv = serverLines.find((l) => l.key === a.key);
    if (!srv) {
      return {
        key: a.key, labelEn: a.en, labelEs: a.es,
        chemical: MONTHLY_CHEMICAL_MAP[a.key] ?? null,
        state: "UNTOUCHED" as RowState,
        reason: "", lineDate: null, lineInitials: null,
        doneByUserId: null, updatedAt: new Date().toISOString(), autoFilled: false,
      };
    }
    return {
      ...srv,
      state: srv.state as RowState,
      reason: srv.reason ?? "",
    };
  });
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function MonthlyCleaning624Page() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams?.get("taskId") ?? null;

  const currentMonth = getPacificMonthKey();
  const today = getPTToday();

  const [record, setRecord]         = useState<MonthlyClean624Record | null>(null);
  const [initials, setInitials]     = useState("");
  const [lines, setLines]           = useState<MonthlyClean624LineEntry[]>([]);
  const [notes, setNotes]           = useState("");
  const [instrOpen, setInstrOpen]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState("");
  const [saveState, setSaveState]   = useState<SaveState>("idle");
  const [saveError, setSaveError]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [openMonths, setOpenMonths] = useState<{ id: string; month: string }[]>([]);
  const saveTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const firstIncompleteRef = useRef<HTMLDivElement | null>(null);

  // Load or create draft for current month
  useEffect(() => {
    if (!session?.user) return;
    setLoading(true);
    fetch("/api/monthly-cleaning-624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: currentMonth }) })
      .then((r) => r.json())
      .then((data: MonthlyClean624Record & { error?: string }) => {
        if (data.error) { setLoadError(data.error); setLoading(false); return; }
        setRecord(data);
        setLines(buildLocalLines(data.lines));
        setNotes(data.notes ?? "");
        setLoading(false);
      })
      .catch(() => { setLoadError("Could not load form. Try refreshing."); setLoading(false); });
  }, [session?.user?.id, currentMonth]);

  // Load previous open (draft) months
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/monthly-cleaning-624?status=draft")
      .then((r) => r.json())
      .then((list: Array<{ id: string; month: string }>) => {
        if (!Array.isArray(list)) return;
        setOpenMonths(list.filter((r) => r.month < currentMonth));
      })
      .catch(() => {});
  }, [session?.user?.id, currentMonth]);

  // Prefill initials from session
  useEffect(() => {
    if (!session?.user || initials) return;
    setInitials(deriveInitials(session.user.name, session.user.email));
  }, [session?.user?.name, session?.user?.email]);

  const isReadOnly = record?.status === "submitted";
  const monthLabel = record ? formatMonthKeyLabel(record.month) : "";
  const monthMin = record ? `${record.month}-01` : "";
  const monthMax = record
    ? (record.month === currentMonth ? today : lastDayOfMonth(record.month))
    : "";

  // Per-line save (debounced)
  const saveLine = useCallback((key: string, entry: MonthlyClean624LineEntry, recordId: string) => {
    const existing = saveTimers.current.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      setSaveState("saving");
      setSaveError("");
      try {
        const res = await fetch(`/api/monthly-cleaning-624/${recordId}/line`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key,
            expectedLineUpdatedAt: entry.updatedAt,
            state: entry.state,
            reason: entry.state === "NOT_DONE" ? entry.reason : null,
            lineDate: entry.lineDate,
            lineInitials: entry.lineInitials,
            doneByUserId: session?.user?.id ?? null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string; code?: string; currentLine?: MonthlyClean624LineEntry; refId?: string };
          if (data.code === "line_conflict" && data.currentLine) {
            // Refresh the conflicting line from server
            setLines((prev) => prev.map((l) => l.key === key ? { ...data.currentLine!, reason: data.currentLine!.reason ?? "", state: data.currentLine!.state as RowState } : l));
            setSaveState("error");
            setSaveError("Someone just changed this line — refreshed from server.");
          } else if (data.code === "already_submitted") {
            setSaveState("error");
            setSaveError("This month was already submitted.");
          } else {
            setSaveState("error");
            setSaveError(data.error ?? "Save failed");
          }
          return;
        }
        const result = await res.json() as { updatedAt: string; lastEditedBy: string };
        // Update the line's updatedAt so future saves use the new timestamp
        setLines((prev) => prev.map((l) => l.key === key ? { ...l, updatedAt: result.updatedAt } : l));
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => s === "saved" ? "idle" : s), 2000);
      } catch {
        setSaveState("error");
        setSaveError("Network error — will retry on next change.");
      }
    }, 800);
    saveTimers.current.set(key, timer);
  }, [session?.user?.id]);

  const updateLine = useCallback((key: string, state: RowState, reason: string, lineDate: string | null, lineInitials: string | null) => {
    if (!record || isReadOnly) return;
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.key !== key) return l;
        const stamp = state !== "UNTOUCHED" && lineDate === l.lineDate && !lineDate
          ? getPTToday()
          : lineDate;
        const ini = state !== "UNTOUCHED" && lineInitials === l.lineInitials && !lineInitials
          ? initials
          : lineInitials;
        const stamped: MonthlyClean624LineEntry = {
          ...l,
          state,
          reason,
          lineDate: state === "UNTOUCHED" ? null : (stamp ?? getPTToday()),
          lineInitials: state === "UNTOUCHED" ? null : (ini || initials || null),
        };
        saveLine(key, stamped, record.id);
        return stamped;
      });
      return next;
    });
  }, [record, isReadOnly, initials, saveLine]);

  const updateLineDate = useCallback((key: string, lineDate: string) => {
    if (!record || isReadOnly) return;
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, lineDate };
        saveLine(key, updated, record.id);
        return updated;
      });
      return next;
    });
  }, [record, isReadOnly, saveLine]);

  const doneCount    = lines.filter((l) => l.state === "DONE").length;
  const naCount      = lines.filter((l) => l.state === "NA").length;
  const notDoneCount = lines.filter((l) => l.state === "NOT_DONE").length;
  const untouched    = lines.filter((l) => l.state === "UNTOUCHED").length;
  const needsReason  = lines.filter((l) => l.state === "NOT_DONE" && !l.reason.trim()).length;
  const totalAnswered = doneCount + naCount + notDoneCount;
  const canSubmit    = untouched === 0 && needsReason === 0;
  const allComplete  = canSubmit;

  let submitBlockMsg = "";
  if (untouched > 0) submitBlockMsg = `${untouched} item${untouched === 1 ? "" : "s"} still need${untouched === 1 ? "s" : ""} an answer`;
  else if (needsReason > 0) submitBlockMsg = `${needsReason} "Not done" item${needsReason === 1 ? "" : "s"} still need${needsReason === 1 ? "s" : ""} a reason`;

  let firstIncompleteIdx = -1;

  function scrollToFirst() {
    firstIncompleteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSubmit() {
    if (!record || !canSubmit) { scrollToFirst(); return; }
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/monthly-cleaning-624/${record.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; code?: string; detail?: string };
        if (data.code === "already_submitted") throw new Error("This month was already submitted.");
        if (data.detail) throw new Error(data.detail);
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const resData = await res.json() as { completedInstanceId?: string | null };
      window.dispatchEvent(new CustomEvent("task-action"));
      navigateAfterSubmit(router, resData.completedInstanceId, "/dashboard/supervisor/monthly-cleaning-624/records");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
      setConfirmSubmit(false);
    }
  }

  async function handlePdf() {
    if (!record) return;
    // Build a merged record for PDF
    const merged: MonthlyClean624Record = {
      ...record,
      lines: lines.map((l) => ({ ...l, state: l.state as "DONE" | "NA" | "NOT_DONE", reason: l.reason || null })) as MonthlyClean624Record["lines"],
      notes: notes || null,
    };
    const html = buildMonthlyPdfHtml624(merged);
    await exportFormPdf(html, `monthly-cleaning-624-${record.month}.pdf`);
  }

  if (loading) {
    return (
      <div className="max-w-2xl">
        <div className="page-header"><div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <div><h1 className="page-title leading-tight">Monthly Cleaning and Sanitation &#8212; 624</h1>
          <p className="page-subtitle">624 Facility &#183; Food Safety Management</p></div>
        </div></div>
        <div className="card p-6 text-center text-sm text-gray-500">Loading&hellip;</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl">
        <div className="page-header"><div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0"><CalendarCheck className="w-5 h-5 text-white" /></div>
          <div><h1 className="page-title leading-tight">Monthly Cleaning and Sanitation &#8212; 624</h1></div>
        </div></div>
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title leading-tight">Monthly Cleaning and Sanitation &#8212; 624</h1>
            <p className="page-subtitle">624 Facility &#183; Food Safety Management &#183; {monthLabel}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handlePdf} className="btn-secondary text-xs">
            Download PDF
          </button>
          <button type="button" onClick={() => router.push("/dashboard/supervisor/monthly-cleaning-624/records")} className="btn-secondary">
            View Records
          </button>
        </div>
      </div>

      {/* Previous open months banner */}
      {openMonths.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-900">Previous month{openMonths.length > 1 ? "s are" : " is"} still open</span>
          </div>
          <div className="pl-6 space-y-1">
            {openMonths.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => router.push(`/dashboard/supervisor/monthly-cleaning-624?month=${m.month}`)}
                className="text-sm text-amber-700 underline block"
              >
                {formatMonthKeyLabel(m.month)} is still a draft &#8212; continue
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Submitted banner */}
      {isReadOnly && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-800">
            This month was {record?.autoSubmitted ? "auto-submitted" : "submitted"} &#8212; read-only.
          </span>
        </div>
      )}

      {/* Instructions */}
      <div className="border border-amber-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setInstrOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
        >
          <span className="text-sm font-semibold text-amber-900">Instructions</span>
          {instrOpen ? <ChevronUp className="w-4 h-4 text-amber-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-amber-600 shrink-0" />}
        </button>
        {instrOpen && (
          <div className="bg-amber-50/50 px-5 py-4">
            <p className="text-sm text-amber-900 leading-relaxed">{INSTRUCTIONS_TEXT_MONTHLY}</p>
          </div>
        )}
      </div>

      {/* Header: initials */}
      <div className="card p-4 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
          <p className="text-sm font-medium">{monthLabel}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Your Initials</label>
          {isReadOnly ? (
            <p className="text-sm font-mono uppercase">{record?.initials || "—"}</p>
          ) : (
            <input
              type="text"
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 4))}
              maxLength={4}
              placeholder="HGA"
              className="input w-full text-sm font-mono uppercase"
            />
          )}
        </div>
      </div>

      {/* Sticky progress bar */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur card px-4 py-3 border-b border-gray-100">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">Progress</span>
            <span className={cn("text-xs font-mono font-bold", totalAnswered === MONTHLY_ACTIVITIES.length ? "text-emerald-600" : "text-gray-500")}>
              {totalAnswered} of {MONTHLY_ACTIVITIES.length} lines answered
            </span>
          </div>
          <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-300",
                totalAnswered === MONTHLY_ACTIVITIES.length && notDoneCount === 0 ? "bg-emerald-500" :
                notDoneCount > 0 ? "bg-amber-400" : "bg-blue-400"
              )}
              style={{ width: `${Math.round((totalAnswered / MONTHLY_ACTIVITIES.length) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-400">
              {doneCount} done &#183; {naCount} N/A &#183; {notDoneCount} not done
              {record?.lastEditedBy && record.lastEditedAt &&
                ` &#183; Last updated by ${record.lastEditedBy} on ${new Date(record.lastEditedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}`
              }
            </p>
            <span className={cn("text-[11px] font-mono",
              saveState === "saving" ? "text-blue-500" :
              saveState === "saved"  ? "text-emerald-600" :
              saveState === "error"  ? "text-red-600" : "text-gray-300"
            )}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* All-complete banner */}
      {!isReadOnly && allComplete && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-sm text-emerald-800">
              All lines are complete. Submit now, or it will be submitted automatically at the end of the month.
            </span>
          </div>
          <button type="button" onClick={() => setConfirmSubmit(true)} className="shrink-0 btn-primary text-xs py-1.5 px-3">
            Submit month
          </button>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="flex items-center gap-2 text-amber-700 text-sm font-mono bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {saveError}
        </div>
      )}

      {/* Activity rows */}
      <div className="space-y-2">
        {lines.map((line) => {
          const isFirstIncomplete =
            !isReadOnly &&
            firstIncompleteIdx === -1 &&
            (line.state === "UNTOUCHED" || (line.state === "NOT_DONE" && !line.reason.trim()));
          if (isFirstIncomplete) firstIncompleteIdx++;

          return (
            <div key={line.key} ref={isFirstIncomplete ? (el) => { firstIncompleteRef.current = el; } : undefined}>
              <MonthlyRow624
                rowKey={line.key}
                labelEn={line.labelEn}
                labelEs={line.labelEs}
                chemical={line.chemical}
                state={line.state}
                reason={line.reason}
                lineDate={line.lineDate}
                lineInitials={line.lineInitials}
                autoFilled={line.autoFilled}
                readOnly={isReadOnly}
                monthMin={monthMin}
                monthMax={monthMax}
                onChange={(state, reason, lineDate, lineInitials) =>
                  updateLine(line.key, state, reason, lineDate, lineInitials)
                }
                onDateChange={(lineDate) => updateLineDate(line.key, lineDate)}
              />
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div className="card p-4 space-y-2">
        <label className="label">Notes / issues found</label>
        {isReadOnly ? (
          <p className="text-sm text-gray-700">{record?.notes || "—"}</p>
        ) : (
          <textarea
            className="input resize-none h-20"
            placeholder="Optional observations…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}
      </div>

      {/* Submit blocker message */}
      {!isReadOnly && submitBlockMsg && (
        <div
          className="flex items-center gap-2 text-amber-700 text-sm font-mono bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5 cursor-pointer"
          onClick={scrollToFirst}
        >
          <AlertCircle className="w-4 h-4 shrink-0" /> {submitBlockMsg} &#8212; tap to scroll
        </div>
      )}

      {submitError && (
        <div className="flex items-center gap-2 text-red-700 text-sm font-mono bg-red-50 border border-red-200 rounded-md px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {submitError}
        </div>
      )}

      {/* Save and exit + Submit buttons */}
      {!isReadOnly && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/supervisor/monthly-cleaning-624/records")}
            className="flex-1 btn-secondary py-3 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" /> Save and exit
          </button>
          <button
            type="button"
            disabled={submitting || !canSubmit}
            onClick={() => setConfirmSubmit(true)}
            className="flex-1 btn-primary py-3 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting&hellip;</>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> Submit month</>
            )}
          </button>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Submit {monthLabel}?</h2>
            <p className="text-sm text-gray-600">This closes the month and makes the record read-only. This cannot be undone.</p>
            {submitError && <p className="text-sm text-red-600">{submitError}</p>}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setConfirmSubmit(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleSubmit} disabled={submitting} className="btn-primary disabled:opacity-60">
                {submitting ? "Submitting…" : "Confirm submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
