/**
 * The CAPA follow-up task belongs to the CAPA alone. This file runs the REAL task generator, status
 * promotion, calendar sync, reminders, escalations and batch sheet sweep against a database holding
 * CAPA tasks in every state, next to ordinary tasks those jobs do act on, and checks that no job
 * creates, deletes, flags, relabels or completes a CAPA task.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", async () => { const { makePrisma } = await import("./memdb"); return { prisma: makePrisma() }; });
// Only the Google Sheet itself is replaced: what the sheet says is set per test
vi.mock("@/lib/google-sheets-fetcher", () => ({ fetchSheetRows: vi.fn(async () => ({ rows: [] })), invalidateSheetCache: vi.fn() }));
vi.mock("@/lib/sheet-parser", async (original) => ({ ...(await original<typeof import("@/lib/sheet-parser")>()), parseDaysInRange: vi.fn(() => []) }));

import { getServerSession } from "next-auth";
import { resetDb, seed, table } from "./memdb";
import { POST as NEW_C } from "@/app/api/quality/capas/route";
import { POST as ACT_C } from "@/app/api/quality/capas/[id]/status/route";
import { prisma } from "@/lib/prisma";
import { parseDaysInRange } from "@/lib/sheet-parser";
import { generateInstances, updateStatuses, computeDueDates } from "@/lib/task-generator";
import { generateCalendarInstances } from "@/lib/calendar-generator";
import { sendReminders } from "@/lib/task-reminders";
import { sendEscalations } from "@/lib/task-escalation";
import { reconcileBatchSheetTasks } from "@/lib/batch-sheet-reconcile";

type MockFn = ReturnType<typeof vi.fn>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const req = (body: unknown) => new NextRequest("http://localhost/api/quality", { method: "POST", body: JSON.stringify(body) });
const d = (day: string) => new Date(`${day}T00:00:00Z`);
const isCapaTask = (t: Row) => String(t.calendarKey ?? "").startsWith("capa:");
const capaTasks = () => table("ruleInstance").filter(isCapaTask);
const otherTasks = () => table("ruleInstance").filter((t) => !isCapaTask(t));
const byLabel = (problem: string) => capaTasks().find((t) => t.label.endsWith(problem))!;
/** Everything stored about every CAPA task, and its audit rows. */
const snapshot = () => structuredClone({ tasks: capaTasks(), audits: table("taskInstanceAudit").filter((a) => capaTasks().some((t) => t.id === a.instanceId)), rule: table("taskRule").find((r) => r.formKey === "quality_capa") });
/** The same, without the fields the status promotion is allowed to touch. */
const withoutStatus = (s: ReturnType<typeof snapshot>) => ({ ...s, tasks: s.tasks.map(({ status: _s, updatedAt: _u, ...rest }: Row) => rest) }); // eslint-disable-line @typescript-eslint/no-unused-vars
const production = (...days: string[]) => (parseDaysInRange as unknown as MockFn).mockReturnValue(days.map((iso_date) => ({ iso_date, items: [{ item_type: "production", product_name: "Whole Grain Bread" }] })));

