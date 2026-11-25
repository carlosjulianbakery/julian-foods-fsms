"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Field, INPUT, Problems } from "@/components/work-orders/WorkOrderParts";
import { formatDay, formatMoment } from "@/lib/quality";
import { OTHER_EQUIPMENT, WO_PRIORITIES, WO_PRIORITY_HINTS, WO_REQUEST_TYPES, WO_STATUSES, dueDateFor, type WoProblem } from "@/lib/work-orders";

export interface WorkOrderOptions {
  users: { id: string; name: string }[];
  equipment: { id: string; facility: string; name: string }[];
  facilities: string[];
  /** Today in Pacific time, and the moment the form was opened. */
  today: string;
  now: string;
  defaultFacility: string;
  viewer: { id: string; name: string; canEditEquipment?: boolean };
}
export interface DuplicateRow { id: string | null; reference: string; status: string; priority: string; requestedAt: string; requestedByName: string; assigneeName: string }
export interface NewWorkOrderValues { facility: string; requestType: string; equipmentId: string; equipmentName: string; problem: string; priority: string; assigneeId: string }

export interface NewWorkOrderFormProps {
  options: WorkOrderOptions;
  /** Open work orders for the equipment chosen: a warning, never a block. */
  duplicates?: DuplicateRow[];
  busy?: boolean;
  error?: string;
  problems?: WoProblem[];
  initial?: Partial<NewWorkOrderValues>;
  onCreate: (values: NewWorkOrderValues) => void;
  onCancel: () => void;
  /** Called when the facility or the equipment changes, so the duplicates can be looked up. */
  onEquipmentChange?: (facility: string, equipmentId: string, equipmentName: string) => void;
}

/** Step 1, the request. The date, the time and "requested by" are set by the system and cannot be edited. */
export function NewWorkOrderForm(p: NewWorkOrderFormProps) {
  const [v, setV] = useState<NewWorkOrderValues>({
    facility: p.options.defaultFacility, requestType: "", equipmentId: "", equipmentName: "", problem: "", priority: "", assigneeId: "", ...p.initial,
  });
  const items = p.options.equipment.filter((e) => e.facility === v.facility);
  // With an empty list there is nothing to pick from: the name is simply typed
  const typed = items.length === 0 || v.equipmentId === OTHER_EQUIPMENT;
  const set = (patch: Partial<NewWorkOrderValues>) => {
    const next = { ...v, ...patch };
    setV(next);
    if ("facility" in patch || "equipmentId" in patch) p.onEquipmentChange?.(next.facility, next.equipmentId === OTHER_EQUIPMENT ? "" : next.equipmentId, next.equipmentName);
  };
  const ready = !!v.facility && !!v.requestType && (typed ? v.equipmentName.trim().length > 0 : !!v.equipmentId) && v.problem.trim().length > 0 && !!v.priority && !!v.assigneeId;
  const duplicates = p.duplicates ?? [];

  return (
    <div className="card p-4 space-y-4" data-new="work-order">
      <Problems error={p.error} problems={p.problems} />
      <div className="grid gap-3 grid-cols-2 bg-gray-50 border border-gray-200 rounded-lg p-3" data-system-fields>
        <div><p className="text-[11px] font-medium text-gray-500">Date and time (Pacific)</p><p className="text-sm text-gray-900" data-requested-at>{formatMoment(p.options.now)}</p></div>
        <div><p className="text-[11px] font-medium text-gray-500">Requested by</p><p className="text-sm text-gray-900" data-requested-by>{p.options.viewer.name}</p></div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Facility (required)">
          <select className={INPUT} value={v.facility} onChange={(e) => set({ facility: e.target.value, equipmentId: "", equipmentName: "" })} data-field="facility">
            <option value="">Choose…</option>{p.options.facilities.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Request type (required)">
          <select className={INPUT} value={v.requestType} onChange={(e) => set({ requestType: e.target.value })} data-field="requestType">
            <option value="">Choose…</option>{Object.entries(WO_REQUEST_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {items.length > 0 && (
          <Field label="Equipment or area (required)">
            <select className={INPUT} value={v.equipmentId} onChange={(e) => set({ equipmentId: e.target.value, equipmentName: "" })} data-field="equipmentId">
              <option value="">Choose…</option>
              {items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              <option value={OTHER_EQUIPMENT}>Other (type the name)</option>
            </select>
          </Field>
        )}
        {typed && (
          <Field label={items.length === 0 ? "Equipment or area (required)" : "Name of the equipment or area (required)"} hint={items.length === 0 && v.facility ? "This facility's list is empty for now: type the name." : undefined}>
            <input
              type="text" className={INPUT} value={v.equipmentName} data-field="equipmentName"
              onChange={(e) => set({ equipmentName: e.target.value })} onBlur={() => p.onEquipmentChange?.(v.facility, "", v.equipmentName)}
            />
          </Field>
        )}
        <Field label="Description of the problem (required)" wide>
          <textarea rows={4} className={INPUT} value={v.problem} onChange={(e) => set({ problem: e.target.value })} data-field="problem" />
        </Field>
        <Field label="Priority (required)" hint={v.priority ? `Due ${formatDay(dueDateFor(v.priority, p.options.today))}` : undefined}>
          <select className={INPUT} value={v.priority} onChange={(e) => set({ priority: e.target.value })} data-field="priority">
            <option value="">Choose…</option>{Object.entries(WO_PRIORITIES).map(([k, l]) => <option key={k} value={k}>{l} — {WO_PRIORITY_HINTS[k]}</option>)}
          </select>
        </Field>
        <Field label="Assigned to (required)" hint="The person who will do the work. It can be you.">
          <select className={INPUT} value={v.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })} data-field="assigneeId">
            <option value="">Choose…</option>{p.options.users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === p.options.viewer.id ? " (me)" : ""}</option>)}
          </select>
        </Field>
      </div>

      {duplicates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900" data-duplicates={duplicates.length}>
          <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> There {duplicates.length === 1 ? "is already an open work order" : `are already ${duplicates.length} open work orders`} for this equipment:</p>
          <ul className="list-disc pl-6 mt-1">
            {duplicates.map((d) => <li key={d.reference} data-duplicate={d.reference}><span className="font-mono font-semibold">{d.reference}</span> · {WO_STATUSES[d.status] ?? d.status} · opened {formatMoment(d.requestedAt)} by {d.requestedByName || "—"} · assigned to {d.assigneeName || "—"}</li>)}
          </ul>
          <p className="text-xs mt-1">You can still open this one if it is a different problem.</p>
        </div>
      )}

      <div className="flex flex-col-reverse md:flex-row gap-2">
        <button type="button" className="btn-secondary text-base md:text-sm min-h-[44px]" onClick={p.onCancel}>Cancel</button>
        <button
          type="button" disabled={p.busy || !ready} className="btn-primary text-base md:text-sm min-h-[44px] disabled:opacity-50" data-create
          onClick={() => p.onCreate({ ...v, equipmentId: typed ? OTHER_EQUIPMENT : v.equipmentId, equipmentName: v.equipmentName.trim(), problem: v.problem.trim() })}
        >
          {p.busy ? "Opening…" : "Open work order"}
        </button>
      </div>
    </div>
  );
}
