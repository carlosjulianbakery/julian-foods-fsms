"use client";

import type { ReactNode } from "react";
import { FormHeader624 } from "@/components/forms624/FormHeader624";
import {
  INSTRUCTIONS, INSTRUCTIONS_VER_VERIFICATION, LABELS, SCALE_POINTS, SECTIONS, SECTION_TITLES,
  fixedResult, iceWaterResult, itemResult, positionOf, referenceOptions, scaleResult, sortEquipment, toTenths,
  type Equipment, type ItemValues, type Progress, type Result, type Section,
} from "@/lib/verification-624";

/** The five weight positions: four corners and the center. */
export function ScaleDiagram624({ className = "" }: { className?: string }) {
  const points: [number, number, string][] = [[60, 45, "1"], [18, 76, "2"], [102, 76, "3"], [18, 14, "4"], [102, 14, "5"]];
  return (
    <svg viewBox="0 0 120 90" role="img" aria-label="Scale platform with five weight points: center and four corners" className={className}>
      <rect x="4" y="4" width="112" height="82" rx="8" fill="#f9fafb" stroke="#9ca3af" strokeWidth="2" />
      {points.map(([cx, cy, n]) => (
        <g key={n}>
          <circle cx={cx} cy={cy} r="9" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.5" />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#3730a3">{n}</text>
        </g>
      ))}
    </svg>
  );
}

export function ResultBadge624({ result }: { result: Result | null }) {
  if (result === "OK") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">OK</span>;
  if (result === "NOT_OK") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Not OK</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Pending</span>;
}

/** Number input whose colour follows the automatic range check. */
export function NumberCheckInput624({
  label, value, decimals, result, readOnly, onChange,
}: {
  label: string; value: number | null | undefined; decimals: 1 | 2; result: Result | null; readOnly?: boolean; onChange?: (v: number | null) => void;
}) {
  const tone = result === "OK" ? "border-emerald-400 bg-emerald-50" : result === "NOT_OK" ? "border-red-400 bg-red-50" : "";
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 mb-1">{label}</span>
      {readOnly ? (
        <span className={`block text-sm font-mono px-2 py-1.5 rounded border ${tone || "border-gray-200"}`}>{value == null ? "—" : value.toFixed(decimals)}</span>
      ) : (
        <input
          type="number"
          inputMode="decimal"
          step={decimals === 1 ? "0.1" : "0.01"}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value === "" ? null : Number(e.target.value))}
          className={`input w-full text-sm font-mono ${tone}`}
        />
      )}
    </label>
  );
}

export interface Verification624FormProps {
  periodLabel: string;
  date: string;
  time: string;
  initials: string;
  equipment: Equipment[];
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
  onItemChange?: (equipmentId: string, patch: Partial<ItemValues>) => void;
  onSubmit?: () => void;
  /** Rendered above the sections, e.g. the equipment editor. */
  children?: ReactNode;
}

function Bilingual({ en, es }: { en: string; es: string }) {
  return <>{en} <span className="text-gray-400 font-normal">/ {es}</span></>;
}

