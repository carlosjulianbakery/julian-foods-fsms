import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient, TaskRule } from "@/generated/prisma";
import { computeDueDates, halfMonthDueOnOrAfter } from "@/lib/task-generator";
import { computeWindowStart, isInWindow } from "@/lib/window-tasks";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { RECURRENCE_UNITS, buildRulePayload, recurrenceLabel, showEndOfMonthOption, showEveryOption, type TaskRuleFormState } from "@/lib/task-rule-form";
import { resolveEndOfMonth } from "@/lib/task-rule-update";
import { periodForDate } from "@/lib/verification-624";

const rule = (start = "2026-01-01") =>
  ({ triggerType: "RECURRING", recurrenceUnit: "half_month", recurrenceEvery: 1, recurrenceStart: new Date(start + "T00:00:00Z"), recurrenceEndOfMonth: false }) as unknown as TaskRule;
const win = (due: string) => computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "half_month" }, due);

describe("half_month due dates — GOLDEN", () => {
  it("2026: the 15th and the last day of every month", () => {
    expect(computeDueDates(rule(), "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-15", "2026-01-31", "2026-02-15", "2026-02-28", "2026-03-15", "2026-03-31", "2026-04-15", "2026-04-30",
      "2026-05-15", "2026-05-31", "2026-06-15", "2026-06-30", "2026-07-15", "2026-07-31", "2026-08-15", "2026-08-31",
      "2026-09-15", "2026-09-30", "2026-10-15", "2026-10-31", "2026-11-15", "2026-11-30", "2026-12-15", "2026-12-31",
    ]);
  });

  it("February: 28 days in 2027, 29 in the leap year 2028", () => {
    expect(computeDueDates(rule(), "2027-02-01", "2027-02-28")).toEqual(["2027-02-15", "2027-02-28"]);
    expect(computeDueDates(rule(), "2028-02-01", "2028-02-29")).toEqual(["2028-02-15", "2028-02-29"]);
  });

  it("created on 2026-11-20: first task is due 11/30 — the 11/15 period is not backfilled", () => {
    expect(computeDueDates(rule("2026-11-20"), "2026-11-20", "2026-12-20")).toEqual(["2026-11-30", "2026-12-15"]);
    expect(computeDueDates(rule("2026-11-01"), "2026-11-20", "2026-12-20")).toEqual(["2026-11-30", "2026-12-15"]);
  });

  it("boundaries: on the 15th the 15th is still due; on the 16th the next is the last day; across a year end", () => {
    expect(halfMonthDueOnOrAfter("2026-11-15")).toBe("2026-11-15");
    expect(halfMonthDueOnOrAfter("2026-11-16")).toBe("2026-11-30");
    expect(halfMonthDueOnOrAfter("2026-11-30")).toBe("2026-11-30");
    expect(computeDueDates(rule(), "2026-12-20", "2027-01-20")).toEqual(["2026-12-31", "2027-01-15"]);
  });

  it("a future start date is honoured; the 30-day horizon always holds the next task before its window opens", () => {
    expect(computeDueDates(rule("2027-03-10"), "2026-11-20", "2027-04-01")).toEqual(["2027-03-15", "2027-03-31"]);
    for (const today of ["2026-11-01", "2026-11-16", "2027-02-01", "2027-02-16", "2028-02-16", "2026-12-16"]) {
      const horizon = new Date(new Date(today + "T00:00:00Z").getTime() + 30 * 86400000).toISOString().slice(0, 10);
      expect(computeDueDates(rule(), today, horizon)[0]).toBe(periodForDate(today).end);
    }
  });

  it("other units are unchanged by the new branch", () => {
    const monthly = { ...rule("2026-11-11"), recurrenceUnit: "month" } as unknown as TaskRule;
    expect(computeDueDates(monthly, "2026-11-01", "2027-01-31")).toEqual(["2026-11-11", "2026-12-11", "2027-01-11"]);
  });
});

describe("half_month windows", () => {
  it("first half opens on the 1st, second half on the 16th", () => {
    expect(win("2026-11-15")).toBe("2026-11-01");
    expect(win("2026-11-30")).toBe("2026-11-16");
    expect(win("2027-02-28")).toBe("2027-02-16");
    expect(win("2028-02-29")).toBe("2028-02-16");
    expect(win("2026-12-31")).toBe("2026-12-16");
  });

  it("the window matches the form's period for every due date of a leap year", () => {
    for (const due of computeDueDates(rule("2028-01-01"), "2028-01-01", "2028-12-31")) {
      expect(win(due)).toBe(periodForDate(due).start);
      expect(periodForDate(due).end).toBe(due);
    }
  });

  it("2026-11-20: the 11/30 task is open, the 12/15 task is not yet", () => {
    expect(isInWindow(win("2026-11-30"), "2026-11-30", "2026-11-20")).toBe(true);
    expect(isInWindow(win("2026-12-15"), "2026-12-15", "2026-11-20")).toBe(false);
    expect(isInWindow(win("2026-12-15"), "2026-12-15", "2026-12-01")).toBe(true);
  });

  it("no window mode → no window", () => {
    expect(computeWindowStart({ windowMode: "NONE", windowDaysBefore: null, recurrenceUnit: "half_month" }, "2026-11-30")).toBeNull();
  });
});

