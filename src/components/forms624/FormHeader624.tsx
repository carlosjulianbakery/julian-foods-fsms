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
}

// Shared header for 624-facility forms: date, time, and a single
// "Conducted by (initials)" field that pre-fills all rows.
export function FormHeader624({
  date, time, conductedBy, readOnly,
  onDateChange, onTimeChange, onConductedByChange,
}: Props) {
  return (
    <div className="card p-4 grid grid-cols-2 gap-4 md:grid-cols-3">
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
          Conducted by <span className="text-gray-400">(initials)</span>
        </label>
        {readOnly ? (
          <p className="text-sm font-mono uppercase">{conductedBy || "—"}</p>
        ) : (
          <input
            type="text"
            value={conductedBy}
            onChange={(e) => onConductedByChange?.(toUpperCaseInput(e.target.value))}
            maxLength={6}
            placeholder="HGA"
            className="input w-full text-sm font-mono uppercase"
          />
        )}
      </div>
    </div>
  );
}