export function Verification624Form(p: Verification624FormProps) {
  const equipment = sortEquipment(p.equipment);
  const references = referenceOptions(equipment, p.values);
  const pct = p.progress.total > 0 ? Math.round((p.progress.verified / p.progress.total) * 100) : 0;
  const problems = p.problems ?? [];

  return (
    <div className="space-y-5">
      <FormHeader624
        date={p.date} time={p.time} initials={p.initials} readOnly={p.readOnly}
        onDateChange={p.onDateChange} onTimeChange={p.onTimeChange} onInitialsChange={p.onInitialsChange}
      />

      <details className="card p-4" open={!p.readOnly}>
        <summary className="cursor-pointer text-sm font-semibold text-gray-800">
          Instructions <span className="text-xs font-normal text-gray-400">({INSTRUCTIONS_VER_VERIFICATION})</span>
        </summary>
        <div className="mt-3 space-y-3 text-sm text-gray-700">
          <div className="flex gap-3 items-start">
            <ScaleDiagram624 className="w-28 shrink-0" />
            <p><span className="font-semibold">Procedure for Scales:</span> {INSTRUCTIONS.scale}</p>
          </div>
          <p><span className="font-semibold">Procedure for Portable Thermometer:</span> {INSTRUCTIONS.portable_thermometer}</p>
          <p><span className="font-semibold">Procedure for Non-Movable Thermometer:</span> {INSTRUCTIONS.fixed_thermometer}</p>
        </div>
      </details>

      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur card px-4 py-3">
        <div className="flex items-center justify-between mb-1.5 gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{p.periodLabel}</span>
          <span className={`text-xs font-mono font-bold ${p.progress.verified === p.progress.total && p.progress.total > 0 ? "text-emerald-600" : "text-gray-500"}`}>
            {p.progress.verified} of {p.progress.total} verified
          </span>
        </div>
        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${p.progress.notOk > 0 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {p.progress.ok} OK · {p.progress.notOk} Not OK · {p.progress.notInUse} not in use
          {p.saveText ? <span className="float-right font-mono">{p.saveText}</span> : null}
        </p>
      </div>

      {p.children}

      {SECTIONS.map((section) => {
        const items = equipment.filter((e) => e.section === section);
        return (
          <section key={section} className="space-y-3" data-section={section}>
            <h2 className="text-sm font-bold text-gray-800">
              <Bilingual en={SECTION_TITLES[section].en} es={SECTION_TITLES[section].es} />
            </h2>
            {items.length === 0 && <p className="text-sm text-gray-400 italic">No equipment in this section.</p>}
            {items.map((e) => (
              <ItemCard
                key={e.id} item={e} position={positionOf(equipment, e.id)} section={section} v={p.values[e.id]}
                references={references} equipment={equipment} readOnly={p.readOnly}
                onChange={(patch) => p.onItemChange?.(e.id, patch)}
              />
            ))}
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
            {p.submitting ? "Submitting…" : "Submit verification"}
          </button>
        </div>
      )}
    </div>
  );
}

function ItemCard({
  item, position, section, v, references, equipment, readOnly, onChange,
}: {
  item: Equipment; position: number; section: Section; v: ItemValues | undefined; references: Equipment[]; equipment: Equipment[];
  readOnly?: boolean; onChange: (patch: Partial<ItemValues>) => void;
}) {
  const title = (
    <p className="text-sm font-semibold text-gray-900">
      <span className="text-gray-400 font-mono mr-1.5">#{position}</span>{item.name}
      {item.location && <span className="ml-2 text-xs font-normal text-gray-500">{item.location}</span>}
    </p>
  );

  if (!item.inUse) {
    return (
      <div className="card p-4 opacity-50 bg-gray-50" data-item={item.id} data-in-use="false">
        <div className="flex items-center justify-between gap-2">
          {title}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">Not in use</span>
        </div>
      </div>
    );
  }

  const result = itemResult(section, v);
  const scale = scaleResult(v?.points);
  const diffTenths = v?.target != null && v?.fixedReading != null ? Math.abs(toTenths(v.target) - toTenths(v.fixedReading)) : null;
  const referenceName = v?.referenceId ? equipment.find((x) => x.id === v.referenceId)?.name ?? (v as { referenceName?: string }).referenceName ?? "—" : "—";

  return (
    <div className="card p-4 space-y-3" data-item={item.id} data-in-use="true">
      <div className="flex items-center justify-between gap-2">
        {title}
        <ResultBadge624 result={result} />
      </div>

      {section === "portable_thermometer" && (
        <div className="grid grid-cols-2 gap-3">
          <NumberCheckInput624 label={`${LABELS.iceWater.en} / ${LABELS.iceWater.es}`} value={v?.reading} decimals={1} result={iceWaterResult(v?.reading)} readOnly={readOnly} onChange={(n) => onChange({ reading: n })} />
          {(result === "NOT_OK" || v?.recheck != null) && (
            <NumberCheckInput624 label="Re-check reading (°F), after the corrective action" value={v?.recheck} decimals={1} result={iceWaterResult(v?.recheck)} readOnly={readOnly} onChange={(n) => onChange({ recheck: n })} />
          )}
        </div>
      )}

      {section === "fixed_thermometer" && (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 mb-1">Reference thermometer used</span>
            {readOnly ? (
              <span className="block text-sm px-2 py-1.5 rounded border border-gray-200">{referenceName}</span>
            ) : (
              <select className="input w-full text-sm" value={v?.referenceId ?? ""} onChange={(e) => onChange({ referenceId: e.target.value || null })}>
                <option value="">{references.length === 0 ? "No portable thermometer has passed yet" : "Choose a portable thermometer that passed"}</option>
                {references.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <NumberCheckInput624 label="Target value (reference reading at that spot, °F)" value={v?.target} decimals={1} result={null} readOnly={readOnly} onChange={(n) => onChange({ target: n })} />
            <NumberCheckInput624 label="Non-movable thermometer reading (°F)" value={v?.fixedReading} decimals={1} result={fixedResult(v?.target, v?.fixedReading)} readOnly={readOnly} onChange={(n) => onChange({ fixedReading: n })} />
          </div>
          {diffTenths != null && <p className="text-xs text-gray-500">Difference: {(diffTenths / 10).toFixed(1)} °F (allowed ± 5.0 °F)</p>}
        </div>
      )}

      {section === "scale" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {SCALE_POINTS.map((name, i) => (
              <NumberCheckInput624
                key={name} label={`${i + 1}. ${name} (lb)`} value={v?.points?.[i]} decimals={2} result={scale.perPoint[i]} readOnly={readOnly}
                onChange={(n) => onChange({ points: SCALE_POINTS.map((_, j) => (j === i ? n : v?.points?.[j] ?? null)) })}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500">
            500 g weight · each point must read 1.00 to 1.20 lb ·{" "}
            {scale.perPoint.map((r, i) => `${i + 1}: ${r === "OK" ? "OK" : r === "NOT_OK" ? "Not OK" : "—"}`).join(" · ")}
          </p>
        </div>
      )}

      <label className="block">
        <span className="block text-[11px] font-medium text-gray-500 mb-1">
          Irregularities / notes <span className="text-gray-400">/ {LABELS.conditions.es}</span>
        </span>
        {readOnly ? (
          <span className="block text-sm text-gray-700">{v?.notes || "—"}</span>
        ) : (
          <input type="text" className="input w-full text-sm" value={v?.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Optional" />
        )}
      </label>

      {result === "NOT_OK" && (
        <label className="block">
          <span className="block text-[11px] font-semibold text-red-700 mb-1">
            Corrective action (required) <span className="font-normal text-red-400">/ {LABELS.corrective.es}</span>
          </span>
          {readOnly ? (
            <span className="block text-sm text-gray-800">{v?.correctiveAction || "—"}</span>
          ) : (
            <textarea rows={2} className="input w-full text-sm" value={v?.correctiveAction ?? ""} onChange={(e) => onChange({ correctiveAction: e.target.value })} placeholder="What was done about it?" />
          )}
        </label>
      )}

      {v?.checkedAt && (
        <p className="text-[11px] text-gray-400">
          Checked {new Date(v.checkedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" })} PT
        </p>
      )}
    </div>
  );
}
