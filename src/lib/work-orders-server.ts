/**
 * Maintenance Work Orders — everything that reads or writes the database. The routes are thin wrappers
 * around these functions. Every write is one transaction that also writes its line in the change log.
 * Who may do what is decided only by `workOrderCan` (src/lib/work-orders.ts), here, on the server.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { REFERENCE_KIND, formatReference, isDate } from "@/lib/quality";
import { QUALITY_NEXT_NUMBER_SQL } from "@/lib/quality-sql";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { RANK_STEP } from "@/lib/task-order";
import {
  OTHER_EQUIPMENT, STEP2_FIELDS, WORK_ORDER_FORM_KEY, WO_FACILITIES, WO_RULE_TITLE, WO_STATUSES, completionProblems, defaultFacility, diffFields, dueDateFor, isOpenStatus,
  parseRequest, parseStep2, step2OrderProblems, taskHasRealHistory, taskStatusForDue, workOrderCan, workOrderTaskKey, workOrderTaskLabel,
  type Change, type FieldValue, type Viewer, type WoEventAction, type WoProblem, type WorkOrderRow,
} from "@/lib/work-orders";

export type Tx = Prisma.TransactionClient;
export interface Actor extends Viewer { id: string; name: string; role: string }
type Wo = NonNullable<Awaited<ReturnType<Tx["workOrder"]["findUnique"]>>>;

/** An expected refusal: the route turns it into a JSON answer with this status. */
export class WorkOrderError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}
const refuse = (status: number, message: string, extra: Record<string, unknown> = {}) => new WorkOrderError(status, message, extra);
const invalid = (problems: WoProblem[]) => refuse(422, "Some fields need attention.", { problems });
const NOT_FOUND = "Work order not found.";

/** The person signed in, as the database knows them now (role and name are not taken from the browser's session). Null when the account is gone or not active. */
export async function currentActor(session: { user: { id: string } } | null): Promise<Actor | null> {
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, role: true, active: true } });
  return user && user.active ? { id: user.id, name: user.name?.trim() || "Unknown", role: String(user.role) } : null;
}

/** The check every work order route goes through: 401 without a session, 403 for an account that is no longer active. */
export async function workOrderRoute(fn: (actor: Actor) => Promise<unknown>, okStatus = 200): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await currentActor(session);
    if (!actor) return NextResponse.json({ error: "Forbidden — your account is not active" }, { status: 403 });
    return NextResponse.json(await fn(actor), { status: okStatus });
  } catch (e) {
    if (e instanceof WorkOrderError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error("[work-orders]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save. Nothing was changed." }, { status: 500 });
  }
}

const write = <T,>(fn: (tx: Tx) => Promise<T>): Promise<T> => prisma.$transaction(fn);
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const DAY_FIELDS = ["dueDate", "startDate", "completedDate"];
/** A record as the pages get it: days as YYYY-MM-DD, moments as ISO strings. */
const serialize = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, isDate(v) ? (DAY_FIELDS.includes(k) ? day(v) : v.toISOString()) : v]));

function recordEvent(tx: Tx, wo: { id: string; reference: string }, action: WoEventAction, actor: Actor, changes: Change[] = [], note?: string | null) {
  return tx.workOrderEvent.create({ data: { workOrderId: wo.id, reference: wo.reference, action, userId: actor.id, userName: actor.name, changes: changes as never, note: note?.trim() || null } });
}

/** The work order, or 404. Someone who may not see it also gets 404: its existence is not given away. */
async function load(tx: Tx, viewer: Viewer, id: string): Promise<Wo> {
  const row = await tx.workOrder.findUnique({ where: { id } });
  if (!row || !workOrderCan.view(viewer, row)) throw refuse(404, NOT_FOUND);
  return row;
}

