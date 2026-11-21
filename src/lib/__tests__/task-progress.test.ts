import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma";
import { fetchTaskProgress, PROGRESS_PROVIDERS } from "@/lib/task-progress";

const task = (id: string, due: string, formKey: string | null) => ({ id, dueDate: new Date(due + "T00:00:00Z"), rule: { formKey } });

function db(over: { monthly?: unknown[]; verification?: unknown[]; inUse?: number } = {}) {
  const d = {
    monthlyClean624Record: { findMany: vi.fn().mockResolvedValue(over.monthly ?? []) },
    verification624Record: { findMany: vi.fn().mockResolvedValue(over.verification ?? []) },
    verification624Equipment: { count: vi.fn().mockResolvedValue(over.inUse ?? 13) },
  };
  return { d, client: d as unknown as PrismaClient };
}

describe("'Open this period' progress — one mechanism for every form with a draft per period", () => {
  it("has a provider for each such form and nothing form-specific elsewhere", () => {
    expect(Object.keys(PROGRESS_PROVIDERS).sort()).toEqual(["facilities_checklist_624", "foreign_matter_624", "monthly_cleaning_624", "verification_624"]);
  });

  it("Monthly Cleaning 624 is unchanged: done + N/A out of all answered lines", async () => {
    const { client } = db({ monthly: [{ linkedInstanceId: "m1", doneCount: 5, naCount: 2, notDoneCount: 1 }] });
    expect(await fetchTaskProgress([task("m1", "2026-11-30", "monthly_cleaning_624")], client)).toEqual(new Map([["m1", { done: 7, total: 8 }]]));
  });

  it("Scales & Thermometer Verification: verified items out of the in-use equipment, found by task link", async () => {
    const { client } = db({ verification: [{ linkedInstanceId: "v1", periodEnd: new Date("2026-11-30T00:00:00Z"), okCount: 6, failCount: 1 }], inUse: 13 });
    expect((await fetchTaskProgress([task("v1", "2026-11-30", "verification_624")], client)).get("v1")).toEqual({ done: 7, total: 13 });
  });

  it("…or by the period's due date when the form was opened from the menu", async () => {
    const { d, client } = db({ verification: [{ linkedInstanceId: null, periodEnd: new Date("2026-11-30T00:00:00Z"), okCount: 2, failCount: 0 }] });
    const out = await fetchTaskProgress([task("v-nov-b", "2026-11-30", "verification_624"), task("v-dec-a", "2026-12-15", "verification_624")], client);
    expect(out.get("v-nov-b")).toEqual({ done: 2, total: 13 });
    expect(out.has("v-dec-a")).toBe(false); // the other half has its own draft
    expect(d.verification624Record.findMany.mock.calls[0][0].where.status).toBe("draft");
  });

  it("no draft yet, or nothing verified yet → no progress bar", async () => {
    expect((await fetchTaskProgress([task("v1", "2026-11-30", "verification_624")], db().client)).size).toBe(0);
    const empty = db({ verification: [{ linkedInstanceId: "v1", periodEnd: new Date("2026-11-30T00:00:00Z"), okCount: 0, failCount: 0 }] });
    expect((await fetchTaskProgress([task("v1", "2026-11-30", "verification_624")], empty.client)).size).toBe(0);
  });

  it("several forms at once; forms without a provider are skipped without a query; a failing provider does not break the others", async () => {
    const { d, client } = db({
      monthly: [{ linkedInstanceId: "m1", doneCount: 1, naCount: 0, notDoneCount: 0 }],
      verification: [{ linkedInstanceId: "v1", periodEnd: new Date("2026-11-30T00:00:00Z"), okCount: 1, failCount: 0 }],
    });
    const tasks = [task("m1", "2026-11-30", "monthly_cleaning_624"), task("v1", "2026-11-30", "verification_624"), task("x", "2026-11-30", "monthly_cleaning"), task("y", "2026-11-30", null)];
    expect(Array.from((await fetchTaskProgress(tasks, client)).keys()).sort()).toEqual(["m1", "v1"]);

    vi.spyOn(console, "error").mockImplementation(() => {});
    d.monthlyClean624Record.findMany.mockRejectedValue(new Error("boom"));
    expect(Array.from((await fetchTaskProgress(tasks, client)).keys())).toEqual(["v1"]);
  });
});
