import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { ruleInstance: { findMany: vi.fn() } } }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/task-instances/range/route";

type MockFn = ReturnType<typeof vi.fn>;
const findMany = (prisma as unknown as { ruleInstance: { findMany: MockFn } }).ruleInstance.findMany;

interface RowOpts { windowMode?: string; recurrenceUnit?: string | null; windowDaysBefore?: number | null; status?: string; doneAt?: string | null; completedLate?: boolean; daysLate?: number | null }
function dbRow(id: string, title: string, due: string, o: RowOpts = {}) {
  return {
    id, dueDate: new Date(due + "T00:00:00Z"), status: o.status ?? "DONE", label: "", source: "MANUAL", ownerUserId: null,
    needsAdminReview: false, reviewReason: null,
    doneBy: o.doneAt ? { id: "user-hugo", name: "Hugo Ayala" } : null,
    doneAt: o.doneAt ? new Date(o.doneAt) : null,
    completedLate: o.completedLate ?? false, daysLate: o.daysLate ?? null,
    missedReason: null, skipReason: null, skippedBy: null, skippedAt: null, sortKey: null,
    createdAt: new Date("2026-11-13T20:00:00Z"),
    rule: {
      sortOrder: null, createdAt: new Date("2026-11-11T20:00:00Z"), id: "r-" + id, title, ownerId: "user-hugo", formKey: null,
      facility: { id: "fac-624", name: "624" }, owner: { id: "user-hugo", name: "Hugo Ayala" },
      windowMode: o.windowMode ?? "PERIOD_START", windowDaysBefore: o.windowDaysBefore ?? null, recurrenceUnit: o.recurrenceUnit ?? "week",
    },
  };
}
type Out = { id: string; dueDate: string; status: string; windowStart: string | null; doneAt: string | null; doneByName: string | null; completedLate: boolean; daysLate: number | null };
/** The three queries the route makes: due in the range, open window tasks due later, done window tasks not due in the range. */
async function getRange(from: string, to: string, db: { dueInRange?: unknown[]; openLater?: unknown[]; doneElsewhere?: unknown[] }) {
  findMany.mockReset();
  findMany.mockResolvedValueOnce(db.dueInRange ?? []).mockResolvedValueOnce(db.openLater ?? []).mockResolvedValueOnce(db.doneElsewhere ?? []);
  const res = await GET(new NextRequest(`http://localhost/api/task-instances/range?from=${from}&to=${to}&myOnly=0`));
  return (await res.json()) as Out[];
}

// As in production: Scales & Thermometer Verification 2026-11-B, window 11/16 → due 11/30, done 11/20 12:03 PM Pacific
const verification = () => dbRow("verif", "Scales & Thermometer Verification", "2026-11-30", { recurrenceUnit: "half_month", doneAt: "2026-11-20T20:03:48.560Z" });
// A weekly task due Thu 11/19 (window from Mon 11/16), completed late on Tue 11/24
const lateWeekly = () => dbRow("late", "Facilities Checklist", "2026-11-19", { doneAt: "2026-11-24T18:00:00Z", completedLate: true, daysLate: 5 });
// Due 12/15 (window from 12/01), completed early on 11/25, before its window opened
const early = () => dbRow("early", "Scales & Thermometer Verification", "2026-12-15", { recurrenceUnit: "half_month", doneAt: "2026-11-25T18:00:00Z" });

beforeEach(() => {
  vi.clearAllMocks();
  (getServerSession as unknown as MockFn).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
});