/** Saves a change, refusing if someone else saved in the meantime (409). */
async function save(tx: Tx, current: Wo, data: Record<string, unknown>, expected: unknown, actor: Actor): Promise<Date> {
  const conflict = () => refuse(409, "Someone else changed this work order. Reload to see the latest version.", { code: "conflict" });
  if (typeof expected !== "string") throw refuse(400, "expectedUpdatedAt is required.");
  if (expected !== current.updatedAt.toISOString()) throw conflict();
  const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
  const res = await tx.workOrder.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: { ...data, updatedAt: now, updatedById: actor.id } as never });
  if (res.count !== 1) throw conflict();
  return now;
}

async function activeUser(tx: Tx, id: string | null | undefined): Promise<{ id: string; name: string } | null> {
  if (!id) return null;
  const u = await tx.user.findUnique({ where: { id }, select: { id: true, name: true, active: true } });
  return u && u.active ? { id: u.id, name: u.name } : null;
}

// ── The task: one per work order, always owned by the assignee ──────────────────

const ruleTitle = (facility: string) => (facility === "Julian Bakery" ? WO_RULE_TITLE : `${WO_RULE_TITLE} — ${facility}`);

/**
 * The system rule the tasks of a facility hang from, created on first use. ONE_OFF with a date in the
 * past, so the task generator never produces anything for it; its tasks are created, moved and removed
 * here and nowhere else. Ranked after every existing rule.
 */
export async function ensureWorkOrderRule(tx: Tx, facilityName: string, actor: Actor): Promise<{ id: string; created: boolean }> {
  const facility = await tx.facility.findUnique({ where: { name: facilityName }, select: { id: true } });
  if (!facility) throw refuse(500, `The facility "${facilityName}" was not found, so its work order rule cannot be created.`);
  const existing = await tx.taskRule.findFirst({ where: { formKey: WORK_ORDER_FORM_KEY, facilityId: facility.id }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  // The rule needs an owner; every task names its own person, so this is only what the Task Rules page shows
  const admins = await tx.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true, createdAt: true } });
  const ownerId = actor.role === "ADMIN" ? actor.id : admins.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.id ?? actor.id;
  const lastRank = (await tx.taskRule.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  const rule = await tx.taskRule.create({
    data: {
      title: ruleTitle(facilityName), description: "Managed by the system: one task per maintenance work order, for the person it is assigned to. Change the work order to change its task.",
      facilityId: facility.id, ownerId, triggerType: "ONE_OFF", recurrenceUnit: null, recurrenceEvery: 1, recurrenceStart: new Date("2026-01-01T00:00:00Z"),
      formKey: WORK_ORDER_FORM_KEY, windowMode: "NONE", isActive: true, sortOrder: lastRank + RANK_STEP,
    },
    select: { id: true },
  });
  return { id: rule.id, created: true };
}

/** Creates the task of a work order for its assignee. A task without a person is never written. */
async function createTask(tx: Tx, actor: Actor, wo: { id: string; reference: string; facility: string; equipmentName: string; problem: string; dueDate: Date; assigneeId: string | null; assigneeName: string }): Promise<string> {
  if (!wo.assigneeId) throw refuse(500, "A work order task needs an assignee.");
  const rule = await ensureWorkOrderRule(tx, wo.facility, actor);
  const due = day(wo.dueDate)!;
  const task = await tx.ruleInstance.create({
    data: {
      ruleId: rule.id, dueDate: wo.dueDate, status: taskStatusForDue(due, getPacificToday()), label: workOrderTaskLabel(wo.reference, wo.equipmentName, wo.problem),
      calendarKey: workOrderTaskKey(wo.id), source: "MANUAL", ownerUserId: wo.assigneeId,
    },
  });
  await tx.taskInstanceAudit.create({ data: { instanceId: task.id, action: "created", userId: actor.id, note: `Created for ${wo.reference} (assigned to ${wo.assigneeName})` } });
  await tx.workOrder.updateMany({ where: { id: wo.id }, data: { taskInstanceId: task.id } });
  return task.id;
}

const taskOf = (tx: Tx, wo: { taskInstanceId: string | null }) => (wo.taskInstanceId ? tx.ruleInstance.findUnique({ where: { id: wo.taskInstanceId } }) : Promise.resolve(null));
const TASK_OPEN = ["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"];

