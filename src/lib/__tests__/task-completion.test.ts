import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma";
import {
  completeRuleInstanceForSubmission,
  completeBatchSheetInstance,
  isOpenForCompletion,
  pickFallbackInstance,
} from "@/lib/task-completion";

// Submission day for every test: Thursday 2026-11-19, 11:00 PT
const NOW = new Date("2026-11-19T19:00:00Z");
const IVAN = "user-ivan";

type Row = {
  id: string;
  dueDate: Date;
  status: string;
  label: string;
  ownerUserId: string | null;
  rule: { formKey: string; ownerId: string; facility: { name: string }; windowMode: string; windowDaysBefore: number | null; recurrenceUnit: string | null };
};

function row(id: string, due: string, status: string, over: { label?: string; formKey?: string; windowMode?: string; windowDaysBefore?: number | null; recurrenceUnit?: string | null; ownerId?: string } = {}): Row {
  return {
    id,
    dueDate: new Date(due + "T00:00:00Z"),
    status,
    label: over.label ?? "",
    ownerUserId: null,
    rule: {
      formKey: over.formKey ?? "preop",
      ownerId: over.ownerId ?? IVAN,
      facility: { name: "Julian Bakery" },
      windowMode: over.windowMode ?? "NONE",
      windowDaysBefore: over.windowDaysBefore ?? null,
      recurrenceUnit: over.recurrenceUnit ?? null,
    },
  };
}

