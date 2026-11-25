"use client";

import { useState } from "react";
import { INPUT, Problems } from "@/components/work-orders/WorkOrderParts";
import type { WoProblem } from "@/lib/work-orders";

export interface EquipmentItem { id: string; facility: string; name: string; retiredAt: string | null }
export interface EquipmentEditorProps {
  facilities: string[];
  items: EquipmentItem[];
  busy?: boolean;
  error?: string;
  problems?: WoProblem[];
  onAdd: (facility: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onRetire: (id: string, retired: boolean) => void;
  initialShowRetired?: boolean;
}

/** The equipment / area list of each facility. Items are added, renamed and retired; never deleted. */
export function EquipmentEditor(p: EquipmentEditorProps) {
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [showRetired, setShowRetired] = useState(!!p.initialShowRetired);
  return (
    <div className="space-y-4" data-equipment-editor>
      <Problems error={p.error} problems={p.problems} />
      <label className="inline-flex items-center gap-2 text-sm text-gray-700 min-h-[44px]">
        <input type="checkbox" className="w-5 h-5" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Show retired items
      </label>
      {p.facilities.map((facility) => {
        const all = p.items.filter((i) => i.facility === facility);
        const shown = all.filter((i) => showRetired || !i.retiredAt);
        return (
          <section key={facility} className="card p-4 space-y-3" data-facility={facility}>
            <h2 className="text-sm font-bold text-gray-900">{facility} <span className="font-normal text-gray-500">({all.filter((i) => !i.retiredAt).length} in use)</span></h2>
            {shown.length === 0 && <p className="text-sm text-gray-500" data-empty>{all.length === 0 ? "The list is empty. Until it is filled in, people type the name of the equipment or area on the work order." : "No items in use."}</p>}
            <ul className="divide-y divide-gray-100">
              {shown.map((item) => (
                <li key={item.id} className="py-2 flex flex-wrap items-center gap-2" data-item={item.name} data-retired={item.retiredAt ? "true" : undefined}>
                  {renaming?.id === item.id ? (
                    <>
                      <input type="text" className={`${INPUT} flex-1`} value={renaming.name} onChange={(e) => setRenaming({ id: item.id, name: e.target.value })} />
                      <button type="button" disabled={p.busy || !renaming.name.trim()} className="btn-primary text-sm min-h-[44px] disabled:opacity-50" onClick={() => { p.onRename(item.id, renaming.name.trim()); setRenaming(null); }}>Save</button>
                      <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={() => setRenaming(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className={`flex-1 text-sm ${item.retiredAt ? "text-gray-400 line-through" : "text-gray-900"}`}>{item.name}{item.retiredAt ? " (retired)" : ""}</span>
                      {!item.retiredAt && <button type="button" disabled={p.busy} className="btn-secondary text-sm min-h-[44px]" onClick={() => setRenaming({ id: item.id, name: item.name })}>Rename</button>}
                      <button type="button" disabled={p.busy} className="btn-secondary text-sm min-h-[44px]" onClick={() => p.onRetire(item.id, !item.retiredAt)}>{item.retiredAt ? "Bring back" : "Retire"}</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-col md:flex-row gap-2" data-add={facility}>
              <input type="text" className={`${INPUT} flex-1`} placeholder="Name of the equipment or area" value={adding[facility] ?? ""} onChange={(e) => setAdding((a) => ({ ...a, [facility]: e.target.value }))} />
              <button type="button" disabled={p.busy || !(adding[facility] ?? "").trim()} className="btn-primary text-base md:text-sm min-h-[44px] disabled:opacity-50"
                onClick={() => { p.onAdd(facility, (adding[facility] ?? "").trim()); setAdding((a) => ({ ...a, [facility]: "" })); }}>
                Add
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