/** Marks the task done through the app's shared completion helper (its audit row; late if past the due date). Never fails the work order. */
async function completeTask(actor: Actor, wo: { id: string; facility: string }, taskId: string | null): Promise<string | null> {
  if (!taskId) return null;
  try {
    return await completeRuleInstanceForSubmission({
      formKey: WORK_ORDER_FORM_KEY, facilityName: wo.facility, submissionId: wo.id, userId: actor.id, submissionDate: getPacificToday(), taskId, prismaClient: prisma as never,
    });
  } catch (e) {
    console.error("[work-orders] task completion failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Self-heal, run when the list or a record is loaded: a work order that is already Completed but whose
 * task was left open gets that task completed. Only tasks of the work order rule that a work order points
 * at are looked at. Running it again changes nothing. Never fails the load.
 */
export async function healWorkOrderTasks(actor: Actor, id?: string): Promise<string[]> {
  const healed: string[] = [];
  try {
    const done = await prisma.workOrder.findMany({ where: { status: "completed", taskInstanceId: { not: null }, ...(id ? { id } : {}) } });
    if (done.length === 0) return healed;
    const tasks = await prisma.ruleInstance.findMany({ where: { id: { in: done.map((w) => w.taskInstanceId!) }, status: { in: TASK_OPEN as never } }, include: { rule: { select: { formKey: true } } } });
    for (const wo of done) {
      const task = tasks.find((t) => t.id === wo.taskInstanceId);
      if (!task || task.rule.formKey !== WORK_ORDER_FORM_KEY) continue;
      if ((await completeTask(actor, wo, task.id)) !== task.id) continue;
      await write((tx) => recordEvent(tx, wo, "task_completed", actor, [{ field: "task", from: "Open", to: "Done" }], "The task was still open although this work order was already completed. It was completed automatically when the work order was opened."));
      healed.push(wo.id);
    }
  } catch (e) {
    console.error("[work-orders] task self-heal failed:", e instanceof Error ? e.message : e);
  }
  return healed;
}

// ── Step 1: the request ─────────────────────────────────────────────────────────

/** Open work orders for the same equipment at the same facility: shown as a warning, never a block. */
export async function findDuplicates(viewer: Viewer, facility: string, equipmentId: string | null, equipmentName: string, exceptId?: string) {
  const name = equipmentName.trim().toLowerCase();
  if (!facility || (!equipmentId && !name)) return [];
  const open = await prisma.workOrder.findMany({ where: { facility, status: { in: ["open", "in_progress"] } } });
  return open
    .filter((w) => w.id !== exceptId && ((!!equipmentId && w.equipmentId === equipmentId) || (!!name && w.equipmentName.trim().toLowerCase() === name)))
    .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
    // Someone who may not open the other work order still learns that one exists, but not what it says
    .map((w) => ({ id: workOrderCan.view(viewer, w) ? w.id : null, reference: w.reference, status: w.status, priority: w.priority, requestedAt: w.requestedAt.toISOString(), requestedByName: w.requestedByName, assigneeName: w.assigneeName }));
}

export function createWorkOrder(actor: Actor, body: Record<string, unknown> | null) {
  return write(async (tx) => {
    if (!workOrderCan.create(actor)) throw refuse(403, "Forbidden");
    const { data, problems } = parseRequest(body);
    // The equipment comes from the facility's list, or is typed by hand ("Other")
    if (data.equipmentId) {
      const item = await tx.workOrderEquipment.findUnique({ where: { id: data.equipmentId } });
      if (!item || item.facility !== data.facility || item.retiredAt) problems.push({ field: "equipmentName", message: "Equipment or area: that item is not in this facility's list any more. Choose another, or choose Other." });
      else data.equipmentName = item.name;
    }
    const assignee = await activeUser(tx, data.assigneeId);
    if (data.assigneeId && !assignee) problems.push({ field: "assigneeId", message: "Assigned to: choose an active user." });
    if (problems.length) throw invalid(problems);

    const now = new Date();
    const today = getPacificToday();
    const year = Number(today.slice(0, 4));
    const numbers = await tx.$queryRawUnsafe<{ lastNumber: number | bigint }[]>(QUALITY_NEXT_NUMBER_SQL, REFERENCE_KIND.workOrder, year);
    const reference = formatReference(REFERENCE_KIND.workOrder, year, Number(numbers[0].lastNumber));
    const dueDate = toDate(dueDateFor(data.priority, today));
    const row = await tx.workOrder.create({
      data: {
        reference, facility: data.facility, requestType: data.requestType, equipmentId: data.equipmentId, equipmentName: data.equipmentName, problem: data.problem, priority: data.priority,
        status: "open", dueDate, requestedById: actor.id, requestedByName: actor.name, requestedAt: now, assigneeId: assignee!.id, assigneeName: assignee!.name,
        startedAt: null, startDate: null, startTime: null, stopTime: null, repairedByKind: null, repairedByUserId: null, repairedByName: "", toolsAccounted: null, workDescription: "",
        completedDate: null, signatureName: "", signedById: null, signedAt: null, cancelledAt: null, cancelledById: null, cancelReason: null, taskInstanceId: null, updatedById: actor.id,
        createdAt: now, updatedAt: now,
      },
    });
    await recordEvent(tx, row, "created", actor, diffFields({}, { facility: data.facility, requestType: data.requestType, equipmentName: data.equipmentName, priority: data.priority, dueDate: day(dueDate), assignee: assignee!.name, status: "open" }));
    await createTask(tx, actor, row);
    return { id: row.id, reference, dueDate: day(dueDate) };
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────────

const toRow = (w: Wo): WorkOrderRow => ({
  id: w.id, reference: w.reference, facility: w.facility, requestType: w.requestType, equipmentName: w.equipmentName, problem: w.problem, priority: w.priority, status: w.status,
  dueDate: day(w.dueDate)!, requestedById: w.requestedById, requestedByName: w.requestedByName, requestedAt: w.requestedAt.toISOString(), assigneeId: w.assigneeId,
  assigneeName: w.assigneeName, completedDate: day(w.completedDate), updatedAt: w.updatedAt.toISOString(),
});

/** The list. Supervisors and admins get every work order; anyone else only those they requested or are assigned. The filter is applied here, in the query. */
export async function listWorkOrders(viewer: Actor) {
  const rows = await prisma.workOrder.findMany(workOrderCan.viewAll(viewer) ? undefined : { where: { OR: [{ requestedById: viewer.id }, { assigneeId: viewer.id }] } });
  return {
    workOrders: rows.filter((w) => workOrderCan.view(viewer, w)).sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime() || b.reference.localeCompare(a.reference)).map(toRow),
    today: getPacificToday(), viewer: { id: viewer.id, name: viewer.name, seesAll: workOrderCan.viewAll(viewer), canEditEquipment: workOrderCan.editEquipment(viewer) },
  };
}

export async function getWorkOrder(viewer: Actor, id: string) {
  const row = await load(prisma, viewer, id);
  const events = await prisma.workOrderEvent.findMany({ where: { workOrderId: id } });
  const task = await taskOf(prisma, row);
  const people = await prisma.user.findMany({ where: { id: { in: [row.assigneeId, row.repairedByUserId].filter((x): x is string => !!x) } }, select: { id: true, name: true, active: true } });
  const assignee = people.find((u) => u.id === row.assigneeId);
  return {
    record: serialize(row),
    events: events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((e) => ({ id: e.id, action: e.action, userName: e.userName, createdAt: e.createdAt.toISOString(), changes: e.changes as unknown as Change[], note: e.note })),
    names: Object.fromEntries(people.map((u) => [u.id, u.name])),
    task: task ? { id: task.id, status: task.status as string, dueDate: day(task.dueDate)!, completedLate: task.completedLate, daysLate: task.daysLate } : null,
    // An assignee who was deactivated (or removed) can no longer do the work: the page says so until it is reassigned
    assigneeActive: !!assignee?.active,
    can: { work: workOrderCan.work(viewer, row), reassign: workOrderCan.reassign(viewer, row), cancel: workOrderCan.cancel(viewer, row) },
    viewer: { id: viewer.id, name: viewer.name }, today: getPacificToday(),
  };
}

/** For "Start" on a task: the work order that holds this task. Null if none does, or if this person may not see it. */
export async function workOrderOfTask(viewer: Viewer, taskId: string | null | undefined): Promise<{ id: string; reference: string } | null> {
  if (!taskId) return null;
  const rows = await prisma.workOrder.findMany({ where: { taskInstanceId: taskId } });
  const row = rows.find((w) => workOrderCan.view(viewer, w));
  return row ? { id: row.id, reference: row.reference } : null;
}

/** What the forms need: the active users, each facility's equipment list, today's Pacific date and the facility to start on. */
export async function workOrderOptions(viewer: Actor) {
  const [users, equipment, mine, rules] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.workOrderEquipment.findMany({ where: { retiredAt: null } }),
    prisma.workOrder.findMany({ where: { requestedById: viewer.id } }),
    prisma.taskRule.findMany({ where: { ownerId: viewer.id, isArchived: false }, include: { facility: { select: { name: true } } } }),
  ]);
  const last = mine.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
  return {
    users: users.sort((a, b) => a.name.localeCompare(b.name)),
    equipment: equipment.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((e) => ({ id: e.id, facility: e.facility, name: e.name })),
    facilities: [...WO_FACILITIES], today: getPacificToday(), now: new Date().toISOString(),
    defaultFacility: defaultFacility(last?.facility, rules.map((r) => r.facility?.name ?? "")),
    viewer: { id: viewer.id, name: viewer.name, canEditEquipment: workOrderCan.editEquipment(viewer) },
  };
}

// ── Start, Step 2, reassign, cancel ─────────────────────────────────────────────

/** The assignee presses Start: Open → In progress, and the task goes to In progress with a "started" audit row. */
export function startWorkOrder(actor: Actor, id: string, expected?: unknown) {
  return write(async (tx) => {
    const current = await load(tx, actor, id);
    if (!workOrderCan.work(actor, current)) throw refuse(403, "Only the person this work order is assigned to (or an admin) can start it.");
    if (current.status !== "open") throw refuse(409, current.status === "in_progress" ? "This work order is already in progress." : `This work order is ${WO_STATUSES[current.status].toLowerCase()} and cannot be started.`, { code: "not_open" });
    const now = await save(tx, current, { status: "in_progress", startedAt: new Date() }, expected ?? current.updatedAt.toISOString(), actor);
    await recordEvent(tx, current, "started", actor, [{ field: "status", from: "open", to: "in_progress" }]);
    const task = await taskOf(tx, current);
    if (task && ["UPCOMING", "DUE_TODAY", "OVERDUE"].includes(task.status)) {
      await tx.ruleInstance.update({ where: { id: task.id }, data: { status: "IN_PROGRESS" } });
      await tx.taskInstanceAudit.create({ data: { instanceId: task.id, action: "started", userId: actor.id, note: `${current.reference} started` } });
    }
    return { status: "in_progress", updatedAt: now.toISOString() };
  });
}

/** The Step 2 values of a request, checked for shape and made consistent (the person's name is stored with their id). */
async function step2Data(tx: Tx, current: Wo, body: Record<string, unknown> | null): Promise<Record<string, FieldValue>> {
  const { data, problems } = parseStep2(body);
  const merged: Record<string, unknown> = { ...serialize(current), ...data };
  if (merged.repairedByKind === "external") data.repairedByUserId = null;
  if (typeof data.repairedByUserId === "string" && data.repairedByUserId !== current.repairedByUserId) {
    const person = await activeUser(tx, data.repairedByUserId);
    if (!person) problems.push({ field: "repairedByUserId", message: "Repaired by: choose an active user, or type the name." });
    else data.repairedByName = person.name;
  }
  problems.push(...step2OrderProblems({ ...merged, ...data }));
  if (problems.length) throw invalid(problems);
  return data as Record<string, FieldValue>;
}
const step2ToDb = (data: Record<string, FieldValue>) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, DAY_FIELDS.includes(k) && typeof v === "string" ? toDate(v) : v]));

