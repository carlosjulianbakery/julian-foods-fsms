"use client";

import { useState } from "react";
import { DateInput } from "@/components/DateInput";
import { AttachmentsSection } from "@/components/quality/QualityAttachments";
import { ClosureChecklist, Field, ProblemList, QualityHistory, ReadValue, StatusBadge, StatusButtons, type QualityEventRow, type StatusButton } from "@/components/quality/QualityParts";
import {
  CAPA_ORDER, CAPA_SOURCES, CAPA_STATUSES, CATEGORIES, CHANNELS, COMPANY_WIDE, FACILITIES, INCIDENT_STATUSES, RESPONSE_CHANNELS, capaCanClose, capaClosingProblems,
  diffFields, facilityLabel, formatDay, formatMoment, incidentClosingProblems, isReadOnly, type AttachmentRow, type FieldProblem,
} from "@/lib/quality";

export interface QualityOptions { products: { id: string; name: string }[]; admins: { id: string; name: string }[]; today: string }
type Values = Record<string, string | boolean | null>;
const opts = (map: Record<string, string>) => Object.entries(map).map(([value, label]) => <option key={value} value={value}>{label}</option>);
const text = (v: unknown) => (typeof v === "string" ? v : "");

interface Common {
  events: QualityEventRow[];
  names?: Record<string, string>;
  options: QualityOptions;
  busy?: boolean;
  error?: string;
  problems?: FieldProblem[];
  /** Saves the fields that changed. */
  onSave: (changed: Values) => void;
  /** A status action: move, close, void or reopen. */
  onAction: (body: { action: string; to?: string; reason?: string; closedDate?: string }) => void;
  attachments?: AttachmentRow[];
  onUpload?: (file: File, kind: "evidence" | "customer_response", description: string) => void;
  onRemoveAttachment?: (id: string, reason: string) => void;
}
const nothing = () => {};

/** Text, select and date inputs that turn into plain text when the record is read-only. */
function useDraft(record: Values, readOnly: boolean) {
  const [draft, setDraft] = useState<Values>(record);
  const set = (field: string, value: string | boolean | null) => setDraft((d) => ({ ...d, [field]: value }));
  const changed = Object.fromEntries(diffFields(record, draft).map((c) => [c.field, draft[c.field]]));
  const input = (field: string, rows?: number) =>
    readOnly ? <ReadValue value={text(draft[field])} />
    : rows ? <textarea rows={rows} className="input w-full text-sm" value={text(draft[field])} onChange={(e) => set(field, e.target.value)} />
    : <input type="text" className="input w-full text-sm" value={text(draft[field])} onChange={(e) => set(field, e.target.value)} />;
  const select = (field: string, map: Record<string, string>, empty = "Choose…") =>
    readOnly ? <ReadValue value={map[text(draft[field])] ?? ""} />
    : <select className="input w-full text-sm" value={text(draft[field])} onChange={(e) => set(field, e.target.value || null)}><option value="">{empty}</option>{opts(map)}</select>;
  const date = (field: string) => (readOnly ? <ReadValue value={draft[field] ? formatDay(text(draft[field])) : ""} /> : <DateInput value={text(draft[field])} onChange={(v) => set(field, v || null)} />);
  const facility = () =>
    readOnly ? <ReadValue value={facilityLabel(text(draft.facility))} />
    : <select className="input w-full text-sm" value={text(draft.facility)} onChange={(e) => set("facility", e.target.value || null)}><option value="">{COMPANY_WIDE}</option>{FACILITIES.map((x) => <option key={x} value={x}>{x}</option>)}</select>;
  return { draft, set, changed, dirty: Object.keys(changed).length > 0, input, select, date, facility };
}

function SaveBar({ dirty, busy, readOnly, updatedAt, onSave }: { dirty: boolean; busy?: boolean; readOnly: boolean; updatedAt: string; onSave: () => void }) {
  if (readOnly) return null;
  return (
    <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur card px-4 py-3 flex items-center gap-3" data-save-bar>
      <button type="button" disabled={busy || !dirty} onClick={onSave} className="btn-primary text-sm disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
      <span className="text-xs text-gray-500">{dirty ? "You have unsaved changes." : `Saved. Last changed ${formatMoment(updatedAt)}.`}</span>
    </div>
  );
}

