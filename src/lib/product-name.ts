/** Same expression as normalizeName in the production-schedule route (kept identical by a test). */
export function normalizeProductName(s: string): string {
  return s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Task labels are written by the calendar generator as the sheet's product name, an optional " #<n>"
 * for a repeated run, and an optional " (<count> <unit>…)" quantity — e.g. "Bread #2 (1 Bowl)".
 */
export function productNameFromTaskLabel(label: string): string {
  return label.replace(/\s*\(\d[^()]*\)\s*$/, "").replace(/\s+#\d+$/, "");
}
