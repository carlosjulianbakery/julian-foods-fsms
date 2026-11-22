/**
 * Quality area — everything that reads or writes the database. The routes are thin wrappers around
 * these functions. EVERY write goes through `write()` (one prisma.$transaction) and records its
 * history row with `recordEvent()` inside that same transaction: a change cannot exist without its
 * event, and an event cannot exist without its change.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { QUALITY_NEXT_NUMBER_SQL } from "@/lib/quality-sql";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { RANK_STEP } from "@/lib/task-order";
import {
  CAPA_RULE_TITLE, QUALITY_CAPA_FORM_KEY, QUALITY_REVIEW_FORM_KEY, QUALITY_RULE_FACILITY, TASK_STARTED_ACTION, TASK_STATUS_LABELS, capaTaskKey, capaTaskStatusAfterMove, planCapaTask,
  taskOpen, taskWasStarted,
  CAPA_FIELDS, CAPA_STATUSES, INCIDENT_FIELDS, REFERENCE_KIND, REOPEN_TO, capaCanClose, capaClosingProblems, capaCreateProblems, capaMove,
  canUseQuality, diffFields, formatReference, isDate, incidentClosingProblems, incidentCreateProblems, incidentMove, isReadOnly, parseFields,
  type AttachmentRow, type CapaRow, type Change, type EventAction, type FieldProblem, type FieldValue, type IncidentRow, type RecordType,
} from "@/lib/quality";

export type Tx = Prisma.TransactionClient;
export interface Actor { id: string; name: string }

/** An expected refusal: the route turns it into a JSON answer with this status. */
export class QualityError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}
export const refuse = (status: number, message: string, extra: Record<string, unknown> = {}) => new QualityError(status, message, extra);
export const invalid = (problems: FieldProblem[]) => refuse(422, "Some fields need attention.", { problems });

/** The session check used by every Quality route: 401 without a session, 403 unless canUseQuality. */
export async function qualityRoute(fn: (actor: Actor) => Promise<unknown>, okStatus = 200): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseQuality(session.user.role)) return NextResponse.json({ error: "Forbidden — admins only" }, { status: 403 });
  try {
    return NextResponse.json(await fn({ id: session.user.id, name: session.user.name?.trim() || session.user.email || "Unknown" }), { status: okStatus });
  } catch (e) {
    if (e instanceof QualityError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error("[quality]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save. Nothing was changed." }, { status: 500 });
  }
}

/** For routes that do not answer JSON (file streaming): the actor, or the 401 / 403 answer to return. */
export async function requireQuality(): Promise<{ actor: Actor; response?: undefined } | { actor?: undefined; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canUseQuality(session.user.role)) return { response: NextResponse.json({ error: "Forbidden — admins only" }, { status: 403 }) };
  return { actor: { id: session.user.id, name: session.user.name?.trim() || session.user.email || "Unknown" } };
}

/** One transaction per write. The change and its history row succeed or fail together. */
export const write = <T,>(fn: (tx: Tx) => Promise<T>): Promise<T> => prisma.$transaction(fn);

/** Appends one row to the history. There is no function that updates or deletes one. */
export function recordEvent(tx: Tx, e: { type: RecordType; id: string; reference: string; action: EventAction; actor: Actor; changes?: Change[]; note?: string | null }) {
  return tx.qualityEvent.create({
    data: { recordType: e.type, recordId: e.id, reference: e.reference, action: e.action, userId: e.actor.id, userName: e.actor.name, changes: (e.changes ?? []) as never, note: e.note?.trim() || null },
  });
}

/** The next reference of a kind for the Pacific year of `today`: CI-2026-001, CAPA-2026-001 … never reused. */
export async function nextReference(tx: Tx, type: "incident" | "capa", today: string): Promise<string> {
  const year = Number(today.slice(0, 4));
  const rows = await tx.$queryRawUnsafe<{ lastNumber: number | bigint }[]>(QUALITY_NEXT_NUMBER_SQL, REFERENCE_KIND[type], year);
  return formatReference(REFERENCE_KIND[type], year, Number(rows[0].lastNumber));
}

// ── Shapes ──────────────────────────────────────────────────────────────────────

const DAY_FIELDS = ["dateReceived", "bestByDate", "responseDate", "closedDate", "dueDate", "effectivenessDate"];
export const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
/** Field values as the database wants them: days become dates. */
function toDb(data: Record<string, FieldValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, DAY_FIELDS.includes(k) && typeof v === "string" ? new Date(`${v}T00:00:00Z`) : v]));
}
/** A record as the pages get it: days as YYYY-MM-DD, moments as ISO strings. */
export function serialize<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, isDate(v) ? (DAY_FIELDS.includes(k) ? day(v) : v.toISOString()) : v]));
}

