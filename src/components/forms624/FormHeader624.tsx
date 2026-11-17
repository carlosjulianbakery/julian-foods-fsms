"use client";

import { DateInput } from "@/components/DateInput";
import { toUpperCaseInput } from "@/lib/formatters";

interface Props {
  date: string;
  time: string;
  conductedBy: string;
  readOnly?: boolean;
  onDateChange?: (v: string) => void;
  onTimeChange?: (v: string) => void;
  onConductedByChange?: (v: string) => void;
  // DC624 passes these to show a full-name field + a separate initials field.
  // Pre-Op 624 omits them and gets the original single "(initials)" field.
  conductedByLabel?: string;
  showInitialsField?: boolean;
  initials?: string;
  onInitialsChange?: (v: string) => void;
  conductedByReadOnly?: boolean;
}

export function FormHeader624({
  date, time, conductedBy, readOnly,
  onDateChange, onTimeChange, onConductedByChange,
  conductedByLabel = "Conducted by",
  showInitialsField = false,
  initials = "",
  onInitialsChange,
  conductedByReadOnly = false,
}: Props) {
  const cols = showInitialsField
    ? "grid-cols-2 gap-4 sm:grid-cols-4"
    : "grid-cols-2 gap-4 md:grid-cols-3";

  const cbReadOnly = readOnly || conductedByReadOnly;

  return (
    <div className={`card p-4 grid ${cols}`}>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
        {readOnly ? (
          <p className="text-sm font-mono">{date}</p>
        ) : (
          <DateInput value={date} onChange={onDateChange ?? (() => {})} />
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Time</label>
        {readOnly ? (
          <p className="text-sm font-mono">{time}</p>
        ) : (
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange?.(e.target.value)}
            className="input w-full text-sm font-mono"
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          {showInitialsField ? conductedByLabel : (
            <>{conductedByLabel} <span className="text-gray-400">(initials)</span></>
          )}
        </label>
        {cbReadOnly ? (
          <p className="text-sm">{conductedBy || "\u2014"}</p>
        ) : (
          <input
            type="text"
            value={conductedBy}
            onChange={(e) => onConductedByChange?.(
              showInitialsField ? e.target.value : toUpperCaseInput(e.target.value)
            )}
            maxLength={showInitialsField ? 80 : 6}
            placeholder={showInitialsField ? "Full name" : "HGA"}
            className={`input w-full text-sm${showInitialsField ? "" : " font-mono uppercase"}`}
          />
        )}
      </div>

      {showInitialsField && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Initials</label>
          {readOnly ? (
            <p className="text-sm font-mono uppercase">{initials || "\u2014"}</p>
          ) : (
            <input
              type="text"
              value={initials}
              onChange={(e) => onInitialsChange?.(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              placeholder="HGA"
              className="input w-full text-sm font-mono uppercase"
            />
          )}
        </div>
      )}
    </div>
  );
}
