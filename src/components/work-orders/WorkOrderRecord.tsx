"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DateInput } from "@/components/DateInput";
import { ChangeLog, Field, INPUT, PriorityBadge, Problems, ReadValue, StatusBadge, type WorkOrderEventRow } from "@/components/work-orders/WorkOrderParts";
import { formatDay, formatMoment } from "@/lib/quality";
import { STEP2_FIELDS, WO_REPAIRED_BY, WO_REQUEST_TYPES, completionProblems, diffFields, formatTime, isOpenStatus, isOverdue, type WoProblem } from "@/lib/work-orders";

type Values = Record<string, string | boolean | null>;
const text = (v: unknown) => (typeof v === "string" ? v : "");

export interface WorkOrderRecordProps {
  record: Values;
  events: WorkOrderEventRow[];
  names?: Record<string, string>;
  /** The active users: who the work order can be given to, and who can be named as "repaired by". */
  users: { id: string; name: string }[];
  viewer: { id: string; name: string };
  can: { work: boolean; reassign: boolean; cancel: boolean };
  /** False when the person it is assigned to has been deactivated or removed. */
  assigneeActive: boolean;
  task?: { id: string; status: string; dueDate: string } | null;
  /** Today in Pacific time, YYYY-MM-DD. */
  today: string;
  busy?: boolean;
  error?: string;
  problems?: WoProblem[];
  onStart: () => void;
  onSaveDraft: (changed: Values) => void;
  onComplete: (values: Values) => void;
  onReassign: (assigneeId: string) => void;
  onCancel: (reason: string) => void;
  /** For tests: which of the two small panels starts open. */
  initialPanel?: "reassign" | "cancel" | null;
}

