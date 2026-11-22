/**
 * A small in-memory stand-in for the Prisma client, for tests only. It understands the query shapes the
 * app uses (equality, in / notIn / not, date ranges, contains, AND / OR, and the task → rule → facility
 * relation), rolls a failed transaction back, and cascades a deleted task's audit rows like the database.
 */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DEFAULTS: Record<string, () => Row> = {
  qualityIncident: () => ({ facility: null, customer: "", productId: null, productName: "", lotCode: "", bestByDate: null, description: "", category: null, foodSafetyConcern: false, immediateAction: "", responseDate: null, responseChannel: null, responseSummary: "", capaRequired: null, noCapaReason: "", status: "open", closedDate: null, closedById: null, voidedAt: null, voidedById: null, voidReason: null }),
  qualityCapa: () => ({ facility: null, problem: "", rootCause: "", correctiveAction: "", preventiveAction: "", ownerId: null, dueDate: null, effectivenessDate: null, effectivenessResult: "", status: "open", closedDate: null, closedById: null, closedByName: null, taskInstanceId: null, voidedAt: null, voidedById: null, voidReason: null }),
  qualityAttachment: () => ({ kind: "evidence", description: "", fileSize: null, mimeType: null, uploadedById: null, uploadedAt: new Date(), removedAt: null, removedById: null, removeReason: null }),
  qualityReview: () => ({ facility: null, reviewedById: null, reviewedByName: "", whatWasReviewed: "", notes: "", counts: {}, linkedInstanceId: null }),
  qualityEvent: () => ({ reference: "", userName: "", changes: [], note: null }),
  ruleInstance: () => ({ status: "UPCOMING", label: "", source: "MANUAL", calendarKey: null, ownerUserId: null, doneAt: null, doneById: null, completedLate: false, daysLate: null, completedBySubmissionId: null, needsAdminReview: false, reviewReason: null, sortKey: null, skippedAt: null, skippedById: null, skipReason: null, missedReason: null }),
  taskRule: () => ({ description: null, triggerType: "RECURRING", recurrenceUnit: null, recurrenceEvery: 1, recurrenceEndOfMonth: false, formKey: null, productName: null, escalateAfterDays: null, isActive: true, isArchived: false, archivedAt: null, windowMode: "NONE", windowDaysBefore: null, sortOrder: null }),
};
const PREFIX: Record<string, string> = { qualityIncident: "inc", qualityCapa: "capa", qualityAttachment: "att", qualityReview: "rev", qualityEvent: "ev", ruleInstance: "task", taskRule: "rule", taskInstanceAudit: "audit", notification: "note" };

const fresh = () => ({ tables: {} as Record<string, Row[]>, counters: {} as Record<string, number>, seq: 0 });
export const db = { ...fresh(), failOn: null as null | ((model: string, op: string, data: Row) => boolean), writes: [] as { model: string; op: string; where?: unknown; data?: unknown }[] };
export function resetDb() { Object.assign(db, fresh()); db.failOn = null; db.writes = []; }
export const table = (model: string): Row[] => (db.tables[model] ??= []);
export function seed(model: string, rows: Row[]) { for (const r of rows) table(model).push({ ...(DEFAULTS[model]?.() ?? {}), createdAt: new Date(), updatedAt: new Date(), ...r }); }

const isDate = (v: unknown): v is Date => Object.prototype.toString.call(v) === "[object Date]";
const cmp = (v: unknown) => (isDate(v) ? v.getTime() : v) as number | string;
const same = (a: unknown, b: unknown) => (isDate(a) || isDate(b) ? a != null && b != null && cmp(a) === cmp(b) : a === b);

function fieldMatches(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || isDate(cond)) return same(value ?? null, cond ?? null);
  const c = cond as Row;
  if ("in" in c && !(c.in as unknown[]).some((x) => same(value, x))) return false;
  if ("notIn" in c && (c.notIn as unknown[]).some((x) => same(value, x))) return false;
  if ("not" in c && same(value ?? null, c.not ?? null)) return false;
  if ("equals" in c && !same(value ?? null, c.equals ?? null)) return false;
  if ("contains" in c && !String(value ?? "").includes(String(c.contains))) return false;
  if ("startsWith" in c && !String(value ?? "").startsWith(String(c.startsWith))) return false;
  for (const [op, test] of [["gte", (a: number | string, b: number | string) => a >= b], ["lte", (a: number | string, b: number | string) => a <= b], ["gt", (a: number | string, b: number | string) => a > b], ["lt", (a: number | string, b: number | string) => a < b]] as const) {
    if (op in c && (value == null || !test(cmp(value), cmp(c[op])))) return false;
  }
  return true;
}

