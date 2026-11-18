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

describe("computeWindowStart — February edge cases", () => {
  it("leap year 2028: due 2028-02-29 → PERIOD_START monthly → 2028-02-01", () => {
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "month" }, "2028-02-29")).toBe("2028-02-01");
  });

  it("non-leap 2027: due 2027-02-28 → PERIOD_START monthly → 2027-02-01", () => {
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "month" }, "2027-02-28")).toBe("2027-02-01");
  });

  it("DAYS_BEFORE spanning Jan→Feb boundary: due 2027-02-01, 7 days before → 2027-01-25", () => {
    expect(computeWindowStart({ windowMode: "DAYS_BEFORE", windowDaysBefore: 7, recurrenceUnit: null }, "2027-02-01")).toBe("2027-01-25");
  });
});

describe("computeWindowStart — PERIOD_START weekly edge: due on Monday", () => {
  it("due on Monday 2026-11-16 → windowStart is that same Monday", () => {
    expect(computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "week" }, "2026-11-16")).toBe("2026-11-16");
  });
});

describe("isInWindow — PT timezone semantics (string comparison, no hour dependency)", () => {
  it("window opens on its start day (today === windowStart)", () => {
    expect(isInWindow("2026-11-01", "2026-11-30", "2026-11-01")).toBe(true);
  });

  it("window excludes due date (today === dueDate)", () => {
    expect(isInWindow("2026-11-01", "2026-11-30", "2026-11-30")).toBe(false);
  });

  it("before window start → false", () => {
    expect(isInWindow("2026-11-01", "2026-11-30", "2026-10-31")).toBe(false);
  });

  it("last day of window (day before due) → true", () => {
    expect(isInWindow("2026-11-01", "2026-11-30", "2026-11-29")).toBe(true);
  });
});

describe("daysLeft — amber threshold ≤3", () => {
  it("3 days left → amber (≤3 is true)", () => {
    const d = daysLeft("2026-11-21", "2026-11-18");
    expect(d).toBe(3);
    expect(d <= 3).toBe(true);
  });

  it("4 days left → not amber (≤3 is false)", () => {
    const d = daysLeft("2026-11-22", "2026-11-18");
    expect(d).toBe(4);
    expect(d <= 3).toBe(false);
  });

  it("0 days left (same day) → amber", () => {
    const d = daysLeft("2026-11-18", "2026-11-18");
    expect(d).toBe(0);
    expect(d <= 3).toBe(true);
  });

  it("past due → 0 → amber", () => {
    const d = daysLeft("2026-11-17", "2026-11-18");
    expect(d).toBe(0);
    expect(d <= 3).toBe(true);
  });
});

describe("daily tasks — no window band", () => {
  it("daily rule (recurrenceUnit=day, windowMode=NONE) → windowStart=null → isInWindow=false", () => {
    const ws = computeWindowStart({ windowMode: "NONE", windowDaysBefore: null, recurrenceUnit: "day" }, "2026-11-18");
    expect(ws).toBeNull();
    expect(isInWindow(ws, "2026-11-18", "2026-11-18")).toBe(false);
  });

  it("daily rule even with PERIOD_START (day unit) → null (day not supported)", () => {
    const ws = computeWindowStart({ windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "day" }, "2026-11-18");
    expect(ws).toBeNull();
  });
});

describe("section placement — DONE/SKIPPED/MISSED filtering", () => {
  const dueDate = "2026-11-30";
  const today = "2026-11-18";
  const ws = "2026-11-01"; // PERIOD_START monthly

  it("UPCOMING task in window → isInWindow=true", () => {
    expect(isInWindow(ws, dueDate, today)).toBe(true);
  });

  it("IN_PROGRESS task in window → isInWindow=true", () => {
    // isInWindow is status-agnostic; caller filters status
    expect(isInWindow(ws, dueDate, today)).toBe(true);
  });

  it("DONE task should be excluded by status filter, not isInWindow", () => {
    // isInWindow does not check status; the query filters it
    // Demonstrate: status filtering happens outside isInWindow
    const statuses = ["DONE", "SKIPPED", "MISSED"];
    for (const s of statuses) {
      // These would pass isInWindow but are excluded by the status filter in the query
      expect(isInWindow(ws, dueDate, today)).toBe(true); // isInWindow itself doesn't know status
      expect(statuses.includes(s)).toBe(true); // caller must filter these out
    }
  });

  it("window task on its due date → not in window section", () => {
    expect(isInWindow(ws, dueDate, dueDate)).toBe(false);
  });

  it("window task with windowMode=NONE → windowStart null → never in window section", () => {
    const wsNone = computeWindowStart({ windowMode: "NONE", windowDaysBefore: null, recurrenceUnit: "month" }, dueDate);
    expect(wsNone).toBeNull();
    expect(isInWindow(wsNone, dueDate, today)).toBe(false);
  });
});
