import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    facility: { findMany: vi.fn(), update: vi.fn() },
    taskRule: { findMany: vi.fn() },
    ruleInstance: {
      findMany: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: { deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/google-sheets-fetcher", () => ({
  fetchSheetRows: vi.fn(),
  invalidateSheetCache: vi.fn(),
}));

vi.mock("@/lib/sheet-parser", () => ({
  parseDaysInRange: vi.fn(),
}));

vi.mock("@/lib/pacific-time", () => ({
  getPacificToday: vi.fn(() => "2026-11-17"),
  addDaysToDateStr: vi.fn((date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }),
}));

import { generateCalendarInstances } from "@/lib/calendar-generator";
import { prisma } from "@/lib/prisma";
import { fetchSheetRows } from "@/lib/google-sheets-fetcher";
import { parseDaysInRange } from "@/lib/sheet-parser";

type MockFn = ReturnType<typeof vi.fn>;

const mp = prisma as unknown as {
  facility: { findMany: MockFn; update: MockFn };
  taskRule: { findMany: MockFn };
  ruleInstance: {
    findMany: MockFn;
    count: MockFn;
    createMany: MockFn;
    deleteMany: MockFn;
    updateMany: MockFn;
  };
  notification: { deleteMany: MockFn };
};

const mockFetchSheetRows = fetchSheetRows as MockFn;
const mockParseDaysInRange = parseDaysInRange as MockFn;

const FAC = { id: "fac1", name: "624", calendarTabName: "624 Calendar" };
const RULE = { id: "rule1", triggerType: "PRODUCTION_DAY", productName: null, ownerId: "owner1", facilityId: "fac1" };

function makeInst(overrides: Partial<{
  id: string; ruleId: string; calendarKey: string; status: string;
  ownerUserId: string | null; completedBySubmissionId: string | null;
}>) {
  return {
    id: "inst1",
    ruleId: "rule1",
    calendarKey: "day:2026-11-18",
    status: "UPCOMING",
    ownerUserId: null,
    completedBySubmissionId: null,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.GOOGLE_SHEETS_API_KEY = "test-key";
  vi.clearAllMocks();
  mp.facility.findMany.mockResolvedValue([FAC]);
  mp.taskRule.findMany.mockResolvedValue([RULE]);
  mp.ruleInstance.findMany.mockResolvedValue([]);
  mp.ruleInstance.count.mockResolvedValue(0);
  mp.ruleInstance.createMany.mockResolvedValue({ count: 0 });
  mp.ruleInstance.deleteMany.mockResolvedValue({ count: 0 });
  mp.ruleInstance.updateMany.mockResolvedValue({ count: 0 });
  mp.notification.deleteMany.mockResolvedValue({ count: 0 });
  mp.facility.update.mockResolvedValue({});
  mockFetchSheetRows.mockResolvedValue({ rows: [] });
  // Sheet only has today in window — inst1's key (day:2026-11-18) is NOT expected
  mockParseDaysInRange.mockReturnValue([
    { iso_date: "2026-11-17", items: [{ item_type: "production", product_name: "Bread" }] },
  ]);
});

// ── DELETE behavior ───────────────────────────────────────────────────────────

