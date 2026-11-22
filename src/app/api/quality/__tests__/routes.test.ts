import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

// ── In-memory database. A transaction that throws is rolled back, like the real one. ──
const mem = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string; updatedAt: Date; createdAt: Date };
  const fresh = () => ({
    incidents: [] as Row[], capas: [] as Row[], links: [] as { incidentId: string; capaId: string; linkedById: string | null }[],
    events: [] as { id: string; recordType: string; recordId: string; reference: string; action: string; userId: string; userName: string; changes: unknown[]; note: string | null; createdAt: Date }[],
    counters: {} as Record<string, number>, seq: 0,
  });
  return { state: fresh(), fresh, failEvents: false, failEventOnAction: null as string | null };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", async () => {
  // Phase 2: tasks, task rules and attachments live in the shared in-memory database (see memdb.ts)
  const shared = (await import("./memdb")).makePrisma();
  const USERS = [
    { id: "carlos", name: "Carlos Gomory", role: "ADMIN", active: true }, { id: "chris", name: "Chris Pence", role: "ADMIN", active: true },
    { id: "hugo", name: "Hugo Ayala", role: "SUPERVISOR", active: true }, { id: "gone", name: "Former Admin", role: "ADMIN", active: false },
  ];
  const PRODUCTS = [{ id: "prod-1", name: "Keto Bread", isActive: true }, { id: "prod-2", name: "Paleo Wraps", isActive: true }];
  const s = () => mem.state;
  const inList = (w: { id?: { in: string[] } } | undefined, id: string) => !w?.id || w.id.in.includes(id);
  const table = (rows: () => (Record<string, unknown> & { id: string; updatedAt: Date; createdAt: Date })[], prefix: string, defaults: Record<string, unknown>) => ({
    create: vi.fn(async (a: { data: Record<string, unknown> }) => {
      const now = new Date();
      const row = { id: `${prefix}-${++s().seq}`, ...defaults, createdAt: now, updatedAt: now, ...a.data };
      rows().push(row); return row;
    }),
    findUnique: vi.fn(async (a: { where: { id: string } }) => rows().find((r) => r.id === a.where.id) ?? null),
    findMany: vi.fn(async (a?: { where?: { id?: { in: string[] } } }) => rows().filter((r) => inList(a?.where, r.id))),
    updateMany: vi.fn(async (a: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
      const row = rows().find((r) => r.id === a.where.id && (!a.where.updatedAt || r.updatedAt.getTime() === a.where.updatedAt.getTime()));
      if (!row) return { count: 0 };
      Object.assign(row, a.data); return { count: 1 };
    }),
  });
  const TEXT = { customer: "", productName: "", lotCode: "", description: "", immediateAction: "", responseSummary: "", noCapaReason: "" };
  const prisma = {
    user: {
      findMany: vi.fn(async (a: { where: { id?: { in: string[] }; role?: string; active?: boolean } }) => USERS.filter((u) => inList(a.where, u.id) && (!a.where.role || u.role === a.where.role) && (a.where.active === undefined || u.active === a.where.active))),
      findUnique: vi.fn(async (a: { where: { id: string } }) => USERS.find((u) => u.id === a.where.id) ?? null),
    },
    product: {
      findMany: vi.fn(async () => PRODUCTS),
      findUnique: vi.fn(async (a: { where: { id: string } }) => PRODUCTS.find((p) => p.id === a.where.id) ?? null),
    },
    qualityIncident: table(() => s().incidents, "inc", { ...TEXT, facility: null, productId: null, bestByDate: null, category: null, foodSafetyConcern: false, responseDate: null, responseChannel: null, capaRequired: null, status: "open", closedDate: null, closedById: null, voidedAt: null, voidedById: null, voidReason: null }),
    qualityCapa: table(() => s().capas, "capa", { facility: null, problem: "", rootCause: "", correctiveAction: "", preventiveAction: "", ownerId: null, dueDate: null, effectivenessDate: null, effectivenessResult: "", status: "open", closedDate: null, closedById: null, closedByName: null, taskInstanceId: null, voidedAt: null, voidedById: null, voidReason: null }),
    qualityIncidentCapa: {
      create: vi.fn(async (a: { data: { incidentId: string; capaId: string; linkedById: string } }) => {
        if (s().links.some((l) => l.incidentId === a.data.incidentId)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        s().links.push(a.data); return a.data;
      }),
      findUnique: vi.fn(async (a: { where: { incidentId: string } }) => s().links.find((l) => l.incidentId === a.where.incidentId) ?? null),
      findMany: vi.fn(async (a: { where: { capaId?: string | { in: string[] }; incidentId?: { in: string[] } } }) =>
        s().links.filter((l) => (a.where.capaId === undefined || (typeof a.where.capaId === "string" ? l.capaId === a.where.capaId : a.where.capaId.in.includes(l.capaId))) && (!a.where.incidentId || a.where.incidentId.in.includes(l.incidentId)))),
      delete: vi.fn(async (a: { where: { incidentId_capaId: { incidentId: string; capaId: string } } }) => {
        s().links = s().links.filter((l) => !(l.incidentId === a.where.incidentId_capaId.incidentId && l.capaId === a.where.incidentId_capaId.capaId)); return {};
      }),
    },
    // The history: rows can be created and read. There is deliberately no update or delete here.
    qualityEvent: {
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        if (mem.failEvents || mem.failEventOnAction === a.data.action) throw new Error("history write failed");
        const row = { id: `ev-${++s().seq}`, note: null, ...a.data, createdAt: new Date(Date.now() + s().events.length) } as (typeof mem.state.events)[number];
        s().events.push(row); return row;
      }),
      findMany: vi.fn(async (a: { where: { recordType: string; recordId: string } }) => s().events.filter((e) => e.recordType === a.where.recordType && e.recordId === a.where.recordId)),
    },
    $queryRawUnsafe: vi.fn(async (sql: string, kind: string, year: number) => {
      if (!sql.includes("quality_counters")) throw new Error("unexpected raw query");
      const key = `${kind}-${year}`;
      s().counters[key] = (s().counters[key] ?? 0) + 1;
      return [{ lastNumber: s().counters[key] }];
    }),
    ruleInstance: shared.ruleInstance, taskRule: shared.taskRule, facility: shared.facility, taskInstanceAudit: shared.taskInstanceAudit, notification: shared.notification, qualityAttachment: shared.qualityAttachment,
    $transaction: vi.fn(async (fn: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[]) => {
      if (typeof fn !== "function") return Promise.all(fn);
      const before = structuredClone(mem.state);
      try { return await fn(prisma); } catch (e) { mem.state = before; throw e; }
    }),
  };
  return { prisma };
});