/** A task joined with its rule, the rule with its facility and owner — as `include: { rule: … }` gives it. */
function joined(model: string, row: Row): Row {
  if (model === "ruleInstance") {
    const rule = table("taskRule").find((r) => r.id === row.ruleId);
    return { ...row, rule: rule ? joined("taskRule", rule) : null, doneBy: table("user").find((u) => u.id === row.doneById) ?? null, skippedBy: null, auditLogs: table("taskInstanceAudit").filter((a) => a.instanceId === row.id) };
  }
  if (model === "taskRule") return { ...row, facility: table("facility").find((f) => f.id === row.facilityId) ?? null, owner: table("user").find((u) => u.id === row.ownerId) ?? null, _count: { instances: table("ruleInstance").filter((i) => i.ruleId === row.id).length } };
  return { ...row };
}

function matches(model: string, row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  const view = joined(model, row);
  return Object.entries(where).every(([key, cond]) => {
    if (key === "AND") return (Array.isArray(cond) ? cond : [cond]).every((w) => matches(model, row, w));
    if (key === "OR") return (cond as Row[]).some((w) => matches(model, row, w));
    if (key === "NOT") return !matches(model, row, cond as Row);
    // a compound unique key such as incidentId_capaId or facility_period
    if (key.includes("_") && cond && typeof cond === "object" && !(key in row)) return Object.entries(cond as Row).every(([k, v]) => same(row[k], v));
    if (cond && typeof cond === "object" && !isDate(cond) && view[key] && typeof view[key] === "object" && !isDate(view[key]) && !Array.isArray(view[key]) && !("in" in cond || "notIn" in cond || "not" in cond || "gte" in cond || "lte" in cond || "gt" in cond || "lt" in cond || "contains" in cond || "equals" in cond)) {
      // a relation filter, e.g. rule: { formKey, facility: { name } }
      const relModel = key === "rule" ? "taskRule" : key;
      return Object.entries(cond as Row).every(([k, v]) => (v && typeof v === "object" && !isDate(v) && view[key][k] && typeof view[key][k] === "object" && !isDate(view[key][k]) ? Object.entries(v as Row).every(([k2, v2]) => fieldMatches(view[key][k][k2], v2)) : relModel && fieldMatches(view[key][k], v)));
    }
    return fieldMatches(row[key], model === "ruleInstance" && key === "dueDate" ? dateOnly(cond) : cond);
  });
}

/** `dueDate` on a task is a DATE column: the database keeps the day only, in what is stored and in what is compared. */
const dateOnly = (v: unknown): unknown => (isDate(v) ? new Date(`${v.toISOString().slice(0, 10)}T00:00:00Z`) : v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Row).map(([k, x]) => [k, dateOnly(x)])) : v);
const dayColumns = (model: string, data: Row): Row => (model === "ruleInstance" && data && "dueDate" in data ? { ...data, dueDate: dateOnly(data.dueDate) } : data);
const applyData = (row: Row, data: Row) => { for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === "object" && !isDate(v) && "increment" in v ? (row[k] ?? 0) + (v as Row).increment : v; };
const maybeFail = (model: string, op: string, data: Row) => { if (db.failOn?.(model, op, data)) throw new Error(`${model}.${op} failed (test)`); };