function VoidOrClosedBanner({ record, what, names }: { record: Values; what: string; names: Record<string, string> }) {
  if (record.status === "void") {
    return <div className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700" data-banner="void"><b>VOID</b> — this {what} was voided on {formatMoment(text(record.voidedAt))}{names[text(record.voidedById)] ? ` by ${names[text(record.voidedById)]}` : ""}. Reason: {text(record.voidReason) || "—"}. It is kept for the record and is read-only.</div>;
  }
  if (record.status === "closed") {
    const by = text(record.closedByName) || names[text(record.closedById)] || "";
    return <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-900" data-banner="closed">Closed on {formatDay(text(record.closedDate))}{by ? ` by ${by}` : ""}. This {what} is read-only; reopen it to make changes.</div>;
  }
  return null;
}

// ── Customer Incident ───────────────────────────────────────────────────────────

export interface IncidentRecordProps extends Common {
  record: Values;
  capa: { id: string; reference: string; status: string; problem: string } | null;
  onOpenCapa: () => void;
  onUnlink: (reason: string) => void;
  onGoToCapa: (id: string) => void;
}

export function IncidentRecord(p: IncidentRecordProps) {
  const readOnly = isReadOnly(text(p.record.status));
  const d = useDraft(p.record, readOnly);
  const [closedDate, setClosedDate] = useState(p.options.today);
  const names = p.names ?? {};
  const status = text(p.record.status);
  // The checklist looks at what is SAVED, so it always matches what closing would check
  const closing = incidentClosingProblems(p.record as never, !!p.capa, closedDate);
  const attachments = p.attachments ?? [];
  const activeAttachments = attachments.filter((a) => !a.removedAt).length;
  const buttons: StatusButton[] = readOnly
    ? [{ key: "reopen", label: "Reopen", needsReason: true }]
    : [
        status === "open" ? { key: "move:under_review", label: "Mark as Under review" } : { key: "move:open", label: "Back to Open" },
        { key: "close", label: "Close incident", primary: true, disabled: closing.length > 0 || d.dirty, title: d.dirty ? "Save your changes first" : closing.length ? "See what is missing below" : undefined },
        { key: "void", label: "Void", needsReason: true, danger: true },
      ];
  const act = (key: string, reason?: string) => {
    if (key === "unlink") return p.onUnlink(reason ?? "");
    if (key.startsWith("move:")) return p.onAction({ action: "move", to: key.slice(5) });
    p.onAction({ action: key, reason, ...(key === "close" ? { closedDate } : {}) });
  };

  return (
    <div className="space-y-4" data-record="incident">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold font-mono text-gray-900">{text(p.record.reference)}</h1>
        <StatusBadge type="incident" status={status} />
        {p.record.foodSafetyConcern === true && <span className="text-xs font-bold text-red-700 bg-red-100 rounded px-2 py-0.5">FOOD SAFETY CONCERN</span>}
        <span className="text-xs text-gray-500">{facilityLabel(text(p.record.facility))}</span>
      </div>
      <VoidOrClosedBanner record={p.record} what="incident" names={names} />
      <ProblemList error={p.error} problems={p.problems} />

      <section className="card p-4 grid gap-3 md:grid-cols-2" data-section="received">
        <h2 className="text-sm font-bold text-gray-900 md:col-span-2">The incident</h2>
        <Field label="Date received">{d.date("dateReceived")}</Field>
        <Field label="How it came in">{d.select("channel", CHANNELS)}</Field>
        <Field label="Customer or account">{d.input("customer")}</Field>
        <Field label="Facility">{d.facility()}</Field>
        <Field label="Product (pick from the list, optional)">
          {readOnly ? <ReadValue value={p.options.products.find((x) => x.id === d.draft.productId)?.name ?? ""} /> : (
            <select className="input w-full text-sm" value={text(d.draft.productId)}
              onChange={(e) => { const id = e.target.value || null; d.set("productId", id); const name = p.options.products.find((x) => x.id === id)?.name; if (name) d.set("productName", name); }}>
              <option value="">Not in the list</option>{p.options.products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Product (as written)">{d.input("productName")}</Field>
        <Field label="Lot code">{d.input("lotCode")}</Field>
        <Field label="Best-by date">{d.date("bestByDate")}</Field>
        <Field label="What happened" wide>{d.input("description", 4)}</Field>
        <Field label="Category">{d.select("category", CATEGORIES)}</Field>
        <Field label="Food safety concern">
          {readOnly ? <ReadValue value={d.draft.foodSafetyConcern ? "Yes" : "No"} /> : (
            <select className="input w-full text-sm" value={d.draft.foodSafetyConcern ? "yes" : "no"} onChange={(e) => d.set("foodSafetyConcern", e.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></select>
          )}
        </Field>
        <Field label={d.draft.foodSafetyConcern ? "Immediate action taken (required for a food safety concern)" : "Immediate action taken"} wide>{d.input("immediateAction", 3)}</Field>
      </section>

      <section className="card p-4 grid gap-3 md:grid-cols-2" data-section="response">
        <h2 className="text-sm font-bold text-gray-900 md:col-span-2">Response to the customer</h2>
        <Field label="Date of the response">{d.date("responseDate")}</Field>
        <Field label="Channel">{d.select("responseChannel", RESPONSE_CHANNELS)}</Field>
        <Field label="Short summary of the message" wide>{d.input("responseSummary", 3)}</Field>
        <div className="md:col-span-2">
          <AttachmentsSection
            attachments={attachments} kind="customer_response" title="Message sent to the customer" addLabel="Attach the message sent"
            recordActiveCount={activeAttachments} readOnly={readOnly} busy={p.busy} onUpload={p.onUpload ?? nothing} onRemove={p.onRemoveAttachment ?? nothing}
          />
        </div>
      </section>

      <section className="card p-4 space-y-3" data-section="capa">
        <h2 className="text-sm font-bold text-gray-900">CAPA decision</h2>
        {p.capa ? (
          <div className="space-y-2" data-linked-capa={p.capa.reference}>
            <p className="text-sm text-gray-700">
              A CAPA is linked: <button type="button" className="font-mono font-semibold underline" onClick={() => p.onGoToCapa(p.capa!.id)}>{p.capa.reference}</button>{" "}
              <StatusBadge type="capa" status={p.capa.status} />
            </p>
            {!readOnly && <StatusButtons busy={p.busy} buttons={[{ key: "unlink", label: "Unlink this CAPA", needsReason: true, danger: true }]} onAction={act} />}
          </div>
        ) : (
          <>
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={p.busy || d.dirty} title={d.dirty ? "Save your changes first" : undefined} onClick={p.onOpenCapa} className="btn-primary text-sm disabled:opacity-50" data-open-capa>Open CAPA</button>
                <span className="text-xs text-gray-500">Creates a CAPA from this incident and links the two.</span>
              </div>
            )}
            <Field label="Or: no CAPA is needed">
              {readOnly ? <ReadValue value={d.draft.capaRequired === false ? "No CAPA needed" : "Not decided"} /> : (
                <select className="input w-full text-sm md:w-64" value={d.draft.capaRequired === false ? "no" : ""} onChange={(e) => d.set("capaRequired", e.target.value === "no" ? false : null)}>
                  <option value="">Not decided yet</option><option value="no">No CAPA needed</option>
                </select>
              )}
            </Field>
            {(d.draft.capaRequired === false || text(d.draft.noCapaReason)) && <Field label="Reason no CAPA is needed (required with that choice)">{d.input("noCapaReason", 2)}</Field>}
          </>
        )}
      </section>

      <section className="card p-4" data-section="attachments">
        <AttachmentsSection
          attachments={attachments} kind="evidence" title="Attachments" addLabel="Add a file"
          recordActiveCount={activeAttachments} readOnly={readOnly} busy={p.busy} onUpload={p.onUpload ?? nothing} onRemove={p.onRemoveAttachment ?? nothing}
        />
      </section>

      {!readOnly && (
        <section className="card p-4 space-y-3" data-section="closing">
          <h2 className="text-sm font-bold text-gray-900">Closing</h2>
          <div className="md:w-56"><Field label="Closed date"><DateInput value={closedDate} onChange={setClosedDate} /></Field></div>
          <ClosureChecklist problems={closing} what="incident" />
          {d.dirty && <p className="text-xs text-gray-500">The checklist reflects what is saved. Save your changes to update it.</p>}
        </section>
      )}

      <section className="card p-4 space-y-2" data-section="status">
        <h2 className="text-sm font-bold text-gray-900">Status: {INCIDENT_STATUSES[status] ?? status}</h2>
        <StatusButtons buttons={buttons} busy={p.busy} onAction={act} />
      </section>

      <QualityHistory type="incident" events={p.events} names={names} />
      <SaveBar dirty={d.dirty} busy={p.busy} readOnly={readOnly} updatedAt={text(p.record.updatedAt)} onSave={() => p.onSave(d.changed)} />
    </div>
  );
}

// ── CAPA ────────────────────────────────────────────────────────────────────────

interface IncidentBrief { id: string; reference: string; status: string; dateReceived: string; description: string }
export interface CapaRecordProps extends Common {
  record: Values;
  incidents: IncidentBrief[];
  /** Open incidents without a CAPA: the ones that can still be linked here. */
  linkable: IncidentBrief[];
  onLink: (incidentId: string) => void;
  onUnlink: (incidentId: string, reason: string) => void;
  onGoToIncident: (id: string) => void;
  /** The follow-up task, if the CAPA has one. */
  task?: { id: string; status: string; dueDate: string; completedLate?: boolean; daysLate?: number | null } | null;
}

const TASK_STATUS: Record<string, string> = { UPCOMING: "Upcoming", DUE_TODAY: "Due today", IN_PROGRESS: "In progress", OVERDUE: "Overdue", DONE: "Done", SKIPPED: "Skipped", MISSED: "Missed" };

export function CapaRecord(p: CapaRecordProps) {
  const readOnly = isReadOnly(text(p.record.status));
  const d = useDraft(p.record, readOnly);
  const [toLink, setToLink] = useState("");
  const names = { ...Object.fromEntries(p.options.admins.map((a) => [a.id, a.name])), ...(p.names ?? {}) };
  const status = text(p.record.status);
  const closing = capaClosingProblems(p.record as never);
  const at = CAPA_ORDER.indexOf(status as (typeof CAPA_ORDER)[number]);
  const next = CAPA_ORDER[at + 1];
  const prev = at > 0 ? CAPA_ORDER[at - 1] : undefined;
  const buttons: StatusButton[] = readOnly
    ? [{ key: "reopen", label: "Reopen", needsReason: true }]
    : [
        ...(prev ? [{ key: `move:${prev}`, label: `Back to ${CAPA_STATUSES[prev]}`, needsReason: true }] : []),
        ...(next && next !== "closed" ? [{ key: `move:${next}`, label: `Move to ${CAPA_STATUSES[next]}` }] : []),
        ...(capaCanClose(status) ? [{ key: "close", label: "Close CAPA", primary: true, disabled: closing.length > 0 || d.dirty, title: d.dirty ? "Save your changes first" : closing.length ? "See what is missing below" : undefined }] : []),
        { key: "void", label: "Void", needsReason: true, danger: true },
      ];
  const act = (key: string, reason?: string) => {
    if (key.startsWith("unlink:")) return p.onUnlink(key.slice(7), reason ?? "");
    if (key.startsWith("move:")) return p.onAction({ action: "move", to: key.slice(5), reason });
    p.onAction({ action: key, reason });
  };

  return (
    <div className="space-y-4" data-record="capa">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold font-mono text-gray-900">{text(p.record.reference)}</h1>
        <StatusBadge type="capa" status={status} />
        <span className="text-xs text-gray-500">{facilityLabel(text(p.record.facility))}</span>
      </div>
      <VoidOrClosedBanner record={p.record} what="CAPA" names={names} />
      <ProblemList error={p.error} problems={p.problems} />

      <section className="card p-4 grid gap-3 md:grid-cols-2" data-section="problem">
        <h2 className="text-sm font-bold text-gray-900 md:col-span-2">The problem</h2>
        <Field label="Source">{d.select("source", CAPA_SOURCES)}</Field>
        <Field label="Facility">{d.facility()}</Field>
        <Field label="The problem" wide>{d.input("problem", 4)}</Field>
        <Field label="Root cause" wide>{d.input("rootCause", 3)}</Field>
      </section>

      <section className="card p-4 grid gap-3 md:grid-cols-2" data-section="actions">
        <h2 className="text-sm font-bold text-gray-900 md:col-span-2">Actions</h2>
        <Field label="Corrective action" wide>{d.input("correctiveAction", 3)}</Field>
        <Field label="Preventive action" wide>{d.input("preventiveAction", 3)}</Field>
        <Field label="Owner">
          {readOnly ? <ReadValue value={names[text(d.draft.ownerId)] ?? ""} /> : (
            <select className="input w-full text-sm" value={text(d.draft.ownerId)} onChange={(e) => d.set("ownerId", e.target.value || null)}>
              <option value="">Choose…</option>{p.options.admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Due date">{d.date("dueDate")}</Field>
        <p className="md:col-span-2 text-xs text-gray-600" data-capa-task={p.task ? p.task.status : "none"}>
          {p.task
            ? <>Follow-up task for the owner: due {formatDay(p.task.dueDate)} · <b>{TASK_STATUS[p.task.status] ?? p.task.status}</b>{p.task.completedLate ? ` (${p.task.daysLate ?? ""} day(s) late)` : ""}. It is completed when this CAPA reaches Verifying effectiveness or Closed.</>
            : <>A follow-up task is created for the owner once both the owner and the due date are saved.</>}
        </p>
      </section>

      <section className="card p-4 grid gap-3 md:grid-cols-2" data-section="effectiveness">
        <h2 className="text-sm font-bold text-gray-900 md:col-span-2">Effectiveness check</h2>
        <Field label="Date of the check">{d.date("effectivenessDate")}</Field>
        <Field label="Result" wide>{d.input("effectivenessResult", 3)}</Field>
      </section>

      <section className="card p-4 space-y-3" data-section="incidents">
        <h2 className="text-sm font-bold text-gray-900">Linked incidents ({p.incidents.length})</h2>
        {p.incidents.length === 0 && <p className="text-sm text-gray-400">No incident is linked to this CAPA.</p>}
        {p.incidents.map((i) => (
          <div key={i.id} className="flex flex-wrap items-start gap-3 border border-gray-200 rounded-lg px-3 py-2" data-linked-incident={i.reference}>
            <div className="flex-1 min-w-[200px]">
              <button type="button" className="font-mono font-semibold underline text-sm" onClick={() => p.onGoToIncident(i.id)}>{i.reference}</button>{" "}
              <StatusBadge type="incident" status={i.status} /> <span className="text-xs text-gray-500">{formatDay(i.dateReceived)}</span>
              <p className="text-xs text-gray-600 truncate">{i.description}</p>
            </div>
            {!readOnly && <StatusButtons busy={p.busy} buttons={[{ key: `unlink:${i.id}`, label: "Unlink", needsReason: true, danger: true }]} onAction={act} />}
          </div>
        ))}
        {!readOnly && (
          <div className="flex flex-wrap items-end gap-2" data-link-incident>
            <Field label="Link another incident (open incidents without a CAPA)">
              <select className="input text-sm w-80 max-w-full" value={toLink} onChange={(e) => setToLink(e.target.value)}>
                <option value="">{p.linkable.length === 0 ? "No incident available to link" : "Choose an incident…"}</option>
                {p.linkable.map((i) => <option key={i.id} value={i.id}>{i.reference} · {formatDay(i.dateReceived)} · {i.description.slice(0, 50)}</option>)}
              </select>
            </Field>
            <button type="button" disabled={p.busy || !toLink} className="btn-secondary text-sm disabled:opacity-50" onClick={() => { p.onLink(toLink); setToLink(""); }}>Link incident</button>
          </div>
        )}
      </section>

      <section className="card p-4" data-section="attachments">
        <AttachmentsSection
          attachments={p.attachments ?? []} kind="evidence" title="Attachments" addLabel="Add a file"
          recordActiveCount={(p.attachments ?? []).filter((a) => !a.removedAt).length} readOnly={readOnly} busy={p.busy} onUpload={p.onUpload ?? nothing} onRemove={p.onRemoveAttachment ?? nothing}
        />
      </section>

      {!readOnly && (
        <section className="card p-4 space-y-3" data-section="closing">
          <h2 className="text-sm font-bold text-gray-900">Closing</h2>
          <ClosureChecklist problems={closing} what="CAPA" />
          <p className="text-xs text-gray-500">
            {capaCanClose(status) ? "The name of the admin who closes it and the date are recorded automatically." : "A CAPA is closed from Verifying effectiveness."}
            {d.dirty ? " The checklist reflects what is saved; save your changes to update it." : ""}
          </p>
        </section>
      )}

      <section className="card p-4 space-y-2" data-section="status">
        <h2 className="text-sm font-bold text-gray-900">Status: {CAPA_STATUSES[status] ?? status}</h2>
        <StatusButtons buttons={buttons} busy={p.busy} onAction={act} />
      </section>

      <QualityHistory type="capa" events={p.events} names={names} />
      <SaveBar dirty={d.dirty} busy={p.busy} readOnly={readOnly} updatedAt={text(p.record.updatedAt)} onSave={() => p.onSave(d.changed)} />
    </div>
  );
}
