import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    facility: {
      aggregate: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/calendar-generator", () => ({
  generateCalendarInstances: vi.fn(),
}));

vi.mock("@/lib/task-generator", () => ({
  updateStatuses: vi.fn().mockResolvedValue({ updated: 0 }),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { generateCalendarInstances } from "@/lib/calendar-generator";
import { updateStatuses } from "@/lib/task-generator";
import { POST } from "@/app/api/task-rules/sync/route";

type MockFn = ReturnType<typeof vi.fn>;

const mockGetSession = getServerSession as MockFn;
const mp = prisma as unknown as {
  facility: { aggregate: MockFn; updateMany: MockFn };
  $transaction: MockFn;
};
const mockGenerate = generateCalendarInstances as MockFn;

const NOW = new Date("2026-11-17T10:00:00Z");
const OLD_SYNC = new Date("2026-11-17T09:00:00Z"); // > 60s ago

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);

  mockGetSession.mockResolvedValue({ user: { id: "u1", role: "SUPERVISOR" } });
  mp.facility.aggregate
    .mockResolvedValueOnce({ _max: { lastCalendarSyncAt: OLD_SYNC } }) // throttle check
    .mockResolvedValueOnce({ _max: { lastCalendarSyncAt: NOW } });     // post-sync read
  mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<boolean>) => {
    const fakeTx = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ acquired: true }]),
      facility: { updateMany: vi.fn().mockResolvedValue({}) },
    };
    return fn(fakeTx);
  });
  mockGenerate.mockResolvedValue({
    results: [],
    totalCreated: 0,
    totalDeleted: 0,
    totalFlagged: 0,
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ran).toBe(false);
    expect(data.error).toMatch(/Unauthorized/i);
  });

  it("allows SUPERVISOR role (non-admin)", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it("allows ADMIN role", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    const res = await POST();
    expect(res.status).toBe(200);
  });
});

// ── Throttle ──────────────────────────────────────────────────────────────────

describe("throttle", () => {
  it("returns ran:false with reason:throttled when last sync was < 60s ago", async () => {
    const recentSync = new Date(NOW.getTime() - 10_000); // 10s ago
    mp.facility.aggregate.mockReset();
    mp.facility.aggregate.mockResolvedValueOnce({ _max: { lastCalendarSyncAt: recentSync } });
    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ran).toBe(false);
    expect(data.reason).toBe("throttled");
    expect(data.lastSyncAt).toBe(recentSync.toISOString());
  });

  it("proceeds when last sync was exactly 60s ago", async () => {
    const exactlyThrottle = new Date(NOW.getTime() - 60_000);
    mp.facility.aggregate.mockReset();
    mp.facility.aggregate
      .mockResolvedValueOnce({ _max: { lastCalendarSyncAt: exactlyThrottle } })
      .mockResolvedValueOnce({ _max: { lastCalendarSyncAt: NOW } });
    const res = await POST();
    const data = await res.json();
    expect(data.ran).toBe(true);
  });

  it("proceeds when lastCalendarSyncAt is null (never synced)", async () => {
    mp.facility.aggregate.mockReset();
    mp.facility.aggregate
      .mockResolvedValueOnce({ _max: { lastCalendarSyncAt: null } })
      .mockResolvedValueOnce({ _max: { lastCalendarSyncAt: NOW } });
    const res = await POST();
    const data = await res.json();
    expect(data.ran).toBe(true);
  });

  it("does NOT call generateCalendarInstances when throttled", async () => {
    const recentSync = new Date(NOW.getTime() - 5_000);
    mp.facility.aggregate.mockReset();
    mp.facility.aggregate.mockResolvedValueOnce({ _max: { lastCalendarSyncAt: recentSync } });
    await POST();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

// ── Advisory lock ─────────────────────────────────────────────────────────────

describe("advisory lock", () => {
  it("returns ran:false with reason:locked when pg_try_advisory_xact_lock returns false", async () => {
    mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<boolean>) => {
      const fakeTx = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ acquired: false }]),
        facility: { updateMany: vi.fn() },
      };
      return fn(fakeTx);
    });
    const res = await POST();
    const data = await res.json();
    expect(data.ran).toBe(false);
    expect(data.reason).toBe("locked");
  });

  it("does NOT call generateCalendarInstances when lock not acquired", async () => {
    mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<boolean>) => {
      const fakeTx = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ acquired: false }]),
        facility: { updateMany: vi.fn() },
      };
      return fn(fakeTx);
    });
    await POST();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

// ── Successful sync ───────────────────────────────────────────────────────────

describe("successful sync", () => {
  it("calls generateCalendarInstances with invalidateCache: false", async () => {
    await POST();
    expect(mockGenerate).toHaveBeenCalledWith({ invalidateCache: false });
  });

  it("returns ran:true with correct counts", async () => {
    mockGenerate.mockResolvedValue({
      results: [],
      totalCreated: 2,
      totalDeleted: 1,
      totalFlagged: 3,
    });
    mp.facility.aggregate.mockReset();
    mp.facility.aggregate
      .mockResolvedValueOnce({ _max: { lastCalendarSyncAt: OLD_SYNC } })
      .mockResolvedValueOnce({ _max: { lastCalendarSyncAt: NOW } });
    const res = await POST();
    const data = await res.json();
    expect(data.ran).toBe(true);
    expect(data.created).toBe(2);
    expect(data.deleted).toBe(1);
    expect(data.flagged).toBe(3);
    expect(data.lastSyncAt).toBe(NOW.toISOString());
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("returns 500 JSON (not bare throw) when generateCalendarInstances throws", async () => {
    mockGenerate.mockRejectedValue(new Error("Sheet fetch failed"));
    const res = await POST();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ran).toBe(false);
    expect(data.error).toMatch(/Internal server error/i);
  });

  it("returns 500 JSON when prisma throws", async () => {
    mp.facility.aggregate.mockReset();
    mp.facility.aggregate.mockRejectedValue(new Error("DB timeout"));
    const res = await POST();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/task-rules/sync — status promotion", () => {
  beforeEach(() => {
    (updateStatuses as MockFn).mockReset().mockResolvedValue({ updated: 2 });
  });

  it("promotes statuses on every call, even when the calendar sync itself is throttled", async () => {
    mp.facility.aggregate.mockReset().mockResolvedValue({ _max: { lastCalendarSyncAt: new Date(NOW.getTime() - 5_000) } });

    const res = await POST();
    const json = await res.json();

    expect(json).toMatchObject({ ran: false, reason: "throttled" });
    expect(updateStatuses).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("a promotion error does not break the sync", async () => {
    (updateStatuses as MockFn).mockRejectedValue(new Error("db hiccup"));
    const res = await POST();
    expect(res.status).toBe(200);
  });

  it("an unauthenticated call promotes nothing", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(updateStatuses).not.toHaveBeenCalled();
  });
});
