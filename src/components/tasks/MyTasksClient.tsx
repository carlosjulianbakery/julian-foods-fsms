"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Play, AlertTriangle, X, MoreHorizontal, CheckCircle2,
  ChevronDown, ChevronUp, Users2, Brush, FlaskConical,
} from "lucide-react";
import { TASK_FORM_REGISTRY } from "@/lib/task-form-registry";
import { addDaysToDateStr } from "@/lib/pacific-time";
import { TaskCalendar } from "./TaskCalendar";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskInstance {
  id: string;
  ruleTitle: string;
  facilityId: string;
  facilityName: string;
  ownerId: string;
  ownerUserId: string | null;
  ownerName: string;
  formKey: string | null;
  label: string;
  dueDate: string; // YYYY-MM-DD
  status: string;
  source: string;
  needsAdminReview: boolean;
  reviewReason: string | null;
  doneByName: string | null;
  doneAt: string | null;
  completedLate: boolean;
  daysLate: number | null;
  missedReason: string | null;
  skipReason: string | null;
  skippedByName: string | null;
  skippedAt: string | null;
}

interface Props {
  instances: TaskInstance[];
  skippedInstances: TaskInstance[];
  calendarInstances: TaskInstance[];
  calendarWeekStart: string;
  role: string;
  userId: string;
  firstName: string;
  facilities: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  today: string; // YYYY-MM-DD
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPacificGreeting(firstName: string): string {
  const h = parseInt(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false,
    }),
    10,
  );
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, ${firstName}`;
}

function formatBigDate(today: string): string {
  const [y, m, d] = today.split("-");
  const dt = new Date(`${today}T12:00:00Z`);
  const weekday = dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${weekday}, ${m}/${d}/${y}`;
}

function formatDueDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}/${y}`;
}

function formatCompletedAt(isoStr: string): string {
  return (
    new Date(isoStr).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " PT"
  );
}

function daysOverdue(dueDateStr: string, today: string): number {
  const due = new Date(dueDateStr + "T12:00:00Z");
  const tod = new Date(today + "T12:00:00Z");
  return Math.max(0, Math.floor((tod.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

function parseBatchLabel(label: string): { product: string; qty: string | null } {
  const match = label.match(/^(.+?)\s+\((\d+\s*\S+)\)$/);
  if (match) return { product: match[1], qty: match[2] };
  return { product: label, qty: null };
}

function isQuietTask(inst: TaskInstance): boolean {
  return (
    inst.formKey === "pre_op" ||
    /daily.?clean/i.test(inst.ruleTitle) ||
    /pre-?op/i.test(inst.ruleTitle)
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function MarkDoneModal({
  inst,
  onClose,
  onConfirm,
}: {
  inst: TaskInstance;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Mark as Done</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          <span className="font-medium">{inst.ruleTitle}</span>
          {inst.label && <span> — {inst.label}</span>}
          <span> (due {formatDueDate(inst.dueDate)})</span>
        </p>
        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">
          Completion note <span className="text-gray-400 font-normal">(min 10 characters)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#C41E3A]"
          placeholder="Describe what was done…"
        />
        <p className="text-xs text-gray-400 mt-1">{note.trim().length}/10 minimum</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { if (note.trim().length < 10) return; setSubmitting(true); onConfirm(note.trim()); }}
            disabled={note.trim().length < 10 || submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-[#C41E3A] hover:bg-[#a3172f] rounded-lg disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Mark as Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkipModal({
  inst,
  onClose,
  onConfirm,
}: {
  inst: TaskInstance;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Skip Task</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          <span className="font-medium">{inst.ruleTitle}</span>
          {inst.label && <span> — {inst.label}</span>}
        </p>
        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">
          Reason <span className="text-gray-400 font-normal">(min 10 characters)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#C41E3A]"
          placeholder="Explain why this task is being skipped…"
        />
        <p className="text-xs text-gray-400 mt-1">{reason.trim().length}/10 minimum</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => { if (reason.trim().length < 10) return; setSubmitting(true); onConfirm(reason.trim()); }}
            disabled={reason.trim().length < 10 || submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-[#C41E3A] hover:bg-[#a3172f] rounded-lg disabled:opacity-50"
          >
            {submitting ? "Skipping…" : "Skip task"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkMissedModal({
  inst,
  onClose,
  onConfirm,
}: {
  inst: TaskInstance;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Mark as Missed</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          <span className="font-medium">{inst.ruleTitle}</span>
          {inst.label && <span> — {inst.label}</span>}
        </p>
        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">
          Reason <span className="text-gray-400 font-normal">(min 10 characters)</span>
        </label>
        <textarea
          ref={textRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#C41E3A]"
          placeholder="Explain why this task was missed…"
        />
        <p className="text-xs text-gray-400 mt-1">{reason.trim().length}/10 minimum</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => { if (reason.trim().length < 10) return; setSubmitting(true); onConfirm(reason.trim()); }}
            disabled={reason.trim().length < 10 || submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-[#C41E3A] hover:bg-[#a3172f] rounded-lg disabled:opacity-50"
          >
            {submitting ? "Marking…" : "Mark as Missed"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hero Header ──────────────────────────────────────────────────────────────

function HeroHeader({
  today,
  firstName,
  overdue,
  dueToday,
  inProgress,
  doneToday,
  role,
  showMyTasksOnly,
  setShowMyTasksOnly,
  nextUpcoming,
}: {
  today: string;
  firstName: string;
  overdue: TaskInstance[];
  dueToday: TaskInstance[];
  inProgress: TaskInstance[];
  doneToday: TaskInstance[];
  role: string;
  showMyTasksOnly: boolean;
  setShowMyTasksOnly: (v: boolean) => void;
  nextUpcoming: TaskInstance | null;
}) {
  const [greeting, setGreeting] = useState("");
  useEffect(() => { setGreeting(getPacificGreeting(firstName)); }, [firstName]);

  const totalActive = overdue.length + dueToday.length + inProgress.length;
  const totalToday = totalActive + doneToday.length;
  const allDone = totalActive === 0 && doneToday.length > 0;
  const nothingToday = totalToday === 0;
  const pct = totalToday > 0 ? Math.round((doneToday.length / totalToday) * 100) : 0;

  // Summary line
  let summary = "";
  if (nothingToday) {
    summary = "Nothing due today.";
  } else if (allDone) {
    summary = `All ${doneToday.length} task${doneToday.length !== 1 ? "s" : ""} complete — great work!`;
  } else {
    const parts: string[] = [];
    const todayCount = dueToday.length + inProgress.length;
    if (todayCount > 0) parts.push(`${todayCount} task${todayCount !== 1 ? "s" : ""} today`);
    if (overdue.length > 0) parts.push(`${overdue.length} overdue`);
    summary = parts.join(", ");
  }

  // Admin team strip: users with overdue tasks (only in "Everyone" mode)
  const teamStrip: { id: string; name: string; count: number }[] = [];
  if (role === "ADMIN" && !showMyTasksOnly && overdue.length > 0) {
    const map = new Map<string, { name: string; count: number }>();
    for (const inst of overdue) {
      const eid = inst.ownerUserId ?? inst.ownerId;
      const existing = map.get(eid);
      if (existing) existing.count++;
      else map.set(eid, { name: inst.ownerName, count: 1 });
    }
    map.forEach((v, k) => teamStrip.push({ id: k, name: v.name, count: v.count }));
    teamStrip.sort((a, b) => b.count - a.count);
  }

  return (
    <div
      className={`rounded-2xl mb-6 p-5 md:p-6 border transition-colors ${
        allDone
          ? "bg-green-50 border-green-200"
          : "bg-white border-gray-200 shadow-sm"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Left: greeting + date + summary */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium mb-0.5 ${allDone ? "text-green-700" : "text-gray-500"}`}>
            {greeting || `Hello, ${firstName}`}
          </p>
          <p className={`text-xl md:text-2xl font-bold mb-1 ${allDone ? "text-green-900" : "text-gray-900"}`}>
            {formatBigDate(today)}
          </p>
          <p className={`text-sm ${allDone ? "text-green-700 font-medium" : overdue.length > 0 ? "text-red-600 font-medium" : "text-gray-600"}`}>
            {summary}
            {nothingToday && nextUpcoming && (
              <span className="text-gray-500 font-normal">
                {" "}Next: {formatDueDate(nextUpcoming.dueDate)}, {nextUpcoming.ruleTitle}
              </span>
            )}
          </p>
        </div>

        {/* Right: progress + admin toggle */}
        <div className="flex flex-col items-end gap-3 shrink-0">
          {/* Progress bar */}
          {totalToday > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-24 md:w-32 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${allDone ? "bg-green-500" : "bg-[#C41E3A]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-xs font-medium tabular-nums ${allDone ? "text-green-600" : "text-gray-500"}`}>
                {doneToday.length}/{totalToday}
              </span>
            </div>
          )}

          {/* Admin toggle */}
          {role === "ADMIN" && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setShowMyTasksOnly(true)}
                className={`px-3 py-1.5 font-medium transition-colors ${showMyTasksOnly ? "bg-[#C41E3A] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                My tasks
              </button>
              <button
                onClick={() => setShowMyTasksOnly(false)}
                className={`px-3 py-1.5 font-medium transition-colors ${!showMyTasksOnly ? "bg-[#C41E3A] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                Everyone
              </button>
            </div>
          )}
        </div>
      </div>

      {/* All done badge */}
      {allDone && (
        <div className="flex items-center gap-2 mt-3 text-green-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-sm font-semibold">All done for today!</span>
        </div>
      )}

      {/* Admin team strip — users with overdue */}
      {teamStrip.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <Users2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Overdue by team</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {teamStrip.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100"
              >
                {u.name}
                <span className="bg-red-200 text-red-800 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">{u.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Large Task Card ──────────────────────────────────────────────────────────

function DotsMenu({ options }: { options: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-14 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors shrink-0"
        aria-label="More options"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border border-gray-100 min-w-[160px] overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => { opt.onClick(); setOpen(false); }}
              className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${opt.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HeroTaskCard({
  inst,
  isNext,
  today,
  role,
  userId,
  startingId,
  actionId,
  isPending,
  onStart,
  onMarkDone,
  onMarkMissed,
  onSkip,
}: {
  inst: TaskInstance;
  isNext: boolean;
  today: string;
  role: string;
  userId: string;
  startingId: string | null;
  actionId: string | null;
  isPending: boolean;
  onStart: (inst: TaskInstance) => void;
  onMarkDone: (inst: TaskInstance) => void;
  onMarkMissed: (inst: TaskInstance) => void;
  onSkip: (inst: TaskInstance) => void;
}) {
  const isOverdue = inst.status === "OVERDUE" || inst.status === "MISSED";
  const isDueToday = inst.status === "DUE_TODAY";
  const isInProgress = inst.status === "IN_PROGRESS";
  const isBusy = actionId === inst.id || isPending;
  const isAdmin = role === "ADMIN";
  const effectiveOwner = inst.ownerUserId ?? inst.ownerId;
  const isOwner = effectiveOwner === userId;
  const isManual = inst.formKey === "manual";
  const isBatchSheet = inst.formKey === "batch_sheet";
  const isQuiet = isQuietTask(inst);
  const days = isOverdue ? daysOverdue(inst.dueDate, today) : 0;
  const isStartable = ["OVERDUE", "DUE_TODAY", "UPCOMING", "IN_PROGRESS"].includes(inst.status);

  const borderColor = isOverdue
    ? "border-red-400"
    : isDueToday
    ? "border-amber-400"
    : "border-blue-400";
  const bgColor = isOverdue
    ? "bg-red-50/40"
    : isDueToday
    ? "bg-amber-50/40"
    : "bg-blue-50/30";
  const badgeBg = isOverdue
    ? "bg-red-100 text-red-700"
    : isDueToday
    ? "bg-amber-100 text-amber-700"
    : "bg-blue-100 text-blue-700";

  // Dots menu options
  const dotsOptions: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (isOverdue && (isAdmin || isOwner)) {
    dotsOptions.push({ label: "Mark as missed", onClick: () => onMarkMissed(inst), danger: true });
  }
  if (isAdmin && inst.status !== "DONE" && inst.status !== "SKIPPED") {
    dotsOptions.push({ label: "Skip task", onClick: () => onSkip(inst) });
  }

  // Batch sheet label parsing
  const batchParsed = isBatchSheet && inst.label ? parseBatchLabel(inst.label) : null;

  return (
    <div
      className={`rounded-xl border-l-4 ${borderColor} ${bgColor} border border-l-[inherit] border-gray-100 p-4 md:p-5 transition-shadow hover:shadow-sm`}
    >
      <div className="flex items-start gap-3">
        {/* Icon for quiet tasks */}
        {isQuiet && (
          <div className="shrink-0 mt-1">
            {/pre-?op/i.test(inst.ruleTitle) ? (
              <FlaskConical className="w-4 h-4 text-gray-400" />
            ) : (
              <Brush className="w-4 h-4 text-gray-400" />
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {isNext && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#C41E3A] text-white">
                Next up
              </span>
            )}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeBg}`}
            >
              {isOverdue
                ? days > 0
                  ? `${days} day${days !== 1 ? "s" : ""} overdue`
                  : "Overdue"
                : isDueToday
                ? "Due today"
                : "In progress"}
            </span>
            {inst.needsAdminReview && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 shrink-0">
                <AlertTriangle className="w-3 h-3" />
                Needs review
              </span>
            )}
          </div>

          {/* Title */}
          {isBatchSheet && batchParsed ? (
            <>
              <p className="text-base font-bold text-gray-900 leading-tight">{batchParsed.product}</p>
              {batchParsed.qty && (
                <p className="text-xs text-gray-500 mt-0.5">{batchParsed.qty} · Due end of day</p>
              )}
            </>
          ) : (
            <>
              <p className={`text-base font-bold text-gray-900 leading-tight ${isQuiet ? "text-gray-700" : ""}`}>
                {inst.ruleTitle}
              </p>
              {inst.label && inst.label !== inst.ruleTitle && (
                <p className="text-xs text-gray-500 mt-0.5">{inst.label}</p>
              )}
              {isDueToday && (
                <p className="text-xs text-amber-600 mt-0.5">Due end of day</p>
              )}
            </>
          )}

          {/* Facility + owner */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-500">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium text-[11px]">
              {inst.facilityName}
            </span>
            {isAdmin && <span>Owner: {inst.ownerName}</span>}
            {inst.doneByName && <span>Done by {inst.doneByName}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isStartable && isManual && (
            <button
              onClick={() => onMarkDone(inst)}
              disabled={isBusy}
              className="inline-flex items-center justify-center px-4 min-h-[56px] rounded-xl bg-[#C41E3A] hover:bg-[#a3172f] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Mark done
            </button>
          )}
          {isStartable && !isManual && (
            <button
              onClick={() => onStart(inst)}
              disabled={startingId === inst.id || isPending}
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[56px] rounded-xl bg-[#C41E3A] hover:bg-[#a3172f] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {startingId === inst.id ? "Starting…" : isInProgress ? "Continue" : "Start"}
            </button>
          )}
          {dotsOptions.length > 0 && (
            <DotsMenu options={dotsOptions} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Done strip (one-line green) ─────────────────────────────────────────────

function DoneStrip({
  inst,
  role,
  userId,
  actionId,
  isPending,
  onReopen,
}: {
  inst: TaskInstance;
  role: string;
  userId: string;
  actionId: string | null;
  isPending: boolean;
  onReopen: (inst: TaskInstance) => void;
}) {
  const isAdmin = role === "ADMIN";
  const isBusy = actionId === inst.id || isPending;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-green-50 border border-green-100">
      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-green-800">{inst.ruleTitle}</span>
        {inst.label && inst.label !== inst.ruleTitle && (
          <span className="text-xs text-green-600 ml-1.5">{inst.label}</span>
        )}
        {inst.doneAt && (
          <span className="text-xs text-green-500 ml-2">{formatCompletedAt(inst.doneAt)}</span>
        )}
        {inst.completedLate && inst.daysLate != null && inst.daysLate > 0 && (
          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
            Late {inst.daysLate}d
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-semibold text-green-600 px-2 py-0.5 rounded-full bg-green-100">Done</span>
        {isAdmin && (
          <button
            onClick={() => onReopen(inst)}
            disabled={isBusy}
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50 font-medium"
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Skipped task row ─────────────────────────────────────────────────────────

function SkippedTaskRow({
  inst,
  actionId,
  isPending,
  onReopen,
}: {
  inst: TaskInstance;
  actionId: string | null;
  isPending: boolean;
  onReopen: (inst: TaskInstance) => void;
}) {
  const isBusy = actionId === inst.id || isPending;
  const skippedBy = inst.skippedByName?.trim() || "System";
  const skippedWhen = inst.skippedAt ? formatCompletedAt(inst.skippedAt) : "";

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0 border-gray-100">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="font-medium text-sm text-gray-900">{inst.ruleTitle}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700 shrink-0">
            {inst.facilityName}
          </span>
        </div>
        {inst.label && (
          <p className="text-xs text-gray-500 mb-0.5">{inst.label}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
          <span>Due {formatDueDate(inst.dueDate)}</span>
          {inst.skipReason && <span>Reason: {inst.skipReason}</span>}
          <span>Skipped by {skippedBy}</span>
          {skippedWhen && <span>{skippedWhen}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
          Skipped
        </span>
        <button
          onClick={() => onReopen(inst)}
          disabled={isBusy}
          className="inline-flex items-center px-2.5 min-h-[44px] rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
        >
          Reopen
        </button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MyTasksClient({
  instances,
  skippedInstances,
  calendarInstances,
  calendarWeekStart,
  role,
  userId,
  firstName,
  facilities,
  owners,
  today,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [facilityFilter, setFacilityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(role === "ADMIN");
  const [expandedSkipped, setExpandedSkipped] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [missedModalInst, setMissedModalInst] = useState<TaskInstance | null>(null);
  const [doneModalInst, setDoneModalInst] = useState<TaskInstance | null>(null);
  const [skipModalInst, setSkipModalInst] = useState<TaskInstance | null>(null);

  const tomorrow = addDaysToDateStr(today, 1);

  const filtered = instances.filter((i) => {
    if (role === "ADMIN" && showMyTasksOnly) {
      if ((i.ownerUserId ?? i.ownerId) !== userId) return false;
    }
    if (facilityFilter && i.facilityId !== facilityFilter) return false;
    if (ownerFilter && i.ownerId !== ownerFilter) return false;
    return true;
  });

  const filteredSkipped = skippedInstances.filter((i) => {
    if (role === "ADMIN" && showMyTasksOnly) {
      if ((i.ownerUserId ?? i.ownerId) !== userId) return false;
    }
    if (facilityFilter && i.facilityId !== facilityFilter) return false;
    if (ownerFilter && i.ownerId !== ownerFilter) return false;
    return true;
  });

  const overdue = filtered.filter((i) => i.status === "OVERDUE" || i.status === "MISSED");
  const dueToday = filtered.filter((i) => i.status === "DUE_TODAY");
  const inProgress = filtered.filter((i) => i.status === "IN_PROGRESS");
  const upcoming = filtered.filter((i) => i.status === "UPCOMING");
  const doneToday = filtered.filter((i) => i.status === "DONE");

  const activeTodayCards = [...overdue, ...dueToday, ...inProgress];
  const nextUpcoming = upcoming[0] ?? null;

  function dispatchTaskAction() {
    window.dispatchEvent(new CustomEvent("task-action"));
  }

  async function handleStart(inst: TaskInstance) {
    setStartingId(inst.id);
    setStartError(null);
    try {
      const res = await fetch(`/api/task-instances/${inst.id}/start`, { method: "POST" });
      if (!res.ok) { setStartError("Failed to start task. Please try again."); return; }
      dispatchTaskAction();
      startTransition(() => router.refresh());
      const entry = inst.formKey ? TASK_FORM_REGISTRY[inst.formKey] : null;
      const href = entry?.href(inst.id) ?? null;
      if (href) {
        router.push(`${href}?taskId=${inst.id}`);
      } else if (inst.formKey && inst.formKey !== "manual") {
        setStartError("No form page found for this task type.");
      }
    } catch {
      setStartError("An unexpected error occurred.");
    } finally {
      setStartingId(null);
    }
  }

  async function handleMarkMissed(inst: TaskInstance, reason: string) {
    setActionId(inst.id);
    try {
      await fetch(`/api/task-instances/${inst.id}/missed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setMissedModalInst(null);
      dispatchTaskAction();
      startTransition(() => router.refresh());
    } finally {
      setActionId(null);
    }
  }

  async function handleSkip(inst: TaskInstance, reason: string) {
    setActionId(inst.id);
    try {
      const res = await fetch(`/api/task-instances/${inst.id}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStartError((data as { error?: string }).error ?? "Failed to skip task.");
        return;
      }
      setSkipModalInst(null);
      dispatchTaskAction();
      startTransition(() => router.refresh());
    } finally {
      setActionId(null);
    }
  }

  async function handleMarkDone(inst: TaskInstance, note: string) {
    setActionId(inst.id);
    try {
      await fetch(`/api/task-instances/${inst.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      setDoneModalInst(null);
      dispatchTaskAction();
      startTransition(() => router.refresh());
    } finally {
      setActionId(null);
    }
  }

  async function handleReopen(inst: TaskInstance) {
    if (!confirm(`Reopen "${inst.ruleTitle}"?`)) return;
    setActionId(inst.id);
    try {
      await fetch(`/api/task-instances/${inst.id}/reopen`, { method: "POST" });
      dispatchTaskAction();
      startTransition(() => router.refresh());
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      {/* Modals */}
      {doneModalInst && (
        <MarkDoneModal
          inst={doneModalInst}
          onClose={() => setDoneModalInst(null)}
          onConfirm={(note) => handleMarkDone(doneModalInst, note)}
        />
      )}
      {missedModalInst && (
        <MarkMissedModal
          inst={missedModalInst}
          onClose={() => setMissedModalInst(null)}
          onConfirm={(reason) => handleMarkMissed(missedModalInst, reason)}
        />
      )}
      {skipModalInst && (
        <SkipModal
          inst={skipModalInst}
          onClose={() => setSkipModalInst(null)}
          onConfirm={(reason) => handleSkip(skipModalInst, reason)}
        />
      )}

      {startError && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          <span>{startError}</span>
          <button onClick={() => setStartError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div id="my-tasks" className="max-w-5xl mb-6">
        {/* Admin filters */}
        {role === "ADMIN" && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <select
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
            >
              <option value="">All facilities</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <select
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              <option value="">All owners</option>
              {owners.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Hero header */}
        <HeroHeader
          today={today}
          firstName={firstName}
          overdue={overdue}
          dueToday={dueToday}
          inProgress={inProgress}
          doneToday={doneToday}
          role={role}
          showMyTasksOnly={showMyTasksOnly}
          setShowMyTasksOnly={setShowMyTasksOnly}
          nextUpcoming={nextUpcoming}
        />

        {/* Task cards: overdue + due today + in progress */}
        {activeTodayCards.length > 0 && (
          <div className="space-y-3 mb-4">
            {activeTodayCards.map((inst, idx) => (
              <HeroTaskCard
                key={inst.id}
                inst={inst}
                isNext={idx === 0}
                today={today}
                role={role}
                userId={userId}
                startingId={startingId}
                actionId={actionId}
                isPending={isPending}
                onStart={handleStart}
                onMarkDone={(i) => setDoneModalInst(i)}
                onMarkMissed={(i) => setMissedModalInst(i)}
                onSkip={(i) => setSkipModalInst(i)}
              />
            ))}
          </div>
        )}

        {/* Done strips */}
        {doneToday.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {doneToday.map((inst) => (
              <DoneStrip
                key={inst.id}
                inst={inst}
                role={role}
                userId={userId}
                actionId={actionId}
                isPending={isPending}
                onReopen={handleReopen}
              />
            ))}
          </div>
        )}

        {/* Calendar */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Schedule</p>
          <TaskCalendar
            initialInstances={calendarInstances}
            initialWeekStart={calendarWeekStart}
            today={today}
            role={role}
            userId={userId}
            showMyTasksOnly={showMyTasksOnly}
          />
        </div>

        {/* Admin skipped section */}
        {role === "ADMIN" && filteredSkipped.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setExpandedSkipped((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 text-gray-600 rounded-t-lg cursor-pointer hover:opacity-90"
            >
              <span className="text-sm font-semibold">Skipped ({filteredSkipped.length})</span>
              {expandedSkipped ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSkipped && (
              <div className="border border-t-0 border-gray-200 rounded-b-lg overflow-hidden bg-white">
                {filteredSkipped.map((inst) => (
                  <SkippedTaskRow
                    key={inst.id}
                    inst={inst}
                    actionId={actionId}
                    isPending={isPending}
                    onReopen={handleReopen}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
