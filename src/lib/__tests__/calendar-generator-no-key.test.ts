import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all external deps before importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    facility: { findMany: vi.fn(), update: vi.fn() },
    taskRule: { findMany: vi.fn() },
    ruleInstance: { findMany: vi.fn(), count: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    taskInstanceAudit: { create: vi.fn() },
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

const mockPrisma = prisma as unknown as {
  facility: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  taskRule: { findMany: ReturnType<typeof vi.fn> };
  ruleInstance: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  taskInstanceAudit: { create: ReturnType<typeof vi.fn> };
};

const mockFetchSheetRows = fetchSheetRows as ReturnType<typeof vi.fn>;
const mockParseDaysInRange = parseDaysInRange as ReturnType<typeof vi.fn>;

const ORIGINAL_ENV = process.env.GOOGLE_SHEETS_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.facility.findMany.mockResolvedValue([]);
  mockPrisma.taskRule.findMany.mockResolvedValue([]);
  mockPrisma.ruleInstance.findMany.mockResolvedValue([]);
  mockPrisma.ruleInstance.count.mockResolvedValue(0);
  mockPrisma.ruleInstance.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.facility.update.mockResolvedValue({});
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.GOOGLE_SHEETS_API_KEY;
  } else {
    process.env.GOOGLE_SHEETS_API_KEY = ORIGINAL_ENV;
  }
});

// --- API key guard ---

describe("API key guard", () => {
  it("throws immediately when GOOGLE_SHEETS_API_KEY is absent", async () => {
    delete process.env.GOOGLE_SHEETS_API_KEY;
    await expect(generateCalendarInstances()).rejects.toThrow(
      "GOOGLE_SHEETS_API_KEY is not set"
    );
  });

  it("does NOT call prisma when key is missing", async () => {
    delete process.env.GOOGLE_SHEETS_API_KEY;
    await expect(generateCalendarInstances()).rejects.toThrow();
    expect(mockPrisma.facility.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.taskRule.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.ruleInstance.createMany).not.toHaveBeenCalled();
  });

  it("does NOT write any instances when key is missing (facility+rule configured)", async () => {
    delete process.env.GOOGLE_SHEETS_API_KEY;
    mockPrisma.facility.findMany.mockResolvedValue([
      { id: "fac1", name: "624", calendarTabName: "624 Calendar" },
    ]);
    mockPrisma.taskRule.findMany.mockResolvedValue([
      { id: "rule1", triggerType: "PRODUCTION_DAY", productName: null, ownerId: "owner1", facilityId: "fac1" },
    ]);
    await expect(generateCalendarInstances()).rejects.toThrow();
    expect(mockPrisma.ruleInstance.createMany).not.toHaveBeenCalled();
  });
});

// --- Sheet fetch error ---

describe("Sheet fetch error", () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEETS_API_KEY = "test-key";
    mockPrisma.facility.findMany.mockResolvedValue([
      { id: "fac1", name: "624", calendarTabName: "624 Calendar" },
    ]);
    mockPrisma.taskRule.findMany.mockResolvedValue([
      { id: "rule1", triggerType: "PRODUCTION_DAY", productName: null, ownerId: "owner1", facilityId: "fac1" },
    ]);
  });

  it("records error on the facility result when fetch throws", async () => {
    mockFetchSheetRows.mockRejectedValue(new Error("API quota exceeded"));
    const result = await generateCalendarInstances();
    expect(result.totalCreated).toBe(0);
    expect(result.results[0].error).toMatch(/Fetch failed/);
    expect(result.results[0].error).toMatch(/API quota exceeded/);
  });

  it("does NOT create any instances when fetch throws", async () => {
    mockFetchSheetRows.mockRejectedValue(new Error("Network error"));
    await generateCalendarInstances();
    expect(mockPrisma.ruleInstance.createMany).not.toHaveBeenCalled();
  });

  it("records lastCalendarSyncError on the facility when fetch throws", async () => {
    mockFetchSheetRows.mockRejectedValue(new Error("Timeout"));
    await generateCalendarInstances();
    expect(mockPrisma.facility.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastCalendarSyncError: expect.any(String) }),
      })
    );
  });
});

