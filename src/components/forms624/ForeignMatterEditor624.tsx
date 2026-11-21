"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { SECTIONS, SECTION_TITLES, areasOf, itemProblem, type Area, type FmItem, type Section } from "@/lib/foreign-matter-624";

export interface ForeignMatterEditor624Props {
  items: FmItem[];
  busy?: boolean;
  error?: string;
  onAdd: (item: { section: Section; areaName: string; name: string; expectedQuantity: number }) => void;
  onRename: (id: string, name: string) => void;
  onQuantity: (id: string, expectedQuantity: number) => void;
  /** Moves the item to the end of that area; a name that is not an existing area starts a new one. */
  onArea: (id: string, areaName: string) => void;
  /** Moves the item to the other section, keeping its area name (placed at the end of that area there). */
  onSection: (id: string, section: Section) => void;
  onRetire: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onRenameArea: (area: Area<FmItem>, name: string) => void;
  onRetireArea: (area: Area<FmItem>) => void;
}

const listId = (section: Section) => `foreign-matter-areas-${section}`;
const toQuantity = (text: string) => (text.trim() === "" ? NaN : Number(text));

/** Edit the list. Every change is saved at once and applies to all future forms. */
export function ForeignMatterEditor624(p: ForeignMatterEditor624Props) {
  const areas = areasOf(p.items);
  const [draft, setDraft] = useState<{ section: Section; areaName: string; name: string; quantity: string }>({
    section: "glass_brittle", areaName: areas.find((a) => a.section === "glass_brittle")?.name ?? "", name: "", quantity: "1",
  });
  const draftInput = { section: draft.section, areaName: draft.areaName, name: draft.name, expectedQuantity: toQuantity(draft.quantity) };
  const draftProblem = draft.name.trim() ? itemProblem(draftInput) : null;

  return (
    <div className="card p-4 space-y-4 border-indigo-200 bg-indigo-50/40" data-list-editor>
      <div>
        <p className="text-sm font-semibold text-gray-900">Edit list</p>
        <p className="text-xs text-gray-500">Changes are saved immediately and stay for all future forms. Retired items stay in old records.</p>
        <p className="text-xs text-gray-500">To move an item to another area, change its area: pick an existing one or type a new area name. Items are numbered automatically.</p>
      </div>
      {p.error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{p.error}</p>}

      {SECTIONS.map((section) => (
        <datalist key={section} id={listId(section)}>
          {areas.filter((a) => a.section === section).map((a) => <option key={a.name} value={a.name} />)}
        </datalist>
      ))}

      {SECTIONS.map((section) => (
        <div key={section} className="space-y-3" data-editor-section={section}>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">{SECTION_TITLES[section]}</p>
          {areas.filter((a) => a.section === section).map((area) => (
            <div key={area.name} className="space-y-1.5 pl-2 border-l-2 border-indigo-200" data-editor-area={area.name}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Name of area ${area.name}`} defaultValue={area.name} disabled={p.busy} className="input text-sm font-semibold flex-1 min-w-[160px]"
                  onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== area.name) p.onRenameArea(area, v); else ev.target.value = area.name; }}
                />
                <span className="text-[11px] text-gray-500">{area.items.length} {area.items.length === 1 ? "item" : "items"}</span>
                <button type="button" disabled={p.busy} onClick={() => p.onRetireArea(area)} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40">
                  Retire area
                </button>
              </div>
              {area.items.map((item, i) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 bg-white rounded-lg border border-gray-200 px-2 py-1.5" data-editor-item={item.id}>
                  <input
                    aria-label={`Name of ${item.name}`} defaultValue={item.name} disabled={p.busy} className="input text-sm flex-1 min-w-[140px]"
                    onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== item.name) p.onRename(item.id, v); else ev.target.value = item.name; }}
                  />
                  <label className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                    Expected
                    <input
                      type="number" min={0} step={1} aria-label={`Expected quantity of ${item.name}`} defaultValue={item.expectedQuantity} disabled={p.busy} className="input text-sm font-mono w-20"
                      onBlur={(ev) => {
                        const n = toQuantity(ev.target.value);
                        if (n !== item.expectedQuantity && !itemProblem({ expectedQuantity: n })) p.onQuantity(item.id, n);
                        else ev.target.value = String(item.expectedQuantity);
                      }}
                    />
                  </label>
                  <input
                    aria-label={`Area of ${item.name}`} defaultValue={item.areaName} list={listId(section)} disabled={p.busy} className="input text-sm w-40"
                    onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== item.areaName) p.onArea(item.id, v); else ev.target.value = item.areaName; }}
                  />
                  <select aria-label={`Section of ${item.name}`} value={item.section} disabled={p.busy} className="input text-xs w-36" onChange={(ev) => p.onSection(item.id, ev.target.value as Section)}>
                    {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_TITLES[s]}</option>)}
                  </select>
                  <button type="button" aria-label={`Move ${item.name} up`} disabled={p.busy || i === 0} onClick={() => p.onMove(item.id, "up")} className="w-8 h-8 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 disabled:opacity-30">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" aria-label={`Move ${item.name} down`} disabled={p.busy || i === area.items.length - 1} onClick={() => p.onMove(item.id, "down")} className="w-8 h-8 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 disabled:opacity-30">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button type="button" disabled={p.busy} onClick={() => p.onRetire(item.id)} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40">
                    Retire
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-indigo-100" data-editor-add>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Section</span>
          <select className="input text-sm" value={draft.section} onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value as Section }))}>
            {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_TITLES[s]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Area (pick one or type a new name)</span>
          <input className="input text-sm w-48" list={listId(draft.section)} value={draft.areaName} onChange={(e) => setDraft((d) => ({ ...d, areaName: e.target.value }))} />
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">New item: name</span>
          <input className="input text-sm w-full" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Expected quantity</span>
          <input type="number" min={0} step={1} className="input text-sm font-mono w-24" value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} />
        </label>
        {draftProblem && <p className="basis-full text-[11px] text-red-700">{draftProblem}</p>}
        <button
          type="button" disabled={p.busy || !draft.name.trim() || !!itemProblem(draftInput)} className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50"
          onClick={() => { p.onAdd({ section: draft.section, areaName: draft.areaName.trim(), name: draft.name.trim(), expectedQuantity: toQuantity(draft.quantity) }); setDraft((d) => ({ ...d, name: "", quantity: "1" })); }}
        >
          <Plus className="w-4 h-4" /> Add item
        </button>
      </div>
    </div>
  );
}
