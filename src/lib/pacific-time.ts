// Pure Intl-based Pacific time helpers (no date-fns-tz needed).

/** Returns "YYYY-MM-DD" for today in America/Los_Angeles. */
export function getPacificToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** Returns "YYYY-MM-DD" for the given UTC Date in Pacific time. */
export function toPacificDateStr(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Returns a Date representing the end-of-day (23:59:59.999) in Pacific time
 * for the given "YYYY-MM-DD" date string.
 */
export function getEndOfDayPacific(dateStr: string): Date {
  // Probe at 20:00 UTC to find offset (noon Pacific is always 12:00 or 13:00 PT).
  const probe = new Date(`${dateStr}T20:00:00Z`);
  const ptHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(probe)
      .find((p) => p.type === "hour")!.value,
    10
  );
  // ptHour is 12 for PST (UTC-8) or 13 for PDT (UTC-7)
  const utcOffsetHours = 20 - ptHour; // 8 or 7

  // 23:59:59.999 Pacific = midnight UTC of dateStr + (23 + utcOffsetHours) hours + 59m 59.999s
  const result = new Date(`${dateStr}T00:00:00Z`);
  result.setUTCHours(23 + utcOffsetHours);
  result.setUTCMinutes(59);
  result.setUTCSeconds(59);
  result.setUTCMilliseconds(999);
  return result;
}

/** Add N days to a "YYYY-MM-DD" string, returning a new "YYYY-MM-DD" string. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add N months to a "YYYY-MM-DD" string, returning a new "YYYY-MM-DD" string. */
export function addMonthsToDateStr(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Add N weeks to a "YYYY-MM-DD" string. */
export function addWeeksToDateStr(dateStr: string, weeks: number): string {
  return addDaysToDateStr(dateStr, weeks * 7);
}

/** Compare two "YYYY-MM-DD" strings. */
export function compareDateStrs(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
