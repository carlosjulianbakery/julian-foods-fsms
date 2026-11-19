import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    facility: { findMany: vi.fn(), update: vi.fn() },
    taskRule: { findMany: vi.fn() },
    ruleInstance: { findMany: vi.fn(), count: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    notification: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/google-sheets-fetcher", () => ({ fetchSheetRows: vi.fn(), invalidateSheetCache: vi.fn() }));
vi.mock("@/lib/sheet-parser", () => ({ parseDaysInRange: vi.fn() }));
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
  ruleInstance: { findMany: MockFn; count: MockFn; createMany: MockFn; deleteMany: MockFn; updateMany: MockFn; update: MockFn };
  notification: { deleteMany: MockFn };
  $transaction: MockFn;
};

const FAC = { id: "fac-jb", name: "Julian Bakery", calendarTabName: "Julian Bakery" };
const BATCH = { id: "rule-batch", triggerType: "PRODUCTION_ANY", productName: null, ownerId: "ivan", facilityId: "fac-jb" };
const PREOP = { id: "rule-preop", triggerType: "PRODUCTION_DAY", productName: null, ownerId: "ivan", facilityId: "fac-jb" };
const prod = (name: string) => ({ item_type: "production", product_name: name, base_unit_count: null, base_unit_label: null });
// The day's sheet cell, top to bottom: a note line, premix, granola
const DAY = { iso_date: "2026-11-18", items: [{ item_type: "note", product_name: "Deep clean oven" }, prod("PreMix Powder - Egg Chocolate"), prod("ProGranola - Chocolate")] };

beforeEach(() => {
  process.env.GOOGLE_SHEETS_API_KEY = "test-key";
  vi.clearAllMocks();
  mp.facility.findMany.mockResolvedValue([FAC]);
  mp.taskRule.findMany.mockResolvedValue([BATCH, PREOP]);
  mp.ruleInstance.findMany.mockResolvedValue([]);
  mp.ruleInstance.count.mockResolvedValue(0);
  mp.ruleInstance.createMany.mockResolvedValue({ count: 3 });
  mp.ruleInstance.update.mockImplementation((args: unknown) => args);
  mp.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  mp.facility.update.mockResolvedValue({});
  (fetchSheetRows as MockFn).mockResolvedValue({ rows: [] });
  (parseDaysInRange as MockFn).mockReturnValue([DAY]);
});

describe("calendar generator — sortKey", () => {
  it("new batch sheet tasks get their position among the day's productions; once-a-day tasks get none", async () => {
    await generateCalendarInstances({});
    const created = mp.ruleInstance.createMany.mock.calls[0][0].data as { label: string; sortKey: number | null; calendarKey: string }[];
    expect(created.map((c) => [c.label, c.sortKey])).toEqual([
      ["PreMix Powder - Egg Chocolate", 0],
      ["ProGranola - Chocolate", 1],
      ["", null],
    ]);
    // the key's trailing number is the run of that product on that day, not the line position
    expect(created.map((c) => c.calendarKey)).toEqual([
      "prod:2026-11-18:premix-powder---egg-chocolate:0",
      "prod:2026-11-18:progranola---chocolate:0",
      "day:2026-11-18",
    ]);
  });

  it("an existing task with a missing or stale position is updated; a correct one is left alone", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([
      { id: "premix", ruleId: "rule-batch", calendarKey: "prod:2026-11-18:premix-powder---egg-chocolate:0", status: "UPCOMING", ownerUserId: null, completedBySubmissionId: null, sortKey: null },
      { id: "granola", ruleId: "rule-batch", calendarKey: "prod:2026-11-18:progranola---chocolate:1", status: "DONE", ownerUserId: null, completedBySubmissionId: "s1", sortKey: 1 },
      { id: "preop", ruleId: "rule-preop", calendarKey: "day:2026-11-18", status: "UPCOMING", ownerUserId: null, completedBySubmissionId: null, sortKey: null },
    ]);
    await generateCalendarInstances({});

    expect(mp.ruleInstance.createMany).not.toHaveBeenCalled();
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
    expect(mp.ruleInstance.update.mock.calls.map((c) => c[0])).toEqual([{ where: { id: "premix" }, data: { sortKey: 0 } }]);
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });

  it("nothing to correct → no write at all; dryRun never writes positions", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([
      { id: "premix", ruleId: "rule-batch", calendarKey: "prod:2026-11-18:premix-powder---egg-chocolate:0", status: "UPCOMING", ownerUserId: null, completedBySubmissionId: null, sortKey: 0 },
      { id: "granola", ruleId: "rule-batch", calendarKey: "prod:2026-11-18:progranola---chocolate:1", status: "UPCOMING", ownerUserId: null, completedBySubmissionId: null, sortKey: 1 },
      { id: "preop", ruleId: "rule-preop", calendarKey: "day:2026-11-18", status: "UPCOMING", ownerUserId: null, completedBySubmissionId: null },
    ]);
    await generateCalendarInstances({});
    expect(mp.$transaction).not.toHaveBeenCalled();

    mp.ruleInstance.findMany.mockResolvedValue([
      { id: "premix", ruleId: "rule-batch", calendarKey: "prod:2026-11-18:premix-powder---egg-chocolate:0", status: "UPCOMING", ownerUserId: null, completedBySubmissionId: null, sortKey: 7 },
    ]);
    await generateCalendarInstances({ dryRun: true });
    expect(mp.$transaction).not.toHaveBeenCalled();
  });
});
