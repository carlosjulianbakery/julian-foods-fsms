import { describe, it, expect } from "vitest";
import { computeWindowStart, isInWindow, daysLeft } from "../window-tasks";

describe("computeWindowStart", () => {
  it("NONE → null", () => {
    expect(computeWindowStart({ windowMode: "NONE", windowDaysBefore: null, recurrenceUnit: "month" }, "2026-11-30")).toBeNull();
  });

  it("empty / falsy windowMode → null", () => {
    expect(computeWindowStart({ windowMode: "", windowDaysBefore: null, recurrenceUnit: "month" }, "2026-11-30")).toBeNull();
  });

  it("PERIOD_START monthly → first of month", () => {
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "month" }, "2026-11-30")).toBe("2026-11-01");
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "month" }, "2027-01-31")).toBe("2027-01-01");
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "month" }, "2026-12-31")).toBe("2026-12-01");
  });

  it("PERIOD_START weekly → Monday of week", () => {
    // 2026-11-20 is Friday
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "week" }, "2026-11-20")).toBe("2026-11-16");
    // 2026-11-16 is Monday
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "week" }, "2026-11-16")).toBe("2026-11-16");
    // 2026-11-22 is Sunday
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "week" }, "2026-11-22")).toBe("2026-11-16");
    // 2026-11-17 is Tuesday
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "week" }, "2026-11-17")).toBe("2026-11-16");
  });

  it("PERIOD_START unknown unit → null (future-proof)", () => {
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "day" }, "2026-11-30")).toBeNull();
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: null }, "2026-11-30")).toBeNull();
  });

  it("DAYS_BEFORE subtracts N days", () => {
    expect(computeWindowStart({ windowMode: "DAYS_BEFORE", windowDaysBefore: 5, recurrenceUnit: null }, "2026-11-30")).toBe("2026-11-25");
    expect(computeWindowStart({ windowMode: "DAYS_BEFORE", windowDaysBefore: 1, recurrenceUnit: null }, "2026-11-01")).toBe("2026-10-31");
    expect(computeWindowStart({ windowMode: "DAYS_BEFORE", windowDaysBefore: 31, recurrenceUnit: null }, "2026-11-30")).toBe("2026-10-30");
  });

  it("DAYS_BEFORE null windowDaysBefore → null", () => {
    expect(computeWindowStart({ windowMode: "DAYS_BEFORE", windowDaysBefore: null, recurrenceUnit: null }, "2026-11-30")).toBeNull();
  });

  it("DAYS_BEFORE 0 → null (zero days is not a valid window)", () => {
    expect(computeWindowStart({ windowMode: "DAYS_BEFORE", windowDaysBefore: 0, recurrenceUnit: null }, "2026-11-30")).toBeNull();
  });

  it("unknown windowMode → null", () => {
    expect(computeWindowStart({ windowMode: "WHATEVER", windowDaysBefore: null, recurrenceUnit: null }, "2026-11-30")).toBeNull();
  });
});

describe("isInWindow", () => {
  const dueDate = "2026-11-30";
  const windowStart = "2026-11-01";

  it("returns false if windowStart is null", () => {
    expect(isInWindow(null, dueDate, "2026-11-15")).toBe(false);
  });

  it("returns true when today is within window", () => {
    expect(isInWindow(windowStart, dueDate, "2026-11-01")).toBe(true);
    expect(isInWindow(windowStart, dueDate, "2026-11-15")).toBe(true);
    expect(isInWindow(windowStart, dueDate, "2026-11-29")).toBe(true);
  });

  it("returns false on the due date (due date belongs to Today section)", () => {
    expect(isInWindow(windowStart, dueDate, "2026-11-30")).toBe(false);
  });

  it("returns false before windowStart", () => {
    expect(isInWindow(windowStart, dueDate, "2026-10-31")).toBe(false);
  });

  it("returns false after due date", () => {
    expect(isInWindow(windowStart, dueDate, "2026-12-01")).toBe(false);
  });

  it("zero-day window (windowStart === dueDate) always false", () => {
    expect(isInWindow("2026-11-30", dueDate, "2026-11-29")).toBe(false);
    expect(isInWindow("2026-11-30", dueDate, "2026-11-30")).toBe(false);
  });
});

describe("daysLeft", () => {
  it("correct days", () => {
    expect(daysLeft("2026-11-30", "2026-11-18")).toBe(12);
    expect(daysLeft("2026-11-30", "2026-11-29")).toBe(1);
    expect(daysLeft("2026-11-30", "2026-11-30")).toBe(0);
  });

  it("past due date → 0 (never negative)", () => {
    expect(daysLeft("2026-11-30", "2026-12-01")).toBe(0);
    expect(daysLeft("2026-11-01", "2026-12-01")).toBe(0);
  });

  it("month boundary", () => {
    expect(daysLeft("2026-12-01", "2026-11-30")).toBe(1);
  });

  it("year boundary", () => {
    expect(daysLeft("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("window tasks — section placement invariant", () => {
  it("window task before due date: windowStart <= today < dueDate → isInWindow=true, NOT on due date", () => {
    // MC624: due Nov 30, window opens Nov 1 (PERIOD_START monthly)
    const dueDate = "2026-11-30";
    const ws = computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "month" }, dueDate);
    expect(ws).toBe("2026-11-01");
    // Today Nov 18: in window section, not Today section
    expect(isInWindow(ws, dueDate, "2026-11-18")).toBe(true);
    // Today Nov 30 (due date): NOT in window section — goes to Today section
    expect(isInWindow(ws, dueDate, "2026-11-30")).toBe(false);
    // Today Dec 1 (past): NOT in window section
    expect(isInWindow(ws, dueDate, "2026-12-01")).toBe(false);
  });

  it("window task with DAYS_BEFORE: appears in window only within N days of due date", () => {
    const dueDate = "2026-11-30";
    const ws = computeWindowStart({ windowMode: "DAYS_BEFORE", windowDaysBefore: 7, recurrenceUnit: null }, dueDate);
    expect(ws).toBe("2026-11-23");
    expect(isInWindow(ws, dueDate, "2026-11-22")).toBe(false); // before window
    expect(isInWindow(ws, dueDate, "2026-11-23")).toBe(true);  // window opens
    expect(isInWindow(ws, dueDate, "2026-11-29")).toBe(true);
    expect(isInWindow(ws, dueDate, "2026-11-30")).toBe(false); // due date → Today section
  });

  it("window task with NONE: never in window section", () => {
    const dueDate = "2026-11-30";
    const ws = computeWindowStart({ windowMode: "NONE", windowDaysBefore: null, recurrenceUnit: "month" }, dueDate);
    expect(ws).toBeNull();
    expect(isInWindow(ws, dueDate, "2026-11-18")).toBe(false);
  });
});

describe("banner regression — window tasks not counted before due date", () => {
  it("daysLeft amber threshold: ≤3 days is considered urgent", () => {
    expect(daysLeft("2026-11-30", "2026-11-27")).toBe(3);
    expect(daysLeft("2026-11-30", "2026-11-28")).toBe(2);
    // The amber threshold is ≤3 from the UI perspective
    // daysLeft of 3 or less should trigger amber styling in WindowTaskCard
    const days3 = daysLeft("2026-11-30", "2026-11-27");
    expect(days3 <= 3).toBe(true);
    const days4 = daysLeft("2026-11-30", "2026-11-26");
    expect(days4 <= 3).toBe(false);
  });
});
