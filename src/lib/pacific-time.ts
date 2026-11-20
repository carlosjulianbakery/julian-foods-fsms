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

/** Hour of day (0–23) in America/Los_Angeles. */
export function getPacificHour(date: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parseInt(hour, 10);
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

/** Returns "YYYY-MM" for the current month in America/Los_Angeles. */
export function getPacificMonthKey(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** Returns "YYYY-MM" for the given Date in America/Los_Angeles. */
export function toPacificMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** Returns the last calendar day of a month as "YYYY-MM-DD". */
export function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of current
  return d.toISOString().slice(0, 10);
}

/** Returns the last calendar day of a month derived from a date string "YYYY-MM-DD". */
export function lastDayOfMonthFromDate(dateStr: string): string {
  return lastDayOfMonth(dateStr.slice(0, 7));
}

/** Formats "YYYY-MM" to a human label like "November 2026". */
export function formatMonthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

// ── ISO weeks ─────────────────────────────────────────────────────────────────

export interface IsoWeek {
  /** "YYYY-Www", e.g. "2026-W48". The year is the ISO week-year, which near January 1st can differ from the calendar year. */
  key: string;
  /** Monday, "YYYY-MM-DD". */
  start: string;
  /** Sunday, "YYYY-MM-DD". */
  end: string;
  year: number;
  week: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Monday (as a UTC-noon timestamp) of the week a "YYYY-MM-DD" date falls in. Pure calendar arithmetic, no time zone involved. */
function mondayOf(dateStr: string): number {
  const t = new Date(`${dateStr}T12:00:00Z`).getTime();
  return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
}
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * The ISO week (Monday to Sunday) a calendar date falls in. Week 1 is the week with the year's first
 * Thursday, so a week belongs to the year its Thursday is in: Fri 2027-01-01 is in 2026-W53.
 * Pass a Pacific date (e.g. getPacificToday()) to get the Pacific week.
 */
export function isoWeekOf(dateStr: string): IsoWeek {
  const monday = mondayOf(dateStr);
  const year = new Date(monday + 3 * DAY_MS).getUTCFullYear(); // the week's Thursday decides the year
  const firstMonday = mondayOf(`${year}-01-04`); // January 4th is always in week 1
  const week = Math.round((monday - firstMonday) / (7 * DAY_MS)) + 1;
  return { key: `${year}-W${String(week).padStart(2, "0")}`, start: isoDay(monday), end: isoDay(monday + 6 * DAY_MS), year, week };
}

/** Parses "YYYY-Www"; null for anything that is not a real ISO week (e.g. W00, or W53 in a 52-week year). */
export function parseIsoWeekKey(key: string): IsoWeek | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const week = isoWeekOf(isoDay(mondayOf(`${m[1]}-01-04`) + (Number(m[2]) - 1) * 7 * DAY_MS));
  return week.key === key ? week : null;
}

/** The current ISO week in America/Los_Angeles. */
export function getPacificIsoWeek(): IsoWeek {
  return isoWeekOf(getPacificToday());
}
