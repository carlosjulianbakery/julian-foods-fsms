"use client";

import { DateInput } from "@/components/DateInput";

interface Props {
  date: string;
  time: string;
  initials: string;
  readOnly?: boolean;
  onDateChange?: (v: string) => void;
  onTimeChange?: (v: string) => void;
  onInitialsChange?: (v: string) => void;
}

export function FormHeader624({
  date, time, initials, readOnly,
  onDateChange, onTimeChange, onInitialsChange,
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
        <label className="block text-xs font-medium text-gray-500 mb-1">Initials</label>
        {readOnly ? (
          <p className="text-sm font-mono uppercase">{initials || "—"}</p>
        ) : (
          <input
            type="text"
            value={initials}
            onChange={(e) => onInitialsChange?.(e.target.value.toUpperCase().slice(0, 4))}
            maxLength={4}
            placeholder="HGA"
            className="input w-full text-sm font-mono uppercase"
          />
        )}
      </div>
    </div>
  );
}
