import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { taskRule: { findMany: vi.fn(), update: vi.fn() }, $transaction: vi.fn() },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PUT } from "@/app/api/task-rules/order/route";

type MockFn = ReturnType<typeof vi.fn>;
const mp = prisma as unknown as { taskRule: { findMany: MockFn; update: MockFn }; $transaction: MockFn };
const session = getServerSession as unknown as MockFn;

// Stored order: JB Pre-Op 10, JB Batch 20, JB Cleaning 30, 624 Pre-Op 40, a brand-new unranked rule last
const STORED = [
  { id: "preop", sortOrder: 10 }, { id: "batch", sortOrder: 20 }, { id: "cleaning", sortOrder: 30 },
  { id: "preop624", sortOrder: 40 }, { id: "new-rule", sortOrder: null },
];
const put = (body: unknown) =>
  PUT(new NextRequest("http://localhost/api/task-rules/order", { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) }));
const writes = () => mp.taskRule.update.mock.calls.map((c) => ({ id: c[0].where.id, sortOrder: c[0].data.sortOrder }));

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mp.taskRule.findMany.mockResolvedValue(STORED);
  mp.taskRule.update.mockImplementation((args: unknown) => args);
  mp.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("PUT /api/task-rules/order", () => {
  it("not signed in → 401; supervisor → 403; nothing is read or written", async () => {
    session.mockResolvedValue(null);
    expect((await put({ ruleIds: ["cleaning", "batch"] })).status).toBe(401);
    session.mockResolvedValue({ user: { id: "user-ivan", role: "SUPERVISOR" } });
    expect((await put({ ruleIds: ["cleaning", "batch"] })).status).toBe(403);
    expect(mp.taskRule.findMany).not.toHaveBeenCalled();
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it("admin moves Cleaning above Batch Sheets: both ranks swap in ONE transaction", async () => {
    const res = await put({ ruleIds: ["preop", "cleaning", "batch"] });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
    expect(mp.$transaction.mock.calls[0][0]).toHaveLength(3);
    // Pre-Op and 624's Pre-Op keep 10 and 40; the unranked rule is given the last rank
    expect(writes()).toEqual([{ id: "cleaning", sortOrder: 20 }, { id: "batch", sortOrder: 30 }, { id: "new-rule", sortOrder: 50 }]);
    expect(json.ranks).toEqual([
      { id: "preop", sortOrder: 10 }, { id: "cleaning", sortOrder: 20 }, { id: "batch", sortOrder: 30 },
      { id: "preop624", sortOrder: 40 }, { id: "new-rule", sortOrder: 50 },
    ]);
  });

  it("the order is read with unranked rules last", async () => {
    await put({ ruleIds: ["preop", "batch"] });
    expect(mp.taskRule.findMany.mock.calls[0][0].orderBy[0]).toEqual({ sortOrder: { sort: "asc", nulls: "last" } });
  });

  it("unknown rule id → 400, nothing written", async () => {
    const res = await put({ ruleIds: ["preop", "does-not-exist"] });
    expect(res.status).toBe(400);
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ ruleIds: [] }], [{ ruleIds: "preop" }], [{ ruleIds: ["preop", 5] }], [{ ruleIds: ["preop", "preop"] }], ["not json"]])(
    "bad body %j → 400, nothing written",
    async (body) => {
      expect((await put(body)).status).toBe(400);
      expect(mp.$transaction).not.toHaveBeenCalled();
    },
  );
});
