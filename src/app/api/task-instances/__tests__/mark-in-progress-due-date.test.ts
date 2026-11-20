import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { ruleInstance: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, taskInstanceAudit: { create: vi.fn() }, $transaction: vi.fn() },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/task-instances/mark-in-progress/route";

type MockFn = ReturnType<typeof vi.fn>;
const mp = prisma as unknown as { ruleInstance: { findMany: MockFn; update: MockFn; updateMany: MockFn }; taskInstanceAudit: { create: MockFn }; $transaction: MockFn };
const row = (id: string, due: string, status: string) => ({ id, dueDate: new Date(due + "T00:00:00Z"), status, ownerUserId: null });
const post = (body: Record<string, unknown>) => POST(new NextRequest("http://localhost/api/task-instances/mark-in-progress", { method: "POST", body: JSON.stringify(body) }));
/** Which task the route chose to mark, whatever write call it used. */
function marked(): string | undefined {
  const calls = [...mp.ruleInstance.update.mock.calls, ...mp.ruleInstance.updateMany.mock.calls];
  const where = calls[0]?.[0]?.where as { id?: string | { in: string[] } } | undefined;
  return typeof where?.id === "string" ? where.id : where?.id?.in?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-12-03T19:00:00Z")); // first half of December; the November second-half task is overdue
  (getServerSession as unknown as MockFn).mockResolvedValue({ user: { id: "hugo", role: "SUPERVISOR" } });
  mp.ruleInstance.findMany.mockResolvedValue([row("nov-b", "2026-11-30", "OVERDUE"), row("dec-a", "2026-12-15", "UPCOMING")]);
  mp.ruleInstance.update.mockResolvedValue({});
  mp.ruleInstance.updateMany.mockResolvedValue({ count: 1 });
  mp.$transaction.mockImplementation(async (ops: unknown) => (typeof ops === "function" ? (ops as (tx: unknown) => unknown)(prisma) : ops));
});

describe("POST /api/task-instances/mark-in-progress — forms with periods", () => {
  it("with the period's due date, the first-half task is marked even though the previous half is overdue", async () => {
    const res = await post({ formKey: "verification_624", facilityName: "624", dueDate: "2026-12-15" });
    expect(res.status).toBe(200);
    expect(marked()).toBe("dec-a");
  });

  it("the overdue half is marked only when its own due date is sent", async () => {
    await post({ formKey: "verification_624", facilityName: "624", dueDate: "2026-11-30" });
    expect(marked()).toBe("nov-b");
  });

  it("without a due date the behaviour is unchanged: the overdue task comes first", async () => {
    await post({ formKey: "verification_624", facilityName: "624" });
    expect(marked()).toBe("nov-b");
  });

  it("a due date with no task for that period marks nothing", async () => {
    const res = await post({ formKey: "verification_624", facilityName: "624", dueDate: "2026-12-31" });
    expect(res.status).toBe(404);
    expect(marked()).toBeUndefined();
  });

  it("a malformed due date is ignored rather than trusted", async () => {
    await post({ formKey: "verification_624", facilityName: "624", dueDate: "next week" });
    expect(marked()).toBe("nov-b");
  });
});