function mustBeInProgress(current: Wo) {
  if (current.status === "open") throw refuse(409, "Press Start first: Step 2 is filled in once the work order is in progress.", { code: "not_started" });
  if (current.status !== "in_progress") throw refuse(409, `This work order is ${WO_STATUSES[current.status].toLowerCase()} and read-only.`, { code: "read_only" });
}

/** Save draft: stores what has been filled in of Step 2. The work order stays In progress. */
export function saveStep2Draft(actor: Actor, id: string, body: Record<string, unknown> | null) {
  return write(async (tx) => {
    const current = await load(tx, actor, id);
    if (!workOrderCan.work(actor, current)) throw refuse(403, "Only the person this work order is assigned to (or an admin) can fill in Step 2.");
    mustBeInProgress(current);
    const data = await step2Data(tx, current, body);
    const changes = diffFields(current, data, [...STEP2_FIELDS]);
    if (typeof body?.expectedUpdatedAt !== "string") throw refuse(400, "expectedUpdatedAt is required.");
    if (changes.length === 0) { if (body.expectedUpdatedAt !== current.updatedAt.toISOString()) await save(tx, current, {}, body.expectedUpdatedAt, actor); return { updatedAt: current.updatedAt.toISOString(), changed: 0 }; }
    const now = await save(tx, current, step2ToDb(Object.fromEntries(changes.map((c) => [c.field, data[c.field]]))), body.expectedUpdatedAt, actor);
    await recordEvent(tx, current, "draft_saved", actor, changes);
    return { updatedAt: now.toISOString(), changed: changes.length };
  });
}