import { getServerSession } from "next-auth";
import { resetDb, seed } from "./memdb";
import { GET as LIST_I, POST as NEW_I } from "@/app/api/quality/incidents/route";
import { GET as GET_I, PATCH as SAVE_I } from "@/app/api/quality/incidents/[id]/route";
import { POST as ACT_I } from "@/app/api/quality/incidents/[id]/status/route";
import { POST as OPEN_CAPA, DELETE as UNLINK_I } from "@/app/api/quality/incidents/[id]/capa/route";
import { GET as LIST_C, POST as NEW_C } from "@/app/api/quality/capas/route";
import { GET as GET_C, PATCH as SAVE_C } from "@/app/api/quality/capas/[id]/route";
import { POST as ACT_C } from "@/app/api/quality/capas/[id]/status/route";
import { POST as LINK, DELETE as UNLINK_C } from "@/app/api/quality/capas/[id]/incidents/route";
import { GET as OPTIONS } from "@/app/api/quality/options/route";

type MockFn = ReturnType<typeof vi.fn>;
const session = getServerSession as unknown as MockFn;
const as = (role: string | null, id = "carlos", name = "Carlos Gomory") => session.mockResolvedValue(role ? { user: { id, role, name, email: `${id}@example.com` } } : null);
const req = (method: string, body?: unknown) => new NextRequest("http://localhost/api/quality", { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const tick = (ms = 60_000) => vi.setSystemTime(new Date(Date.now() + ms));
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (r: Promise<Response>): Promise<[number, Json]> => { const res = await r; return [res.status, await res.json()]; };
const ctx = (id: string) => ({ params: { id } });
const inc = (id: string) => mem.state.incidents.find((r) => r.id === id)!;
const capaRow = (id: string) => mem.state.capas.find((r) => r.id === id)!;
const eventsOf = (id: string) => mem.state.events.filter((e) => e.recordId === id);
const stamp = (id: string) => (inc(id) ?? capaRow(id)).updatedAt.toISOString();

const NEW = { dateReceived: "2026-11-20", channel: "email", description: "Customer found a piece of plastic in a loaf." };
async function newIncident(over: Json = {}) { const [, b] = await call(NEW_I(req("POST", { ...NEW, ...over }))); return b as { id: string; reference: string }; }
async function newCapa(over: Json = {}) { const [, b] = await call(NEW_C(req("POST", { source: "audit_finding", problem: "Sanitizer log incomplete.", ...over }))); return b as { id: string; reference: string }; }
const saveI = (id: string, body: Json) => call(SAVE_I(req("PATCH", { expectedUpdatedAt: stamp(id), ...body }), ctx(id)));
const saveC = (id: string, body: Json) => call(SAVE_C(req("PATCH", { expectedUpdatedAt: stamp(id), ...body }), ctx(id)));
const actI = (id: string, body: Json) => call(ACT_I(req("POST", body), ctx(id)));
const actC = (id: string, body: Json) => call(ACT_C(req("POST", body), ctx(id)));
const READY_CAPA = { rootCause: "No second check at packing.", correctiveAction: "Recalled the lot.", preventiveAction: "Added a metal and visual check.", ownerId: "chris", dueDate: "2026-12-15", effectivenessDate: "2026-12-20", effectivenessResult: "No repeat in four weeks." };

beforeEach(() => {
  vi.clearAllMocks();
  at("2026-11-21T18:00:00Z"); // 10:00 AM Pacific, November 21, 2026
  mem.state = mem.fresh(); mem.failEvents = false; mem.failEventOnAction = null;
  resetDb(); seed("facility", [{ id: "fac-jb", name: "Julian Bakery" }]);
  as("ADMIN");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("permission: one check, canUseQuality, on every route", () => {
  const routes: [string, () => Promise<Response>][] = [
    ["GET incidents", () => LIST_I()], ["POST incidents", () => NEW_I(req("POST", NEW))],
    ["GET incident", () => GET_I(req("GET"), ctx("x"))], ["PATCH incident", () => SAVE_I(req("PATCH", {}), ctx("x"))],
    ["POST incident status", () => ACT_I(req("POST", { action: "void", reason: "test" }), ctx("x"))],
    ["POST incident capa", () => OPEN_CAPA(req("POST"), ctx("x"))], ["DELETE incident capa", () => UNLINK_I(req("DELETE", { reason: "test" }), ctx("x"))],
    ["GET capas", () => LIST_C()], ["POST capas", () => NEW_C(req("POST", { source: "other", problem: "x" }))],
    ["GET capa", () => GET_C(req("GET"), ctx("x"))], ["PATCH capa", () => SAVE_C(req("PATCH", {}), ctx("x"))],
    ["POST capa status", () => ACT_C(req("POST", { action: "void", reason: "test" }), ctx("x"))],
    ["POST capa incidents", () => LINK(req("POST", { incidentId: "x" }), ctx("x"))], ["DELETE capa incidents", () => UNLINK_C(req("DELETE", { incidentId: "x", reason: "test" }), ctx("x"))],
    ["GET options", () => OPTIONS()],
  ];
  it.each(routes)("%s: 401 without a session, 403 for a supervisor, and nothing is written", async (_name, run) => {
    as(null);
    expect((await run()).status).toBe(401);
    as("SUPERVISOR", "hugo", "Hugo Ayala");
    const res = await run();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden — admins only");
    expect(mem.state).toEqual(mem.fresh());
  });
  it("an admin is let in (the same routes answer something other than 401 or 403)", async () => {
    for (const [name, run] of routes) expect([401, 403], name).not.toContain((await run()).status);
  });
  it("every route file under /api/quality goes through qualityRoute, and none of them touches the history table directly", () => {
    const dir = resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "__tests__") walk(p); } else if (f === "route.ts") files.push(p); } };
    walk(dir);
    expect(files).toHaveLength(14); // 9 from phase 1, plus attachments (3) and reviews (2)
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // every handler goes through qualityRoute; the two that answer with something other than JSON (the upload token, the file itself) call the same check directly
      const direct = (src.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? []).length;
      expect(src.split("export const ").length - 1, f).toBe((src.match(/qualityRoute\(/g) ?? []).length + 1); // every other handler (plus `dynamic`)
      if (direct) expect((src.match(/await requireQuality\(\)/g) ?? []).length, f).toBe(direct);
      expect(direct + (src.match(/qualityRoute\(/g) ?? []).length, f).toBeGreaterThan(0);
      expect(src, f).not.toContain("qualityEvent");
    }
    expect(files.some((f) => /events/.test(f))).toBe(false); // no route for events at all
    const server = readFileSync(resolve(__dirname, "../../../../lib/quality-server.ts"), "utf8");
    expect(server.match(/qualityEvent\.\w+/g)).toEqual(["qualityEvent.create", "qualityEvent.findMany"]);
  });
});

describe("reference numbers", () => {
  it("CI-YYYY-NNN and CAPA-YYYY-NNN, each with its own sequence, padded to three digits", async () => {
    expect((await newIncident()).reference).toBe("CI-2026-001");
    expect((await newIncident()).reference).toBe("CI-2026-002");
    expect((await newCapa()).reference).toBe("CAPA-2026-001");
    expect((await newIncident()).reference).toBe("CI-2026-003");
    mem.state.counters["CI-2026"] = 999;
    expect((await newIncident()).reference).toBe("CI-2026-1000"); // grows past 999
  });

  it("two creates at once get consecutive numbers, never the same one", async () => {
    const made = await Promise.all([newIncident(), newIncident(), newIncident(), newCapa(), newCapa()]);
    expect(made.map((m) => m.reference).sort()).toEqual(["CAPA-2026-001", "CAPA-2026-002", "CI-2026-001", "CI-2026-002", "CI-2026-003"]);
    expect(new Set(mem.state.incidents.map((r) => r.reference)).size).toBe(3);
  });

  it("a number is never reused after a void", async () => {
    const first = await newIncident();
    await actI(first.id, { action: "void", reason: "Entered twice by mistake" });
    expect((await newIncident()).reference).toBe("CI-2026-002");
    expect(inc(first.id)).toMatchObject({ reference: "CI-2026-001", status: "void" }); // still there, still its number
  });

  it("a failed create leaves no gap: the number goes back with the rolled-back transaction", async () => {
    await newIncident();
    mem.failEvents = true;
    expect((await NEW_I(req("POST", NEW))).status).toBe(500);
    mem.failEvents = false;
    expect(mem.state.incidents).toHaveLength(1);
    expect(mem.state.counters["CI-2026"]).toBe(1);
    expect((await newIncident()).reference).toBe("CI-2026-002");
    // a create refused for missing fields never takes a number either
    expect((await NEW_I(req("POST", { channel: "email" }))).status).toBe(422);
    expect((await newIncident()).reference).toBe("CI-2026-003");
  });

  it("the year is the Pacific year of the creation date: 11:30 PM on December 31 is still the old year", async () => {
    at("2027-01-01T07:30:00Z"); // Dec 31, 2026, 11:30 PM Pacific — already January 1 in UTC
    expect((await newIncident()).reference).toBe("CI-2026-001");
    expect((await newCapa()).reference).toBe("CAPA-2026-001");
    at("2027-01-01T08:30:00Z"); // Jan 1, 2027, 12:30 AM Pacific
    expect((await newIncident()).reference).toBe("CI-2027-001"); // a new year starts again at 001
    expect((await newCapa()).reference).toBe("CAPA-2027-001");
    // the date received does not decide the year
    expect((await newIncident({ dateReceived: "2026-12-30" })).reference).toBe("CI-2027-002");
  });
});

describe("history: every write and its event in one transaction", () => {
  it("creating writes the record and a 'created' event with who, when and the starting values", async () => {
    const { id, reference } = await newIncident({ facility: "624" });
    expect(eventsOf(id)).toHaveLength(1);
    expect(eventsOf(id)[0]).toMatchObject({ recordType: "incident", reference, action: "created", userId: "carlos", userName: "Carlos Gomory" });
    expect(eventsOf(id)[0].changes).toEqual([
      { field: "facility", from: null, to: "624" }, { field: "dateReceived", from: null, to: "2026-11-20" },
      { field: "channel", from: null, to: "email" }, { field: "description", from: null, to: NEW.description },
    ]);
    expect(eventsOf(id)[0].createdAt.toISOString().slice(0, 16)).toBe("2026-11-21T18:00");
  });

  it("an update records exactly the fields that changed, from what to what; saving the same values writes nothing", async () => {
    const { id } = await newIncident();
    const [status, body] = await saveI(id, { customer: "Whole Foods #12", category: "foreign_matter", lotCode: "L1120", description: NEW.description });
    expect([status, body.changed]).toEqual([200, 3]);
    expect(eventsOf(id).at(-1)).toMatchObject({ action: "updated", changes: [
      { field: "customer", from: null, to: "Whole Foods #12" }, { field: "lotCode", from: null, to: "L1120" }, { field: "category", from: null, to: "foreign_matter" },
    ] });
    const before = mem.state.events.length;
    const [again, same] = await saveI(id, { customer: "Whole Foods #12", lotCode: " L1120 " });
    expect([again, same.changed]).toEqual([200, 0]);
    expect(mem.state.events).toHaveLength(before);
  });

  it("if the history row cannot be written, the change itself is rolled back", async () => {
    const { id } = await newIncident();
    const before = structuredClone(inc(id));
    mem.failEvents = true;
    expect((await saveI(id, { customer: "Whole Foods #12" }))[0]).toBe(500);
    expect((await actI(id, { action: "void", reason: "Entered by mistake" }))[0]).toBe(500);
    expect((await call(OPEN_CAPA(req("POST"), ctx(id))))[0]).toBe(500);
    mem.failEvents = false;
    expect(inc(id)).toEqual(before); // untouched
    expect(mem.state.capas).toHaveLength(0);
    expect(mem.state.links).toHaveLength(0);
    expect(mem.state.counters["CAPA-2026"]).toBeUndefined(); // the CAPA number was not used up
    expect(eventsOf(id)).toHaveLength(1);
  });

  it("a failure half-way through 'Open CAPA' undoes all of it: the CAPA, its event, the link and the decision", async () => {
    const { id } = await newIncident();
    mem.failEventOnAction = "linked"; // the CAPA and its 'created' event are already written when this fails
    expect((await call(OPEN_CAPA(req("POST"), ctx(id))))[0]).toBe(500);
    expect(mem.state.capas).toHaveLength(0);
    expect(mem.state.links).toHaveLength(0);
    expect(mem.state.events).toHaveLength(1);
    expect(inc(id).capaRequired).toBeNull();
  });

  it("the record page gets the history newest first, with the actor's name", async () => {
    const { id } = await newIncident();
    tick(); await saveI(id, { category: "foreign_matter" });
    tick(); as("ADMIN", "chris", "Chris Pence"); await actI(id, { action: "move", to: "under_review" });
    const [, body] = await call(GET_I(req("GET"), ctx(id)));
    expect(body.events.map((e: Json) => [e.action, e.userName])).toEqual([["status_changed", "Chris Pence"], ["updated", "Carlos Gomory"], ["created", "Carlos Gomory"]]);
    expect(body.events[0].changes).toEqual([{ field: "status", from: "open", to: "under_review" }]);
  });
});

describe("customer incident", () => {
  it("needs the date received, how it came in and what happened to be created; everything else can come later", async () => {
    const [status, body] = await call(NEW_I(req("POST", { customer: "Whole Foods" })));
    expect(status).toBe(422);
    expect(body.problems).toEqual([
      { field: "dateReceived", message: "Date received: enter the date." },
      { field: "channel", message: "How it came in: choose Email, Phone, Retailer or Other." },
      { field: "description", message: "What happened: describe the incident." },
    ]);
    expect(mem.state.incidents).toHaveLength(0);
    const [ok, made] = await call(NEW_I(req("POST", NEW)));
    expect([ok, made.reference]).toEqual([201, "CI-2026-001"]);
    expect(inc(made.id)).toMatchObject({ status: "open", facility: null, capaRequired: null, createdById: "carlos" });
  });

  it("refuses values that are not on the lists, with the field named", async () => {
    const [status, body] = await call(NEW_I(req("POST", { ...NEW, channel: "fax", category: "smell", dateReceived: "2026-02-30", facility: "Warehouse", productId: "nope" })));
    expect(status).toBe(422);
    expect(body.problems.map((p: Json) => p.message)).toEqual([
      "Facility: choose Company-wide, Julian Bakery or 624.", "Date received: enter a valid date.", "How it came in: choose one from the list.",
      "Category: choose one from the list.", "Date received: enter the date.", "How it came in: choose Email, Phone, Retailer or Other.", "Product: that product is not in the list.",
    ]);
  });

  it("a product picked from the list stores its name too; a typed product needs no pick", async () => {
    const a = await newIncident({ productId: "prod-1" });
    expect(inc(a.id)).toMatchObject({ productId: "prod-1", productName: "Keto Bread" });
    const b = await newIncident({ productName: "Sample pack (not sold)" });
    expect(inc(b.id)).toMatchObject({ productId: null, productName: "Sample pack (not sold)" });
  });

  it("is saved as you go, and a save over someone else's change is refused with 409", async () => {
    const { id } = await newIncident();
    const stale = stamp(id);
    expect((await saveI(id, { customer: "Whole Foods #12" }))[0]).toBe(200);
    const [status, body] = await call(SAVE_I(req("PATCH", { expectedUpdatedAt: stale, customer: "Sprouts" }), ctx(id)));
    expect([status, body.code]).toEqual([409, "conflict"]);
    expect(inc(id).customer).toBe("Whole Foods #12");
    expect((await call(SAVE_I(req("PATCH", { customer: "x" }), ctx(id))))[0]).toBe(400); // the check is not optional
    expect((await call(ACT_I(req("POST", { action: "move", to: "under_review", expectedUpdatedAt: stale }), ctx(id))))[0]).toBe(409);
    expect(eventsOf(id)).toHaveLength(2);
  });

  it("the three starting fields cannot be emptied later", async () => {
    const { id } = await newIncident();
    const [status, body] = await saveI(id, { description: "  ", channel: "", dateReceived: null });
    expect(status).toBe(422);
    expect(body.problems.map((p: Json) => p.field).sort()).toEqual(["channel", "dateReceived", "description"]);
  });

  it("moves between Open and Under review", async () => {
    const { id } = await newIncident();
    expect((await actI(id, { action: "move", to: "under_review" }))[1].status).toBe("under_review");
    expect((await actI(id, { action: "move", to: "open" }))[1].status).toBe("open");
    expect((await actI(id, { action: "move", to: "open" }))[0]).toBe(409);
    expect((await actI(id, { action: "move", to: "closed" }))[0]).toBe(409); // closing is its own action
    expect((await actI(id, { action: "dance" }))[0]).toBe(400);
    expect((await actI("nope", { action: "move", to: "open" }))[0]).toBe(404);
  });
});

describe("closing an incident", () => {
  it("lists what is missing, by field, in plain words", async () => {
    const { id } = await newIncident();
    const [status, body] = await actI(id, { action: "close", closedDate: "2026-11-21" });
    expect(status).toBe(422);
    expect(body.problems).toEqual([
      { field: "category", message: "Category: choose one." },
      { field: "responseDate", message: "Response to the customer: enter the date of the response." },
      { field: "capaRequired", message: 'CAPA decision: open or link a CAPA, or choose "No CAPA needed" and give the reason.' },
    ]);
    expect(inc(id).status).toBe("open");
    expect(eventsOf(id)).toHaveLength(1);
  });

  it("a food safety concern also needs its immediate action, and cannot close without the CAPA decision", async () => {
    const { id } = await newIncident();
    await saveI(id, { category: "illness_health", responseDate: "2026-11-21", foodSafetyConcern: true });
    const [status, body] = await actI(id, { action: "close", closedDate: "2026-11-21" });
    expect(status).toBe(422);
    expect(body.problems).toEqual([
      { field: "immediateAction", message: "Immediate action taken: required because this is a food safety concern." },
      { field: "capaRequired", message: 'CAPA decision: open or link a CAPA, or choose "No CAPA needed" and give the reason. A food safety concern cannot be closed without this decision.' },
    ]);
    await saveI(id, { immediateAction: "Pulled the lot from the shelf." });
    expect((await actI(id, { action: "close", closedDate: "2026-11-21" }))[1].problems.map((p: Json) => p.field)).toEqual(["capaRequired"]);
  });

  it("decision 'no CAPA needed' needs its reason; with it the incident closes and records who and when", async () => {
    const { id } = await newIncident();
    await saveI(id, { category: "shipping_delivery", responseDate: "2026-11-21", capaRequired: false });
    expect((await actI(id, { action: "close", closedDate: "2026-11-21" }))[1].problems).toEqual([{ field: "capaRequired", message: "CAPA decision: give the reason no CAPA is needed." }]);
    await saveI(id, { noCapaReason: "Carrier damage, one box, credited." });
    expect((await actI(id, { action: "close", closedDate: "bad" }))[1].problems).toEqual([{ field: "closedDate", message: "Closed date: enter the date." }]);
    const [status, body] = await actI(id, { action: "close", closedDate: "2026-11-22" });
    expect([status, body.status]).toEqual([200, "closed"]);
    expect(inc(id)).toMatchObject({ status: "closed", closedById: "carlos" });
    expect((inc(id).closedDate as Date).toISOString().slice(0, 10)).toBe("2026-11-22");
    expect(eventsOf(id).at(-1)).toMatchObject({ action: "closed", changes: [{ field: "status", from: "open", to: "closed" }, { field: "closedDate", from: null, to: "2026-11-22" }] });
  });

  it("decision 'a CAPA is linked' also closes it — but 'CAPA needed: yes' cannot be set by hand", async () => {
    const { id } = await newIncident();
    const [status, body] = await saveI(id, { capaRequired: true });
    expect(status).toBe(422);
    expect(body.problems[0].message).toBe('CAPA decision: use "Open CAPA" (or link one from the CAPA page) instead.');
    await saveI(id, { category: "foreign_matter", responseDate: "2026-11-21" });
    await call(OPEN_CAPA(req("POST"), ctx(id)));
    expect((await actI(id, { action: "close", closedDate: "2026-11-21" }))[0]).toBe(200);
  });

  it("closed is read-only: no edits, no moves, no Open CAPA, no unlinking, until it is reopened with a reason", async () => {
    const { id } = await newIncident();
    await saveI(id, { category: "order_error", responseDate: "2026-11-21", capaRequired: false, noCapaReason: "Wrong SKU shipped once; reshipped." });
    await actI(id, { action: "close", closedDate: "2026-11-21" });
    const [status, body] = await saveI(id, { customer: "Changed afterwards" });
    expect([status, body.code]).toEqual([409, "read_only"]);
    expect((await actI(id, { action: "move", to: "open" }))[0]).toBe(409);
    expect((await call(OPEN_CAPA(req("POST"), ctx(id))))[0]).toBe(409);
    expect((await actI(id, { action: "close" }))[0]).toBe(409);
    expect(inc(id).customer).toBe("");

    expect((await actI(id, { action: "reopen" }))[1].problems).toEqual([{ field: "reason", message: "Reason: say why you are reopening this incident." }]);
    expect((await actI(id, { action: "reopen", reason: " x " }))[0]).toBe(422);
    const [ok, reopened] = await actI(id, { action: "reopen", reason: "Customer wrote again with photos." });
    expect([ok, reopened.status]).toEqual([200, "under_review"]);
    expect(inc(id)).toMatchObject({ status: "under_review", closedDate: null, closedById: null });
    expect(eventsOf(id).at(-1)).toMatchObject({ action: "reopened", note: "Customer wrote again with photos.", changes: [{ field: "status", from: "closed", to: "under_review" }, { field: "closedDate", from: "2026-11-21", to: null }] });
    expect((await saveI(id, { customer: "Editable again" }))[0]).toBe(200);
  });
});

describe("void: never deleted, a reason is required, the record stays visible", () => {
  it("an incident is voided with a reason, stays in the list marked void, is read-only, and can be reopened with a reason", async () => {
    const { id } = await newIncident();
    expect((await actI(id, { action: "void" }))[0]).toBe(422);
    expect((await actI(id, { action: "void", reason: "" }))[1].problems).toEqual([{ field: "reason", message: "Reason: say why you are voiding this incident." }]);
    const [status] = await actI(id, { action: "void", reason: "Duplicate of CI-2026-000." });
    expect(status).toBe(200);
    expect(inc(id)).toMatchObject({ status: "void", voidReason: "Duplicate of CI-2026-000.", voidedById: "carlos" });
    expect(mem.state.incidents).toHaveLength(1); // still there
    expect((await call(LIST_I()))[1].map((r: Json) => [r.reference, r.status])).toEqual([["CI-2026-001", "void"]]);
    expect(eventsOf(id).at(-1)).toMatchObject({ action: "voided", note: "Duplicate of CI-2026-000.", changes: [{ field: "status", from: "open", to: "void" }, { field: "voidReason", from: null, to: "Duplicate of CI-2026-000." }] });
    expect((await saveI(id, { customer: "x" }))[1].code).toBe("read_only");
    expect((await actI(id, { action: "void", reason: "again" }))[0]).toBe(409);
    expect((await actI(id, { action: "reopen", reason: "Not a duplicate after all." }))[1].status).toBe("open");
    expect(inc(id)).toMatchObject({ voidReason: null, voidedAt: null });
  });

  it("a CAPA is voided and reopened the same way", async () => {
    const { id } = await newCapa();
    expect((await actC(id, { action: "void" }))[1].problems[0].message).toBe("Reason: say why you are voiding this CAPA.");
    expect((await actC(id, { action: "void", reason: "Opened against the wrong audit." }))[0]).toBe(200);
    expect(capaRow(id)).toMatchObject({ status: "void", voidReason: "Opened against the wrong audit." });
    expect((await saveC(id, { rootCause: "x" }))[1].code).toBe("read_only");
    expect((await actC(id, { action: "reopen", reason: "It was the right audit." }))[1].status).toBe("open");
    expect(mem.state.capas).toHaveLength(1);
  });
});

describe("CAPA", () => {
  it("needs a source and the problem to be created; the owner must be an active admin", async () => {
    const [status, body] = await call(NEW_C(req("POST", {})));
    expect(status).toBe(422);
    expect(body.problems).toEqual([{ field: "source", message: "Source: choose one from the list." }, { field: "problem", message: "The problem: describe it." }]);
    const { id } = await newCapa();
    expect(capaRow(id)).toMatchObject({ reference: "CAPA-2026-001", source: "audit_finding", status: "open" });
    for (const ownerId of ["hugo", "gone", "nobody"]) expect((await saveC(id, { ownerId }))[1].problems).toEqual([{ field: "ownerId", message: "Owner: choose an active admin user." }]);
    expect((await saveC(id, { ownerId: "chris", dueDate: "2026-12-15" }))[0]).toBe(200);
    expect(eventsOf(id).at(-1)!.changes).toEqual([{ field: "ownerId", from: null, to: "chris" }, { field: "dueDate", from: null, to: "2026-12-15" }]);
  });

  it("moves one step at a time; a step back needs a reason, which is kept in the history", async () => {
    const { id } = await newCapa();
    expect((await actC(id, { action: "move", to: "verifying" }))[1].error).toBe("A CAPA moves one step at a time: from Open it cannot go straight to Verifying effectiveness.");
    expect((await actC(id, { action: "move", to: "in_progress" }))[1].status).toBe("in_progress");
    expect((await actC(id, { action: "move", to: "verifying" }))[1].status).toBe("verifying");
    expect((await actC(id, { action: "move", to: "closed" }))[0]).toBe(409); // closing is its own action
    const [status, body] = await actC(id, { action: "move", to: "in_progress" });
    expect(status).toBe(422);
    expect(body.problems).toEqual([{ field: "reason", message: "Reason: say why you are moving this CAPA back to Action in progress." }]);
    expect(capaRow(id).status).toBe("verifying");
    expect((await actC(id, { action: "move", to: "in_progress", reason: "The fix did not hold; more work needed." }))[0]).toBe(200);
    expect(eventsOf(id).at(-1)).toMatchObject({ action: "status_changed", note: "The fix did not hold; more work needed.", changes: [{ field: "status", from: "verifying", to: "in_progress" }] });
    expect(eventsOf(id).filter((e) => e.action === "status_changed").map((e) => e.note)).toEqual([null, null, "The fix did not hold; more work needed."]); // forward steps need none
  });

  it("is closed only from Verifying effectiveness, and only with everything filled in", async () => {
    const { id } = await newCapa();
    expect((await actC(id, { action: "close" }))[1].error).toBe("A CAPA is closed from Verifying effectiveness. Move it there first.");
    await actC(id, { action: "move", to: "in_progress" }); await actC(id, { action: "move", to: "verifying" });
    const [status, body] = await actC(id, { action: "close" });
    expect(status).toBe(422);
    expect(body.problems).toEqual([
      { field: "rootCause", message: "Root cause: describe it." }, { field: "correctiveAction", message: "Corrective action: describe it." },
      { field: "preventiveAction", message: "Preventive action: describe it." }, { field: "ownerId", message: "Owner: choose who is responsible." },
      { field: "dueDate", message: "Due date: enter the date." }, { field: "effectivenessDate", message: "Effectiveness check: enter the date of the check." },
      { field: "effectivenessResult", message: "Effectiveness check: enter the result." },
    ]);
    await saveC(id, { ...READY_CAPA, effectivenessResult: "" });
    expect((await actC(id, { action: "close" }))[1].problems.map((p: Json) => p.field)).toEqual(["effectivenessResult"]);
    expect(capaRow(id).status).toBe("verifying");
  });

  it("closing records the closing admin's name and the Pacific date automatically", async () => {
    const { id } = await newCapa();
    await saveC(id, READY_CAPA);
    await actC(id, { action: "move", to: "in_progress" }); await actC(id, { action: "move", to: "verifying" });
    at("2026-12-22T07:30:00Z"); // December 21, 11:30 PM Pacific
    as("ADMIN", "chris", "Chris Pence");
    const [status, body] = await actC(id, { action: "close", closedDate: "2020-01-01", closedByName: "Someone Else" });
    expect([status, body.status]).toEqual([200, "closed"]);
    expect(capaRow(id)).toMatchObject({ status: "closed", closedById: "chris", closedByName: "Chris Pence" });
    expect((capaRow(id).closedDate as Date).toISOString().slice(0, 10)).toBe("2026-12-21"); // not what the request said, and not the UTC date
    expect(eventsOf(id).at(-1)).toMatchObject({ action: "closed", userName: "Chris Pence", changes: [
      { field: "status", from: "verifying", to: "closed" }, { field: "closedDate", from: null, to: "2026-12-21" }, { field: "closedByName", from: null, to: "Chris Pence" },
    ] });
    expect((await saveC(id, { rootCause: "Changed afterwards" }))[1].code).toBe("read_only");
    expect((await actC(id, { action: "reopen", reason: "Complaint repeated in January." }))[1].status).toBe("verifying");
    expect(capaRow(id)).toMatchObject({ closedById: null, closedByName: null, closedDate: null });
  });

  it("409 on a stale save", async () => {
    const { id } = await newCapa();
    const stale = stamp(id);
    await saveC(id, { rootCause: "First" });
    expect((await call(SAVE_C(req("PATCH", { expectedUpdatedAt: stale, rootCause: "Second" }), ctx(id))))[1].code).toBe("conflict");
    expect(capaRow(id).rootCause).toBe("First");
  });
});

describe("the link between incidents and CAPAs", () => {
  it("'Open CAPA' creates a CAPA from the incident, links them, sets the decision, and writes one event on each record", async () => {
    const { id } = await newIncident({ facility: "624" });
    await saveI(id, { capaRequired: false, noCapaReason: "Thought it was a one-off." });
    const eventsBefore = mem.state.events.length;
    const [status, body] = await call(OPEN_CAPA(req("POST"), ctx(id)));
    expect(status).toBe(201);
    expect(body.capa.reference).toBe("CAPA-2026-001");
    const capa = capaRow(body.capa.id);
    expect(capa).toMatchObject({ source: "customer_incident", problem: NEW.description, facility: "624", status: "open", createdById: "carlos" });
    expect(mem.state.links).toEqual([{ incidentId: id, capaId: capa.id, linkedById: "carlos" }]);
    expect(inc(id)).toMatchObject({ capaRequired: true, noCapaReason: "" });
    // exactly two events: one on the CAPA, one on the incident
    expect(mem.state.events).toHaveLength(eventsBefore + 2);
    expect(eventsOf(capa.id)).toHaveLength(1);
    expect(eventsOf(capa.id)[0]).toMatchObject({ action: "created", note: "Opened from CI-2026-001", reference: "CAPA-2026-001" });
    expect(eventsOf(id).at(-1)).toMatchObject({ action: "linked", changes: [
      { field: "linkedCapa", from: null, to: "CAPA-2026-001" }, { field: "capaRequired", from: false, to: true }, { field: "noCapaReason", from: "Thought it was a one-off.", to: null },
    ] });
    // both pages show the link
    expect((await call(GET_I(req("GET"), ctx(id))))[1].capa).toMatchObject({ reference: "CAPA-2026-001", status: "open" });
    expect((await call(GET_C(req("GET"), ctx(capa.id))))[1].incidents.map((i: Json) => i.reference)).toEqual(["CI-2026-001"]);
  });

  it("an incident that already has a CAPA gets no second one: the answer points to the existing CAPA", async () => {
    const { id } = await newIncident();
    const [, first] = await call(OPEN_CAPA(req("POST"), ctx(id)));
    const [status, body] = await call(OPEN_CAPA(req("POST"), ctx(id)));
    expect([status, body.code]).toEqual([409, "already_linked"]);
    expect(body.capa).toEqual({ id: first.capa.id, reference: "CAPA-2026-001" });
    expect(mem.state.capas).toHaveLength(1);
    expect(mem.state.counters["CAPA-2026"]).toBe(1);
    // with a CAPA linked, the decision cannot be changed by hand
    expect((await saveI(id, { capaRequired: false }))[1].problems[0].message).toBe("CAPA decision: a CAPA is linked. Unlink it first to change the decision.");
  });

  it("one CAPA can cover several incidents, linked from the CAPA page; an incident can have only one CAPA", async () => {
    const [a, b, c] = [await newIncident(), await newIncident({ description: "Second report, same lot." }), await newIncident({ description: "Third report." })];
    const [, opened] = await call(OPEN_CAPA(req("POST"), ctx(a.id)));
    const capaId = opened.capa.id;
    // the CAPA page offers the open incidents that have no CAPA yet
    expect((await call(GET_C(req("GET"), ctx(capaId))))[1].linkable.map((i: Json) => i.reference)).toEqual(["CI-2026-003", "CI-2026-002"]);
    expect((await call(LINK(req("POST", { incidentId: b.id }), ctx(capaId))))[0]).toBe(201);
    expect((await call(LINK(req("POST", { incidentId: c.id }), ctx(capaId))))[0]).toBe(201);
    expect((await call(GET_C(req("GET"), ctx(capaId))))[1].incidents.map((i: Json) => i.reference)).toEqual(["CI-2026-001", "CI-2026-002", "CI-2026-003"]);
    expect(inc(b.id).capaRequired).toBe(true);
    expect(eventsOf(b.id).at(-1)).toMatchObject({ action: "linked", changes: [{ field: "linkedCapa", from: null, to: "CAPA-2026-001" }, { field: "capaRequired", from: null, to: true }] });
    expect(eventsOf(capaId).filter((e) => e.action === "linked").map((e) => e.changes)).toEqual([[{ field: "linkedIncident", from: null, to: "CI-2026-002" }], [{ field: "linkedIncident", from: null, to: "CI-2026-003" }]]);
    expect((await call(LIST_C()))[1][0].incidentReferences).toEqual(["CI-2026-001", "CI-2026-002", "CI-2026-003"]);

    const other = await newCapa();
    expect((await call(LINK(req("POST", { incidentId: b.id }), ctx(other.id))))[1].error).toBe("CI-2026-002 already has another CAPA. An incident can have only one.");
    expect((await call(LINK(req("POST", { incidentId: b.id }), ctx(capaId))))[1].error).toBe("CI-2026-002 is already linked to this CAPA.");
    expect((await call(LINK(req("POST", {}), ctx(capaId))))[0]).toBe(400);
    expect((await call(LINK(req("POST", { incidentId: "nope" }), ctx(capaId))))[0]).toBe(404);
    expect(mem.state.links).toHaveLength(3);
  });

  it("unlinking is explicit, needs a reason, clears the decision, and is recorded on both records — from either page", async () => {
    const [a, b] = [await newIncident(), await newIncident()];
    const [, opened] = await call(OPEN_CAPA(req("POST"), ctx(a.id)));
    const capaId = opened.capa.id;
    await call(LINK(req("POST", { incidentId: b.id }), ctx(capaId)));

    expect((await call(UNLINK_I(req("DELETE", {}), ctx(a.id))))[1].problems).toEqual([{ field: "reason", message: "Reason: say why you are unlinking these records." }]);
    expect(mem.state.links).toHaveLength(2);
    const [status, body] = await call(UNLINK_I(req("DELETE", { reason: "This one was a different lot." }), ctx(a.id)));
    expect([status, body]).toEqual([200, { unlinked: "CI-2026-001", from: "CAPA-2026-001" }]);
    expect(mem.state.links.map((l) => l.incidentId)).toEqual([b.id]);
    expect(inc(a.id).capaRequired).toBeNull(); // the decision is open again
    expect(eventsOf(a.id).at(-1)).toMatchObject({ action: "unlinked", note: "This one was a different lot.", changes: [{ field: "linkedCapa", from: "CAPA-2026-001", to: null }, { field: "capaRequired", from: true, to: null }] });
    expect(eventsOf(capaId).at(-1)).toMatchObject({ action: "unlinked", note: "This one was a different lot.", changes: [{ field: "linkedIncident", from: "CI-2026-001", to: null }] });
    expect(mem.state.capas).toHaveLength(1); // the CAPA itself is kept

    // from the CAPA page
    expect((await call(UNLINK_C(req("DELETE", { incidentId: b.id }), ctx(capaId))))[0]).toBe(422);
    expect((await call(UNLINK_C(req("DELETE", { incidentId: a.id, reason: "Not linked any more" }), ctx(capaId))))[1].error).toBe("That incident is not linked to this CAPA.");
    expect((await call(UNLINK_C(req("DELETE", { incidentId: b.id, reason: "Linked by mistake." }), ctx(capaId))))[0]).toBe(200);
    expect(mem.state.links).toHaveLength(0);
    expect((await call(UNLINK_I(req("DELETE", { reason: "Nothing to unlink" }), ctx(a.id))))[1].error).toBe("This incident has no linked CAPA.");
  });

  it("nothing can be linked to or unlinked from a closed or void record", async () => {
    const [a, b] = [await newIncident(), await newIncident()];
    const [, opened] = await call(OPEN_CAPA(req("POST"), ctx(a.id)));
    await actC(opened.capa.id, { action: "void", reason: "Raised in error." });
    expect((await call(LINK(req("POST", { incidentId: b.id }), ctx(opened.capa.id))))[1].code).toBe("read_only");
    expect((await call(UNLINK_I(req("DELETE", { reason: "Trying anyway" }), ctx(a.id))))[1].code).toBe("read_only");
    expect(mem.state.links).toHaveLength(1); // a void keeps its links
  });
});

describe("lists and options", () => {
  it("each list returns what its columns need, newest first, with who last changed the record", async () => {
    const a = await newIncident({ dateReceived: "2026-11-10", productId: "prod-2" });
    const b = await newIncident({ dateReceived: "2026-11-20" });
    as("ADMIN", "chris", "Chris Pence");
    await saveI(a.id, { category: "foreign_matter", foodSafetyConcern: true });
    const [, opened] = await call(OPEN_CAPA(req("POST"), ctx(a.id)));
    await saveC(opened.capa.id, { ownerId: "carlos", dueDate: "2026-11-15" });
    const [, incidents] = await call(LIST_I());
    expect(incidents.map((r: Json) => r.reference)).toEqual(["CI-2026-002", "CI-2026-001"]);
    expect(incidents[1]).toMatchObject({ dateReceived: "2026-11-10", category: "foreign_matter", productName: "Paleo Wraps", foodSafetyConcern: true, status: "open", updatedByName: "Chris Pence", capaReference: "CAPA-2026-001" });
    expect(incidents[0]).toMatchObject({ id: b.id, updatedByName: "Carlos Gomory", capaReference: null });
    const [, capas] = await call(LIST_C());
    expect(capas[0]).toMatchObject({ reference: "CAPA-2026-001", source: "customer_incident", status: "open", ownerId: "carlos", ownerName: "Carlos Gomory", dueDate: "2026-11-15", updatedByName: "Chris Pence", incidentReferences: ["CI-2026-001"] });
  });

  it("options: active products, active admins as possible owners, and today's Pacific date", async () => {
    at("2026-11-22T07:30:00Z"); // still November 21 in California
    const [, body] = await call(OPTIONS());
    expect(body.products.map((p: Json) => p.name)).toEqual(["Keto Bread", "Paleo Wraps"]);
    expect(body.admins.map((u: Json) => u.name)).toEqual(["Carlos Gomory", "Chris Pence"]); // no supervisor, no inactive admin
    expect(body.today).toBe("2026-11-21");
  });
});
