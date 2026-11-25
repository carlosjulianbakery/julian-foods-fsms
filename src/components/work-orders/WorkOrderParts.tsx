"use client";

import { WO_ACTION_LABELS, WO_PRIORITIES, WO_STATUSES, describeWoChange, type Change, type WoEventAction, type WoProblem } from "@/lib/work-orders";
import { formatMoment } from "@/lib/quality";

export interface WorkOrderEventRow { id: string; action: string; userName: string; createdAt: string; changes: Change[]; note: string | null }

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800", in_progress: "bg-blue-100 text-blue-800", completed: "bg-emerald-100 text-emerald-800", cancelled: "bg-gray-200 text-gray-600 line-through",
};
const PRIORITY_TONE: Record<string, string> = { high: "bg-red-100 text-red-800", medium: "bg-amber-100 text-amber-800", low: "bg-gray-100 text-gray-700" };

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_TONE[status] ?? "bg-gray-100 text-gray-600"}`} data-status={status}>{WO_STATUSES[status] ?? status}</span>
);
export const PriorityBadge = ({ priority }: { priority: string }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_TONE[priority] ?? "bg-gray-100 text-gray-600"}`} data-priority={priority}>{WO_PRIORITIES[priority] ?? priority}</span>
);

export function Problems({ problems, error }: { problems?: WoProblem[]; error?: string }) {
  if (!error && !(problems && problems.length)) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700" data-problems>
      {error && <p className="font-medium">{error}</p>}
      {problems && problems.length > 0 && <ul className="list-disc pl-5">{problems.map((p) => <li key={p.field + p.message} data-problem={p.field}>{p.message}</li>)}</ul>}
    </div>
  );
}

/** A labelled field. Inputs are full width and tall enough for a thumb. */
export function Field({ label, children, wide, hint }: { label: string; children: React.ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={`block ${wide ? "md:col-span-2" : ""}`}>
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}
export const ReadValue = ({ value }: { value: string }) => <span className="block text-sm text-gray-900 whitespace-pre-wrap" data-read-only>{value || "—"}</span>;
export const INPUT = "input w-full text-base md:text-sm min-h-[44px]";

/** The change log, newest first: when, who, what, and each field's old and new value. */
export function ChangeLog({ events, names = {} }: { events: WorkOrderEventRow[]; names?: Record<string, string> }) {
  return (
    <section className="card p-4 space-y-2" data-change-log>
      <h2 className="text-sm font-bold text-gray-900">Change log</h2>
      {events.length === 0 && <p className="text-sm text-gray-400">Nothing yet.</p>}
      <ol className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="border-l-2 border-gray-200 pl-3" data-event={e.action}>
            <p className="text-xs text-gray-500">
              <span className="font-mono">{formatMoment(e.createdAt)}</span> · <span className="font-medium text-gray-700">{e.userName || "Unknown"}</span> ·{" "}
              <span className="font-semibold text-gray-900">{WO_ACTION_LABELS[e.action as WoEventAction] ?? e.action}</span>
            </p>
            {e.note && <p className="text-xs text-gray-700 italic">{e.note}</p>}
            {e.changes.length > 0 && <ul className="text-xs text-gray-600 mt-0.5 space-y-0.5">{e.changes.map((c) => <li key={c.field}>{describeWoChange(c, names)}</li>)}</ul>}
          </li>
        ))}
      </ol>
    </section>
  );
}
