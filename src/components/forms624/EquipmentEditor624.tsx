"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  MAX_THERMOMETER_TOLERANCE_F, SECTIONS, SECTION_TITLES, WEIGHT_UNITS, defaultSpec, marginText, scaleSpecOf, sortEquipment, specProblem, thermometerToleranceOf,
  type Equipment, type Section, type SpecInput, type WeightUnit,
} from "@/lib/verification-624";

export interface EquipmentEditor624Props {
  equipment: Equipment[];
  busy?: boolean;
  error?: string;
  onAdd: (section: Section, name: string, location: string) => void;
  onRename: (id: string, name: string) => void;
  onLocation: (id: string, location: string) => void;
  onInUse: (id: string, inUse: boolean) => void;
  onRetire: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  /** Save an item's limits: test weight, unit and tolerance for a scale; tolerance for a thermometer. */
  onLimits: (id: string, limits: SpecInput) => void;
}

const toNumber = (text: string) => (text.trim() === "" ? NaN : Number(text));

/**
 * The limits of one item. Nothing is saved until "Save limits" is pressed, because a scale's test weight,
 * unit and tolerance only make sense together. What cannot be saved is said in plain words.
 */
export function ItemLimits624({ item, busy, onSave }: { item: Equipment; busy?: boolean; onSave: (limits: SpecInput) => void }) {
  const isScale = item.section === "scale";
  const saved = isScale ? scaleSpecOf(item) : null;
  const savedTolerance = saved ? saved.tolerance : thermometerToleranceOf(item.section, item);
  const [weight, setWeight] = useState(saved ? String(saved.testWeight) : "");
  const [unit, setUnit] = useState<WeightUnit>(saved?.unit ?? "g");
  const [tolerance, setTolerance] = useState(String(savedTolerance));

  const next: SpecInput = isScale ? { testWeight: toNumber(weight), weightUnit: unit, tolerance: toNumber(tolerance) } : { tolerance: toNumber(tolerance) };
  const dirty = isScale
    ? toNumber(weight) !== saved!.testWeight || unit !== saved!.unit || toNumber(tolerance) !== saved!.tolerance
    : toNumber(tolerance) !== savedTolerance;
  const problem = specProblem(item.section, next);
  const preview = problem ? null : marginText({ section: item.section, ...(next as { testWeight?: number; weightUnit?: string; tolerance?: number }) });

  return (
    <div className="basis-full flex flex-wrap items-end gap-2 pl-8" data-limits={item.id}>
      {isScale && (
        <>
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 mb-0.5">Test weight</span>
            <input type="number" inputMode="decimal" min="0" step="any" aria-label={`Test weight of ${item.name}`} disabled={busy} className="input text-sm w-24 font-mono" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 mb-0.5">Unit</span>
            <select aria-label={`Unit of ${item.name}`} disabled={busy} className="input text-sm" value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)}>
              {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </>
      )}
      <label className="block">
        <span className="block text-[11px] font-medium text-gray-500 mb-0.5">{isScale ? `Tolerance ± (${unit})` : `Tolerance ± (°F, up to ${MAX_THERMOMETER_TOLERANCE_F})`}</span>
        <input type="number" inputMode="decimal" min="0" step="any" aria-label={`Tolerance of ${item.name}`} disabled={busy} className="input text-sm w-24 font-mono" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
      </label>
      {dirty && (
        <button type="button" disabled={busy || !!problem} onClick={() => onSave(next)} className="btn-primary text-xs disabled:opacity-50">Save limits</button>
      )}
      <p className={`basis-full text-[11px] ${dirty && problem ? "text-red-700 font-medium" : "text-gray-500"}`}>
        {dirty && problem ? problem : preview}
        {dirty && !problem ? " — not saved yet" : ""}
      </p>
    </div>
  );
}

/** Edit the equipment list. Every change is saved at once and applies to all future forms. */
export function EquipmentEditor624(p: EquipmentEditor624Props) {
  const equipment = sortEquipment(p.equipment);
  const [draft, setDraft] = useState<{ section: Section; name: string; location: string }>({ section: "portable_thermometer", name: "", location: "" });

  return (
    <div className="card p-4 space-y-4 border-indigo-200 bg-indigo-50/40" data-equipment-editor>
      <div>
        <p className="text-sm font-semibold text-gray-900">Edit equipment</p>
        <p className="text-xs text-gray-500">Changes are saved immediately and stay for all future forms. Retired items stay in old records.</p>
        <p className="text-xs text-gray-500">Each scale has its own test weight, unit and tolerance; each thermometer its own tolerance. The 32.0 °F ice water target is fixed.</p>
      </div>
      {p.error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{p.error}</p>}

      {SECTIONS.map((section) => {
        const items = equipment.filter((e) => e.section === section);
        return (
          <div key={section} className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{SECTION_TITLES[section].en}</p>
            {items.map((e, i) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 bg-white rounded-lg border border-gray-200 px-2 py-1.5">
                <span className="text-xs font-mono text-gray-400 w-6">#{i + 1}</span>
                <input
                  aria-label={`Name of ${e.name}`} defaultValue={e.name} disabled={p.busy} className="input text-sm flex-1 min-w-[140px]"
                  onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.name) p.onRename(e.id, v); else ev.target.value = e.name; }}
                />
                {section === "scale" && (
                  <input
                    aria-label={`Location of ${e.name}`} defaultValue={e.location} disabled={p.busy} placeholder="Location" className="input text-sm w-32"
                    onBlur={(ev) => { const v = ev.target.value.trim(); if (v !== e.location) p.onLocation(e.id, v); }}
                  />
                )}
                <label className="inline-flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={e.inUse} disabled={p.busy} onChange={(ev) => p.onInUse(e.id, ev.target.checked)} /> In use
                </label>
                <button type="button" aria-label={`Move ${e.name} up`} disabled={p.busy || i === 0} onClick={() => p.onMove(e.id, "up")} className="w-8 h-8 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 disabled:opacity-30">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button type="button" aria-label={`Move ${e.name} down`} disabled={p.busy || i === items.length - 1} onClick={() => p.onMove(e.id, "down")} className="w-8 h-8 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 disabled:opacity-30">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button type="button" disabled={p.busy} onClick={() => p.onRetire(e.id)} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40">
                  Retire
                </button>
                <ItemLimits624
                  key={`${e.id}:${e.testWeight ?? ""}:${e.weightUnit ?? ""}:${e.tolerance ?? ""}`}
                  item={e} busy={p.busy} onSave={(limits) => p.onLimits(e.id, limits)}
                />
              </div>
            ))}
          </div>
        );
      })}

      <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-indigo-100">
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Section</span>
          <select className="input text-sm" value={draft.section} onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value as Section }))}>
            {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_TITLES[s].en}</option>)}
          </select>
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Name</span>
          <input className="input text-sm w-full" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </label>
        {draft.section === "scale" && (
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 mb-1">Location</span>
            <input className="input text-sm w-36" value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
          </label>
        )}
        <button
          type="button" disabled={p.busy || !draft.name.trim()} className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50"
          onClick={() => { p.onAdd(draft.section, draft.name.trim(), draft.location.trim()); setDraft((d) => ({ ...d, name: "", location: "" })); }}
        >
          <Plus className="w-4 h-4" /> Add item
        </button>
        <p className="basis-full text-[11px] text-gray-500">
          A new item starts with: {marginText({ section: draft.section, ...defaultSpec(draft.section) })}. Change it above after adding.
        </p>
      </div>
    </div>
  );
}
