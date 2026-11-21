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
import {
  CAPA_FIELDS, CAPA_STATUSES, INCIDENT_FIELDS, REFERENCE_KIND, REOPEN_TO, capaCanClose, capaClosingProblems, capaCreateProblems, capaMove,
  canUseQuality, diffFields, formatReference, isDate, incidentClosingProblems, incidentCreateProblems, incidentMove, isReadOnly, parseFields,
  type CapaRow, type Change, type EventAction, type FieldProblem, type FieldValue, type IncidentRow, type RecordType,
} from "@/lib/quality";

type Tx = Prisma.TransactionClient;
export interface Actor { id: string; name: string }

/** An expected refusal: the route turns it into a JSON answer with this status. */
export class QualityError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}
const refuse = (status: number, message: string, extra: Record<string, unknown> = {}) => new QualityError(status, message, extra);
const invalid = (problems: FieldProblem[]) => refuse(422, "Some fields need attention.", { problems });

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

/** One transaction per write. The change and its history row succeed or fail together. */
export const write = <T,>(fn: (tx: Tx) => Promise<T>): Promise<T> => prisma.$transaction(fn);

/** Appends one row to the history. There is no function that updates or deletes one. */
export function recordEvent(tx: Tx, e: { type: RecordType; id: string; reference: string; action: EventAction; actor: Actor; changes?: Change[]; note?: string | null }) {
  return tx.qualityEvent.create({
    data: { recordType: e.type, recordId: e.id, reference: e.reference, action: e.action, userId: e.actor.id, userName: e.actor.name, changes: (e.changes ?? []) as never, note: e.note?.trim() || null },
  });
}

/** The next reference of a kind for the Pacific year of `today`: CI-2026-001, CAPA-2026-001 … never reused. */
export async function nextReference(tx: Tx, type: RecordType, today: string): Promise<string> {
  const year = Number(today.slice(0, 4));
  const rows = await tx.$queryRawUnsafe<{ lastNumber: number | bigint }[]>(QUALITY_NEXT_NUMBER_SQL, REFERENCE_KIND[type], year);
  return formatReference(REFERENCE_KIND[type], year, Number(rows[0].lastNumber));
}

// ── Shapes ──────────────────────────────────────────────────────────────────────

const DAY_FIELDS = ["dateReceived", "bestByDate", "responseDate", "closedDate", "dueDate", "effectivenessDate"];
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
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

const reason = (v: unknown, what: string): string => {
  const r = typeof v === "string" ? v.trim() : "";
  if (r.length < 3) throw invalid([{ field: "reason", message: `Reason: say why you are ${what}.` }]);
  return r;
};

async function userNames(tx: Tx, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
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

async function loadIncident(tx: Tx, id: string): Promise<IncidentDb> {
  const row = await tx.qualityIncident.findUnique({ where: { id } });
  if (!row) throw refuse(404, "Incident not found.");
  return row;
}
async function loadCapa(tx: Tx, id: string): Promise<CapaDb> {
  const row = await tx.qualityCapa.findUnique({ where: { id } });
  if (!row) throw refuse(404, "CAPA not found.");
  return row;
}
const linkOfIncident = (tx: Tx, incidentId: string) => tx.qualityIncidentCapa.findUnique({ where: { incidentId } });
const mustBeEditable = (status: string, what: string) => {
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
    return insertCapa(tx, actor, data);
  });
}

export function updateCapa(actor: Actor, id: string, body: Record<string, unknown> | null) {
  return write(async (tx) => {
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
    return { updatedAt: (await loadCapa(tx, id)).updatedAt.toISOString(), changed: changes.length };
  });
}

export function capaAction(actor: Actor, id: string, body: StatusBody | null) {
  return write(async (tx) => {
    const current = await loadCapa(tx, id);
    const done = async (action: EventAction, data: Record<string, unknown>, note?: string) => {
      const changes = diffFields(current, data, Object.keys(data).filter((k) => ["status", "closedDate", "closedByName", "voidReason"].includes(k)));
      await save(tx, "capa", current, data, body?.expectedUpdatedAt, actor);
      await recordEvent(tx, { type: "capa", id, reference: current.reference, action, actor, changes, note });
      return { status: data.status as string, updatedAt: (await loadCapa(tx, id)).updatedAt.toISOString() };
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

async function eventsOf(tx: Tx, type: RecordType, id: string) {
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
  };
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