/**
 * Submit Step 2: everything must be filled in and the tools question answered Yes. The work order becomes
 * Completed, signed by the person logged in, and its task is completed right after the save commits.
 */
export async function completeWorkOrder(actor: Actor, id: string, body: Record<string, unknown> | null) {
  const out = await write(async (tx) => {
    const current = await load(tx, actor, id);
    if (!workOrderCan.work(actor, current)) throw refuse(403, "Only the person this work order is assigned to (or an admin) can complete it.");
    mustBeInProgress(current);
    const data = await step2Data(tx, current, body);
    const problems = completionProblems({ ...serialize(current), ...data });
    if (problems.length) throw invalid(problems);
    const changes: Change[] = [{ field: "status", from: "in_progress", to: "completed" }, ...diffFields(current, data, [...STEP2_FIELDS])];
    const now = await save(tx, current, { ...step2ToDb(data), status: "completed", signedById: actor.id, signedAt: new Date() }, body?.expectedUpdatedAt, actor);
    await recordEvent(tx, current, "completed", actor, changes);
    return { status: "completed", updatedAt: now.toISOString(), taskId: current.taskInstanceId, facility: current.facility };
  });
  const completedInstanceId = await completeTask(actor, { id, facility: out.facility }, out.taskId);
  return { status: out.status, updatedAt: out.updatedAt, completedInstanceId };
}

