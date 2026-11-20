/**
 * How period (window) tasks appear in the Task Calendar. Pure rules shared by the calendar and by the
 * two places that load its data (the range API and the dashboard's first load).
 *
 *  - An OPEN period task draws a faint line from its window start up to the day before it is due,
 *    and its chip sits on the due date.
 *  - A DONE period task draws a faint green line across its whole window, window start THROUGH the
 *    due date, and its one chip sits on the day it was actually completed (Pacific date of doneAt) —
 *    not on the due date.
 *  - Skipped and missed tasks draw no line.
 */
import { toPacificDateStr } from "@/lib/pacific-time";
import { windowOverlapsRange } from "@/lib/window-tasks";

export interface CalendarTask {
  status: string;
  dueDate: string; // YYYY-MM-DD
  windowStart?: string | null;
  doneAt?: string | null;
}

const CLOSED_WITHOUT_LINE = ["SKIPPED", "MISSED"];

/** A done task of a rule with a window. */
export function isDonePeriodTask(t: CalendarTask): boolean {
  return t.status === "DONE" && t.windowStart != null;
}

/** The Pacific calendar day a task was completed on; null when it is not done or has no completion time. */
export function doneDayOf(t: Pick<CalendarTask, "status" | "doneAt">): string | null {
  if (t.status !== "DONE" || !t.doneAt) return null;
  const at = new Date(t.doneAt);
  return Number.isNaN(at.getTime()) ? null : toPacificDateStr(at);
}

/**
 * The one day a task's chip is shown on: its due date — except a done period task, which is shown on the
 * day it was completed (so it never appears twice).
 */
export function chipDayOf(t: CalendarTask): string {
  return isDonePeriodTask(t) ? doneDayOf(t) ?? t.dueDate : t.dueDate;
}

/** Whether the task's faint line passes through this day. */
export function lineCoversDay(t: CalendarTask, day: string): boolean {
  if (t.windowStart == null || CLOSED_WITHOUT_LINE.includes(t.status)) return false;
  if (t.status === "DONE") return t.windowStart <= day && day <= t.dueDate;
  return t.windowStart <= day && day < t.dueDate;
}

/** The tasks whose line passes through this day, in the order given (a line keeps its place from day to day). */
export function linesForDay<T extends CalendarTask>(tasks: T[], day: string): T[] {
  return tasks.filter((t) => lineCoversDay(t, day));
}

/** The first of the visible days the line passes through: the one day that carries the line's label. */
export function lineLabelDay(t: CalendarTask, visibleDays: string[]): string | null {
  return visibleDays.find((d) => lineCoversDay(t, d)) ?? null;
}

/** Done period tasks listed in the day panel: every day of the window, start through due date. */
export function donePeriodTasksForDay<T extends CalendarTask>(tasks: T[], day: string): T[] {
  return tasks.filter((t) => isDonePeriodTask(t) && lineCoversDay(t, day));
}

/**
 * Whether a DONE period task that is NOT due inside [from, to] still belongs in that range:
 * its window reaches into the range (it is due later), or it was completed on a day inside the range
 * (completed early, or late after its due date).
 */
export function doneTaskBelongsInRange(t: CalendarTask, from: string, to: string): boolean {
  if (!isDonePeriodTask(t)) return false;
  const doneDay = doneDayOf(t);
  if (doneDay && doneDay >= from && doneDay <= to) return true;
  return t.dueDate > to && windowOverlapsRange(t.windowStart ?? null, t.dueDate, from, to);
}

/**
 * Database filter for the candidates of doneTaskBelongsInRange: done tasks of window rules due after
 * the range, or due before it and completed around it. The exact Pacific-day test is done in code.
 */
export function doneWindowCandidatesWhere(from: string, to: string) {
  const after = new Date(`${to}T23:59:59Z`);
  const doneFrom = new Date(`${from}T00:00:00Z`);
  // Pacific midnight is at most 8 hours after UTC midnight: one extra day covers the end of the range
  const doneTo = new Date(new Date(`${to}T00:00:00Z`).getTime() + 2 * 24 * 60 * 60 * 1000);
  return {
    AND: [
      { status: "DONE" as const },
      { rule: { windowMode: { not: "NONE" as const } } },
      { OR: [{ dueDate: { gt: after } }, { dueDate: { lt: doneFrom }, doneAt: { gte: doneFrom, lte: doneTo } }] },
    ],
  };
}
