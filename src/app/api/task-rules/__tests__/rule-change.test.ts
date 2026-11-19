import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/calendar-generator", () => ({ generateCalendarInstances: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskRule: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    ruleInstance: { findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    taskInstanceAudit: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
// Keep the real computeDueDates; stub only the functions that write
vi.mock("@/lib/task-generator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/task-generator")>();
  return { ...actual, generateInstances: vi.fn(), updateStatuses: vi.fn() };
});

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { generateInstances, updateStatuses } from "@/lib/task-generator";
import { generateCalendarInstances } from "@/lib/calendar-generator";
import { PATCH } from "@/app/api/task-rules/[id]/route";
import { POST } from "@/app/api/task-rules/route";

type MockFn = ReturnType<typeof vi.fn>;
const mp = prisma as unknown as {
  taskRule: { findUnique: MockFn; update: MockFn; create: MockFn };
  ruleInstance: { findMany: MockFn; count: MockFn; deleteMany: MockFn; updateMany: MockFn };
  notification: { deleteMany: MockFn };
  taskInstanceAudit: { create: MockFn };
  $transaction: MockFn;
};
const mockGenerate = generateInstances as unknown as MockFn;

const RULE_ID = "rule-jb-monthly";
const stored = {
  id: RULE_ID,
  title: "Monthly Cleaning",
  description: null,
  facilityId: "fac-jb",
  ownerId: "user-ivan",
  triggerType: "RECURRING",
  recurrenceUnit: "month",
  recurrenceEvery: 1,
  recurrenceStart: new Date("2026-11-01T00:00:00Z"),
  recurrenceEndOfMonth: false,
  formKey: "monthly_cleaning",
  productName: null,
  isActive: true,
  isArchived: false,
  windowMode: "PERIOD_START",
  windowDaysBefore: null,
};
const row = (id: string, due: string, status: string, audits = 0) => ({
  id,
  dueDate: new Date(due + "T00:00:00Z"),
  status,
  _count: { auditLogs: audits },
});

