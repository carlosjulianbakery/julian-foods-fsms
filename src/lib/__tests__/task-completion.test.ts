import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma";
import {
  completeRuleInstanceForSubmission,
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