describe("delete instead of skip", () => {
  it("deletes UPCOMING instance whose key is no longer expected", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "UPCOMING" })]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(mp.notification.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { instanceId: { in: ["inst1"] } } })
    );
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["inst1"] } } })
    );
  });

  it("deletes DUE_TODAY instance with no linked submission", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "DUE_TODAY" })]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalled();
  });

  it("deletes OVERDUE instance with no linked submission", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "OVERDUE" })]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalled();
  });

  it("deletes Notifications before RuleInstance (order check)", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "UPCOMING" })]);
    const callOrder: string[] = [];
    mp.notification.deleteMany.mockImplementation(() => { callOrder.push("notification"); return Promise.resolve({ count: 0 }); });
    mp.ruleInstance.deleteMany.mockImplementation(() => { callOrder.push("instance"); return Promise.resolve({ count: 0 }); });
    await generateCalendarInstances();
    expect(callOrder).toEqual(["notification", "instance"]);
  });

  it("does NOT call deleteMany when no instances to delete", async () => {
    // All existing instances match expected keys — nothing stale
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ calendarKey: "day:2026-11-17", status: "DUE_TODAY" }),
    ]);
    await generateCalendarInstances();
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
    expect(mp.notification.deleteMany).not.toHaveBeenCalled();
  });

  it("does NOT delete in dryRun mode", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "UPCOMING" })]);
    const result = await generateCalendarInstances({ dryRun: true });
    expect(result.totalDeleted).toBe(1);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
    expect(mp.notification.deleteMany).not.toHaveBeenCalled();
  });

  it("reports correct deleted count in result per facility", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ id: "inst1", status: "UPCOMING" }),
      makeInst({ id: "inst2", calendarKey: "day:2026-11-19", status: "OVERDUE" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(2);
    expect(result.results[0].deleted).toBe(2);
  });
});

// ── SKIP / MISSED — leave alone ───────────────────────────────────────────────

describe("leave SKIPPED/MISSED instances untouched", () => {
  it("does NOT delete a SKIPPED instance", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "SKIPPED" })]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(0);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });

  it("does NOT flag a SKIPPED instance", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "SKIPPED" })]);
    const result = await generateCalendarInstances();
    expect(result.totalFlagged).toBe(0);
    expect(mp.ruleInstance.updateMany).not.toHaveBeenCalled();
  });

  it("does NOT delete a MISSED instance", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "MISSED" })]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(0);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });
});

// ── FLAG behavior ─────────────────────────────────────────────────────────────

describe("flag instead of delete for in-progress/done/linked", () => {
  it("flags IN_PROGRESS instance for admin review", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "IN_PROGRESS" })]);
    const result = await generateCalendarInstances();
    expect(result.totalFlagged).toBe(1);
    expect(mp.ruleInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["inst1"] } },
        data: expect.objectContaining({ needsAdminReview: true }),
      })
    );
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });

  it("flags DONE instance for admin review", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "DONE" })]);
    const result = await generateCalendarInstances();
    expect(result.totalFlagged).toBe(1);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });

  it("flags UPCOMING instance with linked submission (completedBySubmissionId set)", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ status: "UPCOMING", completedBySubmissionId: "sub-abc" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalFlagged).toBe(1);
    expect(result.totalDeleted).toBe(0);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });

  it("does NOT flag in dryRun mode but counts it", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([makeInst({ status: "IN_PROGRESS" })]);
    const result = await generateCalendarInstances({ dryRun: true });
    expect(result.totalFlagged).toBe(1);
    expect(mp.ruleInstance.updateMany).not.toHaveBeenCalled();
  });
});

// ── Mixed batch ───────────────────────────────────────────────────────────────

describe("mixed batch", () => {
  it("deletes deletable, flags flaggable, leaves SKIPPED alone", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ id: "del1", status: "UPCOMING" }),
      makeInst({ id: "flag1", calendarKey: "day:2026-11-20", status: "IN_PROGRESS" }),
      makeInst({ id: "skip1", calendarKey: "day:2026-11-21", status: "SKIPPED" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(result.totalFlagged).toBe(1);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["del1"] } } })
    );
    expect(mp.ruleInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["flag1"] } } })
    );
  });
});

// ── PRODUCTION_ANY — batch-sheet rule types ───────────────────────────────────

