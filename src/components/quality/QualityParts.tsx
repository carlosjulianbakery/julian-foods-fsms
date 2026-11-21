"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ACTION_LABELS, CAPA_STATUSES, INCIDENT_STATUSES, describeChange, formatMoment,
  type Change, type EventAction, type FieldProblem, type RecordType,
} from "@/lib/quality";

export interface QualityEventRow { id: string; action: string; userName: string; createdAt: string; changes: Change[]; note: string | null }

const TONE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800", under_review: "bg-blue-100 text-blue-800", in_progress: "bg-blue-100 text-blue-800", verifying: "bg-indigo-100 text-indigo-800",
  closed: "bg-emerald-100 text-emerald-800", void: "bg-gray-200 text-gray-600 line-through",
};

export function StatusBadge({ type, status }: { type: RecordType; status: string }) {
  const label = (type === "incident" ? INCIDENT_STATUSES : CAPA_STATUSES)[status] ?? status;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TONE[status] ?? "bg-gray-100 text-gray-600"}`} data-status={status}>{label}</span>;
}

/** What still has to be filled in before the record can be closed, by field, in plain words. */
export function ClosureChecklist({ problems, what }: { problems: FieldProblem[]; what: string }) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-800" data-closure="ready">
        <CheckCircle2 className="w-4 h-4 shrink-0" /> Everything needed to close this {what} is filled in.
      </div>
    );
  }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900" data-closure="missing">
      <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> Before this {what} can be closed:</p>
      <ul className="list-disc pl-6 mt-1 space-y-0.5">
        {problems.map((p) => <li key={p.field} data-missing={p.field}>{p.message}</li>)}
      </ul>
    </div>
  );
}

/** The record's history, newest first: date, person, action, and each field's change. Nothing here can be edited. */
export function QualityHistory({ type, events, names = {} }: { type: RecordType; events: QualityEventRow[]; names?: Record<string, string> }) {
  return (
    <section className="card p-4 space-y-2" data-history>
      <h2 className="text-sm font-bold text-gray-900">History</h2>
      {events.length === 0 && <p className="text-sm text-gray-400">No history yet.</p>}
      <ol className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="border-l-2 border-gray-200 pl-3" data-event={e.action}>
            <p className="text-xs text-gray-500">
              <span className="font-mono">{formatMoment(e.createdAt)}</span> · <span className="font-medium text-gray-700">{e.userName || "Unknown"}</span> ·{" "}
              <span className="font-semibold text-gray-900">{ACTION_LABELS[e.action as EventAction] ?? e.action}</span>
            </p>
            {e.note && <p className="text-xs text-gray-700 italic">Reason: {e.note}</p>}
            {e.changes.length > 0 && (
              <ul className="text-xs text-gray-600 mt-0.5 space-y-0.5">
                {e.changes.map((c) => <li key={c.field}>{describeChange(type, c, names)}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface StatusButton { key: string; label: string; needsReason?: boolean; danger?: boolean; primary?: boolean; disabled?: boolean; title?: string }

/** The status buttons. An action that needs a reason asks for it before it is sent. */
export function StatusButtons({ buttons, busy, onAction, initialAsking = null }: { buttons: StatusButton[]; busy?: boolean; onAction: (key: string, reason?: string) => void; initialAsking?: string | null }) {
  const [asking, setAsking] = useState<string | null>(initialAsking);
  const [reason, setReason] = useState("");
  const current = buttons.find((b) => b.key === asking);
  return (
    <div className="space-y-2" data-status-buttons>
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button
            key={b.key} type="button" disabled={busy || b.disabled} title={b.title} data-action={b.key}
            onClick={() => { if (b.needsReason) { setAsking(b.key); setReason(""); } else onAction(b.key); }}
            className={`text-sm px-3 py-1.5 rounded-lg border font-medium disabled:opacity-40 ${
              b.primary ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700" : b.danger ? "border-red-200 text-red-700 hover:bg-red-50" : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {current && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2" data-reason-for={current.key}>
          <label className="block text-xs font-medium text-gray-700">
            Reason for “{current.label}” (required, kept in the history)
            <textarea rows={2} className="input w-full text-sm mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy || reason.trim().length < 3} className="btn-primary text-sm disabled:opacity-50" onClick={() => { onAction(current.key, reason.trim()); setAsking(null); }}>
              Confirm
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => setAsking(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProblemList({ problems, error }: { problems?: FieldProblem[]; error?: string }) {
  if (!error && !(problems && problems.length)) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700" data-problems>
      {error && <p className="font-medium">{error}</p>}
      {problems && problems.length > 0 && <ul className="list-disc pl-5">{problems.map((p) => <li key={p.field + p.message}>{p.message}</li>)}</ul>}
    </div>
  );
}

/** A labelled field: an input while editable, plain text once the record is read-only. */
export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "md:col-span-2" : ""}`}>
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
export const ReadValue = ({ value }: { value: string }) => <span className="block text-sm text-gray-900 whitespace-pre-wrap" data-read-only>{value || "—"}</span>;