type IncidentDb = NonNullable<Awaited<ReturnType<Tx["qualityIncident"]["findUnique"]>>>;
type CapaDb = NonNullable<Awaited<ReturnType<Tx["qualityCapa"]["findUnique"]>>>;

export const reason = (v: unknown, what: string): string => {
  const r = typeof v === "string" ? v.trim() : "";
  if (r.length < 3) throw invalid([{ field: "reason", message: `Reason: say why you are ${what}.` }]);
  return r;
};

export async function userNames(tx: Tx, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const wanted = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (wanted.length === 0) return {};
  const users = await tx.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } });
  return Object.fromEntries(users.map((u) => [u.id, u.name]));
}

/**
 * Saves a change to an existing record, refusing if someone else saved in the meantime (409).
 * `expected` is the updatedAt the page last saw; the update itself is also guarded on the row's timestamp.
 */
async function save<T extends "incident" | "capa">(tx: Tx, type: T, current: IncidentDb | CapaDb, data: Record<string, unknown>, expected: unknown, actor: Actor) {
  const conflict = () => refuse(409, "Someone else changed this record. Reload to see the latest version.", { code: "conflict" });
  if (typeof expected === "string" && expected !== current.updatedAt.toISOString()) throw conflict();
  // Always later than the stored timestamp, so the next save can tell this one happened
  const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
  const args = { where: { id: current.id, updatedAt: current.updatedAt }, data: { ...data, updatedAt: now, updatedById: actor.id } };
  const res = type === "incident" ? await tx.qualityIncident.updateMany(args as never) : await tx.qualityCapa.updateMany(args as never);
  if (res.count !== 1) throw conflict();
}

export async function loadIncident(tx: Tx, id: string): Promise<IncidentDb> {
  const row = await tx.qualityIncident.findUnique({ where: { id } });
  if (!row) throw refuse(404, "Incident not found.");
  return row;
}
export async function loadCapa(tx: Tx, id: string): Promise<CapaDb> {
  const row = await tx.qualityCapa.findUnique({ where: { id } });
  if (!row) throw refuse(404, "CAPA not found.");
  return row;
}
const linkOfIncident = (tx: Tx, incidentId: string) => tx.qualityIncidentCapa.findUnique({ where: { incidentId } });
export const mustBeEditable = (status: string, what: string) => {
  if (isReadOnly(status)) throw refuse(409, `This ${what} is ${status === "void" ? "void" : "closed"} and read-only. Reopen it to make changes.`, { code: "read_only" });
};

// ── Incidents ───────────────────────────────────────────────────────────────────

async function checkProduct(tx: Tx, data: Record<string, FieldValue>, problems: FieldProblem[]) {
  if (typeof data.productId !== "string") return;
  const product = await tx.product.findUnique({ where: { id: data.productId }, select: { name: true } });
  if (!product) problems.push({ field: "productId", message: "Product: that product is not in the list." });
  // Picking from the list also stores the name, so the record still reads right if the product is renamed or removed
  else if (!data.productName) data.productName = product.name;
}

export function createIncident(actor: Actor, body: Record<string, unknown> | null) {
  return write(async (tx) => {
    const { data, problems } = parseFields("incident", body);
    problems.push(...incidentCreateProblems(data));
    await checkProduct(tx, data, problems);
    // The CAPA decision is made on the record page, where a CAPA can be opened
    delete data.capaRequired; delete data.noCapaReason;
    if (problems.length) throw invalid(problems);
    const reference = await nextReference(tx, "incident", getPacificToday());
    const row = await tx.qualityIncident.create({ data: { ...toDb(data), reference, createdById: actor.id, updatedById: actor.id } as never });
    await recordEvent(tx, { type: "incident", id: row.id, reference, action: "created", actor, changes: diffFields({}, data) });
    return { id: row.id, reference };
  });
}

