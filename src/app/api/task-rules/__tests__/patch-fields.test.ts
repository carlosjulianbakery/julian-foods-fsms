import { describe, it, expect } from "vitest";
import { buildTaskRulePatchData, resolveEndOfMonth, scheduleChanged, planOrphanCleanup } from "@/lib/task-rule-update";

describe("buildTaskRulePatchData — only fields in the body are written", () => {
  it("only windowMode → nothing else is touched", () => {
    expect(buildTaskRulePatchData({ windowMode: "PERIOD_START" })).toEqual({ windowMode: "PERIOD_START" });
  });

  it("only title → formKey, recurrenceEndOfMonth, windowMode, windowDaysBefore are preserved", () => {
    const existing = { triggerType: "RECURRING", recurrenceUnit: "month", recurrenceEndOfMonth: true };
    expect(buildTaskRulePatchData({ title: "  New title " }, existing)).toEqual({ title: "New title" });
  });

  it("only isActive → nothing else is touched", () => {
    expect(buildTaskRulePatchData({ isActive: false })).toEqual({ isActive: false });
  });

  it('windowDaysBefore "7" → 7; null stays null', () => {
    expect(buildTaskRulePatchData({ windowDaysBefore: "7" })).toEqual({ windowDaysBefore: 7 });
    expect(buildTaskRulePatchData({ windowDaysBefore: null })).toEqual({ windowDaysBefore: null });
  });

  it("empty formKey / recurrenceUnit → null", () => {
    expect(buildTaskRulePatchData({ formKey: "", recurrenceUnit: "" })).toEqual({ formKey: null, recurrenceUnit: null });
  });

  it("recurrenceEvery null (non-recurring rule) → null, not NaN", () => {
    expect(buildTaskRulePatchData({ recurrenceEvery: null })).toEqual({ recurrenceEvery: null });
  });
});

describe("buildTaskRulePatchData — recurrenceEndOfMonth", () => {
  const monthly = { triggerType: "RECURRING", recurrenceUnit: "month", recurrenceEndOfMonth: false };

  it("true on a monthly rule is written", () => {
    expect(buildTaskRulePatchData({ recurrenceEndOfMonth: true }, monthly)).toEqual({ recurrenceEndOfMonth: true });
  });

  it("false is written (checkbox unticked)", () => {
    expect(buildTaskRulePatchData({ recurrenceEndOfMonth: false }, { ...monthly, recurrenceEndOfMonth: true })).toEqual({
      recurrenceEndOfMonth: false,
    });
  });

  it("true together with unit=week is stored as false", () => {
    const data = buildTaskRulePatchData({ recurrenceEndOfMonth: true, recurrenceUnit: "week" }, monthly);
    expect(data.recurrenceEndOfMonth).toBe(false);
  });

  it("unit changed away from month without the flag in the body clears a stored true", () => {
    const data = buildTaskRulePatchData({ recurrenceUnit: "week" }, { ...monthly, recurrenceEndOfMonth: true });
    expect(data).toEqual({ recurrenceUnit: "week", recurrenceEndOfMonth: false });
  });

  it("resolveEndOfMonth: only recurring monthly rules can be end-of-month", () => {
    expect(resolveEndOfMonth(true, "month", "RECURRING")).toBe(true);
    expect(resolveEndOfMonth(true, "month", "ONE_OFF")).toBe(false);
    expect(resolveEndOfMonth(true, "day", "RECURRING")).toBe(false);
    expect(resolveEndOfMonth(null, "month", "RECURRING")).toBe(false);
  });
});

describe("scheduleChanged", () => {
  const base = {
    triggerType: "RECURRING",
    recurrenceUnit: "month",
    recurrenceEvery: 1,
    recurrenceStart: new Date("2026-11-01T00:00:00Z"),
    recurrenceEndOfMonth: false,
  };
  it("identical schedule → false (saving an unrelated field must not clean anything up)", () => {
    expect(scheduleChanged(base, { ...base })).toBe(false);
    expect(scheduleChanged({ ...base, recurrenceEndOfMonth: null }, base)).toBe(false);
  });
  it("each schedule field counts as a change", () => {
    expect(scheduleChanged(base, { ...base, recurrenceEndOfMonth: true })).toBe(true);
    expect(scheduleChanged(base, { ...base, recurrenceUnit: "week" })).toBe(true);
    expect(scheduleChanged(base, { ...base, recurrenceEvery: 2 })).toBe(true);
    expect(scheduleChanged(base, { ...base, recurrenceStart: new Date("2026-11-02T00:00:00Z") })).toBe(true);
    expect(scheduleChanged(base, { ...base, triggerType: "ONE_OFF" })).toBe(true);
  });
});

describe("planOrphanCleanup", () => {
  const inst = (id: string, dueDate: string, status: string, auditCount = 0) => ({ id, dueDate, status, auditCount });

  it("untouched UPCOMING / DUE_TODAY / OVERDUE off the schedule are deleted, not skipped", () => {
    const plan = planOrphanCleanup(
      [inst("a", "2026-12-01", "UPCOMING"), inst("b", "2026-11-19", "DUE_TODAY"), inst("c", "2026-11-10", "OVERDUE")],
      ["2026-11-30"],
    );
    expect(plan).toEqual({ toDelete: ["a", "b", "c"], toSkip: [] });
  });

  it("instances still on the new schedule are kept", () => {
    expect(planOrphanCleanup([inst("a", "2026-11-30", "UPCOMING")], ["2026-11-30"])).toEqual({ toDelete: [], toSkip: [] });
  });

  it("started, done, missed and skipped instances are never touched", () => {
    const plan = planOrphanCleanup(
      ["IN_PROGRESS", "DONE", "MISSED", "SKIPPED"].map((s, i) => inst(`x${i}`, "2026-12-01", s)),
      [],
    );
    expect(plan).toEqual({ toDelete: [], toSkip: [] });
  });

  it("open instances with audit history are skipped (history kept); overdue ones with history are left alone", () => {
    const plan = planOrphanCleanup(
      [inst("a", "2026-12-01", "UPCOMING", 2), inst("b", "2026-11-10", "OVERDUE", 1)],
      [],
    );
    expect(plan).toEqual({ toDelete: [], toSkip: ["a"] });
  });
});
