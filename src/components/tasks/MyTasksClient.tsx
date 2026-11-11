"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Play, AlertTriangle } from "lucide-react";
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

export function MyTasksClient({ instances, role, facilities, owners, today }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [facilityFilter, setFacilityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [expandedUpcoming, setExpandedUpcoming] = useState(false);
  const [expandedDone, setExpandedDone] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

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
    try {
      const res = await fetch(`/api/task-instances/${inst.id}/start`, { method: "POST" });
      if (!res.ok) return;
      startTransition(() => router.refresh());
      if (inst.formKey && TASK_FORM_REGISTRY[inst.formKey]) {
        const href = TASK_FORM_REGISTRY[inst.formKey].href(inst.id);
        router.push(`${href}?taskId=${inst.id}`);
      }
    } finally {
      setStartingId(null);
    }
  }

  function isStartable(inst: TaskInstance): boolean {
    if (!["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"].includes(inst.status)) return false;
    return inst.dueDate <= tomorrow;
  }

  function TaskRow({ inst, showOwner }: { inst: TaskInstance; showOwner: boolean }) {
    const startable = isStartable(inst);
    const isOverdue = inst.status === "OVERDUE" || inst.status === "MISSED";
    const days = isOverdue ? daysOverdue(inst.dueDate, today) : 0;

    return (
      <div
        className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 border-gray-100 dark:border-gray-700 ${
          isOverdue ? "bg-red-50/50 dark:bg-red-900/10" : ""
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
          </div>
          {inst.label && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{inst.label}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span>Due {formatDueDate(inst.dueDate)}</span>
            {isOverdue && days > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium">{days} day{days !== 1 ? "s" : ""} overdue</span>
            )}
            {inst.status === "DUE_TODAY" && <span className="text-amber-600 font-medium">Due end of day</span>}
            {showOwner && <span>Owner: {inst.ownerName}</span>}
            {inst.doneByName && <span>Done by {inst.doneByName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusPill(inst.status)}`}>
            {statusLabel(inst.status)}
          </span>
          {startable && (
            <button
              onClick={() => handleStart(inst)}
              disabled={startingId === inst.id || isPending}
              className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-[#C41E3A] hover:bg-[#a3172f] text-white text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              <Play className="w-3 h-3" />
              {startingId === inst.id ? "Starting…" : "Start"}
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
    defaultExpanded = true,
    expanded,
    onToggle,
  }: {
    title: string;
    items: TaskInstance[];
    colorClass: string;
    defaultExpanded?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
  }) {
    const isCollapsible = onToggle !== undefined;
    const show = isCollapsible ? (expanded ?? defaultExpanded) : true;

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
            title={`Completed today`}
            items={doneToday}
            colorClass="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
            expanded={expandedDone}
            onToggle={() => setExpandedDone((v) => !v)}
          />
        </>
      )}
    </div>
  );
}