describe("Task Rules form — 'Twice a month (15th and last day)'", () => {
  const form: TaskRuleFormState = {
    title: "Scales & Thermometer Verification", description: "", facilityId: "fac-624", ownerId: "hugo", triggerType: "RECURRING",
    recurrenceUnit: "half_month", recurrenceEvery: 3, recurrenceStart: "2026-11-20", recurrenceEndOfMonth: true,
    formKey: "verification_624", productName: "", windowMode: "PERIOD_START", windowDaysBefore: 7,
  };
  it("is offered in the unit list", () => {
    expect(RECURRENCE_UNITS.map((u) => [u.value, u.label])).toContainEqual(["half_month", "Twice a month (15th and last day)"]);
  });
  it("hides 'Every' and the end-of-month checkbox", () => {
    expect(showEveryOption(form)).toBe(false);
    expect(showEndOfMonthOption(form)).toBe(false);
    expect(showEveryOption({ ...form, recurrenceUnit: "month" })).toBe(true);
    expect(showEndOfMonthOption({ ...form, recurrenceUnit: "month" })).toBe(true);
  });
  it("is saved as every 1, never end-of-month, and listed as 'Twice a month'", () => {
    expect(buildRulePayload(form)).toMatchObject({ recurrenceUnit: "half_month", recurrenceEvery: 1, recurrenceEndOfMonth: false, windowMode: "PERIOD_START" });
    expect(resolveEndOfMonth(true, "half_month", "RECURRING")).toBe(false);
    expect(recurrenceLabel({ recurrenceUnit: "half_month", recurrenceEvery: 1 })).toBe("Twice a month");
    expect(recurrenceLabel({ recurrenceUnit: "month", recurrenceEvery: 1, recurrenceEndOfMonth: true })).toBe("Monthly (last day)");
    expect(recurrenceLabel({ recurrenceUnit: "week", recurrenceEvery: 2 })).toBe("Every 2 weeks");
  });
});

describe("task completion for each half (real function, mocked database)", () => {
  const row = (id: string, due: string, status: string) => ({
    id, dueDate: new Date(due + "T00:00:00Z"), status, label: "", ownerUserId: null,
    rule: { formKey: "verification_624", ownerId: "hugo", facility: { name: "624" }, windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "half_month" },
  });
  function db(candidates: ReturnType<typeof row>[], byId: ReturnType<typeof row> | null = null) {
    const d = {
      ruleInstance: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(byId), findMany: vi.fn().mockResolvedValue(candidates), update: vi.fn().mockResolvedValue({}) },
      taskInstanceAudit: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    return { d, client: d as unknown as PrismaClient };
  }
  const complete = (client: PrismaClient, submissionDate: string, taskId: string | null = null) =>
    completeRuleInstanceForSubmission({ formKey: "verification_624", facilityName: "624", submissionId: "rec-1", userId: "hugo", submissionDate, taskId, prismaClient: client });

  beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); });

  it("second half: submitted 11/20 with the period's due date → the 11/30 task, not late, although it is stored UPCOMING", async () => {
    vi.setSystemTime(new Date("2026-11-20T19:00:00Z"));
    const { d, client } = db([row("first-half-next", "2026-12-15", "UPCOMING"), row("second-half", "2026-11-30", "UPCOMING")]);
    expect(await complete(client, "2026-11-30")).toBe("second-half");
    expect(d.ruleInstance.update.mock.calls[0][0].data).toMatchObject({ status: "DONE", completedLate: false, daysLate: null });
    expect(d.ruleInstance.findMany.mock.calls[0][0].where.rule).toEqual({ formKey: "verification_624", facility: { name: "624" } });
  });

  it("first half: the 12/15 due date picks the first-half task even while the 11/30 one is still open", async () => {
    vi.setSystemTime(new Date("2026-12-03T19:00:00Z"));
    const { client } = db([row("second-half-overdue", "2026-11-30", "OVERDUE"), row("first-half", "2026-12-15", "UPCOMING")]);
    expect(await complete(client, "2026-12-15")).toBe("first-half");
  });

  it("an overdue period submitted late is completed as late", async () => {
    vi.setSystemTime(new Date("2026-12-03T19:00:00Z"));
    const { d, client } = db([row("second-half-overdue", "2026-11-30", "OVERDUE"), row("first-half", "2026-12-15", "UPCOMING")]);
    expect(await complete(client, "2026-11-30")).toBe("second-half-overdue");
    expect(d.ruleInstance.update.mock.calls[0][0].data).toMatchObject({ completedLate: true, daysLate: 3 });
  });

  it("a task id wins over the date", async () => {
    vi.setSystemTime(new Date("2026-11-20T19:00:00Z"));
    const { d, client } = db([], row("named", "2026-11-30", "IN_PROGRESS"));
    expect(await complete(client, "2026-12-15", "named")).toBe("named");
    expect(d.ruleInstance.findMany).not.toHaveBeenCalled();
  });
});
