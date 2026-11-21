"use client";

import type { ReactNode } from "react";
import { FormHeader624 } from "@/components/forms624/FormHeader624";
import {
  QUANTITY_CHANGED_HINT, SECTIONS, SECTION_TITLES, answerPatch, areasOf, positionOf, progressOf, quantityChangedSinceCheck, resultOf,
  type Area, type FmItem, type ItemValues, type Progress, type Result,
} from "@/lib/foreign-matter-624";

export interface ForeignMatterForm624Props {
  periodLabel: string;
  date: string;
  time: string;
  initials: string;
  items: FmItem[];
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
  /** "Mark all OK" for one area; the page asks for confirmation first. */
  onMarkAllOk?: (area: Area<FmItem>) => void;
  onSubmit?: () => void;
  /** Rendered above the sections, e.g. the list editor. */
  children?: ReactNode;
}

const checkedText = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }) + " PT";

function ResultButtons({ result, onPick }: { result: Result | null; onPick: (r: Result) => void }) {
  const cls = (r: Result) =>
    `px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
      result === r ? (r === "OK" ? "bg-emerald-600 text-white border-emerald-600" : "bg-red-600 text-white border-red-600") : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
    }`;
  return (
    <div className="flex gap-1 shrink-0">
      <button type="button" onClick={() => onPick("OK")} className={cls("OK")}>OK</button>
      <button type="button" onClick={() => onPick("NOT_OK")} className={cls("NOT_OK")}>Not OK</button>
    </div>
  );
}

function ResultBadge({ result }: { result: Result | null }) {
  if (result === "OK") return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">OK</span>;
  if (result === "NOT_OK") return <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700 shrink-0">Not OK</span>;
  return <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">Pending</span>;
}

export function ForeignMatterForm624(p: ForeignMatterForm624Props) {
  const areas = areasOf(p.items);
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

      {p.items.length === 0 && <p className="text-sm text-gray-400 italic">The list has no items.</p>}
      {SECTIONS.map((section) => {
        const sectionAreas = areas.filter((a) => a.section === section);
        if (sectionAreas.length === 0) return null;
        return (
          <section key={section} className="space-y-3" data-section={section}>
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{SECTION_TITLES[section]}</h2>
            {sectionAreas.map((area) => {
              const ap = progressOf(area.items, p.values);
              const open = ap.total - ap.checked;
              return (
                <details key={`${area.section}|${area.name}`} open className="card p-3" data-area={area.name}>
                  <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 flex-1 min-w-[140px]">{area.name}</span>
                    <span className={`text-xs font-mono ${open === 0 ? "text-emerald-600 font-bold" : "text-gray-500"}`} data-area-progress>{ap.checked} of {ap.total}</span>
                    {ap.notOk > 0 && <span className="text-xs font-semibold text-red-700">{ap.notOk} Not OK</span>}
                    {!p.readOnly && open > 0 && (
                      <button
                        type="button" data-mark-all-ok
                        onClick={(e) => { e.preventDefault(); p.onMarkAllOk?.(area); }}
                        className="text-xs font-medium px-2 py-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                      >
                        Mark all OK
                      </button>
                    )}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {area.items.map((item) => {
                      const v = p.values[item.id];
                      const result = resultOf(v);
                      const tone = result === "OK" ? "border-emerald-200 bg-emerald-50/40" : result === "NOT_OK" ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-gray-50/40";
                      return (
                        <div key={item.id} className={`rounded-lg border p-2.5 space-y-2 ${tone}`} data-item={item.id} data-result={result ?? "pending"}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-400 w-7 shrink-0">#{positionOf(p.items, item.id)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{item.name}</p>
                              <p className="text-xs text-gray-500" data-expected>Expected: <span className="font-mono font-semibold text-gray-700">{item.expectedQuantity}</span></p>
                              {!p.readOnly && quantityChangedSinceCheck(item, v) && (
                                <p className="text-[11px] font-medium text-amber-700" data-quantity-changed>{QUANTITY_CHANGED_HINT}</p>
                              )}
                            </div>
                            {p.readOnly ? <ResultBadge result={result} /> : <ResultButtons result={result} onPick={(r) => p.onItemChange?.(item.id, answerPatch(item, r))} />}
                          </div>

                          {result === "NOT_OK" && (
                            <label className="block">
                              <span className="block text-[11px] font-medium text-gray-500 mb-1">Quantity found (optional)</span>
                              {p.readOnly ? (
                                <span className="block text-sm font-mono text-gray-800">{v?.foundQuantity ?? "—"}</span>
                              ) : (
                                <input
                                  type="number" inputMode="numeric" min={0} step={1} className="input w-28 text-sm font-mono" aria-label={`Quantity found for ${item.name}`}
                                  value={v?.foundQuantity ?? ""}
                                  onChange={(e) => {
                                    const n = e.target.value === "" ? null : Number(e.target.value);
                                    p.onItemChange?.(item.id, { foundQuantity: n !== null && Number.isInteger(n) && n >= 0 ? n : null });
                                  }}
                                />
                              )}
                            </label>
                          )}

                          <label className="block">
                            <span className={`block text-[11px] font-medium mb-1 ${result === "NOT_OK" ? "text-red-700 font-semibold" : "text-gray-500"}`}>
                              {result === "NOT_OK" ? "Comment (required for a Not OK)" : "Comment (optional)"}
                            </span>
                            {p.readOnly ? (
                              <span className="block text-sm text-gray-700">{v?.comment || "—"}</span>
                            ) : (
                              <input type="text" className="input w-full text-sm" value={v?.comment ?? ""} aria-label={`Comment for ${item.name}`} onChange={(e) => p.onItemChange?.(item.id, { comment: e.target.value })} />
                            )}
                          </label>
                          {v?.checkedAt && <p className="text-[11px] text-gray-400">Checked {checkedText(v.checkedAt)}</p>}
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </section>
        );
      })}

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
            {p.submitting ? "Submitting…" : "Submit inspection"}
          </button>
        </div>
      )}
    </div>
  );
}
