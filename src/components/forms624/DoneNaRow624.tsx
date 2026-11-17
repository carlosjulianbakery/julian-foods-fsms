"use client";

import { cn } from "@/lib/utils";
import type { RowState } from "./types";

export const NOT_DONE_CHIPS = [
  "Not used today",
  "Equipment down",
  "Will clean tomorrow",
  "Other",
];

interface Props {
  rowKey: string;
  labelEn: string;
  labelEs: string;
  chemical: string | null;
  state: RowState;
  reason: string;
  readOnly?: boolean;
  onChange?: (state: RowState, reason: string) => void;
}

export function DoneNaRow624({
  rowKey, labelEn, labelEs, chemical,
  state, reason, readOnly, onChange,
}: Props) {
  void rowKey;
  const isNotDone = state === "NOT_DONE";

  const bg =
    state === "DONE"      ? "bg-emerald-50 border-emerald-200" :
    state === "NA"        ? "bg-gray-50 border-gray-200" :
    state === "NOT_DONE"  ? "bg-red-50 border-red-200" :
                            "bg-white border-gray-200";

  function handleState(s: Exclude<RowState, "UNTOUCHED">) {
    if (readOnly) return;
    const next: RowState = state === s ? "UNTOUCHED" : s;
    onChange?.(next, next === "NOT_DONE" ? reason : "");
  }

  function handleChip(chip: string) {
    if (readOnly || !isNotDone) return;
    const next = reason === chip ? "" : chip;
    onChange?.(state, next);
  }

  function handleFreeText(val: string) {
    onChange?.(state, val);
  }

  return (
    <div className={cn("rounded-lg border transition-colors", bg)}>
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{labelEn}</p>
          <p className="text-xs text-gray-500 leading-snug">{labelEs}</p>
          {chemical && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium leading-none">
              {chemical}
            </span>
          )}
        </div>

        {!readOnly ? (
          <div className="flex gap-1 shrink-0">
            {(["DONE", "NA", "NOT_DONE"] as const).map((s) => {
              const labels: Record<string, string> = { DONE: "Done", NA: "N/A", NOT_DONE: "Not done" };
              const activeClass =
                s === "DONE"     ? "bg-emerald-600 text-white border-emerald-600" :
                s === "NA"       ? "bg-gray-500 text-white border-gray-500" :
                                   "bg-red-600 text-white border-red-600";
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleState(s)}
                  className={cn(
                    "px-2 py-1.5 rounded text-xs font-semibold border transition-colors min-h-[36px]",
                    state === s
                      ? activeClass
                      : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                  )}
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>
        ) : (
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded self-start",
            state === "DONE"     ? "bg-emerald-100 text-emerald-700" :
            state === "NA"       ? "bg-gray-100 text-gray-600" :
                                   "bg-red-100 text-red-700"
          )}>
            {state === "DONE" ? "Done" : state === "NA" ? "N/A" : "Not done"}
          </span>
        )}
      </div>

      {isNotDone && (
        <div className="border-t border-red-200 p-3 space-y-2">
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              {NOT_DONE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChip(chip)}
                  className={cn(
                    "px-2 py-1 text-xs rounded-full border transition-colors",
                    reason === chip
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-white text-red-700 border-red-200 hover:bg-red-50"
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          {(!readOnly || reason) && (
            readOnly ? (
              <p className="text-sm text-red-800">{reason || "—"}</p>
            ) : (
              <textarea
                value={reason}
                onChange={(e) => handleFreeText(e.target.value)}
                placeholder="Describe reason (required)…"
                rows={2}
                className="input w-full text-sm resize-none"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