/** Gives the work order to someone else. An order in progress goes back to Open; the task moves to the new person and keeps its history. */
export function reassignWorkOrder(actor: Actor, id: string, body: { assigneeId?: unknown; expectedUpdatedAt?: unknown } | null) {
  return write(async (tx) => {
    const current = await load(tx, actor, id);
    if (!workOrderCan.reassign(actor, current)) throw refuse(403, "Only the requester, the person it is assigned to, or an admin can reassign this work order.");
    if (!isOpenStatus(current.status)) throw refuse(409, `This work order is ${WO_STATUSES[current.status].toLowerCase()} and cannot be reassigned.`, { code: "read_only" });
    const next = await activeUser(tx, typeof body?.assigneeId === "string" ? body.assigneeId : null);
    if (!next) throw invalid([{ field: "assigneeId", message: "Assigned to: choose an active user." }]);
    if (next.id === current.assigneeId) throw refuse(409, `This work order is already assigned to ${next.name}.`);
    const backToOpen = current.status === "in_progress";
    const changes: Change[] = [{ field: "assignee", from: current.assigneeName || null, to: next.name }, ...(backToOpen ? [{ field: "status", from: "in_progress", to: "open" } as Change] : [])];
    const now = await save(tx, current, { assigneeId: next.id, assigneeName: next.name, ...(backToOpen ? { status: "open", startedAt: null } : {}) }, body?.expectedUpdatedAt, actor);
    await recordEvent(tx, current, "reassigned", actor, changes);
    const task = await taskOf(tx, current);
    if (task && TASK_OPEN.includes(task.status)) {
      await tx.ruleInstance.update({
        where: { id: task.id },
        // The same task, now the new person's. Nobody is working on it yet, so its status follows its due date again.
        data: { ownerUserId: next.id, ...(task.status === "IN_PROGRESS" ? { status: taskStatusForDue(day(task.dueDate)!, getPacificToday()) as never } : {}) },
      });
      await tx.taskInstanceAudit.create({ data: { instanceId: task.id, action: "updated", userId: actor.id, note: `${current.reference} reassigned from ${current.assigneeName || "nobody"} to ${next.name}` } });
    } else if (!task) {
      await createTask(tx, actor, { ...current, assigneeId: next.id, assigneeName: next.name });
    }
    return { status: backToOpen ? "open" : current.status, assigneeId: next.id, updatedAt: now.toISOString() };
  });
}