function model(name: string) {
  const rows = () => table(name);
  const log = (op: string, where?: unknown, data?: unknown) => db.writes.push({ model: name, op, where, data });
  const insert = (raw: Row) => {
    const data = dayColumns(name, raw);
    maybeFail(name, "create", data);
    const now = new Date();
    const row: Row = { id: data.id ?? `${PREFIX[name] ?? name}-${++db.seq}`, ...(DEFAULTS[name]?.() ?? {}), createdAt: now, updatedAt: now, ...data };
    if (name === "ruleInstance" && rows().some((r) => r.ruleId === row.ruleId && same(r.dueDate, row.dueDate) && r.label === row.label)) throw Object.assign(new Error("Unique constraint failed on (ruleId, dueDate, label)"), { code: "P2002" });
    if (name === "qualityIncidentCapa" && rows().some((r) => r.incidentId === row.incidentId)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    if (name === "qualityReview" && rows().some((r) => r.period === row.period)) throw Object.assign(new Error("Unique constraint failed on period"), { code: "P2002" });
    rows().push(row);
    return row;
  };
  const remove = (victims: Row[]) => {
    db.tables[name] = rows().filter((r) => !victims.includes(r));
    // the database cascades a deleted task's audit rows
    if (name === "ruleInstance") db.tables.taskInstanceAudit = table("taskInstanceAudit").filter((a) => !victims.some((v) => v.id === a.instanceId));
  };
  return {
    findMany: async (a?: { where?: Row }) => rows().filter((r) => matches(name, r, a?.where)).map((r) => joined(name, r)),
    findFirst: async (a?: { where?: Row }) => { const r = rows().find((x) => matches(name, x, a?.where)); return r ? joined(name, r) : null; },
    findUnique: async (a: { where: Row }) => { const r = rows().find((x) => matches(name, x, a.where)); return r ? joined(name, r) : null; },
    count: async (a?: { where?: Row }) => rows().filter((r) => matches(name, r, a?.where)).length,
    aggregate: async (a: { _max?: Row; where?: Row }) => ({ _max: Object.fromEntries(Object.keys(a._max ?? {}).map((k) => [k, rows().filter((r) => matches(name, r, a.where)).reduce((m: number | null, r) => (r[k] == null ? m : m == null ? r[k] : Math.max(m, r[k])), null)])) }),
    create: async (a: { data: Row }) => { log("create", undefined, a.data); return { ...insert(a.data) }; },
    createMany: async (a: { data: Row[]; skipDuplicates?: boolean }) => { let count = 0; for (const d of a.data) { try { insert(d); count++; log("create", undefined, d); } catch (e) { if (!a.skipDuplicates) throw e; } } return { count }; },
    update: async (a: { where: Row; data: Row }) => {
      const row = rows().find((r) => matches(name, r, a.where));
      if (!row) throw Object.assign(new Error(`${name} to update not found`), { code: "P2025" });
      maybeFail(name, "update", a.data); log("update", a.where, a.data); applyData(row, dayColumns(name, a.data)); return { ...row };
    },
    updateMany: async (a: { where?: Row; data: Row }) => { const hit = rows().filter((r) => matches(name, r, a.where)); if (hit.length) log("updateMany", a.where, a.data); for (const r of hit) applyData(r, dayColumns(name, a.data)); return { count: hit.length }; },
    upsert: async (a: { where: Row; create: Row; update: Row }) => { const row = rows().find((r) => matches(name, r, a.where)); if (row) { applyData(row, dayColumns(name, a.update)); return { ...row }; } return { ...insert(a.create) }; },
    delete: async (a: { where: Row }) => { const hit = rows().filter((r) => matches(name, r, a.where)); if (!hit.length) throw Object.assign(new Error(`${name} to delete not found`), { code: "P2025" }); log("delete", a.where); remove([hit[0]]); return { ...hit[0] }; },
    deleteMany: async (a?: { where?: Row }) => { const hit = rows().filter((r) => matches(name, r, a?.where)); if (hit.length) log("deleteMany", a?.where); remove(hit); return { count: hit.length }; },
    groupBy: async () => [],
  };
}

export function makePrisma() {
  const models: Record<string, ReturnType<typeof model>> = {};
  const client: Row = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") return undefined;
      if (prop === "$queryRawUnsafe") return async (sql: string, kind: string, year: number) => {
        if (!sql.includes("quality_counters")) throw new Error("unexpected raw query");
        const key = `${kind}-${year}`; db.counters[key] = (db.counters[key] ?? 0) + 1; return [{ lastNumber: db.counters[key] }];
      };
      if (prop === "$transaction") return async (arg: unknown) => {
        const before = { tables: structuredClone(db.tables), counters: { ...db.counters } };
        try { return typeof arg === "function" ? await (arg as (tx: unknown) => Promise<unknown>)(client) : await Promise.all(arg as Promise<unknown>[]); }
        catch (e) { db.tables = before.tables; db.counters = before.counters; throw e; }
      };
      if (prop === "$disconnect") return async () => {};
      return (models[prop] ??= model(prop));
    },
  });
  return client;
}