export function updateIncident(actor: Actor, id: string, body: Record<string, unknown> | null) {
  return write(async (tx) => {
    const current = await loadIncident(tx, id);
    mustBeEditable(current.status, "incident");
    if (typeof body?.expectedUpdatedAt !== "string") throw refuse(400, "expectedUpdatedAt is required.");
    const { data, problems } = parseFields("incident", body);
    await checkProduct(tx, data, problems);
    for (const required of ["dateReceived", "channel", "description"]) {
      if (required in data && !data[required]) problems.push({ field: required, message: `${INCIDENT_FIELDS[required].label}: this cannot be emptied.` });
    }
    // "CAPA needed: yes" only ever comes from a linked CAPA; with one linked, the decision cannot be changed by hand
    if ("capaRequired" in data) {
      const linked = !!(await linkOfIncident(tx, id));
      if (linked && data.capaRequired !== true) problems.push({ field: "capaRequired", message: "CAPA decision: a CAPA is linked. Unlink it first to change the decision." });
      if (!linked && data.capaRequired === true) problems.push({ field: "capaRequired", message: 'CAPA decision: use "Open CAPA" (or link one from the CAPA page) instead.' });
    }
    if (problems.length) throw invalid(problems);
    const changes = diffFields(current, data);
    if (changes.length === 0) return { updatedAt: current.updatedAt.toISOString(), changed: 0 };
    await save(tx, "incident", current, toDb(Object.fromEntries(changes.map((c) => [c.field, data[c.field]]))), body.expectedUpdatedAt, actor);
    await recordEvent(tx, { type: "incident", id, reference: current.reference, action: "updated", actor, changes });
    return { updatedAt: (await loadIncident(tx, id)).updatedAt.toISOString(), changed: changes.length };
  });
}

export interface StatusBody { action?: unknown; to?: unknown; reason?: unknown; closedDate?: unknown; expectedUpdatedAt?: unknown }

export function incidentAction(actor: Actor, id: string, body: StatusBody | null) {
  return write(async (tx) => {
    const current = await loadIncident(tx, id);
    const done = async (action: EventAction, data: Record<string, unknown>, note?: string) => {
      const changes = diffFields(current, data, Object.keys(data).filter((k) => ["status", "closedDate", "voidReason"].includes(k)));
      await save(tx, "incident", current, data, body?.expectedUpdatedAt, actor);
      await recordEvent(tx, { type: "incident", id, reference: current.reference, action, actor, changes, note });
      return { status: data.status as string, updatedAt: (await loadIncident(tx, id)).updatedAt.toISOString() };
    };
    switch (body?.action) {
      case "move": {
        const move = incidentMove(current.status, String(body.to ?? ""));
        if (!move.ok) throw refuse(409, move.error);
        return done("status_changed", { status: body.to });
      }
      case "close": {
        mustBeEditable(current.status, "incident");
        const closedDate = typeof body.closedDate === "string" ? body.closedDate : getPacificToday();
        const problems = incidentClosingProblems(serialize(current) as never, !!(await linkOfIncident(tx, id)), closedDate);
        if (problems.length) throw invalid(problems);
        return done("closed", { status: "closed", closedDate: new Date(`${closedDate}T00:00:00Z`), closedById: actor.id });
      }
      case "void": {
        if (current.status === "void") throw refuse(409, "This incident is already void.");
        const why = reason(body.reason, "voiding this incident");
        return done("voided", { status: "void", voidedAt: new Date(), voidedById: actor.id, voidReason: why }, why);
      }
      case "reopen": {
        if (!isReadOnly(current.status)) throw refuse(409, "Only a closed or void incident can be reopened.");
        const why = reason(body.reason, "reopening this incident");
        return done("reopened", { status: REOPEN_TO.incident[current.status], closedDate: null, closedById: null, voidedAt: null, voidedById: null, voidReason: null }, why);
      }
      default: throw refuse(400, "Unknown action.");
    }
  });
}

// ── The CAPA follow-up task ─────────────────────────────────────────────────────

/**
 * The one system rule every CAPA task hangs from. It is a ONE_OFF rule whose date is in the past, so the
 * task generator never produces anything for it; the calendar sync only looks at production rules; its
 * tasks are created, moved and removed here and nowhere else. Created on first use if it is missing.
 */