/** Cancel / void, with a required reason. The work order is kept, read-only. */
export function cancelWorkOrder(actor: Actor, id: string, body: { reason?: unknown; expectedUpdatedAt?: unknown } | null) {
  return write(async (tx) => {
    const current = await load(tx, actor, id);
    if (!workOrderCan.cancel(actor, current)) throw refuse(403, "Only the requester or an admin can cancel this work order.");
    if (current.status === "cancelled") throw refuse(409, "This work order is already cancelled.");
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3) throw invalid([{ field: "reason", message: "Reason: say why you are cancelling this work order." }]);
    const now = await save(tx, current, { status: "cancelled", cancelledAt: new Date(), cancelledById: actor.id, cancelReason: reason }, body?.expectedUpdatedAt, actor);
    await recordEvent(tx, current, "cancelled", actor, [{ field: "status", from: current.status, to: "cancelled" }, { field: "cancelReason", from: null, to: reason }], reason);
    const task = await taskOf(tx, current);
    if (task && TASK_OPEN.includes(task.status)) {
      const actions = (await tx.taskInstanceAudit.findMany({ where: { instanceId: task.id }, select: { action: true } })).map((a) => a.action);
      if (taskHasRealHistory(actions)) {
        // Someone acted on this task: it is kept, as skipped, with the reason
        const note = `Work order cancelled: ${reason}`;
        await tx.ruleInstance.update({ where: { id: task.id }, data: { status: "SKIPPED", skippedAt: new Date(), skippedById: actor.id, skipReason: note } });
        await tx.taskInstanceAudit.create({ data: { instanceId: task.id, action: "skipped", userId: actor.id, note } });
      } else {
        // Nobody acted on it: removed. Its creation row goes with it; notifications have no cascade.
        await tx.notification.deleteMany({ where: { instanceId: task.id } });
        await tx.ruleInstance.delete({ where: { id: task.id } });
        await tx.workOrder.updateMany({ where: { id }, data: { taskInstanceId: null } });
      }
    }
    return { status: "cancelled", updatedAt: now.toISOString() };
  });
}

// ── The equipment / area list ───────────────────────────────────────────────────

const mustEditEquipment = (actor: Actor) => { if (!workOrderCan.editEquipment(actor)) throw refuse(403, "Forbidden — supervisors and admins only"); };
const bumpList = (tx: Tx, facility: string, actor: Actor) =>
  tx.workOrderEquipmentList.upsert({ where: { facility }, create: { facility, version: 1, updatedById: actor.id, updatedAt: new Date() }, update: { version: { increment: 1 }, updatedById: actor.id, updatedAt: new Date() } });
