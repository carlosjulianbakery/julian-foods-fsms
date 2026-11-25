"use client";

import { useState } from "react";
import { PriorityBadge, StatusBadge } from "@/components/work-orders/WorkOrderParts";
import { formatDay, formatMomentDay } from "@/lib/quality";
import { WO_FACILITIES, WO_PRIORITIES, WO_REQUEST_TYPES, WO_STATUSES, filterWorkOrders, isOverdue, type WorkOrderFilters, type WorkOrderRow } from "@/lib/work-orders";

const options = (map: Record<string, string>) => Object.entries(map).map(([value, label]) => <option key={value} value={value}>{label}</option>);
const SELECT = "input text-base md:text-sm min-h-[44px] block mt-0.5 w-full";

export interface WorkOrdersListProps {
  rows: WorkOrderRow[];
  /** Today in Pacific time, YYYY-MM-DD. */
  today: string;
  viewerId: string;
  onOpen: (row: WorkOrderRow) => void;
  initialFilters?: WorkOrderFilters;
}

/** The list of work orders with its filters. Rows are cards, so it reads the same on a phone, an iPad and a desktop. */
export function WorkOrdersList({ rows, today, viewerId, onOpen, initialFilters = {} }: WorkOrdersListProps) {
  const [f, setF] = useState<WorkOrderFilters>(initialFilters);
  const set = (patch: Partial<WorkOrderFilters>) => setF((x) => ({ ...x, ...patch }));
  const shown = filterWorkOrders(rows, f, viewerId);
  const toggle = (key: "assignedToMe" | "requestedByMe" | "showCancelled", label: string) => (
    <label className="inline-flex items-center gap-2 text-sm text-gray-700 min-h-[44px]">
      <input type="checkbox" className="w-5 h-5" checked={!!f[key]} onChange={(e) => set({ [key]: e.target.checked })} data-filter={key} /> {label}
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="card p-3 space-y-2" data-filters="work-orders">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label className="block text-[11px] font-medium text-gray-500">Status
            <select className={SELECT} value={f.status ?? ""} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>{options(WO_STATUSES)}</select>
          </label>
          <label className="block text-[11px] font-medium text-gray-500">Priority
            <select className={SELECT} value={f.priority ?? ""} onChange={(e) => set({ priority: e.target.value })}><option value="">All</option>{options(WO_PRIORITIES)}</select>
          </label>
          <label className="block text-[11px] font-medium text-gray-500">Type
            <select className={SELECT} value={f.requestType ?? ""} onChange={(e) => set({ requestType: e.target.value })}><option value="">All</option>{options(WO_REQUEST_TYPES)}</select>
          </label>
          <label className="block text-[11px] font-medium text-gray-500">Facility
            <select className={SELECT} value={f.facility ?? ""} onChange={(e) => set({ facility: e.target.value })}><option value="">All</option>{WO_FACILITIES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {toggle("assignedToMe", "Assigned to me")}
          {toggle("requestedByMe", "Requested by me")}
          {toggle("showCancelled", "Show cancelled")}
          <span className="text-xs text-gray-400 ml-auto" data-count>{shown.length} of {rows.length}</span>
        </div>
      </div>

      {shown.length === 0 ? <div className="card p-6 text-center text-sm text-gray-500">{rows.length === 0 ? "No work orders yet." : "No work orders match these filters."}</div> : (
        <ul className="space-y-2" data-list="work-orders">
          {shown.map((r) => {
            const overdue = isOverdue(r, today);
            return (
              <li key={r.id}>
                <button
                  type="button" onClick={() => onOpen(r)} data-row={r.reference} data-overdue={overdue ? "true" : undefined}
                  className={`card w-full text-left p-3 hover:bg-gray-50 ${overdue ? "border-red-300 bg-red-50/40" : ""} ${r.status === "cancelled" ? "opacity-60" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-gray-900">{r.reference}</span>
                    <StatusBadge status={r.status} />
                    <PriorityBadge priority={r.priority} />
                    {overdue && <span className="text-[10px] font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5">OVERDUE</span>}
                    <span className="text-xs text-gray-500 ml-auto">{r.facility} · {WO_REQUEST_TYPES[r.requestType] ?? r.requestType}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1">{r.equipmentName}</p>
                  <p className="text-sm text-gray-600 line-clamp-2">{r.problem}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Requested {formatMomentDay(r.requestedAt)} by {r.requestedByName || "—"} · Assigned to <b>{r.assigneeName || "—"}</b>{r.assigneeId === viewerId ? " (you)" : ""} ·{" "}
                    <span className={overdue ? "text-red-700 font-semibold" : ""}>Due {formatDay(r.dueDate)}</span>
                    {r.completedDate ? ` · Completed ${formatDay(r.completedDate)}` : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
