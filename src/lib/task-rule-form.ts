export interface TaskRuleFormState {
  title: string;
  description: string;
  facilityId: string;
  ownerId: string;
  triggerType: string;
  recurrenceUnit: string;
  recurrenceEvery: number;
  recurrenceStart: string;
  recurrenceEndOfMonth: boolean;
  formKey: string;
  productName: string;
  windowMode: string;
  windowDaysBefore: number;
}

export interface TaskRuleFormSource {
  title: string;
  description: string | null;
  facilityId: string;
  ownerId: string;
  triggerType: string;
  recurrenceUnit: string | null;
  recurrenceEvery: number | null;
  recurrenceStart: string;
  recurrenceEndOfMonth?: boolean | null;
  formKey: string | null;
  productName: string | null;
  windowMode: string;
  windowDaysBefore: number | null;
}

export const RECURRENCE_UNITS = [
  { value: "day", label: "Day(s)" },
  { value: "week", label: "Week(s)" },
  { value: "month", label: "Month(s)" },
  { value: "half_month", label: "Twice a month (15th and last day)" },
] as const;

/** "Every N" has no meaning for twice-a-month rules. */
export function showEveryOption(form: Pick<TaskRuleFormState, "triggerType" | "recurrenceUnit">): boolean {
  return form.triggerType === "RECURRING" && form.recurrenceUnit !== "half_month";
}

/** Text for the rules list. */
export function recurrenceLabel(rule: { recurrenceUnit: string | null; recurrenceEvery: number | null; recurrenceEndOfMonth?: boolean | null }): string {
  const unit = rule.recurrenceUnit ?? "day";
  if (unit === "half_month") return "Twice a month";
  const every = rule.recurrenceEvery ?? 1;
  const suffix = unit === "month" && rule.recurrenceEndOfMonth ? " (last day)" : "";
  if (every === 1) return unit.charAt(0).toUpperCase() + unit.slice(1) + "ly" + suffix;
  return `Every ${every} ${unit}s${suffix}`;
}

export function showEndOfMonthOption(form: Pick<TaskRuleFormState, "triggerType" | "recurrenceUnit">): boolean {
  return form.triggerType === "RECURRING" && form.recurrenceUnit === "month";
}

export function ruleToFormState(rule: TaskRuleFormSource): TaskRuleFormState {
  return {
    title: rule.title,
    description: rule.description ?? "",
    facilityId: rule.facilityId,
    ownerId: rule.ownerId,
    triggerType: rule.triggerType,
    recurrenceUnit: rule.recurrenceUnit ?? "day",
    recurrenceEvery: rule.recurrenceEvery ?? 1,
    recurrenceStart: rule.recurrenceStart.slice(0, 10),
    recurrenceEndOfMonth: rule.recurrenceEndOfMonth === true,
    formKey: rule.formKey ?? "",
    productName: rule.productName ?? "",
    windowMode: rule.windowMode ?? "NONE",
    windowDaysBefore: rule.windowDaysBefore ?? 7,
  };
}

export function buildRulePayload(form: TaskRuleFormState): Record<string, unknown> {
  const recurring = form.triggerType === "RECURRING";
  return {
    title: form.title,
    description: form.description,
    facilityId: form.facilityId,
    ownerId: form.ownerId,
    triggerType: form.triggerType,
    recurrenceUnit: recurring ? form.recurrenceUnit : null,
    recurrenceEvery: recurring ? (form.recurrenceUnit === "half_month" ? 1 : form.recurrenceEvery) : null,
    recurrenceStart: form.recurrenceStart,
    recurrenceEndOfMonth: showEndOfMonthOption(form) ? form.recurrenceEndOfMonth : false,
    formKey: form.formKey || null,
    productName: form.triggerType === "PRODUCTION_PRODUCT" ? form.productName || null : null,
    windowMode: form.windowMode || "NONE",
    windowDaysBefore: form.windowMode === "DAYS_BEFORE" ? Number(form.windowDaysBefore) || 7 : null,
  };
}
