export interface TaskRuleBody {
  title?: string;
  description?: string | null;
  facilityId?: string;
  ownerId?: string;
  triggerType?: string;
  recurrenceUnit?: string | null;
  recurrenceEvery?: number | string | null;
  recurrenceStart?: string;
  recurrenceEndOfMonth?: boolean | null;
  formKey?: string | null;
  productName?: string | null;
  isActive?: boolean;
  windowMode?: string;
  windowDaysBefore?: number | string | null;
}

export interface ScheduleFields {
  triggerType: string;
  recurrenceUnit: string | null;
  recurrenceEvery: number | null;
  recurrenceStart: Date;
  recurrenceEndOfMonth?: boolean | null;
}

/** End-of-month only means something for a recurring monthly rule. */
export function resolveEndOfMonth(
  flag: boolean | null | undefined,
  unit: string | null | undefined,
  triggerType: string | null | undefined,
): boolean {
  return flag === true && unit === "month" && (triggerType ?? "RECURRING") === "RECURRING";
}

/**
 * Builds the Prisma update payload for PATCH /api/task-rules/[id].
 * Only fields present in the body are written; everything else keeps its stored value.
 */
export function buildTaskRulePatchData(
  body: TaskRuleBody,
  existing?: Pick<ScheduleFields, "triggerType" | "recurrenceUnit" | "recurrenceEndOfMonth">,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.facilityId !== undefined) data.facilityId = body.facilityId;
  if (body.ownerId !== undefined) data.ownerId = body.ownerId;
  if (body.triggerType !== undefined) data.triggerType = body.triggerType;
  if (body.recurrenceUnit !== undefined) data.recurrenceUnit = body.recurrenceUnit || null;
  if (body.recurrenceEvery !== undefined)
    data.recurrenceEvery = body.recurrenceEvery != null ? parseInt(String(body.recurrenceEvery)) : null;
  if (body.recurrenceStart !== undefined) data.recurrenceStart = new Date(body.recurrenceStart);
  if (body.formKey !== undefined) data.formKey = body.formKey || null;
  if (body.productName !== undefined) data.productName = body.productName || null;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.windowMode !== undefined) data.windowMode = body.windowMode;
  if (body.windowDaysBefore !== undefined)
    data.windowDaysBefore = body.windowDaysBefore != null ? parseInt(String(body.windowDaysBefore)) : null;

  const unit = body.recurrenceUnit !== undefined ? body.recurrenceUnit || null : existing?.recurrenceUnit ?? null;
  const trigger = body.triggerType ?? existing?.triggerType ?? "RECURRING";
  if (body.recurrenceEndOfMonth !== undefined) {
    data.recurrenceEndOfMonth = resolveEndOfMonth(body.recurrenceEndOfMonth, unit, trigger);
  } else if (existing?.recurrenceEndOfMonth && !resolveEndOfMonth(true, unit, trigger)) {
    // Unit or trigger moved away from "monthly recurring": the stored flag no longer applies.
    data.recurrenceEndOfMonth = false;
  }
  return data;
}

export function scheduleChanged(before: ScheduleFields, after: ScheduleFields): boolean {
  return (
    before.triggerType !== after.triggerType ||
    (before.recurrenceUnit ?? null) !== (after.recurrenceUnit ?? null) ||
    (before.recurrenceEvery ?? 1) !== (after.recurrenceEvery ?? 1) ||
    before.recurrenceStart.toISOString().slice(0, 10) !== after.recurrenceStart.toISOString().slice(0, 10) ||
    (before.recurrenceEndOfMonth ?? false) !== (after.recurrenceEndOfMonth ?? false)
  );
}

export interface OpenInstanceForCleanup {
  id: string;
  dueDate: string; // YYYY-MM-DD
  status: string;
  auditCount: number;
}

const UNTOUCHED_STATUSES = ["UPCOMING", "DUE_TODAY", "OVERDUE"];

/**
 * After a schedule change, decides what happens to instances that are no longer on the schedule.
 * - Untouched (UPCOMING / DUE_TODAY / OVERDUE with no audit history) → delete.
 * - UPCOMING / DUE_TODAY that carry audit history → skip, so the history survives.
 * - Anything started, done, missed or skipped is never returned.
 */
export function planOrphanCleanup(
  instances: OpenInstanceForCleanup[],
  expectedDates: Iterable<string>,
): { toDelete: string[]; toSkip: string[] } {
  const expected = new Set(expectedDates);
  const toDelete: string[] = [];
  const toSkip: string[] = [];
  for (const inst of instances) {
    if (!UNTOUCHED_STATUSES.includes(inst.status)) continue;
    if (expected.has(inst.dueDate)) continue;
    if (inst.auditCount === 0) toDelete.push(inst.id);
    else if (inst.status !== "OVERDUE") toSkip.push(inst.id);
  }
  return { toDelete, toSkip };
}