/** One work order: the request, who has it, Step 2 (once started) and the change log. */
export function WorkOrderRecord(p: WorkOrderRecordProps) {
  const r = p.record;
  const status = text(r.status);
  const names = { ...Object.fromEntries(p.users.map((u) => [u.id, u.name])), ...(p.names ?? {}) };
  const overdue = isOverdue({ dueDate: text(r.dueDate), status }, p.today);
  const [panel, setPanel] = useState<"reassign" | "cancel" | null>(p.initialPanel ?? null);
  const [nextAssignee, setNextAssignee] = useState("");
  const [reason, setReason] = useState("");

  // Step 2 starts from what is saved; a blank start date and signature are suggested, not stored, until saved
  const [draft, setDraft] = useState<Values>(() => ({
    ...Object.fromEntries(STEP2_FIELDS.map((f) => [f, r[f] ?? null])),
    startDate: r.startDate ?? p.today, completedDate: r.completedDate ?? null, signatureName: text(r.signatureName) || p.viewer.name,
  }));
  const set = (field: string, value: string | boolean | null) => setDraft((d) => ({ ...d, [field]: value }));
  const changed = Object.fromEntries(diffFields(r, draft, [...STEP2_FIELDS]).map((c) => [c.field, draft[c.field]]));
  const dirty = Object.keys(changed).length > 0;
  const missing = completionProblems(draft);
  const editing = status === "in_progress" && p.can.work;
  const showStep2 = status === "in_progress" || status === "completed" || STEP2_FIELDS.some((f) => f !== "signatureName" && r[f] !== null && r[f] !== "" && r[f] !== undefined);
  const repairedBy = text(r.repairedByKind) ? `${WO_REPAIRED_BY[text(r.repairedByKind)]}: ${text(r.repairedByName) || names[text(r.repairedByUserId)] || "—"}` : "";

  return (
    <div className="space-y-4" data-record="work-order">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold font-mono text-gray-900">{text(r.reference)}</h1>
        <StatusBadge status={status} />
        <PriorityBadge priority={text(r.priority)} />
        {overdue && <span className="text-xs font-bold text-red-700 bg-red-100 rounded px-2 py-0.5" data-overdue>OVERDUE</span>}
        <span className="text-xs text-gray-500">{text(r.facility)}</span>
      </div>

      {status === "cancelled" && (
        <div className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700" data-banner="cancelled">
          <b>CANCELLED / VOID</b> on {formatMoment(text(r.cancelledAt))}. Reason: {text(r.cancelReason) || "—"}. It is kept for the record and is read-only.
        </div>
      )}
      {status === "completed" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-900" data-banner="completed">
          Completed on {formatDay(text(r.completedDate))}. Signed by {text(r.signatureName) || "—"} on {formatMoment(text(r.signedAt))}.
        </div>
      )}
      {isOpenStatus(status) && !p.assigneeActive && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900" data-warning="assignee-inactive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{text(r.assigneeName) || "The person this was assigned to"} is no longer an active user. This work order stays open until it is reassigned.</span>
        </div>
      )}
      <Problems error={p.error} problems={p.problems} />

      <section className="card p-4 grid gap-3 md:grid-cols-2" data-section="request">
        <h2 className="text-sm font-bold text-gray-900 md:col-span-2">Step 1 — Request</h2>
        <Field label="Date and time (Pacific)"><ReadValue value={formatMoment(text(r.requestedAt))} /></Field>
        <Field label="Requested by"><ReadValue value={text(r.requestedByName)} /></Field>
        <Field label="Request type"><ReadValue value={WO_REQUEST_TYPES[text(r.requestType)] ?? text(r.requestType)} /></Field>
        <Field label="Equipment or area"><ReadValue value={text(r.equipmentName)} /></Field>
        <Field label="Description of the problem" wide><ReadValue value={text(r.problem)} /></Field>
      </section>

      <section className="card p-4 space-y-3" data-section="assignment">
        <h2 className="text-sm font-bold text-gray-900">Who has it</h2>
        <div className="grid gap-3 grid-cols-2">
          <Field label="Assigned to"><ReadValue value={`${text(r.assigneeName)}${r.assigneeId === p.viewer.id ? " (you)" : ""}`} /></Field>
          <Field label="Due date"><span className={`block text-sm ${overdue ? "text-red-700 font-semibold" : "text-gray-900"}`} data-due>{formatDay(text(r.dueDate))}</span></Field>
        </div>
        {status === "open" && p.can.work && (
          <button type="button" disabled={p.busy} onClick={p.onStart} data-action="start" className="btn-primary w-full md:w-auto text-base md:text-sm min-h-[44px] disabled:opacity-50">
            {p.busy ? "Starting…" : "Start"}
          </button>
        )}
        {status === "open" && !p.can.work && <p className="text-xs text-gray-500" data-waiting>Waiting for {text(r.assigneeName) || "the assignee"} to press Start.</p>}
        {isOpenStatus(status) && (p.can.reassign || p.can.cancel) && (
          <div className="flex flex-wrap gap-2">
            {p.can.reassign && <button type="button" data-action="reassign" className="btn-secondary text-sm min-h-[44px]" onClick={() => setPanel(panel === "reassign" ? null : "reassign")}>Reassign</button>}
            {p.can.cancel && <button type="button" data-action="cancel" className="text-sm min-h-[44px] px-3 rounded-lg border border-red-200 text-red-700 font-medium hover:bg-red-50" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>Cancel / void</button>}
          </div>
        )}
        {status === "completed" && p.can.cancel && (
          <button type="button" data-action="cancel" className="text-sm min-h-[44px] px-3 rounded-lg border border-red-200 text-red-700 font-medium hover:bg-red-50" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>Void this work order</button>
        )}
        {panel === "reassign" && p.can.reassign && isOpenStatus(status) && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2" data-panel="reassign">
            <Field label="Give this work order to" hint={status === "in_progress" ? "It goes back to Open: the new person presses Start." : undefined}>
              <select className={INPUT} value={nextAssignee} onChange={(e) => setNextAssignee(e.target.value)}>
                <option value="">Choose…</option>
                {p.users.filter((u) => u.id !== r.assigneeId).map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === p.viewer.id ? " (me)" : ""}</option>)}
              </select>
            </Field>
            <button type="button" disabled={p.busy || !nextAssignee} className="btn-primary text-sm min-h-[44px] disabled:opacity-50" onClick={() => { p.onReassign(nextAssignee); setPanel(null); }}>Reassign</button>
          </div>
        )}
        {panel === "cancel" && p.can.cancel && status !== "cancelled" && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2" data-panel="cancel">
            <Field label="Reason (required, kept in the change log)"><textarea rows={2} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <button type="button" disabled={p.busy || reason.trim().length < 3} className="btn-primary text-sm min-h-[44px] disabled:opacity-50" onClick={() => { p.onCancel(reason.trim()); setPanel(null); }}>Confirm</button>
          </div>
        )}
      </section>

      {showStep2 && (
        <section className="card p-4 grid gap-3 md:grid-cols-2" data-section="action" data-editing={editing ? "true" : "false"}>
          <h2 className="text-sm font-bold text-gray-900 md:col-span-2">Step 2 — Action</h2>
          {editing ? (
            <>
              <p className="text-xs text-gray-500 md:col-span-2">Fill this in after all tools are counted and the area is cleaned.</p>
              <Field label="Start date"><DateInput value={text(draft.startDate)} onChange={(v) => set("startDate", v || null)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start time"><input type="time" className={INPUT} value={text(draft.startTime)} onChange={(e) => set("startTime", e.target.value || null)} data-field="startTime" /></Field>
                <Field label="Stop time"><input type="time" className={INPUT} value={text(draft.stopTime)} onChange={(e) => set("stopTime", e.target.value || null)} data-field="stopTime" /></Field>
              </div>
              <Field label="Repaired by">
                <select className={INPUT} value={text(draft.repairedByKind)} onChange={(e) => setDraft((d) => ({ ...d, repairedByKind: e.target.value || null, repairedByUserId: null, repairedByName: "" }))} data-field="repairedByKind">
                  <option value="">Choose…</option>{Object.entries(WO_REPAIRED_BY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              {draft.repairedByKind === "internal" && (
                <Field label="Person (or type the name below)">
                  <select className={INPUT} value={text(draft.repairedByUserId)} data-field="repairedByUserId"
                    onChange={(e) => setDraft((d) => ({ ...d, repairedByUserId: e.target.value || null, repairedByName: p.users.find((u) => u.id === e.target.value)?.name ?? "" }))}>
                    <option value="">Not a user of this system</option>{p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </Field>
              )}
              {(draft.repairedByKind === "external" || (draft.repairedByKind === "internal" && !draft.repairedByUserId)) && (
                <Field label={draft.repairedByKind === "external" ? "Name or company" : "Name"}>
                  <input type="text" className={INPUT} value={text(draft.repairedByName)} onChange={(e) => set("repairedByName", e.target.value)} data-field="repairedByName" />
                </Field>
              )}
              <Field label="Description of work" wide><textarea rows={4} className={INPUT} value={text(draft.workDescription)} onChange={(e) => set("workDescription", e.target.value)} data-field="workDescription" /></Field>
              <Field label="Are all tools accounted for and the area cleared and cleaned?" wide>
                <div className="flex gap-2" data-field="toolsAccounted">
                  {([[true, "Yes"], [false, "No"]] as const).map(([value, label]) => (
                    <button key={label} type="button" aria-pressed={draft.toolsAccounted === value} onClick={() => set("toolsAccounted", value)}
                      className={`flex-1 md:flex-none md:w-32 min-h-[44px] rounded-lg border text-base md:text-sm font-semibold ${draft.toolsAccounted === value ? (value ? "bg-emerald-600 text-white border-emerald-600" : "bg-red-600 text-white border-red-600") : "border-gray-300 text-gray-700"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              {draft.toolsAccounted === false && (
                <p className="md:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-tools-block>
                  The work order cannot be completed while the answer is No. Count the tools and clear and clean the area, then answer Yes. You can save a draft in the meantime.
                </p>
              )}
              <Field label="Date work completed"><DateInput value={text(draft.completedDate)} onChange={(v) => set("completedDate", v || null)} /></Field>
              <Field label="Complete name (your signature)" hint="Your account and the time are recorded with it.">
                <input type="text" className={INPUT} value={text(draft.signatureName)} onChange={(e) => set("signatureName", e.target.value)} data-field="signatureName" />
              </Field>
              {missing.length > 0 && (
                <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900" data-missing={missing.length}>
                  <p className="font-semibold">Before this work order can be completed:</p>
                  <ul className="list-disc pl-6 mt-1 space-y-0.5">{missing.map((m) => <li key={m.field + m.message} data-missing-field={m.field}>{m.message}</li>)}</ul>
                </div>
              )}
              <div className="md:col-span-2 flex flex-col md:flex-row gap-2">
                <button type="button" disabled={p.busy || !dirty} data-action="save-draft" className="btn-secondary text-base md:text-sm min-h-[44px] disabled:opacity-50" onClick={() => p.onSaveDraft(changed)}>
                  {p.busy ? "Saving…" : dirty ? "Save draft" : "Draft saved"}
                </button>
                <button type="button" disabled={p.busy || missing.length > 0} data-action="complete" className="btn-primary text-base md:text-sm min-h-[44px] disabled:opacity-50"
                  onClick={() => p.onComplete(Object.fromEntries(STEP2_FIELDS.map((f) => [f, draft[f] ?? null])))}>
                  {p.busy ? "Submitting…" : "Submit and complete"}
                </button>
              </div>
            </>
          ) : (
            <>
              {status === "in_progress" && <p className="text-xs text-gray-500 md:col-span-2" data-step2-readonly>In progress since {formatMoment(text(r.startedAt))}. Only {text(r.assigneeName) || "the assignee"} or an admin can fill in this step.</p>}
              <Field label="Start"><ReadValue value={r.startDate ? `${formatDay(text(r.startDate))} · ${formatTime(text(r.startTime))}` : ""} /></Field>
              <Field label="Stop time"><ReadValue value={r.stopTime ? formatTime(text(r.stopTime)) : ""} /></Field>
              <Field label="Repaired by"><ReadValue value={repairedBy} /></Field>
              <Field label="All tools accounted for and area cleared and cleaned"><ReadValue value={r.toolsAccounted === true ? "Yes" : r.toolsAccounted === false ? "No" : ""} /></Field>
              <Field label="Description of work" wide><ReadValue value={text(r.workDescription)} /></Field>
              <Field label="Date work completed"><ReadValue value={r.completedDate ? formatDay(text(r.completedDate)) : ""} /></Field>
              <Field label="Complete name (signature)"><ReadValue value={status === "completed" ? `${text(r.signatureName)} · ${formatMoment(text(r.signedAt))}` : ""} /></Field>
            </>
          )}
        </section>
      )}

      <ChangeLog events={p.events} names={names} />
    </div>
  );
}
