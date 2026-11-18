"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toUpperCaseInput } from "@/lib/formatters";
import type { RowCondition, RowSnapshot } from "./types";

const CORRECTIVE_CHIPS = [
  "Cleaned & sanitized",
  "Adjusted temperature",
  "Repaired equipment",
  "Discarded product",
  "Notified supervisor",
  "Re-tested after correction",
];

interface Props {
  rowKey: string;
  label: string;
  condition: RowCondition;
  initials: string;
  correctiveAction: string;
  reInspected: boolean;
  reInspectedAt: string | null;
  // numeric temp (optional — only for temp rows)
  tempValue?: number | null;
  tempLimit?: number | null;
  reInspectTempValue?: number | null;
  // ATP RLU (optional — only for ATP row)
  atpRlu?: number | null;
  atpLimit?: number | null;
  readOnly?: boolean;
  // Per-row initials input/display — false by default; forms must opt in explicitly.
  showRowInitials?: boolean;
  onChange?: (patch: Partial<Omit<RowSnapshot, "key" | "label">>) => void;
}

export function OkNotOkRow({
  rowKey, label, condition, initials, correctiveAction, reInspected, reInspectedAt,
  tempValue, tempLimit, reInspectTempValue, atpRlu, atpLimit,
  readOnly, showRowInitials = false, onChange,
}: Props) {
  const [expanded, setExpanded] = useState(condition === "NOT_OK");
  const isTemp = tempLimit != null;
  const isAtp  = atpLimit != null;

  function set(patch: Partial<Omit<RowSnapshot, "key" | "label">>) {
    onChange?.(patch);
  }

  function handleCondition(c: RowCondition) {
    const patch: Partial<Omit<RowSnapshot, "key" | "label">> = { condition: c };
    if (c === "NOT_OK") setExpanded(true);
    set(patch);
  }

  function handleTempInput(val: string) {
    const n = val === "" ? null : parseFloat(val);
    if (tempLimit == null) return;
    const autoCondition: RowCondition = n == null ? "OK" : (n <= tempLimit ? "OK" : "NOT_OK");
    if (autoCondition === "NOT_OK") setExpanded(true);
    set({ tempValue: n, condition: autoCondition });
  }

  function handleAtpInput(val: string) {
    const n = val === "" ? null : parseFloat(val);
    if (atpLimit == null) return;
    const autoCondition: RowCondition = n == null ? "OK" : (n <= atpLimit ? "OK" : "NOT_OK");
    if (autoCondition === "NOT_OK") setExpanded(true);
    set({ atpRlu: n, condition: autoCondition });
  }

  const conditionColor =
    condition === "OK"     ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    condition === "NOT_OK" ? "text-red-700 bg-red-50 border-red-200" :
                             "text-gray-500 bg-gray-50 border-gray-200";

  return (
    <div className={cn("rounded-lg border transition-colors", conditionColor)}>
      <div className="flex items-center gap-2 p-3">
        {/* Label */}
        <span className="flex-1 text-sm font-medium">{label}</span>

        {/* Numeric temp input */}
        {isTemp && !readOnly && (
          <input
            type="number"
            step="0.1"
            value={tempValue ?? ""}
            onChange={(e) => handleTempInput(e.target.value)}
            placeholder="°F"
            className="w-20 input text-sm font-mono text-center"
          />
        )}
        {isTemp && readOnly && (
          <span className="font-mono text-sm">{tempValue != null ? `${tempValue}°F` : "—"}</span>
        )}

        {/* ATP RLU input */}
        {isAtp && !readOnly && (
          <input
            type="number"
            step="1"
            min={0}
            value={atpRlu ?? ""}
            onChange={(e) => handleAtpInput(e.target.value)}
            placeholder="RLU"
            className="w-20 input text-sm font-mono text-center"
          />
        )}
        {isAtp && readOnly && (
          <span className="font-mono text-sm">{atpRlu != null ? `${atpRlu} RLU` : "—"}</span>
        )}

        {/* OK / Not OK toggle (hidden for auto-flip rows in edit mode) */}
        {!readOnly && !isTemp && !isAtp && (
          <div className="flex gap-1">
            {(["OK", "NOT_OK"] as RowCondition[]).map((c) => (
              <button
                key={c}
                onClick={() => handleCondition(c)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-semibold border transition-colors",
                  condition === c
                    ? c === "OK"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-red-600 text-white border-red-600"
                    : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                )}
              >
                {c === "OK" ? "OK" : "Not OK"}
              </button>
            ))}
          </div>
        )}

        {/* Read-only badge */}
        {readOnly && (
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded",
            condition === "OK"     ? "bg-emerald-100 text-emerald-700" :
            condition === "NOT_OK" ? "bg-red-100 text-red-700" :
                                     "bg-gray-100 text-gray-500"
          )}>
            {condition === "NOT_OK" ? "Not OK" : condition}
          </span>
        )}

        {/* Per-row initials — hidden by default; opt in with showRowInitials={true} */}
        {showRowInitials && !readOnly && (
          <input
            type="text"
            value={initials}
            onChange={(e) => set({ initials: toUpperCaseInput(e.target.value) })}
            maxLength={6}
            placeholder="Init"
            className="w-14 input text-sm font-mono text-center uppercase"
          />
        )}
        {showRowInitials && readOnly && (
          <span className="font-mono text-xs text-gray-500 w-10 text-center">{initials || "—"}</span>
        )}

        {/* Expand toggle */}
        {condition === "NOT_OK" && (
          <button onClick={() => setExpanded((x) => !x)} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded corrective action panel */}
      {condition === "NOT_OK" && expanded && (
        <div className="border-t border-red-200 p-3 space-y-3">
          {!readOnly && (
            <div className="flex flex-wrap gap-1">
              {CORRECTIVE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => set({ correctiveAction: correctiveAction ? `${correctiveAction}; ${chip}` : chip })}
                  className="px-2 py-1 text-xs rounded-full border border-red-200 bg-white text-red-700 hover:bg-red-50 transition-colors"
                >
                  + {chip}
                </button>
              ))}
            </div>
          )}

          {!readOnly ? (
            <textarea
              value={correctiveAction}
              onChange={(e) => set({ correctiveAction: e.target.value })}
              placeholder="Describe corrective action taken…"
              rows={2}
              className="input w-full text-sm"
            />
          ) : (
            <p className="text-sm text-red-800">{correctiveAction || "—"}</p>
          )}

          {/* Re-inspection checkbox */}
          <div className="flex items-center gap-2">
            {!readOnly ? (
              <>
                <input
                  id={`reinsp-${rowKey}`}
                  type="checkbox"
                  checked={reInspected}
                  onChange={(e) => set({
                    reInspected: e.target.checked,
                    reInspectedAt: e.target.checked ? new Date().toISOString() : null,
                  })}
                  className="rounded border-gray-300"
                />
                <label htmlFor={`reinsp-${rowKey}`} className="text-sm text-gray-700">
                  Re-inspected and confirmed corrected
                </label>
              </>
            ) : (
              <span className={cn("text-xs font-semibold", reInspected ? "text-emerald-700" : "text-amber-700")}>
                {reInspected ? `✓ Re-inspected${reInspectedAt ? ` at ${new Date(reInspectedAt).toLocaleTimeString()}` : ""}` : "⚠ Re-inspection pending"}
              </span>
            )}
          </div>

          {/* Re-inspection temperature (temp rows only) */}
          {isTemp && reInspected && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Re-inspection temp:</label>
              {!readOnly ? (
                <input
                  type="number"
                  step="0.1"
                  value={reInspectTempValue ?? ""}
                  onChange={(e) => set({ reInspectTempValue: e.target.value === "" ? null : parseFloat(e.target.value) })}
                  placeholder="°F"
                  className="w-20 input text-sm font-mono"
                />
              ) : (
                <span className="font-mono text-sm">{reInspectTempValue != null ? `${reInspectTempValue}°F` : "—"}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