describe("GET /api/task-instances/range — done window tasks", () => {
  it("a done task due after the week is returned when its window overlaps the week, with what the calendar needs", async () => {
    const out = await getRange("2026-11-16", "2026-11-22", { doneElsewhere: [verification()] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "verif", dueDate: "2026-11-30", status: "DONE", windowStart: "2026-11-16",
      doneAt: "2026-11-20T20:03:48.560Z", doneByName: "Hugo Ayala", completedLate: false, daysLate: null,
    });
  });

  it("also in a week that holds neither its window start nor its completion day", async () => {
    expect((await getRange("2026-11-23", "2026-11-29", { doneElsewhere: [verification()] })).map((i) => i.id)).toEqual(["verif"]);
  });

  it("not in a week before its window opened", async () => {
    expect(await getRange("2026-11-09", "2026-11-15", { doneElsewhere: [verification()] })).toEqual([]);
  });

  it("a task completed late is returned for the week it was completed in, and not for later weeks", async () => {
    const inWeek = await getRange("2026-11-23", "2026-11-29", { doneElsewhere: [lateWeekly()] });
    expect(inWeek[0]).toMatchObject({ id: "late", dueDate: "2026-11-19", windowStart: "2026-11-16", completedLate: true, daysLate: 5 });
    expect(await getRange("2026-11-30", "2026-12-06", { doneElsewhere: [lateWeekly()] })).toEqual([]);
  });

  it("a task completed before its window opened is returned for the completion week and for its window, not in between", async () => {
    expect((await getRange("2026-11-23", "2026-11-29", { doneElsewhere: [early()] })).map((i) => i.id)).toEqual(["early"]);
    expect((await getRange("2026-12-07", "2026-12-13", { doneElsewhere: [early()] })).map((i) => i.id)).toEqual(["early"]);
    expect(await getRange("2026-11-16", "2026-11-22", { doneElsewhere: [early()] })).toEqual([]);
  });

  it("completion at 11:30 PM Pacific counts for that Pacific day, although it is the next day in UTC", async () => {
    // Sunday 11/22, 11:30 PM Pacific = Monday 11/23 07:30 UTC
    const night = () => dbRow("night", "Facilities Checklist", "2026-11-19", { doneAt: "2026-11-23T07:30:00Z", completedLate: true, daysLate: 3 });
    expect((await getRange("2026-11-16", "2026-11-22", { doneElsewhere: [night()] })).map((i) => i.id)).toEqual(["night"]);
    expect(await getRange("2026-11-23", "2026-11-29", { doneElsewhere: [night()] })).toEqual([]);
  });

  it("others are left out: a done task without a window, and done window tasks unrelated to the range", async () => {
    const out = await getRange("2026-11-16", "2026-11-22", { doneElsewhere: [
      dbRow("daily", "Daily Cleaning", "2026-11-10", { windowMode: "NONE", recurrenceUnit: null, doneAt: "2026-11-17T18:00:00Z" }),
      dbRow("old", "Monthly Cleaning — 624", "2026-10-31", { recurrenceUnit: "month", doneAt: "2026-10-20T18:00:00Z" }),
      dbRow("future", "Monthly Cleaning — 624", "2026-12-31", { recurrenceUnit: "month", doneAt: "2026-12-05T18:00:00Z" }),
      verification(),
    ] });
    expect(out.map((i) => i.id)).toEqual(["verif"]);
  });

  it("a done task due inside the range comes from the normal query, once", async () => {
    const out = await getRange("2026-11-30", "2026-12-06", { dueInRange: [verification()] });
    expect(out.map((i) => i.id)).toEqual(["verif"]);
    expect(out[0]).toMatchObject({ windowStart: "2026-11-16", doneAt: "2026-11-20T20:03:48.560Z" });
  });

  it("the month grid of November returns the done task together with the open ones", async () => {
    const out = await getRange("2026-10-26", "2026-12-06", {
      dueInRange: [verification(), dbRow("fac", "Facilities Checklist", "2026-11-26", { status: "UPCOMING" })],
      openLater: [dbRow("next", "Scales & Thermometer Verification", "2026-12-15", { recurrenceUnit: "half_month", status: "UPCOMING" })],
    });
    expect(out.map((i) => `${i.id}:${i.status}`).sort()).toEqual(["fac:UPCOMING", "next:UPCOMING", "verif:DONE"]);
  });

  it("the third query asks only for DONE tasks of window rules outside the range; the first two are unchanged", async () => {
    await getRange("2026-11-16", "2026-11-22", {});
    expect(findMany).toHaveBeenCalledTimes(3);
    const open = findMany.mock.calls[1][0].where.AND as Record<string, unknown>[];
    expect(open).toContainEqual({ status: { notIn: ["DONE", "SKIPPED", "MISSED"] } });
    const done = findMany.mock.calls[2][0].where.AND as Record<string, unknown>[];
    expect(done[2]).toEqual({ AND: [
      { status: "DONE" },
      { rule: { windowMode: { not: "NONE" } } },
      { OR: [
        { dueDate: { gt: new Date("2026-11-22T23:59:59Z") } },
        { dueDate: { lt: new Date("2026-11-16T00:00:00Z") }, doneAt: { gte: new Date("2026-11-16T00:00:00Z"), lte: new Date("2026-11-24T00:00:00Z") } },
      ] },
    ] });
  });

  it("a supervisor's done-task query is restricted to their own tasks; an admin's owner filter applies to it too", async () => {
    (getServerSession as unknown as MockFn).mockResolvedValue({ user: { id: "user-hugo", role: "SUPERVISOR" } });
    await getRange("2026-11-16", "2026-11-22", {});
    const mine = { OR: [{ ownerUserId: "user-hugo" }, { ownerUserId: null, rule: { ownerId: "user-hugo" } }] };
    expect((findMany.mock.calls[2][0].where.AND as unknown[])[0]).toEqual(mine);

    (getServerSession as unknown as MockFn).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    findMany.mockReset(); findMany.mockResolvedValue([]);
    await GET(new NextRequest("http://localhost/api/task-instances/range?from=2026-11-16&to=2026-11-22&myOnly=0&ownerId=user-hugo"));
    expect((findMany.mock.calls[2][0].where.AND as unknown[])[1]).toEqual(mine);
  });
});
