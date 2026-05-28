"use client";
import { useEffect, useRef, useState } from "react";

// Drop-in replacement for <input type="date">.
// Stores/emits YYYY-MM-DD but always displays MM/DD/YYYY to the user,
// regardless of the browser's OS locale.
export function DateInput({
  value,
  onChange,
  className,
  required,
  placeholder = "MM/DD/YYYY",
}: {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
}) {
  function isoToDisplay(iso: string): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
  }

  const [text, setText] = useState(() => isoToDisplay(value));
  const externalValue = useRef(value);

  useEffect(() => {
    if (value !== externalValue.current) {
      externalValue.current = value;
      setText(isoToDisplay(value));
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 8);

    let formatted = digitsOnly;
    if (digitsOnly.length > 4) {
      formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4)}`;
    } else if (digitsOnly.length > 2) {
      formatted = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
    }

    setText(formatted);

    if (digitsOnly.length === 8) {
      const iso = `${digitsOnly.slice(4)}-${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2, 4)}`;
      externalValue.current = iso;
      onChange(iso);
    } else if (digitsOnly.length === 0) {
      externalValue.current = "";
      onChange("");
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={handleChange}
      placeholder={placeholder}
      maxLength={10}
      className={className}
      required={required}
    />
  );
}
