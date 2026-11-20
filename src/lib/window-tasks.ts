import { addDaysToDateStr } from "./pacific-time";

export interface WindowRuleSpec {
  windowMode: string;
  windowDaysBefore: number | null;
  recurrenceUnit?: string | null;
}

/**
 * Returns the ISO date string (YYYY-MM-DD) when this instance's window opens,
 * or null if no window (windowMode=NONE) or unrecognised configuration.
 *
 * PERIOD_START:
 *   - month → first day of dueDate's month
 *   - week  → Monday of dueDate's week
 *   - other → null (extension point for future semi-monthly etc.)
 *
 * DAYS_BEFORE n:
 *   - dueDate minus n calendar days
 */
export function computeWindowStart(rule: WindowRuleSpec, dueDate: string): string | null {
  if (!rule.windowMode || rule.windowMode === "NONE") return null;

  if (rule.windowMode === "PERIOD_START") {
    const unit = rule.recurrenceUnit;
    if (unit === "month") {
      return dueDate.slice(0, 7) + "-01";
    }
    // Twice a month: the first half opens on the 1st, the second half on the 16th
    if (unit === "half_month") {
      return dueDate.slice(0, 7) + (Number(dueDate.slice(8, 10)) <= 15 ? "-01" : "-16");
    }
    if (unit === "week") {
      const d = new Date(dueDate + "T12:00:00Z");
      const dow = d.getUTCDay(); // 0=Sun
      const daysBack = dow === 0 ? 6 : dow - 1;
      d.setUTCDate(d.getUTCDate() - daysBack);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }

  if (rule.windowMode === "DAYS_BEFORE") {
    const n = rule.windowDaysBefore;
    if (n == null || n < 1) return null;
    const d = new Date(dueDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Returns true when today falls within the open window:
 * windowStart <= today < dueDate.
 *
 * The due date itself is handled by the normal "Today's tasks" section.
 */
export function isInWindow(
  windowStart: string | null,
  dueDate: string,
  today: string,
): boolean {
  if (!windowStart) return false;
  return today >= windowStart && today < dueDate;
}

/** Calendar days remaining until dueDate (0 if today or past). */
export function daysLeft(dueDate: string, today: string): number {
  const due = new Date(dueDate + "T12:00:00Z");
  const tod = new Date(today + "T12:00:00Z");
  return Math.max(0, Math.round((due.getTime() - tod.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * True when any day of the window [windowStart, dueDate) falls inside [from, to].
 * The due date itself is not a window day — it is shown as the task chip.
 */
export function windowOverlapsRange(
  windowStart: string | null,
  dueDate: string,
  from: string,
  to: string,
): boolean {
  if (!windowStart) return false;
  return windowStart <= to && dueDate > from && windowStart < dueDate;
}
