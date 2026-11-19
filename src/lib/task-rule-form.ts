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
    recurrenceEvery: recurring ? form.recurrenceEvery : null,
    recurrenceStart: form.recurrenceStart,
    recurrenceEndOfMonth: showEndOfMonthOption(form) ? form.recurrenceEndOfMonth : false,
    formKey: form.formKey || null,
    productName: form.triggerType === "PRODUCTION_PRODUCT" ? form.productName || null : null,
    windowMode: form.windowMode || "NONE",
    windowDaysBefore: form.windowMode === "DAYS_BEFORE" ? Number(form.windowDaysBefore) || 7 : null,
  };
}
