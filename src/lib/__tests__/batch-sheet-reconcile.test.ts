import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { PrismaClient } from "@/generated/prisma";
import { matchSubmissionsConsume, FINISHED_STATUSES } from "@/lib/submission-matcher";
import {
  planBatchSheetLinks,
  reconcileBatchSheetTasks,
  resolveBatchSheetTaskLink,
  normalizeProductName,
  productNameFromTaskLabel,
  sweepRange,
  type ReconTask,
  type ReconSubmission,
} from "@/lib/batch-sheet-reconcile";

const IVAN = "user-ivan";
const HUGO = "user-hugo";
const PRODUCTS = [
  { id: "p-egg", name: "Protein Powder - Egg Unflavored" },
  { id: "p-granola", name: "ProGranola - Chocolate" },
  { id: "p-premix", name: "PreMix Powder - Egg Chocolate" },
  { id: "p-bread", name: "Whole Grain Bread" },
];

let seq = 0;
function task(id: string, label: string, due: string, status = "UPCOMING", over: Partial<ReconTask> = {}): ReconTask {
  return {
    id, label, dueDate: due, status,
    ruleId: "rule-jb", ruleOwnerId: IVAN, ownerUserId: null, completedBySubmissionId: null,
    createdAt: new Date(Date.UTC(2026, 10, 13, 0, 0, seq++)),
    ...over,
  };
}
function sheet(id: string, templateName: string, productionDate: string, over: Partial<ReconSubmission> = {}): ReconSubmission {
  return {
    id, templateName, productId: null, productionDate: new Date(productionDate + "T00:00:00Z"), status: "PASS",
    submittedById: IVAN, submittedAt: new Date("2026-11-19T18:27:04Z"), taskInstanceId: null,
    ...over,
  };
}
const plan = (tasks: ReconTask[], submissions: ReconSubmission[], linked: string[] = []) =>
  planBatchSheetLinks({ tasks, submissions, products: PRODUCTS, linkedSubmissionIds: linked });

// ── A small in-memory database for the sweep itself ──────────────────────────
type DbTask = Omit<ReconTask, "dueDate" | "ruleOwnerId"> & {
  dueDate: Date; rule: { ownerId: string; formKey: string };
  doneAt?: Date; doneById?: string; completedLate?: boolean; daysLate?: number | null; needsAdminReview?: boolean; reviewReason?: string;
};
function fakeDb(tasks: ReconTask[], submissions: ReconSubmission[]) {
  const state = {
    tasks: tasks.map((t): DbTask => ({ ...t, dueDate: new Date(t.dueDate + "T00:00:00Z"), rule: { ownerId: t.ruleOwnerId, formKey: "batch_sheet" } })),
    audits: [] as { instanceId: string; action: string; userId: string; note: string }[],
  };
  const db = {
    batchSheetSubmission: { findMany: vi.fn(async () => submissions) },
    product: { findMany: vi.fn(async () => PRODUCTS) },
    ruleInstance: {
      findMany: vi.fn(async (args: { where: { completedBySubmissionId?: { in: string[] } } }) =>
        args.where.completedBySubmissionId
          ? state.tasks.filter((t) => t.completedBySubmissionId && args.where.completedBySubmissionId!.in.includes(t.completedBySubmissionId))
          : state.tasks),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.tasks.find((t) => t.id === where.id) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: { notIn: string[] }; completedBySubmissionId: null }; data: Partial<DbTask> }) => {
        const t = state.tasks.find((x) => x.id === where.id && !where.status.notIn.includes(x.status) && x.completedBySubmissionId === null);
        if (!t) return { count: 0 };
        Object.assign(t, data);
        return { count: 1 };
      }),
    },
    taskInstanceAudit: { create: vi.fn(async ({ data }: { data: (typeof state.audits)[number] }) => { state.audits.push(data); return data; }) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  return { state, db, client: db as unknown as PrismaClient };
}
const sweep = (client: PrismaClient) => reconcileBatchSheetTasks({ prismaClient: client, source: "nightly cron" });

