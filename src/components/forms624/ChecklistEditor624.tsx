"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { groupsOf, itemProblem, type ChecklistItem } from "@/lib/facilities-checklist-624";

export interface ChecklistEditor624Props {
  items: ChecklistItem[];
  busy?: boolean;
  error?: string;
  onAdd: (item: { name: string; description: string; groupName: string }) => void;
  onRename: (id: string, name: string) => void;
  onDescription: (id: string, description: string) => void;
  /** Moves the check to the end of that group; a name that is not an existing group starts a new one. */
  onGroup: (id: string, groupName: string) => void;
  onRetire: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}

const GROUP_LIST_ID = "facilities-checklist-groups";

/** Edit the checklist. Every change is saved at once and applies to all future forms. */
export function ChecklistEditor624(p: ChecklistEditor624Props) {
  const groups = groupsOf(p.items);
  const [draft, setDraft] = useState({ name: "", description: "", groupName: groups[0]?.name ?? "" });
  const draftProblem = draft.name.trim() || draft.groupName.trim() ? itemProblem(draft) : null;

  return (
    <div className="card p-4 space-y-4 border-indigo-200 bg-indigo-50/40" data-checklist-editor>
      <div>
        <p className="text-sm font-semibold text-gray-900">Edit checklist</p>
        <p className="text-xs text-gray-500">Changes are saved immediately and stay for all future forms. Retired items stay in old records.</p>
        <p className="text-xs text-gray-500">To move a check to another group, change its group: pick an existing one or type a new group name.</p>
      </div>
      {p.error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{p.error}</p>}

      <datalist id={GROUP_LIST_ID}>{groups.map((g) => <option key={g.name} value={g.name} />)}</datalist>

      {groups.map((group) => (
        <div key={group.name} className="space-y-1.5" data-editor-group={group.name}>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{group.name}</p>
          {group.items.map((item, i) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 bg-white rounded-lg border border-gray-200 px-2 py-1.5" data-editor-item={item.id}>
              <input
                aria-label={`Name of ${item.name}`} defaultValue={item.name} disabled={p.busy} className="input text-sm flex-1 min-w-[160px]"
                onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== item.name) p.onRename(item.id, v); else ev.target.value = item.name; }}
              />
              <input
                aria-label={`Group of ${item.name}`} defaultValue={item.groupName} list={GROUP_LIST_ID} disabled={p.busy} className="input text-sm w-36"
                onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== item.groupName) p.onGroup(item.id, v); else ev.target.value = item.groupName; }}
              />
              <button type="button" aria-label={`Move ${item.name} up`} disabled={p.busy || i === 0} onClick={() => p.onMove(item.id, "up")} className="w-8 h-8 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 disabled:opacity-30">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button type="button" aria-label={`Move ${item.name} down`} disabled={p.busy || i === group.items.length - 1} onClick={() => p.onMove(item.id, "down")} className="w-8 h-8 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 disabled:opacity-30">
                <ChevronDown className="w-4 h-4" />
              </button>
              <button type="button" disabled={p.busy} onClick={() => p.onRetire(item.id)} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40">
                Retire
              </button>
              <textarea
                aria-label={`Description of ${item.name}`} defaultValue={item.description} disabled={p.busy} rows={2} placeholder="What to inspect" className="input text-sm basis-full"
                onBlur={(ev) => { const v = ev.target.value.trim(); if (v !== item.description) p.onDescription(item.id, v); }}
              />
            </div>
          ))}
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-indigo-100" data-editor-add>
        <label className="block flex-1 min-w-[160px]">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">New check: name</span>
          <input className="input text-sm w-full" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Group (pick one or type a new name)</span>
          <input className="input text-sm w-44" list={GROUP_LIST_ID} value={draft.groupName} onChange={(e) => setDraft((d) => ({ ...d, groupName: e.target.value }))} />
        </label>
        <label className="block basis-full">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Description: what to inspect</span>
          <textarea rows={2} className="input text-sm w-full" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
        </label>
        {draftProblem && <p className="basis-full text-[11px] text-red-700">{draftProblem}</p>}
        <button
          type="button" disabled={p.busy || !draft.name.trim() || !!itemProblem(draft)} className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50"
          onClick={() => { p.onAdd({ name: draft.name.trim(), description: draft.description.trim(), groupName: draft.groupName.trim() }); setDraft((d) => ({ ...d, name: "", description: "" })); }}
        >
          <Plus className="w-4 h-4" /> Add check
        </button>
      </div>
    </div>
  );
}
