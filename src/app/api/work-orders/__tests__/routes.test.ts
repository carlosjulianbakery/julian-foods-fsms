/**
 * Maintenance Work Orders: the real routes, pages and server functions over the in-memory database
 * (the same one the Quality tests use). Nothing here reaches a real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { NextRequest } from "next/server";

const nav = vi.hoisted(() => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect, useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", async () => { const { makePrisma } = await import("../../quality/__tests__/memdb"); return { prisma: makePrisma() }; });
vi.mock("@/lib/google-sheets-fetcher", () => ({ fetchSheetRows: vi.fn(async () => ({ rows: [] })), invalidateSheetCache: vi.fn() }));

import { getServerSession } from "next-auth";
import { db, resetDb, seed, table } from "../../quality/__tests__/memdb";
import { GET as LIST, POST as CREATE } from "@/app/api/work-orders/route";
import { GET as READ, PATCH as SAVE } from "@/app/api/work-orders/[id]/route";
import { POST as ASSIGN } from "@/app/api/work-orders/[id]/assign/route";
import { POST as START } from "@/app/api/work-orders/[id]/start/route";
import { POST as COMPLETE } from "@/app/api/work-orders/[id]/complete/route";
import { POST as CANCEL } from "@/app/api/work-orders/[id]/cancel/route";
import { GET as OPTIONS } from "@/app/api/work-orders/options/route";
import { GET as EQUIPMENT, POST as ADD_EQUIPMENT } from "@/app/api/work-orders/equipment/route";
import { PATCH as EDIT_EQUIPMENT } from "@/app/api/work-orders/equipment/[id]/route";
import { POST as NEW_INCIDENT } from "@/app/api/quality/incidents/route";
import { POST as NEW_CAPA } from "@/app/api/quality/capas/route";
import { POST as NEW_RULE } from "@/app/api/task-rules/route";
import { PATCH as EDIT_RULE, DELETE as DELETE_RULE } from "@/app/api/task-rules/[id]/route";
import { POST as TASK_START } from "@/app/api/task-instances/[id]/start/route";
import WorkOrderTaskPage from "@/app/(dashboard)/dashboard/work-orders/task/page";
import WorkOrdersPage from "@/app/(dashboard)/dashboard/work-orders/page";
import NewWorkOrder from "@/app/(dashboard)/dashboard/work-orders/new/page";
import WorkOrder from "@/app/(dashboard)/dashboard/work-orders/[id]/page";
import WorkOrderEquipment from "@/app/(dashboard)/dashboard/work-orders/equipment/page";
import { MyTasksBlock } from "@/components/tasks/MyTasksBlock";
import { updateStatuses, generateInstances } from "@/lib/task-generator";
import { healWorkOrderTasks } from "@/lib/work-orders-server";
import { TASK_FORM_REGISTRY, getFormKeyOptions, isSystemManagedFormKey } from "@/lib/task-form-registry";

type MockFn = ReturnType<typeof vi.fn>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const session = getServerSession as unknown as MockFn;
const USERS: Json = {
  carlos: { name: "Carlos Gomory", role: "ADMIN" }, chris: { name: "Chris Pence", role: "ADMIN" }, hugo: { name: "Hugo Ayala", role: "SUPERVISOR" }, ivan: { name: "Ivan Diaz", role: "SUPERVISOR" },
  // No employee role exists in the app yet. These fixtures stand for one, to prove the "own or assigned only" rules.
  emma: { name: "Emma Requester", role: "EMPLOYEE" }, eric: { name: "Eric Assignee", role: "EMPLOYEE" }, eve: { name: "Eve Unrelated", role: "EMPLOYEE" },
};
const as = (id: string | null) => session.mockResolvedValue(id ? { user: { id, role: USERS[id]?.role ?? "SUPERVISOR", name: USERS[id]?.name ?? id, email: `${id}@example.com` } } : null);
const req = (method: string, body?: unknown, url = "http://localhost/api/work-orders") => new NextRequest(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const call = async (r: Promise<Response>): Promise<[number, Json]> => { const res = await r; return [res.status, await res.json()]; };
const ctx = (id: string) => ({ params: { id } });
const row = (model: string, id: string) => table(model).find((r) => r.id === id)!;
const wo = (id: string) => row("workOrder", id);
const stamp = (id: string) => wo(id).updatedAt.toISOString();
const taskOf = (id: string) => { const t = wo(id).taskInstanceId; return t ? row("ruleInstance", t) : null; };
const audits = (taskId: string) => table("taskInstanceAudit").filter((a) => a.instanceId === taskId);
const events = (id: string) => table("workOrderEvent").filter((e) => e.workOrderId === id);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const state = () => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length > 0)));

const REQUEST = { facility: "624", requestType: "machinery_equipment", equipmentId: "other", equipmentName: "Mixer 2", problem: "The belt slips under load.", priority: "medium", assigneeId: "eric" };
/** Opens a work order as `by` (default: Emma, a non-supervisor requester) for Eric. */
async function open(over: Json = {}, by = "emma") { as(by); const [status, body] = await call(CREATE(req("POST", { ...REQUEST, ...over }))); expect(status, JSON.stringify(body)).toBe(201); return body as { id: string; reference: string; dueDate: string }; }
const start = (id: string) => call(START(req("POST", {}), ctx(id)));
const save = (id: string, body: Json) => call(SAVE(req("PATCH", { expectedUpdatedAt: stamp(id), ...body }), ctx(id)));
const complete = (id: string, body: Json = {}) => call(COMPLETE(req("POST", { expectedUpdatedAt: stamp(id), ...body }), ctx(id)));
const assign = (id: string, assigneeId: string) => call(ASSIGN(req("POST", { assigneeId, expectedUpdatedAt: stamp(id) }), ctx(id)));
const cancel = (id: string, reason = "No longer needed") => call(CANCEL(req("POST", { reason, expectedUpdatedAt: stamp(id) }), ctx(id)));
const STEP2 = { startDate: "2026-11-25", startTime: "08:00", stopTime: "09:30", repairedByKind: "internal", repairedByUserId: "eric", toolsAccounted: true, workDescription: "Replaced the belt.", completedDate: "2026-11-25", signatureName: "Eric Assignee" };