beforeEach(() => {
  seq = 0;
  vi.setSystemTime(new Date("2026-11-19T19:00:00Z")); // Thursday 2026-11-19, 11:00 Pacific
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("the two real cases", () => {
  it("Egg Unflavored: sheet dated 11/17, task due 11/19 stored UPCOMING at submit time → linked by schedule rule", () => {
    const tasks = [task("egg-1119", "Protein Powder - Egg Unflavored (600 units EXP 05/12/26)", "2026-11-19", "UPCOMING")];
    const sheets = [sheet("egg-sheet", "Protein Powder - Egg Unflavored", "2026-11-17", { productId: "p-egg" })];
    expect(plan(tasks, sheets)).toEqual([{ instanceId: "egg-1119", submissionId: "egg-sheet", how: "schedule rule" }]);
  });

  it("ProGranola: sheet dated 11/17, task due 11/18 → linked by schedule rule", () => {
    const tasks = [task("granola-1118", "ProGranola - Chocolate (50 Bowls)", "2026-11-18", "OVERDUE")];
    const sheets = [sheet("granola-sheet", "ProGranola - Chocolate", "2026-11-17")];
    expect(plan(tasks, sheets)).toEqual([{ instanceId: "granola-1118", submissionId: "granola-sheet", how: "schedule rule" }]);
  });
});

describe("planner rules", () => {
  it("an explicit task link wins over the schedule rule", () => {
    const tasks = [
      task("mon", "Whole Grain Bread (1 Bowl)", "2026-11-16", "OVERDUE"),
      task("wed", "Whole Grain Bread (2 Bowls)", "2026-11-18", "OVERDUE"),
    ];
    // Dated Monday (the rule alone would pick the Monday task) but opened from Wednesday's Start button
    const sheets = [sheet("s", "Whole Grain Bread", "2026-11-16", { taskInstanceId: "wed" })];
    expect(plan(tasks, sheets)).toEqual([{ instanceId: "wed", submissionId: "s", how: "task link" }]);
  });

  it("exact date wins: a production takes the sheet with its own date, not another sheet from the week", () => {
    const tasks = [task("thu", "Whole Grain Bread (1 Bowl)", "2026-11-19", "UPCOMING")];
    const sheets = [
      sheet("wed-sheet", "Whole Grain Bread", "2026-11-18", { submittedAt: new Date("2026-11-18T20:00:00Z") }),
      sheet("thu-sheet", "Whole Grain Bread", "2026-11-19", { submittedAt: new Date("2026-11-19T20:00:00Z") }),
    ];
    expect(plan(tasks, sheets)).toEqual([{ instanceId: "thu", submissionId: "thu-sheet", how: "exact date" }]);
  });

  it("two productions, one sheet per date: each task gets its own exact-date sheet", () => {
    const tasks = [
      task("tue", "Whole Grain Bread (1 Bowl)", "2026-11-17", "OVERDUE"),
      task("thu", "Whole Grain Bread (1 Bowl)", "2026-11-19", "UPCOMING"),
    ];
    const sheets = [sheet("thu-sheet", "Whole Grain Bread", "2026-11-19"), sheet("tue-sheet", "Whole Grain Bread", "2026-11-17")];
    expect(plan(tasks, sheets)).toEqual([
      { instanceId: "tue", submissionId: "tue-sheet", how: "exact date" },
      { instanceId: "thu", submissionId: "thu-sheet", how: "exact date" },
    ]);
  });

  it("KNOWN SCHEDULE BEHAVIOUR: two productions, a single sheet dated like the later one → the earlier production takes it", () => {
    // The matcher walks productions in date order and each takes what is available. This is exactly
    // what the Production Schedule shows (Tuesday done, Thursday not started), so tasks follow it.
    const tasks = [
      task("tue", "Whole Grain Bread (1 Bowl)", "2026-11-17", "OVERDUE"),
      task("thu", "Whole Grain Bread (1 Bowl)", "2026-11-19", "UPCOMING"),
    ];
    const sheets = [sheet("thu-sheet", "Whole Grain Bread", "2026-11-19")];
    const reference = matchSubmissionsConsume(
      tasks.map((t) => ({ productId: "p-bread", isoDate: t.dueDate })), sheets, () => "p-bread", FINISHED_STATUSES,
    );
    expect(Array.from(reference.keys())).toEqual(["p-bread:2026-11-17"]);
    expect(plan(tasks, sheets)).toEqual([{ instanceId: "tue", submissionId: "thu-sheet", how: "schedule rule" }]);
  });

  it("a future task closes when the schedule pairs it (same product, same week)", () => {
    const tasks = [task("fri", "Whole Grain Bread (1 Bowl)", "2026-11-20", "UPCOMING")];
    expect(plan(tasks, [sheet("s", "Whole Grain Bread", "2026-11-18")])).toEqual([
      { instanceId: "fri", submissionId: "s", how: "schedule rule" },
    ]);
  });

  it("a task in a different week is not paired", () => {
    const tasks = [task("next-mon", "Whole Grain Bread (1 Bowl)", "2026-11-23", "UPCOMING")];
    expect(plan(tasks, [sheet("s", "Whole Grain Bread", "2026-11-19")])).toEqual([]);
  });

  it("a skipped task consumes its sheet, so the sheet cannot spill onto another task", () => {
    const tasks = [
      task("skipped-wed", "PreMix Powder - Egg Chocolate (3 Bowls)", "2026-11-18", "SKIPPED"),
      task("open-fri", "PreMix Powder - Egg Chocolate (2 Bowls)", "2026-11-20", "UPCOMING"),
    ];
    expect(plan(tasks, [sheet("s", "PreMix Powder - Egg Chocolate", "2026-11-18")])).toEqual([]);
  });

  it("DONE, SKIPPED and MISSED tasks are never returned as something to change", () => {
    for (const status of ["DONE", "SKIPPED", "MISSED"]) {
      expect(plan([task("t", "Whole Grain Bread (1 Bowl)", "2026-11-18", status)], [sheet("s", "Whole Grain Bread", "2026-11-18")])).toEqual([]);
    }
  });

  it("a sheet already linked to a task is out of the pool; so is that task", () => {
    const tasks = [
      task("done", "Whole Grain Bread (1 Bowl)", "2026-11-17", "DONE", { completedBySubmissionId: "s1" }),
      task("open", "Whole Grain Bread (1 Bowl)", "2026-11-19", "UPCOMING"),
    ];
    expect(plan(tasks, [sheet("s1", "Whole Grain Bread", "2026-11-17")])).toEqual([]);
    // linked to a task outside the window
    expect(plan([tasks[1]], [sheet("s9", "Whole Grain Bread", "2026-11-19")], ["s9"])).toEqual([]);
  });

  it("each sheet closes at most one task; two runs on the same day need two sheets", () => {
    const tasks = [
      task("run-1", "Whole Grain Bread (1 Bowl)", "2026-11-18", "OVERDUE"),
      task("run-2", "Whole Grain Bread (3 Bowls)", "2026-11-18", "OVERDUE"),
    ];
    expect(plan(tasks, [sheet("a", "Whole Grain Bread", "2026-11-18")])).toEqual([{ instanceId: "run-1", submissionId: "a", how: "exact date" }]);
    expect(plan(tasks, [sheet("a", "Whole Grain Bread", "2026-11-18"), sheet("b", "Whole Grain Bread", "2026-11-18")]).map((p) => p.instanceId)).toEqual(["run-1", "run-2"]);
  });

  it("drafts are not matched", () => {
    const tasks = [task("t", "Whole Grain Bread (1 Bowl)", "2026-11-18", "DUE_TODAY")];
    expect(plan(tasks, [sheet("draft", "Whole Grain Bread", "2026-11-18", { status: "DRAFT" })])).toEqual([]);
  });

  it("product must match exactly — no substring matching", () => {
    const tasks = [task("t", "Protein Powder - Egg Unflavored (600 units)", "2026-11-18", "OVERDUE")];
    expect(plan(tasks, [sheet("s", "Protein Powder - Egg", "2026-11-18")])).toEqual([]);
    expect(plan(tasks, [sheet("s", "PreMix Powder - Egg Chocolate", "2026-11-18")])).toEqual([]);
  });

  it("the owner's own sheet is preferred over someone else's for the same task", () => {
    const tasks = [task("t", "Whole Grain Bread (1 Bowl)", "2026-11-18", "OVERDUE")];
    const sheets = [
      sheet("hugo-sheet", "Whole Grain Bread", "2026-11-18", { submittedById: HUGO, submittedAt: new Date("2026-11-18T10:00:00Z") }),
      sheet("ivan-sheet", "Whole Grain Bread", "2026-11-18", { submittedAt: new Date("2026-11-18T20:00:00Z") }),
    ];
    expect(plan(tasks, sheets)).toEqual([{ instanceId: "t", submissionId: "ivan-sheet", how: "exact date" }]);
  });
});

describe("agreement with the Production Schedule's matcher", () => {
  it("on the same inputs, every pairing equals matchSubmissionsConsume's", () => {
    const tasks = [
      task("egg-thu", "Protein Powder - Egg Unflavored (600 units EXP 05/12/26)", "2026-11-19"),
      task("granola-wed", "ProGranola - Chocolate (50 Bowls)", "2026-11-18"),
      task("bread-mon", "Whole Grain Bread (1 Bowl)", "2026-11-16"),
      task("bread-thu", "Whole Grain Bread (1 Bowl)", "2026-11-19"),
      task("premix-next", "PreMix Powder - Egg Chocolate (2 Bowls)", "2026-11-23"),
      task("bread-prev", "Whole Grain Bread (1 Bowl)", "2026-11-12"),
    ];
    const sheets = [
      sheet("egg", "Protein Powder - Egg Unflavored", "2026-11-17", { productId: "p-egg" }),
      sheet("granola", "ProGranola – Chocolate", "2026-11-17"), // en dash, as typed in a template
      sheet("bread-a", "Whole Grain Bread", "2026-11-19"),
      sheet("bread-b", "whole  grain bread", "2026-11-17"),
      sheet("premix", "PreMix Powder - Egg Chocolate", "2026-11-19"),
      sheet("bread-old", "Whole Grain Bread", "2026-11-10"),
    ];
    const productIdOfTask = (t: ReconTask) => PRODUCTS.find((p) => normalizeProductName(p.name) === normalizeProductName(productNameFromTaskLabel(t.label)))!.id;
    const reference = matchSubmissionsConsume(
      tasks.map((t) => ({ productId: productIdOfTask(t), isoDate: t.dueDate })),
      sheets,
      (s) => s.productId ?? PRODUCTS.find((p) => normalizeProductName(p.name) === normalizeProductName(s.templateName))?.id ?? null,
      FINISHED_STATUSES,
    );
    const expected = tasks
      .map((t) => ({ instanceId: t.id, submissionId: reference.get(`${productIdOfTask(t)}:${t.dueDate}`)?.id }))
      .filter((x) => x.submissionId)
      .sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    const actual = plan(tasks, sheets).map(({ instanceId, submissionId }) => ({ instanceId, submissionId })).sort((a, b) => a.instanceId.localeCompare(b.instanceId));

    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(5); // premix-next is in another week and stays open
  });

  it("the copied name normalisation is character-for-character the route's", () => {
    const body = (file: string, fn: string) => {
      const src = readFileSync(resolve(__dirname, file), "utf8");
      const m = src.match(new RegExp(`function ${fn}\\(s: string\\): string \\{\\s*return ([^;]+);`));
      if (!m) throw new Error(`${fn} not found in ${file}`);
      return m[1].replace(/\s+/g, " ");
    };
    expect(body("../batch-sheet-reconcile.ts", "normalizeProductName")).toBe(
      body("../../app/api/dashboard/production-schedule/route.ts", "normalizeName"),
    );
  });

  it("task labels written by the calendar generator reduce to the sheet's product name", () => {
    expect(productNameFromTaskLabel("Protein Powder - Egg Unflavored (600 units EXP 05/12/26)")).toBe("Protein Powder - Egg Unflavored");
    expect(productNameFromTaskLabel("Waffle Mix (4 Bowls lot 41)")).toBe("Waffle Mix");
    expect(productNameFromTaskLabel("Whole Grain Bread (1 Bowl)")).toBe("Whole Grain Bread");
    expect(productNameFromTaskLabel("Dinner Roll")).toBe("Dinner Roll");
    expect(productNameFromTaskLabel("Dinner Roll #2")).toBe("Dinner Roll");
    expect(productNameFromTaskLabel("Bars (Keto) (12 Trays)")).toBe("Bars (Keto)");
  });
});

describe("the sweep (reconcileBatchSheetTasks)", () => {
  it("window is the current and previous Monday–Sunday week, Pacific", () => {
    expect(sweepRange("2026-11-19")).toEqual({ from: "2026-11-09", to: "2026-11-22" });
    expect(sweepRange("2026-11-22")).toEqual({ from: "2026-11-09", to: "2026-11-22" }); // Sunday
    expect(sweepRange("2026-11-23")).toEqual({ from: "2026-11-16", to: "2026-11-29" }); // Monday
  });

  it("repairs an unlinked sheet: task DONE at the sheet's submission time, not late, audit says how", async () => {
    const { state, client } = fakeDb(
      [task("egg-1119", "Protein Powder - Egg Unflavored (600 units EXP 05/12/26)", "2026-11-19", "DUE_TODAY")],
      [sheet("egg-sheet", "Protein Powder - Egg Unflavored", "2026-11-17", { productId: "p-egg" })],
    );
    const result = await sweep(client);

    expect(result.completed).toEqual([{ instanceId: "egg-1119", submissionId: "egg-sheet", how: "schedule rule", nonOwner: false, daysLate: null }]);
    expect(state.tasks[0]).toMatchObject({
      status: "DONE", doneAt: new Date("2026-11-19T18:27:04Z"), doneById: IVAN,
      completedLate: false, daysLate: null, completedBySubmissionId: "egg-sheet", ownerUserId: IVAN,
    });
    expect(state.tasks[0].needsAdminReview).toBeUndefined();
    expect(state.audits).toEqual([
      { instanceId: "egg-1119", action: "completed", userId: IVAN, note: "Auto-completed by form submission egg-sheet — linked by schedule rule (reconciliation sweep, nightly cron)" },
    ]);
  });

  it("run twice: the second run changes nothing", async () => {
    const { state, db, client } = fakeDb(
      [task("granola-1118", "ProGranola - Chocolate (50 Bowls)", "2026-11-18", "OVERDUE")],
      [sheet("granola-sheet", "ProGranola - Chocolate", "2026-11-17", { submittedAt: new Date("2026-11-19T13:42:06Z") })],
    );
    const first = await sweep(client);
    const snapshot = JSON.stringify(state);
    const second = await sweep(client);

    expect(first.completed).toHaveLength(1);
    expect(first.completed[0]).toMatchObject({ daysLate: 1 });
    expect(second.completed).toEqual([]);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(db.ruleInstance.updateMany).toHaveBeenCalledTimes(1);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].note).toContain("(1 day(s) late)");
  });

  it("a non-owner's sheet completes the task with the 'Completed by non-owner' review flag", async () => {
    const { state, client } = fakeDb(
      [task("t", "Whole Grain Bread (1 Bowl)", "2026-11-18", "OVERDUE")],
      [sheet("s", "Whole Grain Bread", "2026-11-18", { submittedById: HUGO, submittedAt: new Date("2026-11-18T21:00:00Z") })],
    );
    const result = await sweep(client);

    expect(result.completed[0]).toMatchObject({ nonOwner: true, how: "exact date" });
    expect(state.tasks[0]).toMatchObject({ status: "DONE", doneById: HUGO, ownerUserId: IVAN, needsAdminReview: true, reviewReason: "Completed by non-owner" });
    expect(state.audits[0].note).toContain("Completed by non-owner");
  });

  it("an explicit link is honoured even when the task is outside the two-week window, and the audit says 'task link'", async () => {
    const { state, client } = fakeDb(
      [task("old", "Whole Grain Bread (1 Bowl)", "2026-10-20", "OVERDUE")],
      [sheet("s", "Whole Grain Bread", "2026-11-19", { taskInstanceId: "old" })],
    );
    await sweep(client);
    expect(state.tasks[0].status).toBe("DONE");
    expect(state.audits[0].note).toContain("linked by task link");
  });

  it("skipped, missed and done tasks are left exactly as they are", async () => {
    const tasks = [
      task("skipped", "PreMix Powder - Egg Chocolate (3 Bowls)", "2026-11-18", "SKIPPED"),
      task("missed", "Whole Grain Bread (1 Bowl)", "2026-11-17", "MISSED"),
      task("done", "ProGranola - Chocolate (50 Bowls)", "2026-11-18", "DONE", { completedBySubmissionId: "granola" }),
    ];
    const { state, db, client } = fakeDb(tasks, [
      sheet("premix", "PreMix Powder - Egg Chocolate", "2026-11-19"),
      sheet("bread", "Whole Grain Bread", "2026-11-17"),
      sheet("granola", "ProGranola - Chocolate", "2026-11-17"),
    ]);
    const before = JSON.stringify(state);
    expect((await sweep(client)).completed).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
    expect(db.ruleInstance.updateMany).not.toHaveBeenCalled();
  });

  it("a task someone changed in the meantime is not overwritten and gets no audit row", async () => {
    const { state, db, client } = fakeDb(
      [task("t", "Whole Grain Bread (1 Bowl)", "2026-11-18", "OVERDUE")],
      [sheet("s", "Whole Grain Bread", "2026-11-18")],
    );
    db.ruleInstance.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await sweep(client)).completed).toEqual([]);
    expect(state.audits).toEqual([]);
  });
});

describe("resolveBatchSheetTaskLink", () => {
  it("accepts a batch-sheet task id, rejects other forms, unknown ids and non-strings", async () => {
    const { db, client } = fakeDb([task("bs", "Whole Grain Bread (1 Bowl)", "2026-11-18")], []);
    expect(await resolveBatchSheetTaskLink("bs", client)).toBe("bs");
    expect(await resolveBatchSheetTaskLink("nope", client)).toBeNull();
    expect(await resolveBatchSheetTaskLink(undefined, client)).toBeNull();
    expect(await resolveBatchSheetTaskLink(42, client)).toBeNull();
    db.ruleInstance.findUnique.mockResolvedValueOnce({ id: "preop", rule: { formKey: "preop" } } as never);
    expect(await resolveBatchSheetTaskLink("preop", client)).toBeNull();
  });
});
