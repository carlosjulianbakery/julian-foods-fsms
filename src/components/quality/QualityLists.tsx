"use client";

import { useState } from "react";
import { DateInput } from "@/components/DateInput";
import { Field, ProblemList, StatusBadge } from "@/components/quality/QualityParts";
import { exportHref } from "@/lib/quality-export";
import {
  CAPA_SOURCES, CAPA_STATUSES, CATEGORIES, CHANNELS, COMPANY_WIDE, FACILITIES, INCIDENT_STATUSES, capaDay, filterCapas, filterIncidents, formatDay,
  formatMomentDay, isOverdue, type CapaRow, type FieldProblem, type IncidentRow, type ListFilters,
} from "@/lib/quality";

const options = (map: Record<string, string>) => Object.entries(map).map(([value, label]) => <option key={value} value={value}>{label}</option>);
const lastChanged = (r: { updatedAt: string; updatedByName: string }) => `${formatMomentDay(r.updatedAt)}${r.updatedByName ? ` · ${r.updatedByName}` : ""}`;

/** The filter bar shared by both lists. Void records are hidden unless "Show void" is ticked. */
function Filters({ kind, f, set, count, total }: { kind: "incident" | "capa"; f: ListFilters; set: (patch: Partial<ListFilters>) => void; count: number; total: number }) {
  return (
    <div className="card p-3 flex flex-wrap items-end gap-2" data-filters={kind}>
      <label className="block text-[11px] font-medium text-gray-500">Search
        <input className="input text-sm w-44 block mt-0.5" placeholder={kind === "incident" ? "Reference or what happened" : "Reference or problem"} value={f.search ?? ""} onChange={(e) => set({ search: e.target.value })} />
      </label>
      <label className="block text-[11px] font-medium text-gray-500">Status
        <select className="input text-sm block mt-0.5" value={f.status ?? ""} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All</option>{options(kind === "incident" ? INCIDENT_STATUSES : CAPA_STATUSES)}
        </select>
      </label>
      {kind === "incident" ? (
        <>
          <label className="block text-[11px] font-medium text-gray-500">Category
            <select className="input text-sm block mt-0.5" value={f.category ?? ""} onChange={(e) => set({ category: e.target.value })}><option value="">All</option>{options(CATEGORIES)}</select>
          </label>
          <label className="block text-[11px] font-medium text-gray-500">Product
            <input className="input text-sm w-36 block mt-0.5" value={f.product ?? ""} onChange={(e) => set({ product: e.target.value })} />
          </label>
        </>
      ) : (
        <label className="block text-[11px] font-medium text-gray-500">Source
          <select className="input text-sm block mt-0.5" value={f.source ?? ""} onChange={(e) => set({ source: e.target.value })}><option value="">All</option>{options(CAPA_SOURCES)}</select>
        </label>
      )}
      <label className="block text-[11px] font-medium text-gray-500">Facility
        <select className="input text-sm block mt-0.5" value={f.facility ?? ""} onChange={(e) => set({ facility: e.target.value })}>
          <option value="">All</option><option value={COMPANY_WIDE}>{COMPANY_WIDE}</option>{FACILITIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <div className="block text-[11px] font-medium text-gray-500">From<div className="mt-0.5"><DateInput value={f.from ?? ""} onChange={(v) => set({ from: v })} /></div></div>
      <div className="block text-[11px] font-medium text-gray-500">To<div className="mt-0.5"><DateInput value={f.to ?? ""} onChange={(v) => set({ to: v })} /></div></div>
      <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 pb-2">
        <input type="checkbox" checked={!!f.showVoid} onChange={(e) => set({ showVoid: e.target.checked })} /> Show void
      </label>
      <span className="text-xs text-gray-400 pb-2 ml-auto" data-count>{count} of {total}</span>
      {/* The file holds exactly what these filters show: the same filters are applied again on the server */}
      <a href={exportHref(kind === "incident" ? "incidents" : "capas", f)} data-export={kind} className="btn-secondary text-xs mb-1">Export CSV</a>
    </div>
  );
}

const TH = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => <th className={`px-3 py-2 ${right ? "text-right" : ""}`}>{children}</th>;

export function IncidentsList({ rows, onOpen, initialFilters = {} }: { rows: IncidentRow[]; onOpen: (row: IncidentRow) => void; initialFilters?: ListFilters }) {
  const [f, setF] = useState<ListFilters>(initialFilters);
  const shown = filterIncidents(rows, f);
  return (
    <div className="space-y-3">
      <Filters kind="incident" f={f} set={(p) => setF((x) => ({ ...x, ...p }))} count={shown.length} total={rows.length} />
      {shown.length === 0 ? <div className="card p-6 text-center text-sm text-gray-500">{rows.length === 0 ? "No incidents yet." : "No incidents match these filters."}</div> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" data-list="incidents">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <TH>Reference</TH><TH>Date received</TH><TH>Category</TH><TH>Product</TH><TH>What happened</TH><TH>Status</TH><TH>CAPA</TH><TH>Last changed</TH>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} data-row={r.reference} onClick={() => onOpen(r)} className={`border-b last:border-b-0 border-gray-100 cursor-pointer hover:bg-gray-50 ${r.status === "void" ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2 font-mono font-semibold text-gray-900 whitespace-nowrap">
                    {r.reference}{r.foodSafetyConcern && <span className="ml-1.5 text-[10px] font-bold text-red-700 bg-red-100 rounded px-1" title="Food safety concern">FOOD SAFETY</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDay(r.dateReceived)}</td>
                  <td className="px-3 py-2">{r.category ? CATEGORIES[r.category] ?? r.category : "—"}</td>
                  <td className="px-3 py-2">{r.productName || "—"}</td>
                  <td className="px-3 py-2 max-w-[260px] truncate text-gray-600">{r.description}</td>
                  <td className="px-3 py-2"><StatusBadge type="incident" status={r.status} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{r.capaReference ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{lastChanged(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CapasList({ rows, today, onOpen, initialFilters = {} }: { rows: CapaRow[]; /** Today in Pacific time, YYYY-MM-DD. */ today: string; onOpen: (row: CapaRow) => void; initialFilters?: ListFilters }) {
  const [f, setF] = useState<ListFilters>(initialFilters);
  const shown = filterCapas(rows, f);
  return (
    <div className="space-y-3">
      <Filters kind="capa" f={f} set={(p) => setF((x) => ({ ...x, ...p }))} count={shown.length} total={rows.length} />
      {shown.length === 0 ? <div className="card p-6 text-center text-sm text-gray-500">{rows.length === 0 ? "No CAPAs yet." : "No CAPAs match these filters."}</div> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" data-list="capas">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <TH>Reference</TH><TH>Date opened</TH><TH>Source</TH><TH>The problem</TH><TH>Incidents</TH><TH>Status</TH><TH>Owner</TH><TH>Due date</TH><TH>Last changed</TH>
            </tr></thead>
            <tbody>
              {shown.map((r) => {
                const overdue = isOverdue(r, today);
                return (
                  <tr key={r.id} data-row={r.reference} onClick={() => onOpen(r)} className={`border-b last:border-b-0 border-gray-100 cursor-pointer hover:bg-gray-50 ${r.status === "void" ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2 font-mono font-semibold text-gray-900 whitespace-nowrap">{r.reference}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDay(capaDay(r))}</td>
                    <td className="px-3 py-2">{CAPA_SOURCES[r.source] ?? r.source}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate text-gray-600">{r.problem}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.incidentReferences.join(", ") || "—"}</td>
                    <td className="px-3 py-2"><StatusBadge type="capa" status={r.status} /></td>
                    <td className="px-3 py-2">{r.ownerName || "—"}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${overdue ? "text-red-700 font-semibold" : ""}`} data-overdue={overdue ? "true" : undefined}>
                      {formatDay(r.dueDate)}{overdue && <span className="ml-1.5 text-[10px] font-bold bg-red-100 rounded px-1">OVERDUE</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{lastChanged(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** New incident: only what is needed to open one. Everything else is filled in on the record. */
export function NewIncidentForm({ today, busy, error, problems, onCreate, onCancel }: {
  today: string; busy?: boolean; error?: string; problems?: FieldProblem[];
  onCreate: (data: { dateReceived: string; channel: string; description: string; facility: string | null }) => void; onCancel: () => void;
}) {
  const [d, setD] = useState({ dateReceived: today, channel: "", description: "", facility: "" });
  const ready = !!d.dateReceived && !!d.channel && d.description.trim().length > 0;
  return (
    <div className="card p-4 space-y-3 border-indigo-200 bg-indigo-50/40" data-new="incident">
      <p className="text-sm font-semibold text-gray-900">New customer incident</p>
      <ProblemList error={error} problems={problems} />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Date received (required)"><DateInput value={d.dateReceived} onChange={(v) => setD((x) => ({ ...x, dateReceived: v }))} /></Field>
        <Field label="How it came in (required)">
          <select className="input w-full text-sm" value={d.channel} onChange={(e) => setD((x) => ({ ...x, channel: e.target.value }))}><option value="">Choose…</option>{options(CHANNELS)}</select>
        </Field>
        <Field label="Facility (optional)">
          <select className="input w-full text-sm" value={d.facility} onChange={(e) => setD((x) => ({ ...x, facility: e.target.value }))}>
            <option value="">{COMPANY_WIDE}</option>{FACILITIES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <Field label="What happened (required)"><textarea rows={3} className="input w-full text-sm" value={d.description} onChange={(e) => setD((x) => ({ ...x, description: e.target.value }))} /></Field>
      <div className="flex gap-2">
        <button type="button" disabled={busy || !ready} className="btn-primary text-sm disabled:opacity-50" onClick={() => onCreate({ ...d, description: d.description.trim(), facility: d.facility || null })}>
          {busy ? "Creating…" : "Create incident"}
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** New CAPA that does not come from an incident (those are opened with "Open CAPA" on the incident). */
export function NewCapaForm({ busy, error, problems, onCreate, onCancel }: {
  busy?: boolean; error?: string; problems?: FieldProblem[]; onCreate: (data: { source: string; problem: string; facility: string | null }) => void; onCancel: () => void;
}) {
  const [d, setD] = useState({ source: "", problem: "", facility: "" });
  return (
    <div className="card p-4 space-y-3 border-indigo-200 bg-indigo-50/40" data-new="capa">
      <p className="text-sm font-semibold text-gray-900">New CAPA</p>
      <p className="text-xs text-gray-500">For a CAPA that comes from a customer incident, open the incident and use “Open CAPA” there: it links the two.</p>
      <ProblemList error={error} problems={problems} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Source (required)">
          <select className="input w-full text-sm" value={d.source} onChange={(e) => setD((x) => ({ ...x, source: e.target.value }))}><option value="">Choose…</option>{options(CAPA_SOURCES)}</select>
        </Field>
        <Field label="Facility (optional)">
          <select className="input w-full text-sm" value={d.facility} onChange={(e) => setD((x) => ({ ...x, facility: e.target.value }))}>
            <option value="">{COMPANY_WIDE}</option>{FACILITIES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <Field label="The problem (required)"><textarea rows={3} className="input w-full text-sm" value={d.problem} onChange={(e) => setD((x) => ({ ...x, problem: e.target.value }))} /></Field>
      <div className="flex gap-2">
        <button type="button" disabled={busy || !d.source || !d.problem.trim()} className="btn-primary text-sm disabled:opacity-50" onClick={() => onCreate({ source: d.source, problem: d.problem.trim(), facility: d.facility || null })}>
          {busy ? "Creating…" : "Create CAPA"}
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