// --- Normal path ---

describe("Normal path (key present, fetch succeeds)", () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEETS_API_KEY = "test-key";
    mockPrisma.facility.findMany.mockResolvedValue([
      { id: "fac1", name: "624", calendarTabName: "624 Calendar" },
    ]);
    mockPrisma.taskRule.findMany.mockResolvedValue([
      { id: "rule1", triggerType: "PRODUCTION_DAY", productName: null, ownerId: "owner1", facilityId: "fac1" },
    ]);
    mockFetchSheetRows.mockResolvedValue({ rows: [["header"]] });
    mockPrisma.ruleInstance.findMany.mockResolvedValue([]);
  });

  it("creates instances for PRODUCTION_DAY on days with production items", async () => {
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-17", items: [{ item_type: "production", product_name: "Bread" }] },
      { iso_date: "2026-11-18", items: [{ item_type: "production", product_name: "Muffins" }] },
    ]);
    mockPrisma.ruleInstance.createMany.mockResolvedValue({ count: 2 });

    const result = await generateCalendarInstances();

    expect(result.totalCreated).toBe(2);
    expect(mockPrisma.ruleInstance.createMany).toHaveBeenCalledOnce();
    const callArg = mockPrisma.ruleInstance.createMany.mock.calls[0][0];
    expect(callArg.data).toHaveLength(2);
    expect(callArg.data[0].status).toBe("DUE_TODAY");
    expect(callArg.data[1].status).toBe("UPCOMING");
  });

  it("skips days with no production items", async () => {
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-17", items: [{ item_type: "cleaning", product_name: "" }] },
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalCreated).toBe(0);
    expect(mockPrisma.ruleInstance.createMany).not.toHaveBeenCalled();
  });

  it("returns zero created for a facility with no rules", async () => {
    mockPrisma.taskRule.findMany.mockResolvedValue([]);
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-17", items: [{ item_type: "production", product_name: "Bread" }] },
    ]);
    const result = await generateCalendarInstances();
    expect(result.totalCreated).toBe(0);
  });
});

// --- Past-day behavior ---

describe("Past-day behavior (no look-back)", () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEETS_API_KEY = "test-key";
    mockPrisma.facility.findMany.mockResolvedValue([
      { id: "fac1", name: "624", calendarTabName: "624 Calendar" },
    ]);
    mockPrisma.taskRule.findMany.mockResolvedValue([
      { id: "rule1", triggerType: "PRODUCTION_DAY", productName: null, ownerId: "owner1", facilityId: "fac1" },
    ]);
    mockFetchSheetRows.mockResolvedValue({ rows: [] });
    mockPrisma.ruleInstance.findMany.mockResolvedValue([]);
  });

  it("does NOT create an instance for 2026-11-16 when today is 2026-11-17", async () => {
    // parseDaysInRange will only return dates in [today, today+7].
    // 11-16 is before today so it is never in the returned array.
    mockParseDaysInRange.mockReturnValue([
      { iso_date: "2026-11-17", items: [{ item_type: "production", product_name: "Bread" }] },
    ]);
    mockPrisma.ruleInstance.createMany.mockResolvedValue({ count: 1 });

    const result = await generateCalendarInstances();

    expect(result.totalCreated).toBe(1);
    const callArg = mockPrisma.ruleInstance.createMany.mock.calls[0][0];
    const dates = callArg.data.map((d: { dueDate: Date }) => d.dueDate.toISOString().slice(0, 10));
    expect(dates).not.toContain("2026-11-16");
  });

  it("parseDaysInRange is called with startDate = today, confirming no look-back", async () => {
    mockPrisma.taskRule.findMany.mockResolvedValue([]);
    mockParseDaysInRange.mockReturnValue([]);

    await generateCalendarInstances();

    expect(mockParseDaysInRange).toHaveBeenCalledOnce();
    const [, startDate] = mockParseDaysInRange.mock.calls[0];
    expect((startDate as Date).toISOString().slice(0, 10)).toBe("2026-11-17");
  });
});