beforeEach(() => {
  vi.clearAllMocks();
  at("2026-11-25T18:00:00Z"); // Wednesday November 25, 2026, 10:00 AM Pacific
  resetDb();
  seed("user", [
    ...Object.entries(USERS).map(([id, u], i) => ({ id, ...u, active: true, createdAt: new Date(Date.UTC(2026, 0, 1 + i)) })),
    { id: "old", name: "Olga Former", role: "SUPERVISOR", active: false },
  ]);
  seed("facility", [{ id: "fac-jb", name: "Julian Bakery" }, { id: "fac-624", name: "624" }]);
  seed("taskRule", [
    { id: "rule-preop", title: "Pre-Op Inspection — 624", facilityId: "fac-624", ownerId: "ivan", triggerType: "PRODUCTION_DAY", formKey: "preop_624", recurrenceStart: new Date("2026-11-12T00:00:00Z"), sortOrder: 40 },
    { id: "rule-clean", title: "Daily Cleaning — 624", facilityId: "fac-624", ownerId: "ivan", triggerType: "PRODUCTION_DAY", formKey: "daily_cleaning_624", recurrenceStart: new Date("2026-11-12T00:00:00Z"), sortOrder: 60 },
    { id: "rule-jb", title: "Daily Cleaning", facilityId: "fac-jb", ownerId: "hugo", triggerType: "PRODUCTION_DAY", formKey: "daily_cleaning", recurrenceStart: new Date("2026-11-12T00:00:00Z"), sortOrder: 30 },
    { id: "rule-last", title: "Send Samples", facilityId: "fac-jb", ownerId: "carlos", triggerType: "RECURRING", recurrenceUnit: "month", formKey: null, recurrenceStart: new Date("2026-11-01T00:00:00Z"), sortOrder: 150 },
  ]);
  as("carlos");
  for (const m of ["error", "log", "warn"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

// ════════════════════════════════════════════════════════════════════════════════
describe("who may use each route", () => {
  /** Every route, called on Emma's work order assigned to Eric. */
  const routes = (id: string): [string, () => Promise<Response>][] => [
    ["GET list", () => LIST()], ["POST create", () => CREATE(req("POST", REQUEST))],
    ["GET record", () => READ(req("GET"), ctx(id))], ["PATCH save", () => SAVE(req("PATCH", { expectedUpdatedAt: stamp(id), workDescription: "x" }), ctx(id))],
    ["POST assign", () => ASSIGN(req("POST", { assigneeId: "eve", expectedUpdatedAt: stamp(id) }), ctx(id))], ["POST start", () => START(req("POST", {}), ctx(id))],
    ["POST complete", () => COMPLETE(req("POST", { ...STEP2, expectedUpdatedAt: stamp(id) }), ctx(id))], ["POST cancel", () => CANCEL(req("POST", { reason: "test reason", expectedUpdatedAt: stamp(id) }), ctx(id))],
    ["GET options", () => OPTIONS(req("GET", undefined, "http://localhost/api/work-orders/options"))],
    ["GET equipment", () => EQUIPMENT()], ["POST equipment", () => ADD_EQUIPMENT(req("POST", { facility: "624", name: "Oven 1" }))], ["PATCH equipment", () => EDIT_EQUIPMENT(req("PATCH", { name: "Oven" }), ctx("eq-x"))],
  ];

  it("every route: 401 without a session, and nothing is written", async () => {
    const { id } = await open();
    const before = state();
    as(null);
    for (const [name, run] of routes(id)) {
      const res = await run();
      expect(res.status, name).toBe(401);
      expect(await res.json(), name).toEqual({ error: "Unauthorized" });
    }
    expect(state()).toBe(before);
  });

  it("every route: 403 for an account that has been deactivated, even with a session still open", async () => {
    const { id } = await open();
    const before = state();
    as("old");
    for (const [name, run] of routes(id)) expect((await run()).status, name).toBe(403);
    session.mockResolvedValue({ user: { id: "deleted-user", role: "ADMIN", name: "Ghost" } }); // an account that no longer exists
    for (const [name, run] of routes(id)) expect((await run()).status, name).toBe(403);
    expect(state()).toBe(before);
  });

  it("an unrelated non-supervisor cannot see or touch someone else's work order: 404 on every record route, and it is not in their list", async () => {
    const { id, reference } = await open();
    await start2(id);
    const before = state();
    as("eve");
    expect((await call(LIST()))[1].workOrders).toEqual([]);
    for (const [name, run] of routes(id).filter(([n]) => /record|save|assign|start|complete|cancel/.test(n))) {
      const res = await run();
      expect(res.status, name).toBe(404);
      const body = JSON.stringify(await res.json());
      expect(body, name).toBe('{"error":"Work order not found."}');
      expect(body).not.toContain(reference);
    }
    expect(state()).toBe(before);
    // and the equipment editor is not theirs either
    for (const [name, run] of routes(id).filter(([n]) => /equipment/.test(n))) expect((await run()).status, name).toBe(403);
    expect(state()).toBe(before);
  });
  /** Eric starts the work order (helper for tests that need it in progress). */
  async function start2(id: string) { as("eric"); expect((await start(id))[0]).toBe(200); }

  it("the list: supervisors and admins get everything; anyone else only what they requested or are assigned", async () => {
    const a = await open({}, "emma"); // Emma → Eric
    const b = await open({ assigneeId: "hugo", equipmentName: "Oven 1" }, "carlos"); // Carlos → Hugo
    const c = await open({ assigneeId: "emma", equipmentName: "Dock door" }, "eric"); // Eric → Emma
    const refs = async (who: string) => { as(who); const [status, body] = await call(LIST()); expect(status).toBe(200); return (body.workOrders as Json[]).map((w) => w.reference).sort(); };
    expect(await refs("carlos")).toEqual([a.reference, b.reference, c.reference]);
    expect(await refs("hugo")).toEqual([a.reference, b.reference, c.reference]);
    expect(await refs("ivan")).toEqual([a.reference, b.reference, c.reference]);
    expect(await refs("emma")).toEqual([a.reference, c.reference]);
    expect(await refs("eric")).toEqual([a.reference, c.reference]);
    expect(await refs("eve")).toEqual([]);
    as("eve"); expect((await call(LIST()))[1].viewer).toMatchObject({ seesAll: false, canEditEquipment: false });
    as("hugo"); expect((await call(LIST()))[1].viewer).toMatchObject({ seesAll: true, canEditEquipment: true });
  });

  it("the record: requester, assignee, supervisors and admins can open it, each told what they may do", async () => {
    const { id } = await open();
    const can = async (who: string) => { as(who); const [status, body] = await call(READ(req("GET"), ctx(id))); expect(status, who).toBe(200); return body.can; };
    expect(await can("emma")).toEqual({ work: false, reassign: true, cancel: true }); // requester
    expect(await can("eric")).toEqual({ work: true, reassign: true, cancel: false }); // assignee
    expect(await can("hugo")).toEqual({ work: false, reassign: false, cancel: false }); // a supervisor who is neither
    expect(await can("carlos")).toEqual({ work: true, reassign: true, cancel: true }); // admin
  });

  it("start and Step 2 belong to the assignee (or an admin): the requester and a supervisor get 403", async () => {
    const { id } = await open();
    for (const who of ["emma", "hugo"]) { as(who); expect((await start(id))[0], who).toBe(403); }
    expect(wo(id).status).toBe("open");
    await start2(id);
    for (const who of ["emma", "hugo"]) {
      as(who);
      expect((await save(id, { workDescription: "not mine" }))[0], who).toBe(403);
      expect((await complete(id, STEP2))[0], who).toBe(403);
    }
    expect(wo(id)).toMatchObject({ status: "in_progress", workDescription: "" });
    as("carlos"); expect((await complete(id, { ...STEP2, signatureName: "Carlos Gomory" }))[0]).toBe(200); // an admin may
  });

  it("reassign: requester, assignee or admin; cancel: requester or admin", async () => {
    const { id } = await open();
    as("hugo"); expect((await assign(id, "eve"))[0]).toBe(403); expect((await cancel(id))[0]).toBe(403);
    as("eric"); expect((await cancel(id))[0]).toBe(403); // the assignee cannot cancel
    expect(wo(id)).toMatchObject({ status: "open", assigneeId: "eric" });
    as("eric"); expect((await assign(id, "eve"))[0]).toBe(200); // but can hand it on
    as("emma"); expect((await assign(id, "hugo"))[0]).toBe(200);
    as("carlos"); expect((await assign(id, "eric"))[0]).toBe(200);
    as("emma"); expect((await cancel(id))[0]).toBe(200);
    const other = await open({ equipmentName: "Oven 1" });
    as("chris"); expect((await cancel(other.id))[0]).toBe(200);
  });

  it("every route file under /api/work-orders goes through workOrderRoute", () => {
    const dir = resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "__tests__") walk(p); } else if (f === "route.ts") files.push(p); } };
    walk(dir);
    expect(files).toHaveLength(9);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src.split("export const ").length - 1, f).toBe((src.match(/workOrderRoute\(/g) ?? []).length + 1); // every handler, plus `dynamic`
      expect(src, f).not.toMatch(/export async function/);
      expect(src, f).toContain('export const dynamic = "force-dynamic";');
    }
  });
  it("the pages are outside /dashboard/admin and need a session", async () => {
    const landing = async (run: () => Promise<JSX.Element>) => { try { await run(); return "rendered"; } catch (e) { return (e as Error).message; } };
    as(null);
    expect(await landing(() => WorkOrdersPage())).toBe("REDIRECT /login");
    expect(await landing(() => NewWorkOrder())).toBe("REDIRECT /login");
    expect(await landing(() => WorkOrder({ params: { id: "x" } }))).toBe("REDIRECT /login");
    expect(await landing(() => WorkOrderEquipment())).toBe("REDIRECT /login");
    expect(await landing(() => WorkOrderTaskPage({ searchParams: { taskId: "x" } }))).toBe("REDIRECT /login");
    for (const who of ["eve", "hugo", "carlos"]) { as(who); expect(await landing(() => WorkOrdersPage()), who).toBe("rendered"); expect(await landing(() => NewWorkOrder()), who).toBe("rendered"); }
    as("eve"); expect(await landing(() => WorkOrderEquipment())).toBe("REDIRECT /dashboard/work-orders");
    as("hugo"); expect(await landing(() => WorkOrderEquipment())).toBe("rendered");
    expect(TASK_FORM_REGISTRY.work_order.href("t")).toBe("/dashboard/work-orders/task");
    expect(resolve(__dirname, "../../../(dashboard)/dashboard/work-orders")).not.toContain("/dashboard/admin");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("opening a work order", () => {
  it("the system sets the reference, the date and time, the requester and the due date; the browser cannot", async () => {
    as("emma");
    const [status, body] = await call(CREATE(req("POST", { ...REQUEST, requestedById: "carlos", requestedByName: "Someone Else", requestedAt: "2020-01-01T00:00:00Z", dueDate: "2030-01-01", status: "completed", reference: "WO-1999-001" })));
    expect(status).toBe(201);
    expect(body).toEqual({ id: body.id, reference: "WO-2026-001", dueDate: "2026-12-02" });
    expect(wo(body.id)).toMatchObject({
      reference: "WO-2026-001", facility: "624", requestType: "machinery_equipment", equipmentId: null, equipmentName: "Mixer 2", problem: "The belt slips under load.", priority: "medium", status: "open",
      requestedById: "emma", requestedByName: "Emma Requester", assigneeId: "eric", assigneeName: "Eric Assignee", toolsAccounted: null, signedById: null,
    });
    expect(wo(body.id).requestedAt.toISOString()).toBe("2026-11-25T18:00:00.000Z");
    expect(day(wo(body.id).dueDate)).toBe("2026-12-02");
    expect(events(body.id).map((e) => [e.action, e.userName])).toEqual([["created", "Emma Requester"]]);
    expect(events(body.id)[0].changes).toContainEqual({ field: "assignee", from: null, to: "Eric Assignee" });
  });

  it("due dates in Pacific time: High today, Medium +7, Low +30, also just before and after midnight and across both clock changes", async () => {
    const due = async (priority: string, when: string) => { at(when); return (await open({ priority, equipmentName: `Item ${priority} ${when}` })).dueDate; };
    expect(await due("high", "2026-11-25T18:00:00Z")).toBe("2026-11-25");
    expect(await due("medium", "2026-11-25T18:00:00Z")).toBe("2026-12-02");
    expect(await due("low", "2026-11-25T18:00:00Z")).toBe("2026-12-25");
    // 11:30 PM Pacific on the 25th is already the 26th in UTC: the work order still belongs to the 25th
    expect(await due("high", "2026-11-26T07:30:00Z")).toBe("2026-11-25");
    expect(await due("high", "2026-11-26T08:30:00Z")).toBe("2026-11-26"); // 12:30 AM Pacific
    // the night the clocks go back (November 1, 2026): 11:30 PM PDT on October 31, then 12:30 AM on November 1
    expect(await due("high", "2026-11-01T06:30:00Z")).toBe("2026-10-31");
    expect(await due("medium", "2026-11-01T06:30:00Z")).toBe("2026-11-07");
    expect(await due("high", "2026-11-01T07:30:00Z")).toBe("2026-11-01");
    // across the spring change (March 8, 2026)
    expect(await due("medium", "2026-03-06T07:59:00Z")).toBe("2026-03-12"); // 11:59 PM PST on March 5
    expect(await due("low", "2026-03-06T08:01:00Z")).toBe("2026-04-05");
    // a work order opened on New Year's Eve Pacific belongs to the old year
    at("2027-01-01T07:30:00Z");
    expect((await open({ equipmentName: "Year end" })).reference).toMatch(/^WO-2026-/);
    at("2027-01-01T08:30:00Z");
    expect((await open({ equipmentName: "New year" })).reference).toBe("WO-2027-001");
  });

  it("what is required is refused by field, and nothing is written", async () => {
    as("emma");
    const before = state();
    const [status, body] = await call(CREATE(req("POST", {})));
    expect(status).toBe(422);
    expect((body.problems as Json[]).map((p) => p.field)).toEqual(["facility", "requestType", "equipmentName", "problem", "priority", "assigneeId"]);
    expect((await call(CREATE(req("POST", null as never))))[0]).toBe(422);
    expect(state()).toBe(before);
    expect(db.counters).toEqual({});
  });

  it("the assignee must be an active user; a deactivated one is refused and is not offered", async () => {
    as("emma");
    for (const assigneeId of ["old", "nobody"]) {
      const [status, body] = await call(CREATE(req("POST", { ...REQUEST, assigneeId })));
      expect(status).toBe(422);
      expect(body.problems).toEqual([{ field: "assigneeId", message: "Assigned to: choose an active user." }]);
    }
    expect(table("workOrder")).toHaveLength(0);
    const [, options] = await call(OPTIONS(req("GET", undefined, "http://localhost/api/work-orders/options")));
    expect((options.users as Json[]).map((u) => u.id).sort()).toEqual(["carlos", "chris", "emma", "eric", "eve", "hugo", "ivan"]);
    expect(JSON.stringify(options.users)).not.toContain("Olga");
  });

  it("requester = assignee: one work order, one task, theirs", async () => {
    const { id } = await open({ assigneeId: "emma" });
    expect(wo(id)).toMatchObject({ requestedById: "emma", assigneeId: "emma" });
    expect(table("ruleInstance")).toHaveLength(1);
    expect(taskOf(id)!.ownerUserId).toBe("emma");
    as("emma");
    expect((await call(READ(req("GET"), ctx(id))))[1].can).toEqual({ work: true, reassign: true, cancel: true });
    expect(table("notification")).toHaveLength(0); // no notification is written in this phase, to oneself or anyone
  });

  it("equipment from the list is taken by its id and facility; a retired item or another facility's item is refused", async () => {
    as("hugo");
    const [, a] = await call(ADD_EQUIPMENT(req("POST", { facility: "624", name: "Mixer 2" })));
    const [, b] = await call(ADD_EQUIPMENT(req("POST", { facility: "Julian Bakery", name: "Oven 1" })));
    const made = await open({ equipmentId: a.id, equipmentName: "ignored when an item is chosen" });
    expect(wo(made.id)).toMatchObject({ equipmentId: a.id, equipmentName: "Mixer 2" });
    as("emma");
    expect((await call(CREATE(req("POST", { ...REQUEST, equipmentId: b.id }))))[0]).toBe(422); // Oven 1 belongs to Julian Bakery
    as("hugo"); await call(EDIT_EQUIPMENT(req("PATCH", { retired: true }), ctx(a.id)));
    as("emma");
    const [status, body] = await call(CREATE(req("POST", { ...REQUEST, equipmentId: a.id })));
    expect(status).toBe(422);
    expect(body.problems[0].field).toBe("equipmentName");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("reference numbers: the Quality counter, with its own kind", () => {
  it("WO-2026-001, then 002, and CI / CAPA numbering is not disturbed", async () => {
    expect((await open()).reference).toBe("WO-2026-001");
    as("carlos");
    expect((await call(NEW_INCIDENT(req("POST", { dateReceived: "2026-11-25", channel: "email", description: "Plastic in a loaf." }))))[1].reference).toBe("CI-2026-001");
    expect((await call(NEW_CAPA(req("POST", { source: "audit_finding", problem: "Log incomplete." }))))[1].reference).toBe("CAPA-2026-001");
    expect((await open({ equipmentName: "Oven 1" })).reference).toBe("WO-2026-002");
    as("carlos");
    expect((await call(NEW_INCIDENT(req("POST", { dateReceived: "2026-11-25", channel: "phone", description: "Second one." }))))[1].reference).toBe("CI-2026-002");
    expect((await open({ equipmentName: "Dock door" })).reference).toBe("WO-2026-003");
    expect(db.counters).toEqual({ "WO-2026": 3, "CI-2026": 2, "CAPA-2026": 1 });
  });
  it("a refused request does not use up a number; a cancelled work order keeps its number", async () => {
    as("emma");
    await call(CREATE(req("POST", { ...REQUEST, assigneeId: "old" })));
    const first = await open();
    as("emma"); await cancel(first.id);
    expect((await open({ equipmentName: "Oven 1" })).reference).toBe("WO-2026-002");
    expect(table("workOrder").map((w) => [w.reference, w.status])).toEqual([["WO-2026-001", "cancelled"], ["WO-2026-002", "open"]]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("the task: one per work order, always the assignee's", () => {
  it("opening a work order creates one task for the assignee, on the facility's system rule, ranked last", async () => {
    const { id, reference } = await open();
    const rules = table("taskRule").filter((r) => r.formKey === "work_order");
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ title: "Maintenance work order — 624", facilityId: "fac-624", triggerType: "ONE_OFF", windowMode: "NONE", isActive: true, sortOrder: 160, ownerId: "carlos" });
    expect(day(rules[0].recurrenceStart)).toBe("2026-01-01");
    const task = taskOf(id)!;
    expect(task).toMatchObject({ ruleId: rules[0].id, status: "UPCOMING", ownerUserId: "eric", label: `${reference}: Mixer 2 — The belt slips under load.`, calendarKey: `wo:${id}`, source: "MANUAL" });
    expect(day(task.dueDate)).toBe("2026-12-02");
    expect(audits(task.id).map((a) => [a.action, a.userId, a.note])).toEqual([["created", "emma", `Created for ${reference} (assigned to Eric Assignee)`]]);
    expect(table("ruleInstance")).toHaveLength(1);
  });
  it("one rule per facility, created on first use and then reused", async () => {
    await open(); await open({ equipmentName: "Oven 1" });
    await open({ facility: "Julian Bakery", equipmentName: "Proofer" }); await open({ facility: "Julian Bakery", equipmentName: "Slicer" });
    const rules = table("taskRule").filter((r) => r.formKey === "work_order");
    expect(rules.map((r) => [r.title, r.facilityId, r.sortOrder])).toEqual([["Maintenance work order — 624", "fac-624", 160], ["Maintenance work order", "fac-jb", 170]]);
    expect(table("ruleInstance").map((t) => t.ruleId)).toEqual([rules[0].id, rules[0].id, rules[1].id, rules[1].id]);
  });
  it("a High work order's task is due today; an already-past date cannot happen at creation", async () => {
    const { id } = await open({ priority: "high" });
    expect(taskOf(id)).toMatchObject({ status: "DUE_TODAY" });
    expect(day(taskOf(id)!.dueDate)).toBe("2026-11-25");
  });
  it("two work orders for the same equipment and the same problem on the same day: two tasks, different labels (the unique index holds)", async () => {
    const a = await open({ priority: "high" });
    const b = await open({ priority: "high" });
    expect([taskOf(a.id)!.label, taskOf(b.id)!.label]).toEqual(["WO-2026-001: Mixer 2 — The belt slips under load.", "WO-2026-002: Mixer 2 — The belt slips under load."]);
    expect(taskOf(a.id)!.ruleId).toBe(taskOf(b.id)!.ruleId);
    expect(day(taskOf(a.id)!.dueDate)).toBe(day(taskOf(b.id)!.dueDate));
    // the in-memory database enforces the same unique index as the real one: (rule, due date, label)
    expect(() => seed("ruleInstance", [])).not.toThrow();
    await expect((async () => { const { prisma } = await import("@/lib/prisma"); await prisma.ruleInstance.create({ data: { ruleId: taskOf(a.id)!.ruleId, dueDate: taskOf(a.id)!.dueDate, label: taskOf(a.id)!.label } as never }); })()).rejects.toThrow(/Unique constraint/);
  });
  it("the Ivan trap: no work order task ever has an empty owner, through every change", async () => {
    const a = await open(); const b = await open({ assigneeId: "emma", equipmentName: "Oven 1" }); const c = await open({ equipmentName: "Dock door" }, "carlos");
    const owners = () => table("ruleInstance").filter((t) => String(t.calendarKey).startsWith("wo:")).map((t) => t.ownerUserId);
    expect(owners()).toEqual(["eric", "emma", "eric"]);
    as("eric"); await start(a.id);
    as("emma"); await assign(a.id, "hugo");
    as("carlos"); await assign(c.id, "ivan");
    as("emma"); await start(b.id); await complete(b.id, { ...STEP2, repairedByUserId: "emma", signatureName: "Emma Requester" });
    expect(owners()).toEqual(["hugo", "emma", "ivan"]);
    expect(owners().every((o) => typeof o === "string" && o.length > 0)).toBe(true);
    // and the status promotion, which runs every night, leaves the owner alone
    at("2026-12-20T18:00:00Z"); await updateStatuses(); await generateInstances();
    expect(owners()).toEqual(["hugo", "emma", "ivan"]);
    expect(table("ruleInstance").filter((t) => String(t.calendarKey).startsWith("wo:"))).toHaveLength(3); // the generator made none
  });
  it("My Tasks (the real dashboard block): the assignee sees the task; an unrelated supervisor and the rule's owner-by-default do not", async () => {
    const { id } = await open({ priority: "high", assigneeId: "hugo" }, "carlos"); // Carlos → Hugo, due today
    const taskId = taskOf(id)!.id;
    const seen = async (who: string) => {
      as(who);
      const el = (await MyTasksBlock()) as JSX.Element | null;
      const p = el!.props as { instances: Json[]; calendarInstances: Json[]; role: string };
      return { list: p.instances.some((t) => t.id === taskId), calendar: p.calendarInstances.some((t) => t.id === taskId) };
    };
    expect(await seen("hugo")).toEqual({ list: true, calendar: true }); // the assignee
    expect(await seen("ivan")).toEqual({ list: false, calendar: false }); // another supervisor: not his
    expect(await seen("eve")).toEqual({ list: false, calendar: false });
    expect(await seen("carlos")).toEqual({ list: true, calendar: true }); // admins see every task, as with all tasks
    // reassigned to Ivan: now it is on Ivan's list and gone from Hugo's
    as("carlos"); await assign(id, "ivan");
    expect(await seen("ivan")).toEqual({ list: true, calendar: true });
    expect(await seen("hugo")).toEqual({ list: false, calendar: false });
    // the row carries its work order label, and its rule opens the work order
    as("ivan");
    const mine = ((await MyTasksBlock()) as JSX.Element).props.instances.find((t: Json) => t.id === taskId);
    expect(mine).toMatchObject({ label: "WO-2026-001: Mixer 2 — The belt slips under load.", formKey: "work_order", ownerUserId: "ivan" });
  });
  it("the rules are system-managed: not offered when making a rule, and cannot be created, edited, archived or deleted from Task Rules", async () => {
    await open();
    const rule = table("taskRule").find((r) => r.formKey === "work_order")!;
    expect(isSystemManagedFormKey("work_order")).toBe(true);
    expect(getFormKeyOptions().map((o) => o.value)).not.toContain("work_order");
    as("carlos");
    const before = state();
    expect((await NEW_RULE(req("POST", { title: "Mine", facilityId: "fac-624", ownerId: "carlos", triggerType: "ONE_OFF", recurrenceStart: "2026-12-01", formKey: "work_order" }))).status).toBe(403);
    expect((await EDIT_RULE(req("PATCH", { title: "Renamed" }), ctx(rule.id))).status).toBe(403);
    expect((await EDIT_RULE(req("PATCH", { isArchived: true }), ctx(rule.id))).status).toBe(403);
    expect((await DELETE_RULE(req("DELETE"), ctx(rule.id))).status).toBe(403);
    expect(state()).toBe(before);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("Start", () => {
  it("the assignee presses Start: Open → In progress, the task with it, both logged", async () => {
    const { id, reference } = await open({ priority: "high" });
    as("eric");
    const [status, body] = await start(id);
    expect([status, body.status]).toEqual([200, "in_progress"]);
    expect(wo(id)).toMatchObject({ status: "in_progress", updatedById: "eric" });
    expect(wo(id).startedAt.toISOString()).toBe("2026-11-25T18:00:00.000Z");
    expect(taskOf(id)!.status).toBe("IN_PROGRESS");
    expect(audits(taskOf(id)!.id).map((a) => [a.action, a.note])).toEqual([["created", expect.any(String)], ["started", `${reference} started`]]);
    expect(events(id).map((e) => e.action)).toEqual(["created", "started"]);
    expect(events(id)[1].changes).toEqual([{ field: "status", from: "open", to: "in_progress" }]);
    // a second Start changes nothing
    const once = state();
    expect((await start(id))[0]).toBe(409);
    expect(state()).toBe(once);
  });
  it("Start on the task (My Tasks, the calendar) opens the work order and starts it, once", async () => {
    const { id } = await open({ priority: "high" });
    const taskId = taskOf(id)!.id;
    const landing = async () => { try { await WorkOrderTaskPage({ searchParams: { taskId } }); return "rendered"; } catch (e) { return (e as Error).message; } };
    as("eric");
    expect(await landing()).toBe(`REDIRECT /dashboard/work-orders/${id}`);
    expect(wo(id).status).toBe("in_progress");
    expect(taskOf(id)!.status).toBe("IN_PROGRESS");
    const once = state();
    expect(await landing()).toBe(`REDIRECT /dashboard/work-orders/${id}`); // again: nothing more happens
    expect(state()).toBe(once);
    // the app's own start route on the same task changes nothing either
    expect((await call(TASK_START(req("POST"), ctx(taskId))))[1].status).toBe("IN_PROGRESS");
    expect(state()).toBe(once);
  });
  it("someone who is not the assignee following the task link sees the work order but does not start it; a stranger gets a plain message", async () => {
    const { id } = await open();
    const taskId = taskOf(id)!.id;
    const landing = async (searchParams?: { taskId?: string }) => { try { await WorkOrderTaskPage({ searchParams }); return "rendered"; } catch (e) { return (e as Error).message; } };
    const before = state();
    as("hugo"); expect(await landing({ taskId })).toBe(`REDIRECT /dashboard/work-orders/${id}`);
    as("emma"); expect(await landing({ taskId })).toBe(`REDIRECT /dashboard/work-orders/${id}`);
    as("eve"); expect(await landing({ taskId })).toBe("rendered"); // "No work order was found for this task"
    as("eric"); expect(await landing({ taskId: "no-such-task" })).toBe("rendered");
    as("eric"); expect(await landing(undefined)).toBe("rendered");
    expect(state()).toBe(before);
  });
  it("a task that had gone overdue is started all the same", async () => {
    const { id } = await open({ priority: "high" });
    at("2026-11-27T18:00:00Z"); await updateStatuses();
    expect(taskOf(id)!.status).toBe("OVERDUE");
    as("eric"); expect((await start(id))[0]).toBe(200);
    expect(taskOf(id)!.status).toBe("IN_PROGRESS");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("Step 2", () => {
  async function started(over: Json = {}) { const made = await open(over); as("eric"); await start(made.id); at(new Date(Date.now() + 60_000).toISOString()); return made; }

  it("Step 2 cannot be filled in before Start", async () => {
    const { id } = await open();
    as("eric");
    expect(await save(id, { workDescription: "early" })).toEqual([409, { error: "Press Start first: Step 2 is filled in once the work order is in progress.", code: "not_started" }]);
    expect((await complete(id, STEP2))[0]).toBe(409);
    expect(wo(id)).toMatchObject({ status: "open", workDescription: "" });
  });

  it("Save draft stores what is filled in on the server, keeps the work order In progress and logs the change", async () => {
    const { id } = await started();
    const [status, body] = await save(id, { startDate: "2026-11-25", startTime: "08:00", toolsAccounted: false, workDescription: "  Took the guard off.  " });
    expect([status, body.changed]).toEqual([200, 4]);
    expect(wo(id)).toMatchObject({ status: "in_progress", startTime: "08:00", toolsAccounted: false, workDescription: "Took the guard off.", signedById: null });
    expect(day(wo(id).startDate)).toBe("2026-11-25");
    expect(taskOf(id)!.status).toBe("IN_PROGRESS");
    expect(events(id).map((e) => e.action)).toEqual(["created", "started", "draft_saved"]);
    expect(events(id)[2].changes.map((c: Json) => c.field).sort()).toEqual(["startDate", "startTime", "toolsAccounted", "workDescription"]);
    // saving the same again writes nothing
    const before = state();
    expect((await save(id, { startTime: "08:00" }))[1].changed).toBe(0);
    expect(state()).toBe(before);
    // another device sees the draft
    as("eric");
    expect((await call(READ(req("GET"), ctx(id))))[1].record).toMatchObject({ startDate: "2026-11-25", startTime: "08:00", toolsAccounted: false, workDescription: "Took the guard off." });
  });

  it("tools No blocks completion on the server; the draft can still be saved and the work order stays In progress", async () => {
    const { id } = await started();
    const before = state();
    const [status, body] = await complete(id, { ...STEP2, toolsAccounted: false });
    expect(status).toBe(422);
    expect((body.problems as Json[]).map((p) => p.field)).toEqual(["toolsAccounted"]);
    expect(body.problems[0].message).toContain("the answer is No");
    expect(state()).toBe(before); // nothing was saved by the refused submit
    expect((await complete(id, { ...STEP2, toolsAccounted: null }))[0]).toBe(422);
    const noAnswer = { ...STEP2 } as Json; delete noAnswer.toolsAccounted;
    expect((await complete(id, noAnswer))[0]).toBe(422);
    // a "No" saved in the draft blocks a later submit that leaves the answer out
    expect((await save(id, { ...STEP2, toolsAccounted: false }))[0]).toBe(200);
    expect(wo(id)).toMatchObject({ status: "in_progress", toolsAccounted: false });
    expect((await complete(id, {}))[0]).toBe(422);
    expect(wo(id).status).toBe("in_progress");
    expect(taskOf(id)!.status).toBe("IN_PROGRESS");
    // once the answer is Yes it goes through
    expect((await complete(id, { toolsAccounted: true }))[0]).toBe(200);
    expect(wo(id)).toMatchObject({ status: "completed", toolsAccounted: true });
  });

  it("submitting completes the work order, signs it with the typed name, the account and the time, and completes the task exactly once", async () => {
    const { id } = await started({ priority: "high" });
    const [status, body] = await complete(id, STEP2);
    expect(status).toBe(200);
    const taskId = wo(id).taskInstanceId;
    expect(body).toMatchObject({ status: "completed", completedInstanceId: taskId });
    expect(wo(id)).toMatchObject({
      status: "completed", startTime: "08:00", stopTime: "09:30", repairedByKind: "internal", repairedByUserId: "eric", repairedByName: "Eric Assignee", toolsAccounted: true,
      workDescription: "Replaced the belt.", signatureName: "Eric Assignee", signedById: "eric",
    });
    expect(wo(id).signedAt.toISOString()).toBe("2026-11-25T18:01:00.000Z");
    expect(day(wo(id).completedDate)).toBe("2026-11-25");
    expect(row("ruleInstance", taskId)).toMatchObject({ status: "DONE", doneById: "eric", completedLate: false, completedBySubmissionId: id, ownerUserId: "eric" });
    expect(audits(taskId).map((a) => a.action)).toEqual(["created", "started", "completed"]);
    expect(events(id).map((e) => e.action)).toEqual(["created", "started", "completed"]);
    expect(events(id)[2].changes[0]).toEqual({ field: "status", from: "in_progress", to: "completed" });
    // a second submit is refused and does not complete anything twice
    const once = state();
    expect((await complete(id, STEP2))[0]).toBe(409);
    expect((await save(id, { workDescription: "after the fact" }))[0]).toBe(409);
    expect(state()).toBe(once);
    expect(table("ruleInstance").filter((t) => t.status === "DONE")).toHaveLength(1);
    expect(audits(taskId).filter((a) => a.action === "completed")).toHaveLength(1);
    expect(await healWorkOrderTasks({ id: "carlos", name: "Carlos Gomory", role: "ADMIN" })).toEqual([]);
    expect(state()).toBe(once);
  });

  it("the signature is required, and the signer is the person logged in, whatever name is typed", async () => {
    const { id } = await started();
    expect((await complete(id, { ...STEP2, signatureName: "  " }))[1].problems.map((p: Json) => p.field)).toEqual(["signatureName"]);
    as("carlos"); // an admin completes it and types the technician's name
    expect((await complete(id, { ...STEP2, signatureName: "Eric Assignee", signedById: "eric", signedAt: "2020-01-01T00:00:00Z" }))[0]).toBe(200);
    expect(wo(id)).toMatchObject({ signatureName: "Eric Assignee", signedById: "carlos" });
    expect(wo(id).signedAt.getUTCFullYear()).toBe(2026);
  });

  it("late: judged by the day Step 2 is submitted, by the app's shared helper", async () => {
    const { id } = await started({ priority: "high" }); // due November 25
    at("2026-11-28T18:00:00Z");
    expect((await complete(id, { ...STEP2, completedDate: "2026-11-25" }))[0]).toBe(200); // the work was done on time, written up three days later
    expect(taskOf(id)).toMatchObject({ status: "DONE", completedLate: true, daysLate: 3 });
  });

  it("dates and times: completion not before the start; stop not before start on the same day; refused for drafts and for submits", async () => {
    const { id } = await started();
    const before = state();
    for (const send of [save, complete]) {
      const [s1, b1] = await send(id, { ...STEP2, startDate: "2026-11-25", completedDate: "2026-11-24" });
      expect([s1, b1.problems.map((p: Json) => p.field)]).toEqual([422, ["completedDate"]]);
      const [s2, b2] = await send(id, { ...STEP2, startTime: "14:00", stopTime: "13:00" });
      expect([s2, b2.problems.map((p: Json) => p.field)]).toEqual([422, ["stopTime"]]);
      expect((await send(id, { startTime: "9 o'clock" }))[0]).toBe(422);
    }
    expect(state()).toBe(before);
    // a draft that contradicts what is already saved is refused too
    await save(id, { startDate: "2026-11-25" });
    expect((await save(id, { completedDate: "2026-11-20" }))[0]).toBe(422);
    // work that ran past midnight is fine
    expect((await complete(id, { ...STEP2, startTime: "22:00", stopTime: "02:00", completedDate: "2026-11-26" }))[0]).toBe(200);
  });

  it("repaired by: an active user, a typed internal name, or an external name or company", async () => {
    const a = await started();
    expect((await complete(a.id, { ...STEP2, repairedByUserId: "old" }))[1].problems.map((p: Json) => p.field)).toEqual(["repairedByUserId"]);
    expect((await complete(a.id, { ...STEP2, repairedByUserId: null, repairedByName: "" }))[1].problems.map((p: Json) => p.field)).toEqual(["repairedByName"]);
    expect((await complete(a.id, { ...STEP2, repairedByUserId: "hugo", repairedByName: "typed but a person was chosen" }))[0]).toBe(200);
    expect(wo(a.id)).toMatchObject({ repairedByKind: "internal", repairedByUserId: "hugo", repairedByName: "Hugo Ayala" });
    const b = await started({ equipmentName: "Oven 1" });
    expect((await complete(b.id, { ...STEP2, repairedByUserId: null, repairedByName: "Pedro (night shift)" }))[0]).toBe(200);
    expect(wo(b.id)).toMatchObject({ repairedByKind: "internal", repairedByUserId: null, repairedByName: "Pedro (night shift)" });
    const c = await started({ equipmentName: "Freezer" });
    expect((await complete(c.id, { ...STEP2, repairedByKind: "external", repairedByName: "" }))[1].problems.map((p: Json) => p.field)).toEqual(["repairedByName"]);
    expect((await complete(c.id, { ...STEP2, repairedByKind: "external", repairedByUserId: "eric", repairedByName: "ACME Refrigeration" }))[0]).toBe(200);
    expect(wo(c.id)).toMatchObject({ repairedByKind: "external", repairedByUserId: null, repairedByName: "ACME Refrigeration" });
  });

  it("two people editing Step 2: the second save, made on a stale copy, gets 409 and changes nothing", async () => {
    const { id } = await started();
    const stale = stamp(id);
    as("eric"); expect((await save(id, { workDescription: "Eric's note" }))[0]).toBe(200);
    as("carlos");
    const before = state();
    const [status, body] = await call(SAVE(req("PATCH", { expectedUpdatedAt: stale, workDescription: "Carlos's note" }), ctx(id)));
    expect([status, body.code]).toEqual([409, "conflict"]);
    expect(body.error).toBe("Someone else changed this work order. Reload to see the latest version.");
    expect((await call(COMPLETE(req("POST", { ...STEP2, expectedUpdatedAt: stale }), ctx(id))))[0]).toBe(409);
    expect((await call(SAVE(req("PATCH", { expectedUpdatedAt: stale, workDescription: "Eric's note" }), ctx(id))))[0]).toBe(409); // even with nothing to change
    expect(state()).toBe(before);
    expect(wo(id).workDescription).toBe("Eric's note");
    expect((await call(SAVE(req("PATCH", { workDescription: "no stamp" }), ctx(id))))[0]).toBe(400); // the stamp is required
    expect((await save(id, { workDescription: "Carlos's note, on the latest copy" }))[0]).toBe(200);
  });

  it("self-heal: a completed work order whose task was left open gets it completed when the list or the record is loaded, once", async () => {
    const { id } = await started({ priority: "high" });
    const fails = (model: string, op: string, data: Json) => (model === "ruleInstance" && op === "update" && data.status === "DONE") || (model === "taskInstanceAudit" && op === "create" && data.action === "completed");
    db.failOn = fails;
    expect((await complete(id, STEP2))[0]).toBe(200); // the work order is saved even though its task could not be completed
    db.failOn = null;
    expect([wo(id).status, taskOf(id)!.status]).toEqual(["completed", "IN_PROGRESS"]);
    seed("ruleInstance", [{ id: "other-open", ruleId: "rule-clean", dueDate: new Date("2026-11-25T00:00:00Z"), status: "DUE_TODAY", label: "" }]);
    as("hugo"); await LIST();
    expect(taskOf(id)).toMatchObject({ status: "DONE", doneById: "hugo" });
    expect(events(id).map((e) => e.action)).toEqual(["created", "started", "completed", "task_completed"]);
    expect(row("ruleInstance", "other-open").status).toBe("DUE_TODAY");
    const once = state();
    await LIST(); await READ(req("GET"), ctx(id));
    expect(state()).toBe(once);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("reassign", () => {
  it("moves the same task to the new person, with an audit row, and logs who had it", async () => {
    const { id, reference } = await open();
    const taskId = taskOf(id)!.id;
    as("emma");
    const [status, body] = await assign(id, "hugo");
    expect([status, body]).toEqual([200, { status: "open", assigneeId: "hugo", updatedAt: expect.any(String) }]);
    expect(wo(id)).toMatchObject({ assigneeId: "hugo", assigneeName: "Hugo Ayala", status: "open", taskInstanceId: taskId });
    expect(table("ruleInstance")).toHaveLength(1);
    expect(row("ruleInstance", taskId)).toMatchObject({ ownerUserId: "hugo", status: "UPCOMING" });
    expect(audits(taskId).map((a) => [a.action, a.note])).toEqual([["created", expect.any(String)], ["updated", `${reference} reassigned from Eric Assignee to Hugo Ayala`]]);
    expect(events(id)[1]).toMatchObject({ action: "reassigned", userName: "Emma Requester", changes: [{ field: "assignee", from: "Eric Assignee", to: "Hugo Ayala" }] });
    // Eric no longer has it: he cannot start it, and (not being a supervisor) cannot even see it
    as("eric"); expect((await start(id))[0]).toBe(404);
    as("hugo"); expect((await start(id))[0]).toBe(200);
  });
  it("an order In progress goes back to Open; the task keeps its history and waits for the new person", async () => {
    const { id } = await open({ priority: "high" });
    as("eric"); await start(id); await save(id, { workDescription: "Started taking it apart." });
    const taskId = taskOf(id)!.id;
    as("eric");
    expect((await assign(id, "ivan"))[1]).toMatchObject({ status: "open", assigneeId: "ivan" });
    expect(wo(id)).toMatchObject({ status: "open", assigneeId: "ivan", startedAt: null, workDescription: "Started taking it apart." }); // the draft is kept for the next person
    expect(row("ruleInstance", taskId)).toMatchObject({ ownerUserId: "ivan", status: "DUE_TODAY" });
    expect(audits(taskId).map((a) => a.action)).toEqual(["created", "started", "updated"]);
    expect(events(id).find((e) => e.action === "reassigned")!.changes).toEqual([{ field: "assignee", from: "Eric Assignee", to: "Ivan Diaz" }, { field: "status", from: "in_progress", to: "open" }]);
    as("ivan"); expect((await start(id))[0]).toBe(200);
    expect(audits(taskId).map((a) => a.action)).toEqual(["created", "started", "updated", "started"]);
  });
  it("only to an active user, not to the same person, and not once it is completed or cancelled", async () => {
    const { id } = await open();
    as("emma");
    expect((await assign(id, "old"))[0]).toBe(422);
    expect((await assign(id, "nobody"))[0]).toBe(422);
    expect((await assign(id, "eric"))[0]).toBe(409);
    expect((await call(ASSIGN(req("POST", { assigneeId: "hugo" }), ctx(id))))[0]).toBe(400); // no stamp
    expect(wo(id).assigneeId).toBe("eric");
    await cancel(id);
    expect((await assign(id, "hugo"))[0]).toBe(409);
  });
  it("an assignee who is deactivated later: the record says so, the work order stays open, and reassigning fixes it", async () => {
    const { id } = await open();
    as("emma");
    expect((await call(READ(req("GET"), ctx(id))))[1].assigneeActive).toBe(true);
    table("user").find((u) => u.id === "eric")!.active = false;
    const [, body] = await call(READ(req("GET"), ctx(id)));
    expect(body.assigneeActive).toBe(false);
    expect(body.record).toMatchObject({ status: "open", assigneeName: "Eric Assignee" });
    expect((await assign(id, "hugo"))[0]).toBe(200);
    expect((await call(READ(req("GET"), ctx(id))))[1].assigneeActive).toBe(true);
    // a user row that is deleted empties the id (the foreign key does that in the database); the name stays
    Object.assign(wo(id), { assigneeId: null });
    as("carlos");
    expect((await call(READ(req("GET"), ctx(id))))[1]).toMatchObject({ assigneeActive: false, record: { assigneeName: "Hugo Ayala" } });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("cancel / void", () => {
  it("needs a reason; the work order is kept, read-only, and never deleted", async () => {
    const { id } = await open();
    as("emma");
    for (const reason of ["", "  ", "no"]) expect((await cancel(id, reason))[0]).toBe(422);
    expect(wo(id).status).toBe("open");
    expect((await cancel(id, "Fixed itself after a restart"))[0]).toBe(200);
    expect(wo(id)).toMatchObject({ status: "cancelled", cancelledById: "emma", cancelReason: "Fixed itself after a restart" });
    expect(events(id)[1]).toMatchObject({ action: "cancelled", note: "Fixed itself after a restart", changes: [{ field: "status", from: "open", to: "cancelled" }, { field: "cancelReason", from: null, to: "Fixed itself after a restart" }] });
    expect(table("workOrder")).toHaveLength(1);
    expect((await cancel(id))[0]).toBe(409);
    as("eric");
    expect((await start(id))[0]).toBe(409);
    const src = readFileSync(resolve(__dirname, "../../../../lib/work-orders-server.ts"), "utf8");
    expect(src).not.toMatch(/workOrder\.(delete|deleteMany)\(/);
    expect(src).not.toMatch(/workOrderEvent\.(delete|deleteMany|update|updateMany)\(/);
  });
  it("a task nobody acted on (only its creation in its history) is deleted with its audit row", async () => {
    const { id } = await open();
    const taskId = taskOf(id)!.id;
    seed("notification", [{ id: "n1", userId: "eric", instanceId: taskId, type: "TASK_DUE_SOON", title: "t", body: "b", dedupeKey: "k1" }, { id: "n2", userId: "ivan", instanceId: "another-task", type: "TASK_DUE_SOON", title: "t", body: "b", dedupeKey: "k2" }]);
    as("emma"); await cancel(id);
    expect(table("ruleInstance")).toHaveLength(0);
    expect(audits(taskId)).toHaveLength(0);
    expect(wo(id).taskInstanceId).toBeNull();
    expect(table("notification").map((n) => n.id)).toEqual(["n2"]);
  });
  it("a task with real history is kept as Skipped, with the reason and a 'skipped' audit row", async () => {
    const { id } = await open({ priority: "high" });
    as("eric"); await start(id);
    const taskId = taskOf(id)!.id;
    as("emma"); expect((await cancel(id, "The machine was replaced"))[0]).toBe(200);
    expect(row("ruleInstance", taskId)).toMatchObject({ status: "SKIPPED", skippedById: "emma", skipReason: "Work order cancelled: The machine was replaced", ownerUserId: "eric" });
    expect(audits(taskId).map((a) => [a.action, a.note])).toEqual([["created", expect.any(String)], ["started", expect.any(String)], ["skipped", "Work order cancelled: The machine was replaced"]]);
    expect(wo(id).taskInstanceId).toBe(taskId);
  });
  it("a reassigned task also has real history; a finished task is left exactly as it is when a completed order is voided", async () => {
    const a = await open();
    as("emma"); await assign(a.id, "hugo"); await cancel(a.id);
    expect(taskOf(a.id)).toMatchObject({ status: "SKIPPED", ownerUserId: "hugo" });
    const b = await open({ equipmentName: "Oven 1", priority: "high" });
    as("eric"); await start(b.id); await complete(b.id, STEP2);
    const done = JSON.stringify(taskOf(b.id));
    as("carlos"); expect((await cancel(b.id, "Entered on the wrong equipment"))[0]).toBe(200);
    expect(wo(b.id).status).toBe("cancelled");
    expect(JSON.stringify(taskOf(b.id))).toBe(done);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("duplicate warning", () => {
  const options = (q: string) => call(OPTIONS(req("GET", undefined, `http://localhost/api/work-orders/options${q}`)));
  it("open work orders for the same equipment at the same facility are listed; it never blocks", async () => {
    const a = await open(); // Mixer 2 at 624, open
    const b = await open(); // a second one for the same equipment goes through
    expect([a.reference, b.reference]).toEqual(["WO-2026-001", "WO-2026-002"]);
    as("eric"); await start(a.id);
    as("hugo");
    const [, found] = await options("?facility=624&equipmentName=%20mixer%202%20");
    expect((found.duplicates as Json[]).map((d) => [d.reference, d.status]).sort()).toEqual([["WO-2026-001", "in_progress"], ["WO-2026-002", "open"]]);
    expect(found.duplicates[0]).toMatchObject({ requestedByName: "Emma Requester", assigneeName: "Eric Assignee" });
    expect((await options("?facility=Julian%20Bakery&equipmentName=Mixer%202"))[1].duplicates).toEqual([]); // another facility
    expect((await options("?facility=624&equipmentName=Oven%201"))[1].duplicates).toEqual([]);
    expect((await options(""))[1].duplicates).toEqual([]);
    // completed and cancelled work orders are not "open"
    as("eric"); await complete(a.id, STEP2); as("emma"); await cancel(b.id);
    expect((await options("?facility=624&equipmentName=Mixer%202"))[1].duplicates).toEqual([]);
  });
  it("matches a list item by its id, whatever it is called now", async () => {
    as("hugo");
    const [, item] = await call(ADD_EQUIPMENT(req("POST", { facility: "624", name: "Mixer 2" })));
    await open({ equipmentId: item.id });
    await call(EDIT_EQUIPMENT(req("PATCH", { name: "Spiral mixer 2" }), ctx(item.id)));
    expect((await options(`?facility=624&equipmentId=${item.id}`))[1].duplicates.map((d: Json) => d.reference)).toEqual(["WO-2026-001"]);
  });
  it("someone who may not open the other work order learns that it exists, but gets no link to it", async () => {
    const { id } = await open();
    as("eve"); expect((await options("?facility=624&equipmentName=Mixer%202"))[1].duplicates[0]).toMatchObject({ id: null, reference: "WO-2026-001" });
    as("hugo"); expect((await options("?facility=624&equipmentName=Mixer%202"))[1].duplicates[0]).toMatchObject({ id });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("the facility the form starts on", () => {
  const facility = async (who: string) => { as(who); return (await call(OPTIONS(req("GET", undefined, "http://localhost/api/work-orders/options"))))[1].defaultFacility; };
  it("where the person owns the most task rules, when they have opened no work order yet", async () => {
    expect(await facility("ivan")).toBe("624"); // owns two 624 rules
    expect(await facility("hugo")).toBe("Julian Bakery");
    expect(await facility("eve")).toBe(""); // owns none: must choose
    seed("taskRule", [{ id: "r-x", title: "X", facilityId: "fac-jb", ownerId: "ivan", triggerType: "RECURRING", recurrenceStart: new Date("2026-11-01T00:00:00Z"), isArchived: true }, { id: "r-y", title: "Y", facilityId: "fac-jb", ownerId: "ivan", triggerType: "RECURRING", recurrenceStart: new Date("2026-11-01T00:00:00Z"), isArchived: true }, { id: "r-z", title: "Z", facilityId: "fac-jb", ownerId: "ivan", triggerType: "RECURRING", recurrenceStart: new Date("2026-11-01T00:00:00Z"), isArchived: true }]);
    expect(await facility("ivan")).toBe("624"); // archived rules do not count
  });
  it("the facility of their most recent work order wins over that", async () => {
    await open({ facility: "Julian Bakery", equipmentName: "Proofer" }, "ivan");
    expect(await facility("ivan")).toBe("Julian Bakery");
    at("2026-11-26T18:00:00Z");
    await open({ facility: "624", equipmentName: "Oven 1" }, "ivan");
    expect(await facility("ivan")).toBe("624");
    await open({ facility: "Julian Bakery", equipmentName: "Slicer", assigneeId: "ivan" }, "carlos"); // assigned to him, not opened by him
    expect(await facility("ivan")).toBe("624");
    // the system rules created for the work orders do not sway an admin's default
    expect(await facility("carlos")).toBe("Julian Bakery");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("the equipment and area list", () => {
  it("starts empty, and an empty list never blocks a request", async () => {
    as("hugo");
    expect((await call(EQUIPMENT()))[1]).toEqual({ facilities: ["Julian Bakery", "624"], items: [], versions: {} });
    expect((await call(OPTIONS(req("GET", undefined, "http://localhost/api/work-orders/options"))))[1].equipment).toEqual([]);
    expect((await open({ equipmentId: "", equipmentName: "Roof vent" })).reference).toBe("WO-2026-001");
  });
  it("supervisors and admins add, rename, retire and bring back items; nothing is ever deleted; each change raises the list's version", async () => {
    as("hugo");
    const [s1, a] = await call(ADD_EQUIPMENT(req("POST", { facility: "624", name: "  Mixer   2 " })));
    expect(s1).toBe(201);
    as("carlos");
    const [, b] = await call(ADD_EQUIPMENT(req("POST", { facility: "624", name: "Oven 1" })));
    await call(ADD_EQUIPMENT(req("POST", { facility: "Julian Bakery", name: "Oven 1" }))); // the same name at the other facility is fine
    expect(row("workOrderEquipment", a.id)).toMatchObject({ facility: "624", name: "Mixer 2", sortOrder: 1, createdById: "hugo", retiredAt: null });
    expect(row("workOrderEquipment", b.id).sortOrder).toBe(2);
    expect((await call(ADD_EQUIPMENT(req("POST", { facility: "624", name: "mixer 2" }))))[0]).toBe(409); // already there
    expect((await call(ADD_EQUIPMENT(req("POST", { facility: "624", name: "" }))))[0]).toBe(422);
    expect((await call(ADD_EQUIPMENT(req("POST", { facility: "624", name: "Other" }))))[0]).toBe(422);
    expect((await call(ADD_EQUIPMENT(req("POST", { facility: "Mars", name: "Rover" }))))[0]).toBe(422);
    expect((await call(EDIT_EQUIPMENT(req("PATCH", { name: "Oven 1" }), ctx(a.id))))[0]).toBe(409);
    expect((await call(EDIT_EQUIPMENT(req("PATCH", { name: "Spiral mixer 2" }), ctx(a.id))))[0]).toBe(200);
    expect((await call(EDIT_EQUIPMENT(req("PATCH", { retired: true }), ctx(b.id))))[0]).toBe(200);
    expect(row("workOrderEquipment", b.id)).toMatchObject({ retiredById: "carlos" });
    expect(row("workOrderEquipment", b.id).retiredAt).toBeTruthy();
    expect((await call(EDIT_EQUIPMENT(req("PATCH", { name: "x" }), ctx("nope"))))[0]).toBe(404);
    const [, list] = await call(EQUIPMENT());
    expect((list.items as Json[]).map((i) => [i.facility, i.name, !!i.retiredAt])).toEqual([["624", "Spiral mixer 2", false], ["624", "Oven 1", true], ["Julian Bakery", "Oven 1", false]]);
    expect(list.versions).toEqual({ "624": 4, "Julian Bakery": 1 });
    // people opening a work order are offered only what is in use
    as("eve");
    expect((await call(OPTIONS(req("GET", undefined, "http://localhost/api/work-orders/options"))))[1].equipment.map((e: Json) => `${e.facility}/${e.name}`).sort()).toEqual(["624/Spiral mixer 2", "Julian Bakery/Oven 1"]);
    as("carlos");
    expect((await call(EDIT_EQUIPMENT(req("PATCH", { retired: false }), ctx(b.id))))[0]).toBe(200);
    expect(row("workOrderEquipment", b.id).retiredAt).toBeNull();
    expect(table("workOrderEquipment")).toHaveLength(3);
    const src = readFileSync(resolve(__dirname, "../../../../lib/work-orders-server.ts"), "utf8");
    expect(src).not.toMatch(/workOrderEquipment\.(delete|deleteMany)\(/);
  });
  it("a work order keeps the name its equipment had, even after the item is renamed or retired", async () => {
    as("hugo");
    const [, item] = await call(ADD_EQUIPMENT(req("POST", { facility: "624", name: "Mixer 2" })));
    const { id } = await open({ equipmentId: item.id });
    as("hugo"); await call(EDIT_EQUIPMENT(req("PATCH", { name: "Spiral mixer", retired: true }), ctx(item.id)));
    expect(wo(id)).toMatchObject({ equipmentId: item.id, equipmentName: "Mixer 2" });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("nothing shared was changed to make this work", () => {
  it("the shared task code, the hook and the crons do not mention work orders", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "../../../..", p), "utf8");
    for (const shared of ["lib/task-generator.ts", "lib/task-completion.ts", "lib/calendar-generator.ts", "lib/task-reminders.ts", "lib/task-escalation.ts", "lib/batch-sheet-reconcile.ts", "lib/task-order.ts", "app/api/task-instances/[id]/start/route.ts", "hooks/useMarkInProgress.ts", "components/tasks/MyTasksBlock.tsx", "components/tasks/MyTasksClient.tsx"]) {
      expect(read(shared), shared).not.toMatch(/work[-_]orders?|workOrder|WORK_ORDER|WorkOrder/);
    }
    expect(read("lib/work-orders-server.ts")).toContain('import { completeRuleInstanceForSubmission } from "@/lib/task-completion";');
  });
});