export async function ensureCapaRule(tx: Tx, ownerId: string): Promise<{ id: string; created: boolean }> {
  const existing = await tx.taskRule.findFirst({ where: { formKey: QUALITY_CAPA_FORM_KEY }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const facility = await tx.facility.findUnique({ where: { name: QUALITY_RULE_FACILITY }, select: { id: true } });
  if (!facility) throw refuse(500, `The facility "${QUALITY_RULE_FACILITY}" was not found, so the CAPA follow-up rule cannot be created.`);
  // Ranked last in the work order
  const lastRank = (await tx.taskRule.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  const rule = await tx.taskRule.create({
    data: {
      title: CAPA_RULE_TITLE, description: "Managed by the system: one task per CAPA that has an owner and a due date. Change the CAPA to change its task.",
      facilityId: facility.id, ownerId, triggerType: "ONE_OFF", recurrenceUnit: null, recurrenceEvery: 1, recurrenceStart: new Date("2026-01-01T00:00:00Z"),
      formKey: QUALITY_CAPA_FORM_KEY, windowMode: "NONE", isActive: true, sortOrder: lastRank + RANK_STEP,
    },
    select: { id: true },
  });
  return { id: rule.id, created: true };
}

const statusForDue = (due: string, today: string) => (due < today ? "OVERDUE" : due === today ? "DUE_TODAY" : "UPCOMING");

/**
 * Brings a CAPA's follow-up task in line with the CAPA, inside the CAPA's own transaction (see
 * planCapaTask for the rules). Returns the task to complete, if the CAPA just reached Verifying
 * effectiveness or Closed: completion uses the app's shared helper, which runs right after the commit.
 */
export async function syncCapaTask(tx: Tx, actor: Actor, capaId: string): Promise<{ completeTaskId: string | null }> {
  const capa = await loadCapa(tx, capaId);
  const found = capa.taskInstanceId ? await tx.ruleInstance.findUnique({ where: { id: capa.taskInstanceId } }) : null;
  // The task's own audit rows: a task that was ever acted on is kept, whatever its status says now
  const auditActions = found ? (await tx.taskInstanceAudit.findMany({ where: { instanceId: found.id }, select: { action: true } })).map((a) => a.action) : [];
  const plan = planCapaTask(
    { id: capa.id, reference: capa.reference, problem: capa.problem, status: capa.status, ownerId: capa.ownerId, dueDate: day(capa.dueDate) },
    found ? { status: found.status, dueDate: day(found.dueDate)!, ownerUserId: found.ownerUserId, label: found.label, auditActions } : null,
  );
  const setTaskId = (taskInstanceId: string | null) => tx.qualityCapa.updateMany({ where: { id: capa.id }, data: { taskInstanceId } });
  const today = getPacificToday();
  if (plan.do === "create") {
    const rule = await ensureCapaRule(tx, actor.id);
    const task = await tx.ruleInstance.create({
      data: {
        ruleId: rule.id, dueDate: new Date(`${plan.dueDate}T00:00:00Z`), status: statusForDue(plan.dueDate, today), label: plan.label,
        calendarKey: capaTaskKey(capa.id), source: "MANUAL", ownerUserId: plan.ownerUserId,
      },
    });
    await tx.taskInstanceAudit.create({ data: { instanceId: task.id, action: "created", userId: actor.id, note: `Created for ${capa.reference} (owner and due date set)` } });
    await setTaskId(task.id);
  } else if (plan.do === "update" && found) {
    await tx.ruleInstance.update({
      where: { id: found.id },
      // A started task keeps its status and its history; only the date, the owner and the label follow the CAPA
      data: { dueDate: new Date(`${plan.dueDate}T00:00:00Z`), ownerUserId: plan.ownerUserId, label: plan.label, status: capaTaskStatusAfterMove(found.status, taskWasStarted(auditActions), plan.dueDate, today) as never },
    });
    await tx.taskInstanceAudit.create({ data: { instanceId: found.id, action: "updated", userId: actor.id, note: `${capa.reference}: ${plan.changed.join(", ")} changed on the CAPA` } });
  } else if (plan.do === "delete" && found) {
    // Removed, not skipped: nobody acted on it. Its audit rows go with it; notifications have no cascade.
    await tx.notification.deleteMany({ where: { instanceId: found.id } });
    await tx.ruleInstance.delete({ where: { id: found.id } });
    await setTaskId(null);
  } else if (plan.do === "complete" && found) {
    return { completeTaskId: found.id };
  }
  return { completeTaskId: null };
}

/** Marks the CAPA's task done through the shared completion helper (its audit row, late if past the due date). Never fails the CAPA change. */
export async function completeCapaTask(actor: Actor, capaId: string, taskId: string | null): Promise<string | null> {
  if (!taskId) return null;
  try {
    return await completeRuleInstanceForSubmission({
      formKey: QUALITY_CAPA_FORM_KEY, facilityName: QUALITY_RULE_FACILITY, submissionId: capaId, userId: actor.id,
      submissionDate: getPacificToday(), taskId, prismaClient: prisma as never,
    });
  } catch (e) {
    console.error("[quality] CAPA task completion failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Self-heal, run when the CAPA list or a CAPA page is loaded: a CAPA already at Verifying effectiveness or
 * Closed whose follow-up task is still open gets that task completed, through the same shared helper (its
 * audit row, late if past the due date) and with a line in the CAPA's history. Only tasks of the CAPA
 * follow-up rule that a CAPA points at are ever looked at. Running it again changes nothing. Never fails the load.
 */
export async function healCapaTasks(actor: Actor, capaId?: string): Promise<string[]> {
  const healed: string[] = [];
  try {
    const capas = await prisma.qualityCapa.findMany({ where: { status: { in: ["verifying", "closed"] }, taskInstanceId: { not: null }, ...(capaId ? { id: capaId } : {}) } });
    if (capas.length === 0) return healed;
    const tasks = await prisma.ruleInstance.findMany({
      where: { id: { in: capas.map((c) => c.taskInstanceId!) }, status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"] } },
      include: { rule: { select: { formKey: true } } },
    });
    for (const capa of capas) {
      const task = tasks.find((t) => t.id === capa.taskInstanceId);
      if (!task || task.rule.formKey !== QUALITY_CAPA_FORM_KEY) continue;
      const completed = await completeCapaTask(actor, capa.id, task.id);
      const after = await prisma.ruleInstance.findUnique({ where: { id: task.id }, select: { status: true } });
      if (completed !== task.id || after?.status !== "DONE") continue;
      await write((tx) => recordEvent(tx, {
        type: "capa", id: capa.id, reference: capa.reference, action: "task_completed", actor,
        changes: [{ field: "followUpTask", from: TASK_STATUS_LABELS[task.status] ?? task.status, to: TASK_STATUS_LABELS.DONE }],
        note: `The follow-up task was still open although this CAPA was already ${CAPA_STATUSES[capa.status]}. It was completed automatically when the CAPA was opened.`,
      }));
      healed.push(capa.id);
    }
  } catch (e) {
    console.error("[quality] CAPA task self-heal failed:", e instanceof Error ? e.message : e);
  }
  return healed;
}

/**
 * Records, once, that a Quality task (a CAPA follow-up or a monthly review) was opened from its Start
 * button. This audit row is what later proves the task was started, even after the shared status
 * promotion has turned it into "Overdue". Finished, skipped and missed tasks, and tasks of any other
 * rule, are left alone. The status itself is set by the app's existing start route.
 */
export async function noteTaskStarted(actor: Actor, taskId: string | null | undefined): Promise<boolean> {
  if (!taskId) return false;
  try {
    return await write(async (tx) => {
      const task = await tx.ruleInstance.findUnique({ where: { id: taskId }, include: { rule: { select: { formKey: true } } } });
      if (!task || ![QUALITY_CAPA_FORM_KEY, QUALITY_REVIEW_FORM_KEY].includes(task.rule.formKey ?? "") || !taskOpen(task.status)) return false;
      const already = await tx.taskInstanceAudit.findMany({ where: { instanceId: taskId, action: TASK_STARTED_ACTION }, select: { id: true } });
      if (already.length > 0) return false;
      await tx.taskInstanceAudit.create({ data: { instanceId: taskId, action: TASK_STARTED_ACTION, userId: actor.id, note: "Opened from the task's Start button" } });
      return true;
    });
  } catch (e) {
    console.error("[quality] could not record the task start:", e instanceof Error ? e.message : e);
    return false;
  }
}

// ── CAPAs ───────────────────────────────────────────────────────────────────────

async function checkOwner(tx: Tx, data: Record<string, FieldValue>, problems: FieldProblem[]) {
  if (typeof data.ownerId !== "string") return;
  const owner = await tx.user.findUnique({ where: { id: data.ownerId }, select: { role: true, active: true } });
  if (!owner || owner.role !== "ADMIN" || !owner.active) problems.push({ field: "ownerId", message: "Owner: choose an active admin user." });
}

async function insertCapa(tx: Tx, actor: Actor, data: Record<string, FieldValue>, note?: string) {
  const reference = await nextReference(tx, "capa", getPacificToday());
  const row = await tx.qualityCapa.create({ data: { ...toDb(data), reference, createdById: actor.id, updatedById: actor.id } as never });
  await recordEvent(tx, { type: "capa", id: row.id, reference, action: "created", actor, changes: diffFields({}, data), note });
  return { id: row.id, reference };
}

export function createCapa(actor: Actor, body: Record<string, unknown> | null) {
  return write(async (tx) => {
    const { data, problems } = parseFields("capa", body);
    problems.push(...capaCreateProblems(data));
    await checkOwner(tx, data, problems);
    if (problems.length) throw invalid(problems);
    const made = await insertCapa(tx, actor, data);
    await syncCapaTask(tx, actor, made.id);
    return made;
  });
}

export async function updateCapa(actor: Actor, id: string, body: Record<string, unknown> | null) {
  const out = await write(async (tx) => {
    const current = await loadCapa(tx, id);
    mustBeEditable(current.status, "CAPA");
    if (typeof body?.expectedUpdatedAt !== "string") throw refuse(400, "expectedUpdatedAt is required.");
    const { data, problems } = parseFields("capa", body);
    await checkOwner(tx, data, problems);
    for (const required of ["source", "problem"]) {
      if (required in data && !data[required]) problems.push({ field: required, message: `${CAPA_FIELDS[required].label}: this cannot be emptied.` });
    }
    if (problems.length) throw invalid(problems);
    const changes = diffFields(current, data);
    if (changes.length === 0) return { updatedAt: current.updatedAt.toISOString(), changed: 0 };
    await save(tx, "capa", current, toDb(Object.fromEntries(changes.map((c) => [c.field, data[c.field]]))), body.expectedUpdatedAt, actor);
    await recordEvent(tx, { type: "capa", id, reference: current.reference, action: "updated", actor, changes });
    // The follow-up task follows the owner and the due date
    const task = await syncCapaTask(tx, actor, id);
    return { updatedAt: (await loadCapa(tx, id)).updatedAt.toISOString(), changed: changes.length, task };
  });
  if ("task" in out && out.task) await completeCapaTask(actor, id, out.task.completeTaskId);
  return { updatedAt: out.updatedAt, changed: out.changed };
}

export async function capaAction(actor: Actor, id: string, body: StatusBody | null) {
  const out = await write(async (tx) => {
    const current = await loadCapa(tx, id);
    const done = async (action: EventAction, data: Record<string, unknown>, note?: string) => {
      const changes = diffFields(current, data, Object.keys(data).filter((k) => ["status", "closedDate", "closedByName", "voidReason"].includes(k)));
      await save(tx, "capa", current, data, body?.expectedUpdatedAt, actor);
      await recordEvent(tx, { type: "capa", id, reference: current.reference, action, actor, changes, note });
      // Verifying or Closed completes the task; Void removes an untouched one; a reopened void CAPA gets its task back
      const task = await syncCapaTask(tx, actor, id);
      return { status: data.status as string, updatedAt: (await loadCapa(tx, id)).updatedAt.toISOString(), completeTaskId: task.completeTaskId };
    };
    switch (body?.action) {
      case "move": {
        const move = capaMove(current.status, String(body.to ?? ""));
        if (!move.ok) throw refuse(409, move.error);
        // A step back needs a reason; it is kept in the history
        const why = move.backward ? reason(body.reason, `moving this CAPA back to ${CAPA_STATUSES[String(body.to)]}`) : undefined;
        return done("status_changed", { status: body.to }, why);
      }
      case "close": {
        mustBeEditable(current.status, "CAPA");
        if (!capaCanClose(current.status)) throw refuse(409, "A CAPA is closed from Verifying effectiveness. Move it there first.");
        const problems = capaClosingProblems(serialize(current) as never);
        if (problems.length) throw invalid(problems);
        // Who closed it and when is recorded automatically
        return done("closed", { status: "closed", closedDate: new Date(`${getPacificToday()}T00:00:00Z`), closedById: actor.id, closedByName: actor.name });
      }
      case "void": {
        if (current.status === "void") throw refuse(409, "This CAPA is already void.");
        const why = reason(body.reason, "voiding this CAPA");
        return done("voided", { status: "void", voidedAt: new Date(), voidedById: actor.id, voidReason: why }, why);
      }
      case "reopen": {
        if (!isReadOnly(current.status)) throw refuse(409, "Only a closed or void CAPA can be reopened.");
        const why = reason(body.reason, "reopening this CAPA");
        return done("reopened", { status: REOPEN_TO.capa[current.status], closedDate: null, closedById: null, closedByName: null, voidedAt: null, voidedById: null, voidReason: null }, why);
      }
      default: throw refuse(400, "Unknown action.");
    }
  });
  await completeCapaTask(actor, id, out.completeTaskId);
  return { status: out.status, updatedAt: out.updatedAt };
}

// ── The link: one CAPA can cover several incidents; an incident has at most one CAPA ──

/** Marks the incident's decision as "a CAPA is linked" and writes the incident's side of the history. */
async function markLinked(tx: Tx, actor: Actor, incident: IncidentDb, capa: { id: string; reference: string }) {
  const data = { capaRequired: true, noCapaReason: "" };
  // Worked out before the save, from the values as they were
  const changes: Change[] = [{ field: "linkedCapa", from: null, to: capa.reference }, ...diffFields(incident, data)];
  await tx.qualityIncidentCapa.create({ data: { incidentId: incident.id, capaId: capa.id, linkedById: actor.id } });
  await save(tx, "incident", incident, data, undefined, actor);
  await recordEvent(tx, { type: "incident", id: incident.id, reference: incident.reference, action: "linked", actor, changes });
}

/** "Open CAPA" on an incident: creates the CAPA from it, links the two, and records one event on each. */
export function openCapaFromIncident(actor: Actor, incidentId: string) {
  return write(async (tx) => {
    const incident = await loadIncident(tx, incidentId);
    mustBeEditable(incident.status, "incident");
    const existing = await linkOfIncident(tx, incidentId);
    if (existing) {
      const capa = await loadCapa(tx, existing.capaId);
      throw refuse(409, `This incident already has ${capa.reference}.`, { code: "already_linked", capa: { id: capa.id, reference: capa.reference } });
    }
    const capa = await insertCapa(tx, actor, { source: "customer_incident", problem: incident.description, ...(incident.facility ? { facility: incident.facility } : {}) }, `Opened from ${incident.reference}`);
    await markLinked(tx, actor, incident, capa);
    return { capa, incidentUpdatedAt: (await loadIncident(tx, incidentId)).updatedAt.toISOString() };
  });
}

/** Links an existing incident to an existing CAPA (from the CAPA page). One event on each record. */
export function linkIncident(actor: Actor, capaId: string, incidentId: unknown) {
  return write(async (tx) => {
    const capa = await loadCapa(tx, capaId);
    mustBeEditable(capa.status, "CAPA");
    if (typeof incidentId !== "string") throw refuse(400, "Choose an incident.");
    const incident = await loadIncident(tx, incidentId);
    mustBeEditable(incident.status, "incident");
    const existing = await linkOfIncident(tx, incidentId);
    if (existing) throw refuse(409, existing.capaId === capaId ? `${incident.reference} is already linked to this CAPA.` : `${incident.reference} already has another CAPA. An incident can have only one.`, { code: "already_linked" });
    await markLinked(tx, actor, incident, capa);
    await recordEvent(tx, { type: "capa", id: capa.id, reference: capa.reference, action: "linked", actor, changes: [{ field: "linkedIncident", from: null, to: incident.reference }] });
    return { linked: incident.reference };
  });
}

/** Unlinking is explicit and needs a reason. It clears the incident's CAPA decision. One event on each record. */
export function unlinkIncident(actor: Actor, incidentId: string, why: unknown, fromCapaId?: string) {
  return write(async (tx) => {
    const incident = await loadIncident(tx, incidentId);
    const link = await linkOfIncident(tx, incidentId);
    if (!link || (fromCapaId && link.capaId !== fromCapaId)) throw refuse(409, fromCapaId ? "That incident is not linked to this CAPA." : "This incident has no linked CAPA.");
    const capa = await loadCapa(tx, link.capaId);
    mustBeEditable(incident.status, "incident");
    mustBeEditable(capa.status, "CAPA");
    const note = reason(why, "unlinking these records");
    await tx.qualityIncidentCapa.delete({ where: { incidentId_capaId: { incidentId, capaId: capa.id } } });
    const data = { capaRequired: null };
    const changes: Change[] = [{ field: "linkedCapa", from: capa.reference, to: null }, ...diffFields(incident, data)];
    await save(tx, "incident", incident, data, undefined, actor);
    await recordEvent(tx, { type: "incident", id: incident.id, reference: incident.reference, action: "unlinked", actor, note, changes });
    await recordEvent(tx, { type: "capa", id: capa.id, reference: capa.reference, action: "unlinked", actor, note, changes: [{ field: "linkedIncident", from: incident.reference, to: null }] });
    return { unlinked: incident.reference, from: capa.reference };
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────────

export async function eventsOf(tx: Tx, type: RecordType, id: string) {
  const events = await tx.qualityEvent.findMany({ where: { recordType: type, recordId: id } });
  return events
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((e) => ({ id: e.id, action: e.action, userName: e.userName, createdAt: e.createdAt.toISOString(), changes: e.changes as unknown as Change[], note: e.note }));
}

export async function listIncidents(): Promise<IncidentRow[]> {
  const rows = await prisma.qualityIncident.findMany();
  const links = await prisma.qualityIncidentCapa.findMany({ where: { incidentId: { in: rows.map((r) => r.id) } } });
  const capas = links.length ? await prisma.qualityCapa.findMany({ where: { id: { in: links.map((l) => l.capaId) } }, select: { id: true, reference: true } }) : [];
  const names = await userNames(prisma, rows.map((r) => r.updatedById));
  return rows
    .sort((a, b) => b.dateReceived.getTime() - a.dateReceived.getTime() || b.reference.localeCompare(a.reference))
    .map((r) => {
      const capa = capas.find((c) => c.id === links.find((l) => l.incidentId === r.id)?.capaId);
      return {
        id: r.id, reference: r.reference, facility: r.facility, dateReceived: day(r.dateReceived)!, channel: r.channel, customer: r.customer, productId: r.productId,
        productName: r.productName, description: r.description, category: r.category, foodSafetyConcern: r.foodSafetyConcern, status: r.status,
        updatedAt: r.updatedAt.toISOString(), updatedByName: names[r.updatedById ?? ""] ?? "", capaId: capa?.id ?? null, capaReference: capa?.reference ?? null,
      };
    });
}

export async function getIncident(id: string) {
  const row = await loadIncident(prisma, id);
  const link = await linkOfIncident(prisma, id);
  const capa = link ? await loadCapa(prisma, link.capaId) : null;
  return {
    record: serialize(row),
    capa: capa ? { id: capa.id, reference: capa.reference, status: capa.status, problem: capa.problem } : null,
    events: await eventsOf(prisma, "incident", id),
    names: await userNames(prisma, [row.closedById, row.voidedById, row.createdById]),
    attachments: await listAttachments(prisma, "incident", id),
  };
}

export async function listCapas(): Promise<CapaRow[]> {
  const rows = await prisma.qualityCapa.findMany();
  const links = await prisma.qualityIncidentCapa.findMany({ where: { capaId: { in: rows.map((r) => r.id) } } });
  const incidents = links.length ? await prisma.qualityIncident.findMany({ where: { id: { in: links.map((l) => l.incidentId) } }, select: { id: true, reference: true } }) : [];
  const names = await userNames(prisma, rows.flatMap((r) => [r.updatedById, r.ownerId]));
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.reference.localeCompare(a.reference))
    .map((r) => ({
      id: r.id, reference: r.reference, facility: r.facility, source: r.source, problem: r.problem, status: r.status, ownerId: r.ownerId, ownerName: names[r.ownerId ?? ""] ?? "",
      dueDate: day(r.dueDate), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), updatedByName: names[r.updatedById ?? ""] ?? "",
      incidentReferences: links.filter((l) => l.capaId === r.id).map((l) => incidents.find((i) => i.id === l.incidentId)?.reference ?? "").filter(Boolean).sort(),
    }));
}

export async function getCapa(id: string) {
  const row = await loadCapa(prisma, id);
  const links = await prisma.qualityIncidentCapa.findMany({ where: { capaId: id } });
  const all = await prisma.qualityIncident.findMany();
  const linkedIds = new Set(links.map((l) => l.incidentId));
  const taken = new Set((await prisma.qualityIncidentCapa.findMany({ where: { incidentId: { in: all.map((i) => i.id) } } })).map((l) => l.incidentId));
  const brief = (i: (typeof all)[number]) => ({ id: i.id, reference: i.reference, status: i.status, dateReceived: day(i.dateReceived)!, description: i.description });
  return {
    record: serialize(row),
    incidents: all.filter((i) => linkedIds.has(i.id)).sort((a, b) => a.reference.localeCompare(b.reference)).map(brief),
    // Incidents that can still be linked: open ones without a CAPA
    linkable: all.filter((i) => !taken.has(i.id) && !isReadOnly(i.status)).sort((a, b) => b.reference.localeCompare(a.reference)).map(brief),
    events: await eventsOf(prisma, "capa", id),
    names: await userNames(prisma, [row.ownerId, row.closedById, row.voidedById, row.createdById]),
    task: await capaTaskSummary(row.taskInstanceId),
    attachments: await listAttachments(prisma, "capa", id),
  };
}

/** The follow-up task as the CAPA page shows it. */
async function capaTaskSummary(taskInstanceId: string | null) {
  if (!taskInstanceId) return null;
  const t = await prisma.ruleInstance.findUnique({ where: { id: taskInstanceId } });
  return t ? { id: t.id, status: t.status as string, dueDate: day(t.dueDate)!, completedLate: t.completedLate, daysLate: t.daysLate } : null;
}

/** A record's attachments, newest first, WITHOUT their storage address: files are only ever reached through the download route. */
export async function listAttachments(tx: Tx, type: "incident" | "capa", id: string): Promise<AttachmentRow[]> {
  const rows = await tx.qualityAttachment.findMany({ where: { recordType: type, recordId: id } });
  const names = await userNames(tx, rows.flatMap((r) => [r.uploadedById, r.removedById]));
  return rows
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .map((r) => ({
      id: r.id, kind: r.kind, fileName: r.fileName, fileSize: r.fileSize, mimeType: r.mimeType, description: r.description, uploadedAt: r.uploadedAt.toISOString(),
      uploadedByName: names[r.uploadedById ?? ""] ?? "", removedAt: r.removedAt?.toISOString() ?? null, removedByName: names[r.removedById ?? ""] ?? "", removeReason: r.removeReason,
    }));
}

/** What the forms' dropdowns need: products, the admins who can own a CAPA, and today's Pacific date. */
export async function qualityOptions() {
  const [products, admins] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true, name: true } }),
  ]);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return { products: products.sort(byName), admins: admins.sort(byName), today: getPacificToday() };
}