function patch(body: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/task-rules/${RULE_ID}`, { method: "PATCH", body: JSON.stringify(body) });
  return PATCH(req, { params: { id: RULE_ID } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-11-19T19:00:00Z")); // 11:00 PT on 2026-11-19
  (getServerSession as unknown as MockFn).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mp.taskRule.findUnique.mockResolvedValue(stored);
  mp.taskRule.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...(await mp.taskRule.findUnique()),
    ...data,
    facility: { id: "fac-jb", name: "Julian Bakery" },
    owner: { id: "user-ivan", name: "Ivan Torres" },
  }));
  mp.ruleInstance.findMany.mockResolvedValue([]);
  mp.ruleInstance.deleteMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
  mp.ruleInstance.updateMany.mockResolvedValue({ count: 0 });
  mp.notification.deleteMany.mockResolvedValue({ count: 0 });
  mp.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  mockGenerate.mockResolvedValue({ created: 1 });
  (updateStatuses as unknown as MockFn).mockResolvedValue({ updated: 0 });
});

describe("PATCH /api/task-rules/[id] — schedule change", () => {
  it("ticking end-of-month DELETES the untouched 12/01 instance, never skips it, and generates immediately", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([row("inst-dec-1", "2026-12-01", "UPCOMING")]);

    const res = await patch({ recurrenceUnit: "month", recurrenceEvery: 1, recurrenceStart: "2026-11-01", recurrenceEndOfMonth: true });
    const json = await res.json();

    expect(mp.taskRule.update.mock.calls[0][0].data.recurrenceEndOfMonth).toBe(true);
    expect(mp.ruleInstance.deleteMany).toHaveBeenCalledTimes(1);
    expect(mp.ruleInstance.deleteMany.mock.calls[0][0].where).toEqual({
      id: { in: ["inst-dec-1"] },
      status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE"] },
    });
    expect(mp.ruleInstance.updateMany).not.toHaveBeenCalled();
    expect(mp.taskInstanceAudit.create).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(json.recurringResult).toEqual({ created: 1, deleted: 1, skipped: 0 });
  });

  it("only UPCOMING / DUE_TODAY / OVERDUE are ever considered — started and done instances are not even read", async () => {
    await patch({ recurrenceEndOfMonth: true });
    expect(mp.ruleInstance.findMany.mock.calls[0][0].where).toEqual({
      ruleId: RULE_ID,
      status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE"] },
    });
  });

  it("an untouched overdue instance off the new schedule is deleted; one still on it is kept", async () => {
    mp.taskRule.findUnique.mockResolvedValue({ ...stored, recurrenceStart: new Date("2026-10-01T00:00:00Z") });
    mp.ruleInstance.findMany.mockResolvedValue([
      row("overdue-off", "2026-11-01", "OVERDUE"),
      row("overdue-on", "2026-10-31", "OVERDUE"),
      row("upcoming-on", "2026-11-30", "UPCOMING"),
    ]);

    const json = await (await patch({ recurrenceEndOfMonth: true })).json();

    expect(mp.ruleInstance.deleteMany.mock.calls[0][0].where.id).toEqual({ in: ["overdue-off"] });
    expect(json.recurringResult.deleted).toBe(1);
  });

  it("an open instance that has audit history is skipped (history kept), not deleted", async () => {
    mp.ruleInstance.findMany.mockResolvedValue([row("inst-with-history", "2026-12-01", "UPCOMING", 2)]);

    const json = await (await patch({ recurrenceEndOfMonth: true })).json();

    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
    expect(mp.ruleInstance.updateMany.mock.calls[0][0].data.status).toBe("SKIPPED");
    expect(json.recurringResult).toEqual({ created: 1, deleted: 0, skipped: 1 });
  });

  it("saving without a schedule change removes nothing but still generates", async () => {
    const res = await patch({ title: "Monthly Cleaning (JB)", recurrenceUnit: "month", recurrenceEvery: 1, recurrenceStart: "2026-11-01", recurrenceEndOfMonth: false });
    const json = await res.json();

    expect(mp.ruleInstance.findMany).not.toHaveBeenCalled();
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
    expect(mp.ruleInstance.updateMany).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(json.recurringResult).toEqual({ created: 1, deleted: 0, skipped: 0 });
  });

  it("a body without recurrenceEndOfMonth leaves the stored flag alone", async () => {
    mp.taskRule.findUnique.mockResolvedValue({ ...stored, recurrenceEndOfMonth: true });
    await patch({ windowMode: "NONE" });
    expect(mp.taskRule.update.mock.calls[0][0].data).toEqual({ windowMode: "NONE" });
  });

  it("deactivating a rule does not generate", async () => {
    await patch({ isActive: false });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mp.ruleInstance.deleteMany).not.toHaveBeenCalled();
  });

  it("unknown rule → 404, nothing written", async () => {
    mp.taskRule.findUnique.mockResolvedValue(null);
    const res = await patch({ title: "x" });
    expect(res.status).toBe(404);
    expect(mp.taskRule.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/task-rules — immediate generation", () => {
  function post(body: Record<string, unknown>) {
    return POST(new NextRequest("http://localhost/api/task-rules", { method: "POST", body: JSON.stringify(body) }));
  }
  const base = { title: "Monthly Cleaning", facilityId: "fac-jb", ownerId: "user-ivan", recurrenceStart: "2026-11-01", formKey: "monthly_cleaning" };

  beforeEach(() => {
    mp.taskRule.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "new-rule",
      ...data,
      facility: { id: "fac-jb", name: "Julian Bakery" },
      owner: { id: "user-ivan", name: "Ivan Torres" },
    }));
    (generateCalendarInstances as unknown as MockFn).mockResolvedValue({ results: [] });
  });

  it("a new recurring rule stores end-of-month and generates its instances in the same request", async () => {
    const res = await post({ ...base, triggerType: "RECURRING", recurrenceUnit: "month", recurrenceEvery: 1, recurrenceEndOfMonth: true });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(mp.taskRule.create.mock.calls[0][0].data.recurrenceEndOfMonth).toBe(true);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(json.recurringResult).toEqual({ created: 1 });
  });

  it("end-of-month is stored false when the box was not sent or the unit is not month", async () => {
    await post({ ...base, triggerType: "RECURRING", recurrenceUnit: "month" });
    await post({ ...base, triggerType: "RECURRING", recurrenceUnit: "week", recurrenceEndOfMonth: true });
    expect(mp.taskRule.create.mock.calls[0][0].data.recurrenceEndOfMonth).toBe(false);
    expect(mp.taskRule.create.mock.calls[1][0].data.recurrenceEndOfMonth).toBe(false);
  });

  it("a production-day rule uses the calendar generator, not the recurring one", async () => {
    await post({ ...base, triggerType: "PRODUCTION_DAY", formKey: "daily_cleaning" });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(generateCalendarInstances).toHaveBeenCalledTimes(1);
  });
});
