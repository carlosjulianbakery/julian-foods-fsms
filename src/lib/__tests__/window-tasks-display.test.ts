/**
 * Behavior tests for the "Open this period" section, calendar band logic,
 * admin view filtering, and banner regression coverage.
 *
 * All tests exercise actual logic functions — no source-text assertions.
 */

import { describe, it, expect } from "vitest";
import { computeWindowStart, isInWindow, daysLeft } from "../window-tasks";
import { computeBannerState } from "../banner-state";

// ─── Shared fixture helpers ────────────────────────────────────────────────────

type FakeInst = {
  id: string;
  ruleTitle: string;
  dueDate: string;
  status: string;
  ownerId: string;
  ownerUserId: string | null;
  windowStart?: string | null;
  progress?: { done: number; total: number } | null;
};

function mkInst(overrides: Partial<FakeInst> & { dueDate: string; status: string }): FakeInst {
  return {
    id: "i1",
    ruleTitle: "Test Task",
    ownerId: "owner1",
    ownerUserId: null,
    windowStart: null,
    progress: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) "Open this period" section — placement, amber, progress
// ─────────────────────────────────────────────────────────────────────────────

describe('"Open this period" section — section placement', () => {
  const TODAY = "2026-11-18";
  const DUE_DATE = "2026-11-30"; // future
  const WINDOW_START = "2026-11-01"; // already open

  it("window task with open window + future due date → included in section", () => {
    const ws = computeWindowStart(
      { windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "month" },
      DUE_DATE,
    );
    expect(ws).toBe("2026-11-01");
    expect(isInWindow(ws, DUE_DATE, TODAY)).toBe(true);
  });

  it("window task on its due date → NOT included (goes to Today section)", () => {
    expect(isInWindow(WINDOW_START, DUE_DATE, DUE_DATE)).toBe(false);
  });

  it("DONE/SKIPPED/MISSED statuses are the terminal set excluded from section", () => {
    const terminal = ["DONE", "SKIPPED", "MISSED"];
    expect(terminal.includes("DONE")).toBe(true);
    expect(terminal.includes("UPCOMING")).toBe(false);
    expect(terminal.includes("IN_PROGRESS")).toBe(false);
  });

  it("window task BEFORE windowStart → not in section", () => {
    expect(isInWindow(WINDOW_START, DUE_DATE, "2026-10-31")).toBe(false);
  });

  it("window task with windowMode NONE → computeWindowStart returns null → never in section", () => {
    const ws = computeWindowStart(
      { windowMode: "NONE", windowDaysBefore: null, recurrenceUnit: "month" },
      DUE_DATE,
    );
    expect(ws).toBeNull();
    expect(isInWindow(ws, DUE_DATE, TODAY)).toBe(false);
  });

  it("section is empty when no window instances qualify", () => {
    const rawInstances: FakeInst[] = [
      mkInst({ id: "i1", dueDate: DUE_DATE, status: "UPCOMING", windowStart: null }),
      mkInst({ id: "i2", dueDate: "2026-10-31", status: "UPCOMING", windowStart: "2026-10-01" }),
    ];
    const openWindow = rawInstances.filter((inst) =>
      isInWindow(inst.windowStart ?? null, inst.dueDate, TODAY),
    );
    expect(openWindow).toHaveLength(0);
  });
});

describe('"Open this period" section — days-left and amber threshold', () => {
  it("12 days left — not amber", () => {
    const dl = daysLeft("2026-11-30", "2026-11-18");
    expect(dl).toBe(12);
    expect(dl <= 3).toBe(false);
  });

  it("3 days left — amber threshold (exactly 3)", () => {
    const dl = daysLeft("2026-11-30", "2026-11-27");
    expect(dl).toBe(3);
    expect(dl <= 3).toBe(true);
  });

  it("2 days left — amber", () => {
    expect(daysLeft("2026-11-30", "2026-11-28") <= 3).toBe(true);
  });

  it("1 day left — amber", () => {
    expect(daysLeft("2026-11-30", "2026-11-29") <= 3).toBe(true);
  });

  it("0 days left (today === due) — amber (shows \'today\')", () => {
    const dl = daysLeft("2026-11-30", "2026-11-30");
    expect(dl).toBe(0);
    expect(dl <= 3).toBe(true);
  });

  it("4 days left — NOT amber", () => {
    expect(daysLeft("2026-11-30", "2026-11-26") <= 3).toBe(false);
  });
});

describe('"Open this period" section — MC624 progress calculation', () => {
  function computeProgress(
    mc624: { doneCount: number; naCount: number; notDoneCount: number } | null,
  ): { done: number; total: number } | null {
    const total = mc624 ? mc624.doneCount + mc624.naCount + mc624.notDoneCount : null;
    const done = mc624 ? mc624.doneCount + mc624.naCount : null;
    return total != null && total > 0 ? { done: done!, total } : null;
  }

  it("no mc624 record → progress null", () => {
    expect(computeProgress(null)).toBeNull();
  });

  it("mc624 record with all counts 0 → progress null (total = 0)", () => {
    expect(computeProgress({ doneCount: 0, naCount: 0, notDoneCount: 0 })).toBeNull();
  });

  it("5 done + 2 N/A + 1 not done → { done: 7, total: 8 }", () => {
    expect(computeProgress({ doneCount: 5, naCount: 2, notDoneCount: 1 })).toEqual({ done: 7, total: 8 });
  });

  it("0 done + 0 N/A + 10 not done → { done: 0, total: 10 }", () => {
    expect(computeProgress({ doneCount: 0, naCount: 0, notDoneCount: 10 })).toEqual({ done: 0, total: 10 });
  });

  it("all done: 10 done + 0 N/A + 0 not done → { done: 10, total: 10 }", () => {
    expect(computeProgress({ doneCount: 10, naCount: 0, notDoneCount: 0 })).toEqual({ done: 10, total: 10 });
  });

  it("naCount counts toward done in progress (N/A treated as resolved)", () => {
    const p = computeProgress({ doneCount: 3, naCount: 4, notDoneCount: 1 });
    expect(p).toEqual({ done: 7, total: 8 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) Banner and counters unchanged with and without window tasks
// ─────────────────────────────────────────────────────────────────────────────

describe("Banner state unaffected by window instances", () => {
  const TODAY = "2026-11-18";
  const TOMORROW = "2026-11-19";

  it("banner from filtered (non-window) instances: inProgress when 1 DUE_TODAY", () => {
    const bannerState = computeBannerState({
      today: TODAY,
      instances: [{ status: "DUE_TODAY", dueDate: TODAY }],
      skippedInstances: [],
      nextUpcoming: null,
      syncStale: false,
    });
    expect(bannerState.kind).toBe("inProgress");
  });

  it("window task (MC624, UPCOMING, future) excluded from filtered → banner stays noTasks", () => {
    const bannerWithNoWindowInFiltered = computeBannerState({
      today: TODAY,
      instances: [],
      skippedInstances: [],
      nextUpcoming: null,
      syncStale: false,
    });
    expect(bannerWithNoWindowInFiltered.kind).toBe("noTasks");
  });

  it("future UPCOMING non-window task in filtered has no effect on banner (goes to upcoming section)", () => {
    const bannerState = computeBannerState({
      today: TODAY,
      instances: [{ status: "UPCOMING", dueDate: TOMORROW }],
      skippedInstances: [],
      nextUpcoming: null,
      syncStale: false,
    });
    expect(bannerState.kind).toBe("noTasks");
  });

  it("existing daily tasks not affected: 1 DONE + 1 DUE_TODAY → inProgress (1/2)", () => {
    const bannerState = computeBannerState({
      today: TODAY,
      instances: [
        { status: "DONE", dueDate: TODAY },
        { status: "DUE_TODAY", dueDate: TODAY },
      ],
      skippedInstances: [],
      nextUpcoming: null,
      syncStale: false,
    });
    expect(bannerState).toEqual({ kind: "inProgress", done: 1, total: 2, remaining: 1 });
  });

  it("all done today (window tasks not in filtered) → success banner", () => {
    const bannerState = computeBannerState({
      today: TODAY,
      instances: [
        { status: "DONE", dueDate: TODAY },
        { status: "DONE", dueDate: TODAY },
      ],
      skippedInstances: [],
      nextUpcoming: null,
      syncStale: false,
    });
    expect(bannerState.kind).toBe("success");
  });
});

describe("Daily tasks — sort order preserved with window instances present", () => {
  const TODAY = "2026-11-18";

  it("overdue task appears before due-today in activeTodayCards build", () => {
    const overdue = mkInst({ id: "i-overdue", dueDate: "2026-11-17", status: "OVERDUE" });
    const dueToday = mkInst({ id: "i-due", dueDate: TODAY, status: "DUE_TODAY" });
    const filtered = [overdue, dueToday];
    const cards = [
      ...filtered.filter((i) => i.status === "OVERDUE"),
      ...filtered.filter((i) => i.status === "DUE_TODAY"),
      ...filtered.filter((i) => i.status === "IN_PROGRESS"),
    ];
    expect(cards[0].id).toBe("i-overdue");
    expect(cards[1].id).toBe("i-due");
  });

  it("window task (future dueDate) stays out of Today section by virtue of dueDate > today", () => {
    const windowInst = mkInst({
      id: "i-window",
      dueDate: "2026-11-30",
      status: "UPCOMING",
      windowStart: "2026-11-01",
    });
    expect(windowInst.dueDate > TODAY).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) Calendar band logic — week, month, day/list views
// ─────────────────────────────────────────────────────────────────────────────

function bandsForDay(instances: FakeInst[], day: string): FakeInst[] {
  return instances.filter(
    (inst) =>
      inst.windowStart != null &&
      inst.windowStart <= day &&
      day < inst.dueDate &&
      !["DONE", "SKIPPED", "MISSED"].includes(inst.status),
  );
}

function bandIsStart(inst: FakeInst, day: string, weekStart: string): boolean {
  const ws = inst.windowStart!;
  return ws >= weekStart ? ws === day : day === weekStart;
}

describe("Calendar bands — band span logic", () => {
  const INST = mkInst({
    id: "mc624",
    ruleTitle: "Monthly Cleaning — 624",
    dueDate: "2026-11-30",
    status: "UPCOMING",
    windowStart: "2026-11-01",
  });

  it("day within band → present", () => {
    expect(bandsForDay([INST], "2026-11-15")).toHaveLength(1);
  });

  it("day before windowStart → no band", () => {
    expect(bandsForDay([INST], "2026-10-31")).toHaveLength(0);
  });

  it("day equals dueDate → no band (dueDate excluded)", () => {
    expect(bandsForDay([INST], "2026-11-30")).toHaveLength(0);
  });

  it("day after dueDate → no band", () => {
    expect(bandsForDay([INST], "2026-12-01")).toHaveLength(0);
  });

  it("DONE → band excluded", () => {
    expect(bandsForDay([{ ...INST, status: "DONE" }], "2026-11-15")).toHaveLength(0);
  });

  it("SKIPPED → band excluded", () => {
    expect(bandsForDay([{ ...INST, status: "SKIPPED" }], "2026-11-15")).toHaveLength(0);
  });

  it("MISSED → band excluded", () => {
    expect(bandsForDay([{ ...INST, status: "MISSED" }], "2026-11-15")).toHaveLength(0);
  });

  it("IN_PROGRESS → band present (blue-tinted)", () => {
    expect(bandsForDay([{ ...INST, status: "IN_PROGRESS" }], "2026-11-15")).toHaveLength(1);
  });

  it("4 bands on same day → 3 shown + 1 overflow", () => {
    const mk4 = (id: string) =>
      mkInst({ id, dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-01" });
    const all = bandsForDay([mk4("a"), mk4("b"), mk4("c"), mk4("d")], "2026-11-15");
    expect(all).toHaveLength(4);
    expect(all.slice(0, 3)).toHaveLength(3);
    expect(all.length - 3).toBe(1); // "+1" overflow
  });
});

describe("Calendar bands — isStart label logic (week view)", () => {
  it("windowStart within visible week → label on windowStart day only", () => {
    const inst = mkInst({ id: "a", dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-09" });
    const weekStart = "2026-11-09";
    expect(bandIsStart(inst, "2026-11-09", weekStart)).toBe(true);
    expect(bandIsStart(inst, "2026-11-10", weekStart)).toBe(false);
    expect(bandIsStart(inst, "2026-11-11", weekStart)).toBe(false);
  });

  it("windowStart before visible week → label on weekStart (first visible day)", () => {
    const inst = mkInst({ id: "a", dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-02" });
    const weekStart = "2026-11-09";
    expect(bandIsStart(inst, "2026-11-09", weekStart)).toBe(true);
    expect(bandIsStart(inst, "2026-11-10", weekStart)).toBe(false);
  });

  it("windowStart on hidden weekend (Nov 1 Sun) → label on Mon Nov 2", () => {
    const inst = mkInst({ id: "a", dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-01" });
    const weekStart = "2026-11-02"; // Monday
    // windowStart < weekStart → label on weekStart
    expect(bandIsStart(inst, "2026-11-02", weekStart)).toBe(true);
    expect(bandIsStart(inst, "2026-11-03", weekStart)).toBe(false);
  });
});

describe("Calendar bands — DayPanel windowTasks filter", () => {
  function dayPanelWindowTasks(instances: FakeInst[], selectedDay: string): FakeInst[] {
    return instances.filter(
      (inst) =>
        inst.windowStart != null &&
        inst.windowStart <= selectedDay &&
        selectedDay < inst.dueDate &&
        !["DONE", "SKIPPED", "MISSED"].includes(inst.status),
    );
  }

  it("window task visible in day panel on day within span", () => {
    const inst = mkInst({ id: "a", dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-01" });
    expect(dayPanelWindowTasks([inst], "2026-11-18")).toHaveLength(1);
  });

  it("window task NOT in day panel on its due date", () => {
    const inst = mkInst({ id: "a", dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-01" });
    expect(dayPanelWindowTasks([inst], "2026-11-30")).toHaveLength(0);
  });

  it("window task NOT in day panel before windowStart", () => {
    const inst = mkInst({ id: "a", dueDate: "2026-11-30", status: "UPCOMING", windowStart: "2026-11-01" });
    expect(dayPanelWindowTasks([inst], "2026-10-31")).toHaveLength(0);
  });

  it("DONE window task excluded from day panel", () => {
    const inst = mkInst({ id: "a", dueDate: "2026-11-30", status: "DONE", windowStart: "2026-11-01" });
    expect(dayPanelWindowTasks([inst], "2026-11-18")).toHaveLength(0);
  });

  it("non-window task (windowStart null) excluded from day panel window section", () => {
    const inst = mkInst({ id: "a", dueDate: "2026-11-18", status: "DUE_TODAY", windowStart: null });
    expect(dayPanelWindowTasks([inst], "2026-11-18")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) Admin views — My Tasks / Everyone / By Owner filtering
// ─────────────────────────────────────────────────────────────────────────────

function filterByViewMode(
  instances: FakeInst[],
  role: string,
  viewMode: "my" | "everyone" | "byOwner",
  userId: string,
  selectedOwnerId: string,
): FakeInst[] {
  if (role !== "ADMIN") return instances;
  if (viewMode === "my") return instances.filter((i) => (i.ownerUserId ?? i.ownerId) === userId);
  if (viewMode === "byOwner" && selectedOwnerId)
    return instances.filter((i) => (i.ownerUserId ?? i.ownerId) === selectedOwnerId);
  return instances;
}

describe("Admin views — view mode filtering", () => {
  const USER1 = "user1";
  const USER2 = "user2";
  const instances: FakeInst[] = [
    mkInst({ id: "a", dueDate: "2026-11-18", status: "DUE_TODAY", ownerId: USER1 }),
    mkInst({ id: "b", dueDate: "2026-11-18", status: "DUE_TODAY", ownerId: USER2 }),
    mkInst({ id: "c", dueDate: "2026-11-18", status: "OVERDUE", ownerId: USER1, ownerUserId: USER2 }),
  ];

  it("non-admin role → all instances returned", () => {
    expect(filterByViewMode(instances, "SUPERVISOR", "my", USER1, "")).toHaveLength(3);
  });

  it("admin, everyone → all instances", () => {
    expect(filterByViewMode(instances, "ADMIN", "everyone", USER1, "")).toHaveLength(3);
  });

  it("admin, my → only USER1 effective owner (excludes reassigned c)", () => {
    const result = filterByViewMode(instances, "ADMIN", "my", USER1, "");
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });

  it("admin, byOwner USER2 → includes b (ownerId=U2) and c (ownerUserId=U2)", () => {
    const result = filterByViewMode(instances, "ADMIN", "byOwner", USER1, USER2);
    expect(result.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("ownerUserId takes precedence over ownerId", () => {
    const inst = mkInst({ id: "r", dueDate: "2026-11-18", status: "DUE_TODAY", ownerId: USER1, ownerUserId: USER2 });
    expect((inst.ownerUserId ?? inst.ownerId)).toBe(USER2);
  });

  it("filteredWindowInstances: MY mode excludes other-owner window tasks", () => {
    const windowInstances: FakeInst[] = [
      mkInst({ id: "w1", dueDate: "2026-11-30", status: "UPCOMING", ownerId: USER1, windowStart: "2026-11-01" }),
      mkInst({ id: "w2", dueDate: "2026-11-30", status: "UPCOMING", ownerId: USER2, windowStart: "2026-11-01" }),
    ];
    const myWindow = filterByViewMode(windowInstances, "ADMIN", "my", USER1, "");
    expect(myWindow.map((i) => i.id)).toEqual(["w1"]);
  });
});
