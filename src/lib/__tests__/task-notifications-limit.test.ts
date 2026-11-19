import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { ruleInstance: { findMany: vi.fn() }, user: { findMany: vi.fn() } },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { sendReminders, NOTIFY_MAX_OVERDUE_DAYS } from "@/lib/task-reminders";
import { sendEscalations } from "@/lib/task-escalation";

type MockFn = ReturnType<typeof vi.fn>;
const findMany = (prisma as unknown as { ruleInstance: { findMany: MockFn } }).ruleInstance.findMany;
const users = (prisma as unknown as { user: { findMany: MockFn } }).user.findMany;
const notify = notifyUser as unknown as MockFn;

const inst = (id: string, due: string, status: string) => ({
  id,
  dueDate: new Date(due + "T00:00:00Z"),
  status,
  ownerUserId: null,
  rule: { title: `Task ${id}`, ownerId: "user-ivan", formKey: "manual", escalateAfterDays: null },
});

// A tiny stand-in for the database: applies the status and dueDate filters the code sends
const ALL = [
  inst("today", "2026-11-19", "DUE_TODAY"),
  inst("tomorrow", "2026-11-20", "UPCOMING"),
  inst("overdue-1", "2026-11-18", "OVERDUE"),
  inst("overdue-3", "2026-11-16", "OVERDUE"),
  inst("overdue-4", "2026-11-15", "OVERDUE"),
  inst("overdue-30", "2026-10-20", "OVERDUE"),
];
function applyWhere({ where }: { where: { status?: string | { in: string[] }; dueDate?: Date | { gte: Date } } }) {
  return ALL.filter((i) => {
    const s = where.status;
    if (typeof s === "string" && i.status !== s) return false;
    if (s && typeof s !== "string" && !s.in.includes(i.status)) return false;
    const d = where.dueDate;
    if (d instanceof Date) return i.dueDate.toISOString().slice(0, 10) === d.toISOString().slice(0, 10);
    if (d && "gte" in d) return i.dueDate.getTime() >= d.gte.getTime();
    return true;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-11-19T19:00:00Z")); // 2026-11-19 Pacific
  vi.spyOn(console, "log").mockImplementation(() => {});
  findMany.mockImplementation(async (args) => applyWhere(args));
  users.mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);
});

const notified = (type: string) => notify.mock.calls.filter((c) => c[0].type === type).map((c) => c[0].instanceId);

describe("notification limit — due today or overdue by 3 days or fewer", () => {
  it("the limit is 3 days", () => expect(NOTIFY_MAX_OVERDUE_DAYS).toBe(3));

  it("overdue reminders go out for 1 and 3 days overdue, not for 4 or 30", async () => {
    const result = await sendReminders();
    expect(notified("TASK_OVERDUE").sort()).toEqual(["overdue-1", "overdue-3"]);
    expect(notified("TASK_DUE_TODAY")).toEqual(["today"]);
    expect(notified("TASK_DUE_SOON")).toEqual(["tomorrow"]);
    expect(result).toEqual({ dueSoon: 1, dueToday: 1, overdue: 2 });
  });

  it("escalations go to every admin for 3 days overdue only (1 day is too early, 4+ is past the limit)", async () => {
    const result = await sendEscalations();
    expect(Array.from(new Set(notified("TASK_ESCALATED")))).toEqual(["overdue-3"]);
    expect(result).toEqual({ escalated: 2 });
  });

  it("dedupe keys are unchanged: one per task per day for reminders, one per task per admin for escalations", async () => {
    await sendReminders();
    await sendEscalations();
    const keys = notify.mock.calls.map((c) => c[0].dedupeKey);
    expect(keys).toContain("TASK_OVERDUE:overdue-1:2026-11-19");
    expect(keys).toContain("TASK_DUE_TODAY:today:2026-11-19");
    expect(keys).toContain("TASK_ESCALATED:overdue-3:admin-1");
    expect(keys).toContain("TASK_ESCALATED:overdue-3:admin-2");
  });

  it("dryRun counts but creates no notification", async () => {
    await sendReminders({ dryRun: true });
    await sendEscalations({ dryRun: true });
    expect(notify).not.toHaveBeenCalled();
  });
});
