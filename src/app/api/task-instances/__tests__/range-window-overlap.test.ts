import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { ruleInstance: { findMany: vi.fn() } } }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/task-instances/range/route";
import { windowOverlapsRange } from "@/lib/window-tasks";

type MockFn = ReturnType<typeof vi.fn>;
const findMany = (prisma as unknown as { ruleInstance: { findMany: MockFn } }).ruleInstance.findMany;

function dbRow(id: string, title: string, due: string, rule: { windowMode: string; windowDaysBefore?: number | null; recurrenceUnit?: string | null }, status = "UPCOMING") {
  return {
    id,
    dueDate: new Date(due + "T00:00:00Z"),
    status,
    label: "",
    source: "MANUAL",
    ownerUserId: null,
    needsAdminReview: false,
    reviewReason: null,
    doneBy: null,
    doneAt: null,
    completedLate: false,
    daysLate: null,
    missedReason: null,
    skipReason: null,
    skippedBy: null,
    skippedAt: null,
    sortKey: null,
    createdAt: new Date("2026-11-13T20:00:00Z"),
    rule: {
      sortOrder: null,
      createdAt: new Date("2026-11-11T20:00:00Z"),
      id: "r-" + id,
      title,
      ownerId: "user-ivan",
      formKey: null,
      facility: { id: "fac-jb", name: "Julian Bakery" },
      owner: { id: "user-ivan", name: "Ivan Torres" },
      windowMode: rule.windowMode,
      windowDaysBefore: rule.windowDaysBefore ?? null,
      recurrenceUnit: rule.recurrenceUnit ?? null,
    },
  };
}

async function getRange(from: string, to: string) {
  const res = await GET(new NextRequest(`http://localhost/api/task-instances/range?from=${from}&to=${to}&myOnly=0`));
  return (await res.json()) as { id: string; dueDate: string; windowStart: string | null }[];
}

beforeEach(() => {
  vi.clearAllMocks();
  // The route also asks for done window tasks (third query, see range-done-window.test.ts): none here
  findMany.mockReset();
  findMany.mockResolvedValue([]);
  (getServerSession as unknown as MockFn).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
});

describe("GET /api/task-instances/range — window tasks overlapping the range", () => {
  it("week 11/16–11/22 contains neither the window start (11/01) nor the due date (11/30) — the task is still returned", async () => {
    findMany
      .mockResolvedValueOnce([dbRow("daily", "Daily Cleaning", "2026-11-18", { windowMode: "NONE" })])
      .mockResolvedValueOnce([
        dbRow("monthly", "Monthly Cleaning", "2026-11-30", { windowMode: "PERIOD_START", recurrenceUnit: "month" }),
        dbRow("not-open-yet", "Audit prep", "2026-12-15", { windowMode: "DAYS_BEFORE", windowDaysBefore: 5 }),
      ]);

    const out = await getRange("2026-11-16", "2026-11-22");

    expect(out.map((i) => i.id)).toEqual(["daily", "monthly"]);
    expect(out[1]).toMatchObject({ dueDate: "2026-11-30", windowStart: "2026-11-01" });
  });

  it("the extra query asks only for open window-rule tasks due after the range", async () => {
    findMany.mockResolvedValue([]);
    await getRange("2026-11-16", "2026-11-22");

    expect(findMany).toHaveBeenCalledTimes(3);
    const and = findMany.mock.calls[1][0].where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ rule: { windowMode: { not: "NONE" } } });
    expect(and).toContainEqual({ dueDate: { gt: new Date("2026-11-22T23:59:59Z") } });
    expect(and).toContainEqual({ status: { notIn: ["DONE", "SKIPPED", "MISSED"] } });
  });

  it("a supervisor's extra query is restricted to their own tasks", async () => {
    (getServerSession as unknown as MockFn).mockResolvedValue({ user: { id: "user-ivan", role: "SUPERVISOR" } });
    findMany.mockResolvedValue([]);
    await getRange("2026-11-16", "2026-11-22");

    const and = findMany.mock.calls[1][0].where.AND as Record<string, unknown>[];
    expect(and[0]).toEqual({ OR: [{ ownerUserId: "user-ivan" }, { ownerUserId: null, rule: { ownerId: "user-ivan" } }] });
  });
});

describe("windowOverlapsRange", () => {
  const ws = "2026-11-01";
  const due = "2026-11-30";
  it("every week the window covers overlaps", () => {
    expect(windowOverlapsRange(ws, due, "2026-10-26", "2026-11-01")).toBe(true); // contains the start
    expect(windowOverlapsRange(ws, due, "2026-11-02", "2026-11-08")).toBe(true);
    expect(windowOverlapsRange(ws, due, "2026-11-16", "2026-11-22")).toBe(true); // neither start nor due
    expect(windowOverlapsRange(ws, due, "2026-11-23", "2026-11-29")).toBe(true);
  });
  it("ranges before the start or from the due date onward do not", () => {
    expect(windowOverlapsRange(ws, due, "2026-10-19", "2026-10-25")).toBe(false);
    expect(windowOverlapsRange(ws, due, "2026-11-30", "2026-12-06")).toBe(false);
    expect(windowOverlapsRange(ws, due, "2026-12-07", "2026-12-13")).toBe(false);
  });
  it("no window (null) or a zero-length window never overlaps", () => {
    expect(windowOverlapsRange(null, due, "2026-11-16", "2026-11-22")).toBe(false);
    expect(windowOverlapsRange("2026-12-01", "2026-12-01", "2026-11-30", "2026-12-06")).toBe(false);
  });
});
