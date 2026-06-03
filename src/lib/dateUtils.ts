// Extracts the YYYY-MM-DD part from any date string, stripping time/timezone so
// new Date(... + "T00:00:00") always treats the date as local midnight.
function dateOnlyStr(date: string): string {
  return date.includes("T") ? date.split("T")[0] : date;
}

// Formats any date value for display as MM/DD/YYYY.
// Always interprets the date as local (not UTC) to avoid off-by-one-day shift.
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d =
    typeof date === "string"
      ? new Date(dateOnlyStr(date) + "T00:00:00")
      : new Date(date.toISOString().split("T")[0] + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y   = d.getFullYear();
  return `${m}/${day}/${y}`;
}

// Formats a Date or ISO string for use as value in <input type="date"> (YYYY-MM-DD).
// Same local-midnight approach to avoid off-by-one-day shift.
export function toInputDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d =
    typeof date === "string"
      ? new Date(dateOnlyStr(date) + "T00:00:00")
      : new Date(date.toISOString().split("T")[0] + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
