import { prisma } from "@/lib/prisma";
import {
  getPacificToday,
  addDaysToDateStr,
  addWeeksToDateStr,
  addMonthsToDateStr,
  compareDateStrs,
  getEndOfDayPacific,
} from "@/lib/pacific-time";
import type { TaskRule } from "@/generated/prisma";
export { generateCalendarInstances } from "@/lib/calendar-generator";

const GENERATE_DAYS_AHEAD = 30;

/**
 * Generates RuleInstances for RECURRING and ONE_OFF rules up to 30 days ahead.
 * Idempotent — uses createMany with skipDuplicates.
 */
export async function generateInstances(): Promise<{ created: number }> {
  const today = getPacificToday();
  const horizon = addDaysToDateStr(today, GENERATE_DAYS_AHEAD);

  const rules = await prisma.taskRule.findMany({
    where: { isActive: true, isArchived: false, triggerType: { in: ["RECURRING", "ONE_OFF"] } },
  });

  let totalCreated = 0;

  for (const rule of rules) {
    const dueDates = computeDueDates(rule, today, horizon);
    if (dueDates.length === 0) continue;

    const result = await prisma.ruleInstance.createMany({
      data: dueDates.map((dueDate) => ({
        ruleId: rule.id,
        dueDate: new Date(`${dueDate}T12:00:00Z`),
        status: (dueDate === today ? "DUE_TODAY" : "UPCOMING") as "DUE_TODAY" | "UPCOMING",
        label: "",
      })),
      skipDuplicates: true,
    });
    totalCreated += result.count;
  }

  return { created: totalCreated };
}

function computeDueDates(rule: TaskRule, today: string, horizon: string): string[] {
  const startStr = rule.recurrenceStart.toISOString().slice(0, 10);

  if (rule.triggerType === "ONE_OFF") {
    if (startStr >= today && startStr <= horizon) return [startStr];
    return [];
  }

  // RECURRING
  const unit = rule.recurrenceUnit ?? "day";
  const every = rule.recurrenceEvery ?? 1;
  const dates: string[] = [];

  let cursor = startStr < today ? alignCursor(startStr, unit, every, today) : startStr;

  let safety = 0;
  while (cursor <= horizon && safety++ < 500) {
    dates.push(cursor);
    cursor = advance(cursor, unit, every);
  }

  return dates;
}

function alignCursor(start: string, unit: string, every: number, today: string): string {
  let cursor = start;
  while (compareDateStrs(cursor, today) < 0) {
    cursor = advance(cursor, unit, every);
  }
  return cursor;
}

function advance(dateStr: string, unit: string, every: number): string {
  if (unit === "day") return addDaysToDateStr(dateStr, every);
  if (unit === "week") return addWeeksToDateStr(dateStr, every);
  if (unit === "month") return addMonthsToDateStr(dateStr, every);
  return addDaysToDateStr(dateStr, every);
}

/**
 * Updates statuses:
 * - UPCOMING → DUE_TODAY for instances whose dueDate is today
 * - DUE_TODAY / IN_PROGRESS → OVERDUE when end-of-day Pacific has passed
 */
export async function updateStatuses(): Promise<{ updated: number }> {
  const today = getPacificToday();
  const now = new Date();
  let updated = 0;

  const toDueToday = await prisma.ruleInstance.updateMany({
    where: {
      status: "UPCOMING",
      dueDate: new Date(`${today}T12:00:00Z`),
    },
    data: { status: "DUE_TODAY", updatedAt: now },
  });
  updated += toDueToday.count;

  const endOfToday = getEndOfDayPacific(today);
  if (now > endOfToday) {
    const toOverdue = await prisma.ruleInstance.updateMany({
      where: {
        status: { in: ["DUE_TODAY", "IN_PROGRESS"] },
        dueDate: new Date(`${today}T12:00:00Z`),
      },
      data: { status: "OVERDUE", updatedAt: now },
    });
    updated += toOverdue.count;
  }

  return { updated };
}
