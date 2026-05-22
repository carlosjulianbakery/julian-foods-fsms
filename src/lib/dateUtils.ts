// Formats any date value for display as MM/DD/YYYY
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  // For YYYY-MM-DD strings (from DB date fields), append T00:00:00 to avoid UTC offset shift
  const d =
    typeof date === "string"
      ? new Date(date.includes("T") ? date : date + "T00:00:00")
      : date;
  if (isNaN(d.getTime())) return "—";
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y   = d.getFullYear();
  return `${m}/${day}/${y}`;
}

// Formats a Date or ISO string for use as value in <input type="date"> (YYYY-MM-DD)
export function toInputDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d =
    typeof date === "string"
      ? new Date(date.includes("T") ? date : date + "T00:00:00")
      : date;
  if (isNaN(d.getTime())) return "";
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