const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** The whole list, retired items included, for the editor. */
export async function listEquipment(actor: Actor) {
  mustEditEquipment(actor);
  const [items, lists] = await Promise.all([prisma.workOrderEquipment.findMany(), prisma.workOrderEquipmentList.findMany()]);
  return {
    facilities: [...WO_FACILITIES],
    items: items.sort((a, b) => a.facility.localeCompare(b.facility) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((e) => ({ id: e.id, facility: e.facility, name: e.name, retiredAt: e.retiredAt?.toISOString() ?? null })),
    versions: Object.fromEntries(lists.map((l) => [l.facility, l.version])),
  };
}

async function nameTaken(tx: Tx, facility: string, name: string, exceptId?: string) {
  const same = await tx.workOrderEquipment.findMany({ where: { facility, retiredAt: null } });
  return same.some((e) => e.id !== exceptId && e.name.toLowerCase() === name.toLowerCase());
}

export function addEquipment(actor: Actor, body: { facility?: unknown; name?: unknown } | null) {
  return write(async (tx) => {
    mustEditEquipment(actor);
    const facility = typeof body?.facility === "string" ? body.facility : "";
    const name = cleanName(body?.name);
    if (!(WO_FACILITIES as readonly string[]).includes(facility)) throw invalid([{ field: "facility", message: `Facility: choose ${WO_FACILITIES.join(" or ")}.` }]);
    if (!name || name.length > 200 || name.toLowerCase() === OTHER_EQUIPMENT) throw invalid([{ field: "name", message: "Name: enter the name of the equipment or area (200 characters at most)." }]);
    if (await nameTaken(tx, facility, name)) throw refuse(409, `"${name}" is already in the ${facility} list.`);
    const all = await tx.workOrderEquipment.findMany({ where: { facility } });
    const now = new Date();
    const row = await tx.workOrderEquipment.create({
      data: { facility, name, sortOrder: all.reduce((m, e) => Math.max(m, e.sortOrder), 0) + 1, retiredAt: null, retiredById: null, createdById: actor.id, updatedById: actor.id, createdAt: now, updatedAt: now },
    });
    await bumpList(tx, facility, actor);
    return { id: row.id };
  });
}

/** Rename, retire or bring back an item. Items are never deleted: past work orders keep pointing at them. */
export function updateEquipment(actor: Actor, id: string, body: { name?: unknown; retired?: unknown } | null) {
  return write(async (tx) => {
    mustEditEquipment(actor);
    const item = await tx.workOrderEquipment.findUnique({ where: { id } });
    if (!item) throw refuse(404, "That item was not found.");
    const data: Record<string, unknown> = {};
    if (body && "name" in body) {
      const name = cleanName(body.name);
      if (!name || name.length > 200 || name.toLowerCase() === OTHER_EQUIPMENT) throw invalid([{ field: "name", message: "Name: enter the name of the equipment or area (200 characters at most)." }]);
      if (await nameTaken(tx, item.facility, name, id)) throw refuse(409, `"${name}" is already in the ${item.facility} list.`);
      if (name !== item.name) data.name = name;
    }
    if (body && typeof body.retired === "boolean" && body.retired !== !!item.retiredAt) {
      if (!body.retired && (await nameTaken(tx, item.facility, (data.name as string) ?? item.name, id))) throw refuse(409, `"${item.name}" is already in the ${item.facility} list.`);
      Object.assign(data, body.retired ? { retiredAt: new Date(), retiredById: actor.id } : { retiredAt: null, retiredById: null });
    }
    if (Object.keys(data).length === 0) return { changed: 0 };
    await tx.workOrderEquipment.update({ where: { id }, data: { ...data, updatedById: actor.id, updatedAt: new Date() } });
    await bumpList(tx, item.facility, actor);
    return { changed: Object.keys(data).length };
  });
}
