import { describe, it, expect } from "vitest";
import { buildRulePayload, ruleToFormState, showEndOfMonthOption, type TaskRuleFormState } from "@/lib/task-rule-form";
import { buildTaskRulePatchData, resolveEndOfMonth } from "@/lib/task-rule-update";
import { computeDueDates } from "@/lib/task-generator";
import type { TaskRule } from "@/generated/prisma";

const form: TaskRuleFormState = {
  title: "Monthly Cleaning",
  description: "",
  facilityId: "fac-jb",
  ownerId: "user-ivan",
  triggerType: "RECURRING",
  recurrenceUnit: "month",
  recurrenceEvery: 1,
  recurrenceStart: "2026-11-01",
  recurrenceEndOfMonth: true,
  formKey: "monthly_cleaning",
  productName: "",
  windowMode: "PERIOD_START",
  windowDaysBefore: 7,
};

function ruleFromPayload(payload: Record<string, unknown>): TaskRule {
  // Same resolution the POST route applies when creating the rule
  return {
    id: "rule-1",
    title: payload.title,
    triggerType: payload.triggerType,
    recurrenceUnit: payload.recurrenceUnit,
    recurrenceEvery: payload.recurrenceEvery ?? 1,
    recurrenceStart: new Date(payload.recurrenceStart as string),
    recurrenceEndOfMonth: resolveEndOfMonth(
      payload.recurrenceEndOfMonth as boolean,
      payload.recurrenceUnit as string | null,
      payload.triggerType as string,
    ),
  } as unknown as TaskRule;
}

describe("Task Rules form — 'Due on the last day of the month' (golden)", () => {
  it("checkbox is offered only for recurring monthly rules", () => {
    expect(showEndOfMonthOption(form)).toBe(true);
    expect(showEndOfMonthOption({ ...form, recurrenceUnit: "week" })).toBe(false);
    expect(showEndOfMonthOption({ ...form, recurrenceUnit: "day" })).toBe(false);
    expect(showEndOfMonthOption({ ...form, triggerType: "ONE_OFF" })).toBe(false);
    expect(showEndOfMonthOption({ ...form, triggerType: "PRODUCTION_DAY" })).toBe(false);
  });

  it("GOLDEN checked: form → payload → rule → generator yields month-end due dates", () => {
    const payload = buildRulePayload(form);
    expect(payload.recurrenceEndOfMonth).toBe(true);
    const dates = computeDueDates(ruleFromPayload(payload), "2026-11-19", "2027-03-31");
    expect(dates).toEqual(["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("GOLDEN unchecked: same form yields the anchor day (the 1st) — next one is 12/01", () => {
    const payload = buildRulePayload({ ...form, recurrenceEndOfMonth: false });
    expect(payload.recurrenceEndOfMonth).toBe(false);
    const dates = computeDueDates(ruleFromPayload(payload), "2026-11-19", "2027-03-31");
    expect(dates).toEqual(["2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"]);
  });

  it("a stale checked box is not sent once the unit is no longer month", () => {
    expect(buildRulePayload({ ...form, recurrenceUnit: "week" }).recurrenceEndOfMonth).toBe(false);
  });

  it("read: a stored rule opens with the box in the stored state", () => {
    const stored = {
      ...form,
      description: null,
      productName: null,
      windowDaysBefore: null,
      recurrenceStart: "2026-11-01T00:00:00.000Z",
    };
    expect(ruleToFormState({ ...stored, recurrenceEndOfMonth: true }).recurrenceEndOfMonth).toBe(true);
    expect(ruleToFormState({ ...stored, recurrenceEndOfMonth: false }).recurrenceEndOfMonth).toBe(false);
    expect(ruleToFormState({ ...stored, recurrenceEndOfMonth: null }).recurrenceEndOfMonth).toBe(false);
    expect(ruleToFormState({ ...stored, recurrenceEndOfMonth: true }).recurrenceStart).toBe("2026-11-01");
  });

  it("write: ticking the box on an existing rule reaches the database update", () => {
    const existing = { triggerType: "RECURRING", recurrenceUnit: "month", recurrenceEndOfMonth: false };
    const data = buildTaskRulePatchData(buildRulePayload(form), existing);
    expect(data.recurrenceEndOfMonth).toBe(true);
    const cleared = buildTaskRulePatchData(buildRulePayload({ ...form, recurrenceEndOfMonth: false }), { ...existing, recurrenceEndOfMonth: true });
    expect(cleared.recurrenceEndOfMonth).toBe(false);
  });
});
