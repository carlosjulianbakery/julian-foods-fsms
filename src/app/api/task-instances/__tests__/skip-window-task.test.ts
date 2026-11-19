import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// Only these two models exist on the mock: any write to task_rules would throw.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ruleInstance: { findUnique: vi.fn(), update: vi.fn() },
    taskInstanceAudit: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/task-instances/[id]/skip/route";
import { computeDueDates } from "@/lib/task-generator";
import type { TaskRule } from "@/generated/prisma";

type MockFn = ReturnType<typeof vi.fn>;
const mp = prisma as unknown as {
  ruleInstance: { findUnique: MockFn; update: MockFn };
  taskInstanceAudit: { create: MockFn };
  $transaction: MockFn;
};
const session = getServerSession as unknown as MockFn;

const ID = "inst-monthly-nov";
// A period task: due 11/30, window open since 11/01, not started, never reassigned
const windowInstance = (status = "UPCOMING") => ({
  id: ID,
  ruleId: "rule-monthly",
  dueDate: new Date("2026-11-30T00:00:00Z"),
  status,
  ownerUserId: null,
  rule: { ownerId: "user-ivan" },
});

function skip(reason: unknown) {
  const req = new NextRequest(`http://localhost/api/task-instances/${ID}/skip`, { method: "POST", body: JSON.stringify({ reason }) });
  return POST(req, { params: { id: ID } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-11-19T19:00:00Z"));
  session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mp.ruleInstance.findUnique.mockResolvedValue(windowInstance());
  mp.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("POST /api/task-instances/[id]/skip — window (period) task", () => {
  it("admin skip writes SKIPPED with the reason and an audit entry", async () => {
    const res = await skip("Plant closed for the holiday week");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, status: "SKIPPED" });
    expect(mp.ruleInstance.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: {
        status: "SKIPPED",
        skippedAt: new Date("2026-11-19T19:00:00Z"),
        skippedById: "admin-1",
        skipReason: "Plant closed for the holiday week",
        ownerUserId: "user-ivan",
      },
    });
    expect(mp.taskInstanceAudit.create).toHaveBeenCalledWith({
      data: { instanceId: ID, action: "skipped", userId: "admin-1", note: "Plant closed for the holiday week" },
    });
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
  });

  it("an IN_PROGRESS period task can be skipped, as a daily one can", async () => {
    mp.ruleInstance.findUnique.mockResolvedValue(windowInstance("IN_PROGRESS"));
    expect((await skip("Plant closed for the holiday week")).status).toBe(200);
    expect(mp.ruleInstance.update).toHaveBeenCalledTimes(1);
  });

  it("non-admin is refused and nothing is written", async () => {
    session.mockResolvedValue({ user: { id: "user-ivan", role: "SUPERVISOR" } });
    expect((await skip("Plant closed for the holiday week")).status).toBe(403);
    expect(mp.ruleInstance.update).not.toHaveBeenCalled();
    expect(mp.taskInstanceAudit.create).not.toHaveBeenCalled();
  });

  it.each(["DONE", "SKIPPED"])("a %s task is refused", async (status) => {
    mp.ruleInstance.findUnique.mockResolvedValue(windowInstance(status));
    expect((await skip("Plant closed for the holiday week")).status).toBe(400);
    expect(mp.ruleInstance.update).not.toHaveBeenCalled();
  });

  it("a reason shorter than 10 characters is refused", async () => {
    expect((await skip("too short")).status).toBe(400);
    expect(mp.ruleInstance.update).not.toHaveBeenCalled();
  });
});

describe("skipping one period does not stop the next", () => {
  it("the generator computes the next period from the rule alone — instance status is not an input", () => {
    const rule = {
      triggerType: "RECURRING",
      recurrenceUnit: "month",
      recurrenceEvery: 1,
      recurrenceStart: new Date("2026-11-01T00:00:00Z"),
      recurrenceEndOfMonth: true,
    } as unknown as TaskRule;
    // On 12/01 the 30-day horizon reaches 12/31: December is generated whether or not November was skipped
    expect(computeDueDates(rule, "2026-12-01", "2026-12-31")).toEqual(["2026-12-31"]);
  });
});