function fakeDb(opts: { candidates?: Row[]; crossFacility?: Row[]; byId?: Row | null; alreadyClosed?: string | null } = {}) {
  const findMany = vi.fn();
  findMany.mockResolvedValueOnce(opts.candidates ?? []);
  findMany.mockResolvedValue(opts.crossFacility ?? []);
  const db = {
    ruleInstance: {
      findFirst: vi.fn().mockResolvedValue(opts.alreadyClosed ? { id: opts.alreadyClosed } : null),
      findUnique: vi.fn().mockResolvedValue(opts.byId ?? null),
      findMany,
      update: vi.fn().mockResolvedValue({}),
    },
    taskInstanceAudit: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  return { db, client: db as unknown as PrismaClient };
}

const updated = (db: ReturnType<typeof fakeDb>["db"]) => db.ruleInstance.update.mock.calls.map((c) => ({ id: c[0].where.id, ...c[0].data }));

beforeEach(() => {
  vi.setSystemTime(NOW);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const batch = (client: PrismaClient, over: Partial<Parameters<typeof completeBatchSheetInstance>[0]> = {}) =>
  completeBatchSheetInstance({
    submissionId: "sub-1",
    userId: IVAN,
    userRole: "SUPERVISOR",
    submissionDate: "2026-11-17",
    productName: "ProGranola - Chocolate",
    taskId: null,
    prismaClient: client,
    ...over,
  });

const generic = (client: PrismaClient, over: Partial<Parameters<typeof completeRuleInstanceForSubmission>[0]> = {}) =>
  completeRuleInstanceForSubmission({
    formKey: "preop",
    submissionId: "sub-1",
    userId: IVAN,
    submissionDate: "2026-11-19",
    taskId: null,
    prismaClient: client,
    ...over,
  });

const bs = { formKey: "batch_sheet" };

describe("batch sheet — the ProGranola case", () => {
  it("sheet dated 11/17, task due 11/18 still stored UPCOMING, submitted 11/19 → completes, late by 1", async () => {
    const { db, client } = fakeDb({
      candidates: [row("progranola-1118", "2026-11-18", "UPCOMING", { ...bs, label: "ProGranola - Chocolate (50 Bowls)" })],
    });

    expect(await batch(client)).toBe("progranola-1118");
    expect(updated(db)).toEqual([
      {
        id: "progranola-1118",
        status: "DONE",
        doneAt: NOW,
        doneById: IVAN,
        completedLate: true,
        daysLate: 1,
        completedBySubmissionId: "sub-1",
        ownerUserId: IVAN,
      },
    ]);
    expect(db.taskInstanceAudit.create.mock.calls[0][0].data).toMatchObject({ instanceId: "progranola-1118", action: "completed" });
    expect(updated(db)[0]).not.toHaveProperty("needsAdminReview"); // late completion is not flagged for review
  });

  it("exact date match wins over an older open instance", async () => {
    const { db, client } = fakeDb({
      candidates: [
        row("older-open", "2026-11-18", "OVERDUE", { ...bs, label: "ProGranola - Chocolate (50 Bowls)" }),
        row("exact", "2026-11-19", "UPCOMING", { ...bs, label: "ProGranola - Chocolate (20 Bowls)" }),
      ],
    });
    expect(await batch(client, { submissionDate: "2026-11-19" })).toBe("exact");
    expect(updated(db)[0]).toMatchObject({ id: "exact", completedLate: false, daysLate: null });
  });

  it("a different product is never matched", async () => {
    const { db, client } = fakeDb({
      candidates: [row("crackers", "2026-11-18", "OVERDUE", { ...bs, label: "Organic Seed Crackers - Parmesan (6 Bowls)" })],
      crossFacility: [row("crackers", "2026-11-18", "OVERDUE", { ...bs, label: "Organic Seed Crackers - Parmesan (6 Bowls)" })],
    });
    expect(await batch(client)).toBeNull();
    expect(db.ruleInstance.update).not.toHaveBeenCalled();
  });

  it("today's sheet never closes a future task", async () => {
    const future = row("next-week", "2026-11-24", "UPCOMING", { ...bs, label: "ProGranola - Chocolate (50 Bowls)" });
    const { db, client } = fakeDb({ candidates: [future], crossFacility: [future] });
    expect(await batch(client, { submissionDate: "2026-11-19" })).toBeNull();
    expect(db.ruleInstance.update).not.toHaveBeenCalled();
  });

  it("lookback is 6 days: due 11/13 is matched, due 11/12 is not", async () => {
    const label = "ProGranola - Chocolate (50 Bowls)";
    const six = fakeDb({ candidates: [row("six-days", "2026-11-13", "OVERDUE", { ...bs, label })] });
    expect(await batch(six.client)).toBe("six-days");
    expect(updated(six.db)[0]).toMatchObject({ completedLate: true, daysLate: 6 });

    const seven = fakeDb({ candidates: [row("seven-days", "2026-11-12", "OVERDUE", { ...bs, label })], crossFacility: [] });
    expect(await batch(seven.client)).toBeNull();
  });

  it("with two open tasks for the product, the oldest is closed — and only that one", async () => {
    const label = "ProGranola - Chocolate (50 Bowls)";
    const { db, client } = fakeDb({
      candidates: [row("newer", "2026-11-18", "OVERDUE", { ...bs, label }), row("oldest", "2026-11-16", "OVERDUE", { ...bs, label })],
    });
    expect(await batch(client)).toBe("oldest");
    expect(db.ruleInstance.update).toHaveBeenCalledTimes(1);
  });

  it("a re-submitted sheet that already closed an instance cannot close a second", async () => {
    const { db, client } = fakeDb({
      alreadyClosed: "closed-earlier",
      candidates: [row("another", "2026-11-18", "OVERDUE", { ...bs, label: "ProGranola - Chocolate (50 Bowls)" })],
    });
    expect(await batch(client)).toBe("closed-earlier");
    expect(db.ruleInstance.findFirst.mock.calls[0][0].where).toEqual({ completedBySubmissionId: "sub-1" });
    expect(db.ruleInstance.findMany).not.toHaveBeenCalled();
    expect(db.ruleInstance.update).not.toHaveBeenCalled();
  });

  it("a match in another owner's facility keeps the 'Completed by non-owner' review flag", async () => {
    const other = row("other-facility", "2026-11-18", "UPCOMING", { ...bs, label: "ProGranola - Chocolate (50 Bowls)", ownerId: "user-hugo" });
    const { db, client } = fakeDb({ candidates: [], crossFacility: [other] });
    expect(await batch(client)).toBe("other-facility");
    expect(updated(db)[0]).toMatchObject({ needsAdminReview: true, reviewReason: "Completed by non-owner", completedLate: true, daysLate: 1 });
  });
});

describe("generic forms (Pre-Op, cleaning, receiving, 624 forms)", () => {
  it("taskId closes exactly that instance", async () => {
    const { db, client } = fakeDb({ byId: row("named", "2026-11-18", "UPCOMING") });
    expect(await generic(client, { taskId: "named" })).toBe("named");
    expect(db.ruleInstance.findMany).not.toHaveBeenCalled();
    expect(updated(db)[0]).toMatchObject({ id: "named", completedLate: true, daysLate: 1 });
  });

  it("exact date match wins over an older overdue instance", async () => {
    const { db, client } = fakeDb({ candidates: [row("yesterday", "2026-11-18", "OVERDUE"), row("today", "2026-11-19", "UPCOMING")] });
    expect(await generic(client)).toBe("today");
    expect(updated(db)[0]).toMatchObject({ completedLate: false, daysLate: null });
  });

  it("no task for the form's date: yesterday's task stored UPCOMING is closed, late by 1", async () => {
    const { db, client } = fakeDb({ candidates: [row("yesterday", "2026-11-18", "UPCOMING")] });
    expect(await generic(client)).toBe("yesterday");
    expect(updated(db)[0]).toMatchObject({ completedLate: true, daysLate: 1 });
  });

  it("3-day limit: due 11/16 is matched, due 11/15 is not", async () => {
    const three = fakeDb({ candidates: [row("three-days", "2026-11-16", "OVERDUE")] });
    expect(await generic(three.client)).toBe("three-days");

    const four = fakeDb({ candidates: [row("four-days", "2026-11-15", "OVERDUE")] });
    expect(await generic(four.client)).toBeNull();
    expect(four.db.ruleInstance.update).not.toHaveBeenCalled();
  });

  it("a future UPCOMING task with no window is never matched", async () => {
    const { db, client } = fakeDb({ candidates: [row("tomorrow", "2026-11-20", "UPCOMING")] });
    expect(await generic(client)).toBeNull();
    expect(db.ruleInstance.update).not.toHaveBeenCalled();
  });

  it("period task with its window open (11/01–11/30) is closed without a taskId, not late", async () => {
    const monthly = row("monthly-nov", "2026-11-30", "UPCOMING", { formKey: "monthly_cleaning", windowMode: "PERIOD_START", recurrenceUnit: "month" });
    const { db, client } = fakeDb({ candidates: [monthly] });
    expect(await generic(client, { formKey: "monthly_cleaning" })).toBe("monthly-nov");
    expect(updated(db)[0]).toMatchObject({ status: "DONE", completedLate: false, daysLate: null });
  });

  it("period task outside its window (opens 5 days before 12/15) is not matched", async () => {
    const early = row("audit-prep", "2026-12-15", "UPCOMING", { formKey: "monthly_cleaning", windowMode: "DAYS_BEFORE", windowDaysBefore: 5 });
    const { db, client } = fakeDb({ candidates: [early] });
    expect(await generic(client, { formKey: "monthly_cleaning" })).toBeNull();
    expect(db.ruleInstance.update).not.toHaveBeenCalled();
  });

  it("one submission closes one instance even when several are open", async () => {
    const { db, client } = fakeDb({ candidates: [row("a", "2026-11-17", "OVERDUE"), row("b", "2026-11-18", "OVERDUE")] });
    expect(await generic(client, { submissionDate: "2026-11-20" })).toBe("a");
    expect(db.ruleInstance.update).toHaveBeenCalledTimes(1);
  });

  it("a second call for the same submission closes nothing more", async () => {
    const { db, client } = fakeDb({ alreadyClosed: "a", candidates: [row("b", "2026-11-18", "OVERDUE")] });
    expect(await generic(client)).toBe("a");
    expect(db.ruleInstance.update).not.toHaveBeenCalled();
  });

  it("a back-dated form is late by the real completion day, not by the date typed on the form", async () => {
    const { db, client } = fakeDb({ candidates: [row("mon", "2026-11-16", "OVERDUE")] });
    expect(await generic(client, { submissionDate: "2026-11-16" })).toBe("mon");
    expect(updated(db)[0]).toMatchObject({ completedLate: true, daysLate: 3, doneAt: NOW });
  });
});

describe("isOpenForCompletion / pickFallbackInstance", () => {
  const TODAY = "2026-11-19";
  it("stored open statuses are open; terminal ones never are", () => {
    for (const s of ["DUE_TODAY", "IN_PROGRESS", "OVERDUE"]) expect(isOpenForCompletion(row("x", "2026-11-18", s), TODAY)).toBe(true);
    for (const s of ["DONE", "SKIPPED", "MISSED"]) expect(isOpenForCompletion(row("x", "2026-11-18", s), TODAY)).toBe(false);
  });
  it("UPCOMING is open when due today or earlier, closed when due later with no window", () => {
    expect(isOpenForCompletion(row("x", "2026-11-18", "UPCOMING"), TODAY)).toBe(true);
    expect(isOpenForCompletion(row("x", "2026-11-19", "UPCOMING"), TODAY)).toBe(true);
    expect(isOpenForCompletion(row("x", "2026-11-20", "UPCOMING"), TODAY)).toBe(false);
  });
  it("picks the oldest eligible instance and ignores ones past the lookback", () => {
    const rows = [row("c", "2026-11-18", "OVERDUE"), row("too-old", "2026-11-10", "OVERDUE"), row("b", "2026-11-17", "UPCOMING")];
    expect(pickFallbackInstance(rows, TODAY, 3)?.id).toBe("b");
    expect(pickFallbackInstance(rows, TODAY, 30)?.id).toBe("too-old");
    expect(pickFallbackInstance([], TODAY, 3)).toBeUndefined();
  });
});
