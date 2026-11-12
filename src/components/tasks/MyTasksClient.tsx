"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Play, AlertTriangle, X } from "lucide-react";
import { TASK_FORM_REGISTRY } from "@/lib/task-form-registry";
import { addDaysToDateStr } from "@/lib/pacific-time";

export interface TaskInstance {
  id: string;
  ruleTitle: string;
  facilityId: string;
  facilityName: string;
  ownerId: string;
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
}

interface Props {
  instances: TaskInstance[];
  role: string;
  userId: string;
  facilities: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  today: string; // YYYY-MM-DD
}

function formatDueDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}/${y}`;
}

function formatCompletedAt(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " PT";
}

function daysOverdue(dueDateStr: string, today: string): number {
  const due = new Date(dueDateStr + "T12:00:00Z");
  const tod = new Date(today + "T12:00:00Z");
  return Math.max(0, Math.floor((tod.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

function statusPill(status: string) {
  const styles: Record<string, string> = {
    UPCOMING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    DUE_TODAY: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    IN_PROGRESS: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    DONE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    MISSED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    SKIPPED: "bg-gray-100 text-gray-500",
  };
  return styles[status] ?? "bg-gray-100 text-gray-500";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    UPCOMING: "Upcoming",
    DUE_TODAY: "Due Today",
    IN_PROGRESS: "In Progress",
    DONE: "Done",
    OVERDUE: "Overdue",
    MISSED: "Missed",
    SKIPPED: "Skipped",
  };
  return labels[status] ?? status;
}

// Modal for "Mark as done" (manual tasks)
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

  async function handleSubmit() {
    if (note.trim().length < 10) return;
    setSubmitting(true);
    onConfirm(note.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Mark as Done</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          <span className="font-medium">{inst.ruleTitle}</span>
          {inst.label && <span> — {inst.label}</span>}
          <span> (due {formatDueDate(inst.dueDate)})</span>
        </p>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-4 mb-1">
          Completion note <span className="text-gray-400 font-normal">(min 10 characters)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-[#C41E3A]"
          placeholder="Describe what was done…"
        />
        <p className="text-xs text-gray-400 mt-1">{note.trim().length}/10 minimum</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
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

// Modal for "Mark as missed"
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

  async function handleSubmit() {
    if (reason.trim().length < 10) return;
    setSubmitting(true);
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Mark as Missed</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          <span className="font-medium">{inst.ruleTitle}</span>
          {inst.label && <span> — {inst.label}</span>}
          <span> (due {formatDueDate(inst.dueDate)})</span>
        </p>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-4 mb-1">
          Reason <span className="text-gray-400 font-normal">(min 10 characters)</span>
        </label>
        <textarea
          ref={textRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-[#C41E3A]"
          placeholder="Explain why this task was missed…"
        />
        <p className="text-xs text-gray-400 mt-1">{reason.trim().length}/10 minimum</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
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

export function MyTasksClient({ instances, role, userId, facilities, owners, today }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [facilityFilter, setFacilityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [expandedUpcoming, setExpandedUpcoming] = useState(false);
  const [expandedDone, setExpandedDone] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [missedModalInst, setMissedModalInst] = useState<TaskInstance | null>(null);
  const [doneModalInst, setDoneModalInst] = useState<TaskInstance | null>(null);

  const tomorrow = addDaysToDateStr(today, 1);

  const filtered = instances.filter((i) => {
    if (facilityFilter && i.facilityId !== facilityFilter) return false;
    if (ownerFilter && i.ownerId !== ownerFilter) return false;
    return true;
  });

  const overdue = filtered.filter((i) => i.status === "OVERDUE" || i.status === "MISSED");
  const dueToday = filtered.filter((i) => i.status === "DUE_TODAY");
  const inProgress = filtered.filter((i) => i.status === "IN_PROGRESS");
  const upcoming = filtered.filter((i) => i.status === "UPCOMING");
  const doneToday = filtered.filter((i) => i.status === "DONE");

  const totalActive = overdue.length + dueToday.length + inProgress.length + upcoming.length;

  async function handleStart(inst: TaskInstance) {
    setStartingId(inst.id);
    setStartError(null);
    try {
      const res = await fetch(`/api/task-instances/${inst.id}/start`, { method: "POST" });
      if (!res.ok) {
        setStartError("Failed to start task. Please try again.");
        return;
      }
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
      startTransition(() => router.refresh());
    } finally {
      setActionId(null);
    }
  }

  async function handleSkip(inst: TaskInstance) {
    if (!confirm(`Skip "${inst.ruleTitle}"? This cannot easily be undone.`)) return;
    setActionId(inst.id);
    try {
      await fetch(`/api/task-instances/${inst.id}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Skipped by admin" }),
      });
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
      startTransition(() => router.refresh());
    } finally {
      setActionId(null);
    }
  }

  function isStartable(inst: TaskInstance): boolean {
    if (!["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"].includes(inst.status)) return false;
    return inst.dueDate <= tomorrow;
  }

  // Effective owner check (mirrors server logic)
  function isEffectiveOwner(inst: TaskInstance): boolean {
    return inst.ownerId === userId; // ownerUserId not currently passed down — rule.ownerId is the proxy
  }

  function TaskRow({ inst, showOwner }: { inst: TaskInstance; showOwner: boolean }) {
    const startable = isStartable(inst);
    const isManual = inst.formKey === "manual";
    const isRedStatus = inst.status === "OVERDUE" || inst.status === "MISSED";
    const days = inst.status === "OVERDUE" ? daysOverdue(inst.dueDate, today) : 0;
    const isAdmin = role === "ADMIN";
    const isBusy = actionId === inst.id || isPending;
    const canMarkMissed = inst.status === "OVERDUE" && (isAdmin || isEffectiveOwner(inst));

    return (
      <div
        className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 border-gray-100 dark:border-gray-700 ${
          isRedStatus ? "bg-red-50/50 dark:bg-red-900/10" : ""
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="font-medium text-sm text-gray-900 dark:text-white">{inst.ruleTitle}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 shrink-0">
              {inst.facilityName}
            </span>
            {inst.needsAdminReview && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 shrink-0">
                <AlertTriangle className="w-3 h-3" />
                Needs review{inst.reviewReason ? `: ${inst.reviewReason}` : ""}
              </span>
            )}
            {inst.completedLate && inst.daysLate != null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 shrink-0">
                Late {inst.daysLate}d
              </span>
            )}
          </div>
          {inst.label && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{inst.label}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span>Due {formatDueDate(inst.dueDate)}</span>
            {inst.status === "OVERDUE" && days > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium">{days} day{days !== 1 ? "s" : ""} overdue</span>
            )}
            {inst.status === "DUE_TODAY" && <span className="text-amber-600 font-medium">Due end of day</span>}
            {inst.status === "DONE" && inst.doneAt && (
              <span className="text-green-700 dark:text-green-400">Completed {formatCompletedAt(inst.doneAt)}</span>
            )}
            {inst.status === "MISSED" && inst.missedReason && (
              <span className="text-red-600 dark:text-red-400">Reason: {inst.missedReason}</span>
            )}
            {showOwner && <span>Owner: {inst.ownerName}</span>}
            {inst.doneByName && <span>Done by {inst.doneByName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusPill(inst.status)}`}>
            {statusLabel(inst.status)}
          </span>
          {startable && isManual && (
            <button
              onClick={() => setDoneModalInst(inst)}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-[#C41E3A] hover:bg-[#a3172f] text-white text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              Mark done
            </button>
          )}
          {startable && !isManual && (
            <button
              onClick={() => handleStart(inst)}
              disabled={startingId === inst.id || isPending}
              className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-[#C41E3A] hover:bg-[#a3172f] text-white text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              <Play className="w-3 h-3" />
              {startingId === inst.id ? "Starting…" : "Start"}
            </button>
          )}
          {canMarkMissed && (
            <button
              onClick={() => setMissedModalInst(inst)}
              disabled={isBusy}
              className="inline-flex items-center px-2.5 min-h-[44px] rounded-lg border border-red-300 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              Mark missed
            </button>
          )}
          {isAdmin && ["DONE", "MISSED", "OVERDUE", "DUE_TODAY", "UPCOMING", "IN_PROGRESS"].includes(inst.status) && inst.status !== "SKIPPED" && (
            <button
              onClick={() => handleSkip(inst)}
              disabled={isBusy || inst.status === "DONE"}
              className="inline-flex items-center px-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              Skip
            </button>
          )}
          {isAdmin && ["DONE", "MISSED", "SKIPPED"].includes(inst.status) && (
            <button
              onClick={() => handleReopen(inst)}
              disabled={isBusy}
              className="inline-flex items-center px-2.5 min-h-[44px] rounded-lg border border-blue-300 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    );
  }

  function Section({
    title,
    items,
    colorClass,
    expanded,
    onToggle,
  }: {
    title: string;
    items: TaskInstance[];
    colorClass: string;
    expanded?: boolean;
    onToggle?: () => void;
  }) {
    const isCollapsible = onToggle !== undefined;
    const show = isCollapsible ? (expanded ?? false) : true;

    if (items.length === 0) return null;

    return (
      <div className="mb-1">
        <button
          onClick={onToggle}
          disabled={!isCollapsible}
          className={`w-full flex items-center justify-between px-4 py-2 ${colorClass} rounded-t-lg ${isCollapsible ? "cursor-pointer hover:opacity-90" : "cursor-default"}`}
        >
          <span className="text-sm font-semibold">
            {title} ({items.length})
          </span>
          {isCollapsible && (
            show ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
          )}
        </button>
        {show && (
          <div className="border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg overflow-hidden bg-white dark:bg-gray-900">
            {items.map((inst) => (
              <TaskRow key={inst.id} inst={inst} showOwner={role === "ADMIN"} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
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
      {startError && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          <span>{startError}</span>
          <button onClick={() => setStartError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      <div id="my-tasks" className="max-w-5xl space-y-1 mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            My Tasks
          </h2>
          {role === "ADMIN" && (
            <div className="flex items-center gap-2">
              <select
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                value={facilityFilter}
                onChange={(e) => setFacilityFilter(e.target.value)}
              >
                <option value="">All facilities</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <select
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
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
        </div>

        {totalActive === 0 && doneToday.length === 0 ? (
          <div className="card p-6 text-center text-gray-500 text-sm">
            No tasks due. You&apos;re all caught up.
          </div>
        ) : (
          <>
            <Section
              title="Overdue"
              items={overdue}
              colorClass="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
            />
            <Section
              title="Due today"
              items={dueToday}
              colorClass="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
            />
            <Section
              title="In progress"
              items={inProgress}
              colorClass="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
            />
            <Section
              title="Upcoming (next 7 days)"
              items={upcoming}
              colorClass="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
              expanded={expandedUpcoming}
              onToggle={() => setExpandedUpcoming((v) => !v)}
            />
            <Section
              title="Completed today"
              items={doneToday}
              colorClass="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
              expanded={expandedDone}
              onToggle={() => setExpandedDone((v) => !v)}
            />
          </>
        )}
      </div>
    </>
  );
}