describe("PRODUCTION_ANY rule type", () => {
  const ANY_RULE = { id: "rule-any", triggerType: "PRODUCTION_ANY", productName: null, ownerId: "owner1", facilityId: "fac1" };

  beforeEach(() => {
    mp.taskRule.findMany.mockResolvedValue([ANY_RULE]);
    // Sheet has one production item on today — bread at index 0
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-17", items: [{ item_type: "production", product_name: "Bread" }] },
    ]);
  });

  it("deletes UPCOMING instance when production day is removed from sheet", async () => {
    // Sheet now has NO days in range — bread day was deleted
    mockParseDaysInRange.mockReturnValue([]);
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ ruleId: "rule-any", calendarKey: "prod:2026-11-18:bread:0", status: "UPCOMING" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalled();
  });

  it("deletes UPCOMING instance when production day is moved to a different date (624 facility)", async () => {
    // Instance was for 2026-11-18; sheet now shows 2026-11-20 instead
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-20", items: [{ item_type: "production", product_name: "Bread" }] },
    ]);
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ ruleId: "rule-any", calendarKey: "prod:2026-11-18:bread:0", status: "UPCOMING" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalled();
  });

  it("deletes UPCOMING instance when production day is moved (Julian Bakery facility)", async () => {
    const JB_FAC = { id: "fac2", name: "Julian Bakery", calendarTabName: "JB Calendar" };
    mp.facility.findMany.mockResolvedValue([JB_FAC]);
    mp.taskRule.findMany.mockResolvedValue([{ ...ANY_RULE, facilityId: "fac2" }]);
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-21", items: [{ item_type: "production", product_name: "Croissant" }] },
    ]);
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ ruleId: "rule-any", calendarKey: "prod:2026-11-19:croissant:0", status: "UPCOMING" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalled();
  });

  it("does NOT delete instance whose key still matches expected", async () => {
    // Sheet has bread on 2026-11-17 → key prod:2026-11-17:bread:0 is still expected
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ ruleId: "rule-any", calendarKey: "prod:2026-11-17:bread:0", status: "UPCOMING" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(0);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });
});

// ── PRODUCTION_PRODUCT — specific product rule type ───────────────────────────

describe("PRODUCTION_PRODUCT rule type", () => {
  const PROD_RULE = { id: "rule-prod", triggerType: "PRODUCTION_PRODUCT", productName: "Bread", ownerId: "owner1", facilityId: "fac1" };

  beforeEach(() => {
    mp.taskRule.findMany.mockResolvedValue([PROD_RULE]);
  });

  it("deletes UPCOMING instance when matching product is removed from a day", async () => {
    // Sheet now has the day but no bread — only croissant
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-17", items: [{ item_type: "production", product_name: "Croissant" }] },
    ]);
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ ruleId: "rule-prod", calendarKey: "prod:2026-11-17:bread:0", status: "UPCOMING" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalled();
  });

  it("deletes UPCOMING instance when entire production day containing the product is removed", async () => {
    mockParseDaysInRange.mockReturnValue([]);
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ ruleId: "rule-prod", calendarKey: "prod:2026-11-18:bread:0", status: "UPCOMING" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(1);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalled();
  });

  it("does NOT delete instance when product is still on that day", async () => {
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-17", items: [{ item_type: "production", product_name: "Bread" }] },
    ]);
    mp.ruleInstance.findMany.mockResolvedValue([
      makeInst({ ruleId: "rule-prod", calendarKey: "prod:2026-11-17:bread:0", status: "UPCOMING" }),
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalDeleted).toBe(0);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });
});

// ── Zero-days safety guard still fires ────────────────────────────────────────

describe("zero-days safety guard", () => {
  it("aborts reconciliation when zero production days but active instances exist", async () => {
    mockParseDaysInRange.mockReturnValue([]);
    mp.ruleInstance.count.mockResolvedValue(3);
    const result = await generateCalendarInstances();
    expect(result.results[0].error).toMatch(/Zero production days/);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });

  it("proceeds normally when zero production days and no active instances", async () => {
    mockParseDaysInRange.mockReturnValue([]);
    mp.ruleInstance.count.mockResolvedValue(0);
    const result = await generateCalendarInstances();
    expect(result.results[0].error).toBeUndefined();
  });
});