async function capa(problem: string, dueDate: string, ownerId = "chris") {
  const res = await NEW_C(req({ source: "audit_finding", problem, ownerId, dueDate }));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.GOOGLE_SHEETS_API_KEY = "test-key";
  at("2026-11-21T18:00:00Z"); // Saturday November 21, 2026, 10:00 AM Pacific
  resetDb();
  for (const m of ["error", "log", "warn"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  (getServerSession as unknown as MockFn).mockResolvedValue({ user: { id: "carlos", role: "ADMIN", name: "Carlos Gomory" } });
  seed("user", [{ id: "carlos", name: "Carlos Gomory", role: "ADMIN", active: true }, { id: "chris", name: "Chris Pence", role: "ADMIN", active: true }, { id: "hugo", name: "Hugo Ayala", role: "SUPERVISOR", active: true }]);
  seed("facility", [{ id: "fac-jb", name: "Julian Bakery", calendarTabName: "JB Calendar" }, { id: "fac-624", name: "624", calendarTabName: "624 Calendar" }]);
  seed("product", [{ id: "p-bread", name: "Whole Grain Bread", isActive: true }]);
  seed("taskRule", [
    { id: "rule-preop", title: "Pre-Op Inspection", facilityId: "fac-jb", ownerId: "hugo", triggerType: "PRODUCTION_DAY", formKey: "preop", recurrenceStart: d("2026-11-12"), sortOrder: 10 },
    { id: "rule-batch", title: "Batch Sheet", facilityId: "fac-jb", ownerId: "hugo", triggerType: "PRODUCTION_PRODUCT", formKey: "batch_sheet", recurrenceStart: d("2026-11-12"), sortOrder: 20 },
    { id: "rule-fm", title: "Foreign Matter Inspection", facilityId: "fac-624", ownerId: "hugo", triggerType: "RECURRING", recurrenceUnit: "half_month", formKey: "foreign_matter_624", recurrenceStart: d("2026-11-20"), sortOrder: 120 },
    { id: "rule-daily", title: "Daily walk-through", facilityId: "fac-jb", ownerId: "hugo", triggerType: "RECURRING", recurrenceUnit: "day", formKey: "manual", recurrenceStart: d("2026-11-01"), sortOrder: 30 },
  ]);
  // CAPA tasks in every state, all made through the real CAPA route
  await capa("overdue", "2026-11-18");
  await capa("due yesterday", "2026-11-20");
  await capa("due today", "2026-11-21");
  await capa("due tomorrow", "2026-11-22");
  await capa("next week", "2026-11-25");
  await capa("next month", "2026-12-15", "carlos");
  await capa("started", "2026-11-24");
  byLabel("started").status = "IN_PROGRESS";
  const done = await capa("finished", "2026-11-23");
  await ACT_C(req({ action: "move", to: "in_progress" }), { params: { id: done.id } });
  await ACT_C(req({ action: "move", to: "verifying" }), { params: { id: done.id } });
});

describe("the starting point", () => {
  it("eight CAPA tasks exist, under one system rule: overdue, due today, upcoming, started and done", () => {
    expect(capaTasks().map((t) => [t.label.split(": ")[1], t.status, t.dueDate.toISOString().slice(0, 10), t.source])).toEqual([
      ["overdue", "OVERDUE", "2026-11-18", "MANUAL"], ["due yesterday", "OVERDUE", "2026-11-20", "MANUAL"], ["due today", "DUE_TODAY", "2026-11-21", "MANUAL"],
      ["due tomorrow", "UPCOMING", "2026-11-22", "MANUAL"], ["next week", "UPCOMING", "2026-11-25", "MANUAL"], ["next month", "UPCOMING", "2026-12-15", "MANUAL"],
      ["started", "IN_PROGRESS", "2026-11-24", "MANUAL"], ["finished", "DONE", "2026-11-23", "MANUAL"],
    ]);
    expect(new Set(capaTasks().map((t) => t.ruleId)).size).toBe(1);
    expect(otherTasks()).toHaveLength(0);
  });
});

describe("task generator (generateInstances)", () => {
  it("creates the recurring tasks of ordinary rules and nothing for the CAPA rule; CAPA tasks are untouched", async () => {
    const before = snapshot();
    const { created } = await generateInstances();
    expect(created).toBeGreaterThan(30); // 31 daily tasks + the half-month ones: the generator did run
    expect(otherTasks()).toHaveLength(created);
    expect(otherTasks().every((t) => ["rule-daily", "rule-fm"].includes(t.ruleId))).toBe(true);
    expect(capaTasks()).toHaveLength(8);
    expect(snapshot()).toEqual(before);
    // a second run, and runs on later days, change nothing either
    await generateInstances();
    for (const later of ["2026-11-22", "2026-12-01", "2026-12-31", "2027-01-01", "2027-06-15"]) { at(`${later}T18:00:00Z`); await generateInstances(); }
    expect(snapshot()).toEqual(before);
  });

  it("the CAPA rule can never produce a date: it is a one-off whose date is in the past", () => {
    const rule = table("taskRule").find((r) => r.formKey === "quality_capa")!;
    expect([rule.triggerType, rule.recurrenceStart.toISOString().slice(0, 10)]).toEqual(["ONE_OFF", "2026-01-01"]);
    for (const today of ["2026-11-21", "2026-12-31", "2027-01-01", "2027-12-02", "2030-01-01"]) expect(computeDueDates(rule as never, today, "2031-01-01"), today).toEqual([]);
  });
});

describe("status promotion (updateStatuses)", () => {
  it("moves a CAPA task to due today and overdue like any other task — and changes nothing else about it", async () => {
    const before = snapshot();
    expect((await updateStatuses()).updated).toBe(0); // already right when created
    expect(snapshot()).toEqual(before);

    at("2026-11-22T18:00:00Z"); // the next day
    await updateStatuses();
    expect(capaTasks().map((t) => [t.label.split(": ")[1], t.status])).toEqual([
      ["overdue", "OVERDUE"], ["due yesterday", "OVERDUE"], ["due today", "OVERDUE"], ["due tomorrow", "DUE_TODAY"],
      ["next week", "UPCOMING"], ["next month", "UPCOMING"], ["started", "IN_PROGRESS"], ["finished", "DONE"],
    ]);
    expect(withoutStatus(snapshot())).toEqual(withoutStatus(before)); // same tasks, labels, owners, dates, flags, completion, audits
    expect(capaTasks().every((t) => t.needsAdminReview === false)).toBe(true);

    at("2026-12-20T18:00:00Z"); // a month later: everything open is overdue, the finished one stays finished
    await updateStatuses();
    expect(capaTasks().map((t) => t.status)).toEqual(["OVERDUE", "OVERDUE", "OVERDUE", "OVERDUE", "OVERDUE", "OVERDUE", "OVERDUE", "DONE"]);
    expect(withoutStatus(snapshot())).toEqual(withoutStatus(before));
  });
});

describe("calendar sync (generateCalendarInstances)", () => {
  beforeEach(() => {
    // schedule tasks the sync owns, on the same days and in the same facility as CAPA tasks
    seed("ruleInstance", [
      { id: "preop-23", ruleId: "rule-preop", dueDate: d("2026-11-23"), source: "SCHEDULE", calendarKey: "day:2026-11-23", status: "UPCOMING" },
      { id: "preop-24", ruleId: "rule-preop", dueDate: d("2026-11-24"), source: "SCHEDULE", calendarKey: "day:2026-11-24", status: "IN_PROGRESS" },
    ]);
  });

  it("creates, deletes and flags its own schedule tasks; no CAPA task is created, deleted, flagged or relabelled", async () => {
    const before = snapshot();
    production("2026-11-25"); // the 23rd and 24th are no longer production days; the 25th is new
    const out = await generateCalendarInstances();
    expect([out.totalCreated, out.totalDeleted, out.totalFlagged]).toEqual([1, 1, 1]); // the sync did act
    expect(table("ruleInstance").find((t) => t.id === "preop-23")).toBeUndefined();
    expect(table("ruleInstance").find((t) => t.id === "preop-24")).toMatchObject({ needsAdminReview: true });
    expect(otherTasks().map((t) => t.calendarKey).sort()).toEqual(["day:2026-11-24", "day:2026-11-25"]);
    expect(capaTasks()).toHaveLength(8);
    expect(snapshot()).toEqual(before);
  });

  it("the same when the sheet shows no production at all, production every day, or the sync runs for one facility", async () => {
    const before = snapshot();
    table("ruleInstance").find((t) => t.id === "preop-24")!.status = "DONE"; // so the 'zero production days' guard lets the sync through
    table("ruleInstance").find((t) => t.id === "preop-23")!.status = "OVERDUE";
    production();
    await generateCalendarInstances();
    expect(snapshot()).toEqual(before);
    production("2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28");
    const all = await generateCalendarInstances({ invalidateCache: true });
    expect(all.totalCreated).toBeGreaterThan(5);
    expect(snapshot()).toEqual(before);
    await generateCalendarInstances({ facilityId: "fac-jb" });
    await generateCalendarInstances({ dryRun: true });
    expect(snapshot()).toEqual(before);
    expect(capaTasks().every((t) => t.sortKey === null && t.source === "MANUAL")).toBe(true);
  });
});

describe("reminders and escalations", () => {
  it("the owner is reminded like for any task (tomorrow, today, overdue); the task itself is not changed", async () => {
    const before = snapshot();
    const out = await sendReminders();
    expect(out).toEqual({ dueSoon: 1, dueToday: 1, overdue: 2 });
    const notes = table("notification");
    expect(notes.map((n) => [n.type, n.userId, capaTasks().find((t) => t.id === n.instanceId)!.label.split(": ")[1]])).toEqual([
      ["TASK_DUE_SOON", "chris", "due tomorrow"], ["TASK_DUE_TODAY", "chris", "due today"], ["TASK_OVERDUE", "chris", "overdue"], ["TASK_OVERDUE", "chris", "due yesterday"],
    ]);
    expect(notes[0].body).toBe('"CAPA follow-up" is due tomorrow (2026-11-22).');
    expect(snapshot()).toEqual(before);
    await sendReminders(); // the same day again: no duplicates, still no change
    expect(table("notification")).toHaveLength(4);
    await sendReminders({ dryRun: true });
    expect(snapshot()).toEqual(before);
  });

  it("an overdue CAPA task escalates to the admins after two days, as for any task; the task itself is not changed", async () => {
    const before = snapshot();
    const out = await sendEscalations();
    expect(out.escalated).toBe(2); // the one due the 18th, to both admins; the one due yesterday is not there yet
    expect(table("notification").map((n) => [n.type, n.userId]).sort()).toEqual([["TASK_ESCALATED", "carlos"], ["TASK_ESCALATED", "chris"]]);
    expect(new Set(table("notification").map((n) => n.instanceId))).toEqual(new Set([byLabel("overdue").id]));
    expect(snapshot()).toEqual(before);
  });
});

describe("batch sheet sweep (reconcileBatchSheetTasks)", () => {
  const sweep = () => reconcileBatchSheetTasks({ prismaClient: prisma as never, source: "nightly cron" });
  const sheet = (id: string, over: Row = {}) => ({ id, templateName: "Whole Grain Bread", productId: "p-bread", productionDate: d("2026-11-20"), status: "PASS", submittedById: "hugo", submittedAt: new Date("2026-11-20T20:00:00Z"), taskInstanceId: null, ...over });

  it("completes the batch sheet task that has a sheet, and leaves every CAPA task alone", async () => {
    seed("ruleInstance", [{ id: "bread-20", ruleId: "rule-batch", dueDate: d("2026-11-20"), source: "SCHEDULE", calendarKey: "prod:2026-11-20:whole grain bread:1", status: "OVERDUE", label: "Whole Grain Bread (2 Bowls)" }]);
    seed("batchSheetSubmission", [sheet("sheet-1")]);
    const before = snapshot();
    const out = await sweep();
    expect(out.completed.map((c) => c.instanceId)).toEqual(["bread-20"]); // the sweep did act
    expect(out.examinedTasks).toBe(1); // it never even looks at a CAPA task
    expect(table("ruleInstance").find((t) => t.id === "bread-20")).toMatchObject({ status: "DONE", completedBySubmissionId: "sheet-1" });
    expect(snapshot()).toEqual(before);
  });

  it("even a sheet that points straight at a CAPA task, or shares its wording and date, cannot complete it", async () => {
    const target = byLabel("due yesterday");
    seed("batchSheetSubmission", [
      sheet("sheet-pointing", { taskInstanceId: target.id }),
      sheet("sheet-same-day", { templateName: target.label }),
      sheet("sheet-other", { taskInstanceId: byLabel("started").id, productionDate: d("2026-11-24") }),
    ]);
    const before = snapshot();
    const out = await sweep();
    expect([out.examinedSubmissions, out.examinedTasks, out.completed]).toEqual([2, 0, []]);
    expect(snapshot()).toEqual(before);
    expect((await reconcileBatchSheetTasks({ prismaClient: prisma as never, source: "nightly cron", includeSubmissionId: "sheet-other" })).completed).toEqual([]);
    expect(snapshot()).toEqual(before);
  });
});

describe("all of them, one after the other, over several days", () => {
  it("a week of nightly runs leaves the CAPA tasks exactly as the CAPAs made them, apart from due today / overdue", async () => {
    const before = snapshot();
    seed("batchSheetSubmission", [{ id: "s1", templateName: "Whole Grain Bread", productId: "p-bread", productionDate: d("2026-11-23"), status: "PASS", submittedById: "hugo", submittedAt: new Date("2026-11-23T20:00:00Z"), taskInstanceId: null }]);
    for (const today of ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]) {
      at(`${today}T09:00:00Z`); // the nightly job, 1 AM Pacific
      production(today, "2026-11-30");
      await generateInstances(); await generateCalendarInstances(); await updateStatuses();
      await reconcileBatchSheetTasks({ prismaClient: prisma as never, source: "nightly cron" });
      await sendReminders(); await sendEscalations();
    }
    expect(capaTasks()).toHaveLength(8);
    expect(withoutStatus(snapshot())).toEqual(withoutStatus(before));
    expect(capaTasks().map((t) => [t.label.split(": ")[1], t.status])).toEqual([
      ["overdue", "OVERDUE"], ["due yesterday", "OVERDUE"], ["due today", "OVERDUE"], ["due tomorrow", "OVERDUE"],
      ["next week", "OVERDUE"], ["next month", "UPCOMING"], ["started", "OVERDUE"], ["finished", "DONE"],
    ]);
    expect(table("ruleInstance").filter((t) => t.ruleId === snapshot().rule!.id)).toHaveLength(8); // nothing was added under the CAPA rule
  });
});
