import { describe, it, expect } from "vitest";
import { getEffectiveStatus, getTaskPresentation, TASK_SORT_PRIORITY } from "../task-presentation";

const TODAY = "2026-11-18";
const PAST  = "2026-11-10";
const FUTURE = "2026-12-01";

// ─── getEffectiveStatus ───────────────────────────────────────────────────────

describe("getEffectiveStatus", () => {
  const cases: [string, string, string, string][] = [
    ["UPCOMING",    TODAY,  TODAY,  "DUE_TODAY"],
    ["UPCOMING",    PAST,   TODAY,  "OVERDUE"],
    ["UPCOMING",    FUTURE, TODAY,  "UPCOMING"],
    ["DUE_TODAY",   TODAY,  TODAY,  "DUE_TODAY"],
    ["DUE_TODAY",   PAST,   TODAY,  "OVERDUE"],
    ["IN_PROGRESS", TODAY,  TODAY,  "IN_PROGRESS"],
    ["IN_PROGRESS", PAST,   TODAY,  "IN_PROGRESS"],
    ["DONE",        TODAY,  TODAY,  "DONE"],
    ["OVERDUE",     PAST,   TODAY,  "OVERDUE"],
    ["MISSED",      PAST,   TODAY,  "MISSED"],
    ["SKIPPED",     TODAY,  TODAY,  "SKIPPED"],
    ["UNKNOWN",     TODAY,  TODAY,  "UPCOMING"],
  ];

  for (const [status, dueDate, today, expected] of cases) {
    it(`${status} dueDate=${dueDate} -> ${expected}`, () => {
      expect(getEffectiveStatus(status, dueDate, today)).toBe(expected);
    });
  }
});

// ─── getTaskPresentation — label ──────────────────────────────────────────────

describe("getTaskPresentation label", () => {
  it("UPCOMING+today shows Due today", () => {
    const p = getTaskPresentation("UPCOMING", TODAY, TODAY);
    expect(p.label).toBe("Due today");
    expect(p.effectiveStatus).toBe("DUE_TODAY");
  });

  it("UPCOMING past shows Overdue", () => {
    expect(getTaskPresentation("UPCOMING", PAST, TODAY).label).toBe("Overdue");
  });

  it("UPCOMING future shows Upcoming", () => {
    expect(getTaskPresentation("UPCOMING", FUTURE, TODAY).label).toBe("Upcoming");
  });

  it("IN_PROGRESS shows In progress", () => {
    expect(getTaskPresentation("IN_PROGRESS", TODAY, TODAY).label).toBe("In progress");
  });

  it("DONE shows Done", () => {
    expect(getTaskPresentation("DONE", TODAY, TODAY).label).toBe("Done");
  });

  it("MISSED shows Missed", () => {
    expect(getTaskPresentation("MISSED", PAST, TODAY).label).toBe("Missed");
  });

  it("SKIPPED shows Skipped", () => {
    expect(getTaskPresentation("SKIPPED", TODAY, TODAY).label).toBe("Skipped");
  });
});

// ─── getTaskPresentation — colors ─────────────────────────────────────────────

describe("getTaskPresentation colors", () => {
  it("UPCOMING+today is amber not blue", () => {
    const p = getTaskPresentation("UPCOMING", TODAY, TODAY);
    expect(p.badgeBg).toContain("amber");
    expect(p.borderColor).toContain("amber");
    expect(p.dotColor).toContain("amber");
  });

  it("IN_PROGRESS is blue", () => {
    const p = getTaskPresentation("IN_PROGRESS", TODAY, TODAY);
    expect(p.badgeBg).toContain("blue");
    expect(p.borderColor).toContain("blue");
    expect(p.dotColor).toContain("blue");
  });

  it("DONE is green", () => {
    const p = getTaskPresentation("DONE", TODAY, TODAY);
    expect(p.badgeBg).toContain("green");
    expect(p.borderColor).toContain("green");
    expect(p.dotColor).toContain("green");
  });

  it("OVERDUE is red", () => {
    const p = getTaskPresentation("OVERDUE", PAST, TODAY);
    expect(p.badgeBg).toContain("red");
    expect(p.borderColor).toContain("red");
    expect(p.dotColor).toContain("red");
  });

  it("UPCOMING past is red", () => {
    const p = getTaskPresentation("UPCOMING", PAST, TODAY);
    expect(p.badgeBg).toContain("red");
    expect(p.dotColor).toContain("red");
  });

  it("UPCOMING future is gray", () => {
    const p = getTaskPresentation("UPCOMING", FUTURE, TODAY);
    expect(p.badgeBg).toContain("gray");
    expect(p.borderColor).toContain("gray");
    expect(p.dotColor).toContain("gray");
  });

  it("MISSED is red", () => {
    const p = getTaskPresentation("MISSED", PAST, TODAY);
    expect(p.badgeBg).toContain("red");
    expect(p.dotColor).toContain("red");
  });

  it("SKIPPED is gray", () => {
    const p = getTaskPresentation("SKIPPED", TODAY, TODAY);
    expect(p.badgeBg).toContain("gray");
    expect(p.dotColor).toContain("gray");
  });
});

// ─── TASK_SORT_PRIORITY ───────────────────────────────────────────────────────

describe("TASK_SORT_PRIORITY ordering", () => {
  it("OVERDUE < MISSED < DUE_TODAY < IN_PROGRESS < UPCOMING < DONE < SKIPPED", () => {
    const order = ["OVERDUE", "MISSED", "DUE_TODAY", "IN_PROGRESS", "UPCOMING", "DONE", "SKIPPED"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(TASK_SORT_PRIORITY[order[i]]).toBeLessThan(TASK_SORT_PRIORITY[order[i + 1]]);
    }
  });
});
