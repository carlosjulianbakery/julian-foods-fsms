"use client";

import type { ReactNode } from "react";
import { FormHeader624 } from "@/components/forms624/FormHeader624";
import { OkNotOkRow } from "@/components/forms624/OkNotOkRow";
import type { RowCondition } from "@/components/forms624/types";
import { groupsOf, resultOf, type ChecklistItem, type ItemValues, type Progress } from "@/lib/facilities-checklist-624";

export interface FacilitiesChecklistForm624Props {
  periodLabel: string;
  date: string;
  time: string;
  initials: string;
  items: ChecklistItem[];
  values: Record<string, ItemValues>;
  progress: Progress;
  /** Plain-language reasons the form cannot be submitted yet. */
  problems?: string[];
  readOnly?: boolean;
  saveText?: string;
  submitting?: boolean;
  onDateChange?: (v: string) => void;
  onTimeChange?: (v: string) => void;
  onInitialsChange?: (v: string) => void;
  onItemChange?: (itemId: string, patch: Partial<ItemValues>) => void;
  onSubmit?: () => void;
  /** Rendered above the groups, e.g. the checklist editor. */
  children?: ReactNode;
}

const checkedText = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }) + " PT";

export function FacilitiesChecklistForm624(p: FacilitiesChecklistForm624Props) {
  const groups = groupsOf(p.items);
  const pct = p.progress.total > 0 ? Math.round((p.progress.checked / p.progress.total) * 100) : 0;
  const problems = p.problems ?? [];

  return (
    <div className="space-y-5">
      <FormHeader624
        date={p.date} time={p.time} initials={p.initials} readOnly={p.readOnly}
        onDateChange={p.onDateChange} onTimeChange={p.onTimeChange} onInitialsChange={p.onInitialsChange}
      />

      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur card px-4 py-3">
        <div className="flex items-center justify-between mb-1.5 gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{p.periodLabel}</span>
          <span className={`text-xs font-mono font-bold ${p.progress.checked === p.progress.total && p.progress.total > 0 ? "text-emerald-600" : "text-gray-500"}`}>
            {p.progress.checked} of {p.progress.total} checked
          </span>
        </div>
        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${p.progress.notOk > 0 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {p.progress.ok} OK · {p.progress.notOk} Not OK
          {p.saveText ? <span className="float-right font-mono">{p.saveText}</span> : null}
        </p>
      </div>

      {p.children}

      {groups.length === 0 && <p className="text-sm text-gray-400 italic">The checklist has no items.</p>}
      {groups.map((group) => (
        <section key={group.name} className="space-y-3" data-group={group.name}>
          <h2 className="text-sm font-bold text-gray-800">{group.name}</h2>
          {group.items.map((item) => {
            const v = p.values[item.id];
            const result = resultOf(v);
            return (
              <div key={item.id} className="card p-3 space-y-2" data-item={item.id} data-result={result ?? "pending"}>
                <OkNotOkRow
                  rowKey={item.id}
                  label={item.name}
                  // No result yet: neither button is highlighted
                  condition={(result ?? "PENDING") as RowCondition}
                  initials=""
                  correctiveAction={v?.correctiveAction ?? ""}
                  reInspected={v?.reInspected === true}
                  reInspectedAt={v?.reInspectedAt ?? null}
                  readOnly={p.readOnly}
                  onChange={(patch) => p.onItemChange?.(item.id, {
                    ...(patch.condition === "OK" || patch.condition === "NOT_OK" ? { result: patch.condition } : {}),
                    ...(patch.correctiveAction !== undefined ? { correctiveAction: patch.correctiveAction } : {}),
                    ...(patch.reInspected !== undefined ? { reInspected: patch.reInspected, reInspectedAt: patch.reInspectedAt ?? null } : {}),
                  })}
                />
                {item.description && <p className="text-xs text-gray-500 px-1" data-description>{item.description}</p>}
                {result === "NOT_OK" && !p.readOnly && !v?.correctiveAction?.trim() && (
                  <p className="text-xs font-medium text-red-700 px-1">A corrective action is required for a Not OK.</p>
                )}
                <label className="block px-1">
                  <span className="block text-[11px] font-medium text-gray-500 mb-1">Note (optional)</span>
                  {p.readOnly ? (
                    <span className="block text-sm text-gray-700">{v?.note || "—"}</span>
                  ) : (
                    <input type="text" className="input w-full text-sm" value={v?.note ?? ""} onChange={(e) => p.onItemChange?.(item.id, { note: e.target.value })} aria-label={`Note for ${item.name}`} />
                  )}
                </label>
                {v?.checkedAt && <p className="text-[11px] text-gray-400 px-1">Checked {checkedText(v.checkedAt)}</p>}
              </div>
            );
          })}
        </section>
      ))}

      {!p.readOnly && (
        <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur card px-4 py-3 space-y-2">
          {problems.length > 0 && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="font-semibold mb-1">Before you can submit:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {problems.slice(0, 6).map((m) => <li key={m}>{m}</li>)}
                {problems.length > 6 && <li>…and {problems.length - 6} more.</li>}
              </ul>
            </div>
          )}
          <button type="button" onClick={p.onSubmit} disabled={problems.length > 0 || p.submitting} className="btn-primary w-full disabled:opacity-50">
            {p.submitting ? "Submitting…" : "Submit checklist"}
          </button>
        </div>
      )}
    </div>
  );
}
