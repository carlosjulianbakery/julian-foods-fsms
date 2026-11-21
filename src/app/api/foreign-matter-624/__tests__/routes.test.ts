import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── In-memory database. Task completion and reopening run their REAL code against it. ──
const mem = vi.hoisted(() => {
  type Item = { id: string; facility: string; section: string; areaName: string; name: string; expectedQuantity: number; sortOrder: number; retiredAt: Date | null };
  type Rec = Record<string, unknown> & { id: string; period: string; status: string; items: unknown[]; updatedAt: Date; initials: string; linkedInstanceId: string | null; periodStart: Date; periodEnd: Date };
  type Inst = {
    id: string; dueDate: Date; status: string; createdAt: Date; ownerUserId: string | null; completedBySubmissionId: string | null;
    completedLate?: boolean; daysLate?: number | null; doneById?: string | null;
    rule: { formKey: string; ownerId: string; facility: { name: string }; windowMode: string; windowDaysBefore: number | null; recurrenceUnit: string | null };
  };
  const state = { items: [] as Item[], records: [] as Rec[], instances: [] as Inst[], audits: [] as { instanceId: string; action: string; note: string }[], version: 1, seq: 0 };
  return { state };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => {
  const { state } = mem;
  type Item = (typeof state.items)[number];
  type Inst = (typeof state.instances)[number];
  type InstWhere = { id?: string; completedBySubmissionId?: string; status?: { in: string[] }; dueDate?: { gte?: Date; lte?: Date }; rule?: { formKey?: string; facility?: { name?: string } } };
  const matches = (i: Inst, w: InstWhere) =>
    (!w.id || i.id === w.id) &&
    (w.completedBySubmissionId === undefined || i.completedBySubmissionId === w.completedBySubmissionId) &&
    (!w.status || w.status.in.includes(i.status)) &&
    (!w.dueDate?.gte || i.dueDate >= w.dueDate.gte) && (!w.dueDate?.lte || i.dueDate <= w.dueDate.lte) &&
    (!w.rule?.formKey || i.rule.formKey === w.rule.formKey) && (!w.rule?.facility?.name || i.rule.facility.name === w.rule.facility.name);
  const live = () => state.items.filter((e) => e.retiredAt === null);
  const prisma = {
    foreignMatterItem: {
      findMany: vi.fn(async () => [...live()].sort((x, y) => x.sortOrder - y.sortOrder)),
      findUnique: vi.fn(async (a: { where: { id: string } }) => state.items.find((e) => e.id === a.where.id) ?? null),
      create: vi.fn(async (a: { data: Partial<Item> }) => { const e = { id: `item-${++state.seq}`, facility: "624", expectedQuantity: 1, sortOrder: 0, retiredAt: null, ...a.data } as Item; state.items.push(e); return e; }),
      update: vi.fn(async (a: { where: { id: string }; data: Partial<Item> }) => Object.assign(state.items.find((e) => e.id === a.where.id)!, a.data)),
    },
    foreignMatterList: {
      findUnique: vi.fn(async () => ({ version: state.version })),
      upsert: vi.fn(async () => ({ version: ++state.version })),
    },
    foreignMatterRecord: {
      findUnique: vi.fn(async (a: { where: { id?: string; facility_period?: { period: string } } }) =>
        state.records.find((r) => (a.where.id ? r.id === a.where.id : r.period === a.where.facility_period!.period)) ?? null),
      findMany: vi.fn(async (a?: { where?: { status?: string; OR?: Array<{ linkedInstanceId?: { in: string[] }; periodEnd?: { in: Date[] } }> } }) =>
        state.records.filter((r) =>
          (!a?.where?.status || r.status === a.where.status) &&
          (!a?.where?.OR || a.where.OR.some((c) => (c.linkedInstanceId ? c.linkedInstanceId.in.includes(r.linkedInstanceId ?? "") : c.periodEnd!.in.some((d) => d.getTime() === r.periodEnd.getTime())))))),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        const r = { id: `rec-${++state.seq}`, initials: "", notes: null, okCount: 0, failCount: 0, conductedBy: "", submittedAt: null, updatedAt: new Date(), ...a.data } as unknown as (typeof state.records)[number];
        state.records.push(r); return r;
      }),
      updateMany: vi.fn(async (a: { where: { id: string; status: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        const r = state.records.find((x) => x.id === a.where.id && x.status === a.where.status && x.updatedAt.getTime() === a.where.updatedAt.getTime());
        if (!r) return { count: 0 };
        Object.assign(r, a.data); return { count: 1 };
      }),
      delete: vi.fn(async (a: { where: { id: string } }) => { state.records = state.records.filter((r) => r.id !== a.where.id); return {}; }),
    },
    ruleInstance: {
      findMany: vi.fn(async (a: { where: InstWhere }) => state.instances.filter((i) => matches(i, a.where)).sort((x, y) => x.dueDate.getTime() - y.dueDate.getTime())),
      findUnique: vi.fn(async (a: { where: { id: string } }) => state.instances.find((i) => i.id === a.where.id) ?? null),
      findFirst: vi.fn(async (a: { where: InstWhere }) => state.instances.find((i) => matches(i, a.where)) ?? null),
      update: vi.fn(async (a: { where: { id: string }; data: Partial<Inst> }) => Object.assign(state.instances.find((i) => i.id === a.where.id)!, a.data)),
    },
    taskInstanceAudit: { create: vi.fn(async (a: { data: { instanceId: string; action: string; note: string } }) => { state.audits.push(a.data); return a.data; }) },
    $transaction: vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  return { prisma };
});

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET as LIST, POST as OPEN } from "@/app/api/foreign-matter-624/route";
import { GET as READ, PATCH as SAVE, DELETE as REMOVE } from "@/app/api/foreign-matter-624/[id]/route";
import { POST as SUBMIT } from "@/app/api/foreign-matter-624/[id]/submit/route";
import { GET as ITEMS, POST as ADD } from "@/app/api/foreign-matter-624/items/route";
import { PATCH as EDIT } from "@/app/api/foreign-matter-624/items/[id]/route";
import { PATCH as AREA } from "@/app/api/foreign-matter-624/areas/route";
import { POST as MARK } from "@/app/api/task-instances/mark-in-progress/route";
import { fetchTaskProgress } from "@/lib/task-progress";
import { areasOf, markAllOk, quantityChangedSinceCheck, splitStored, type FmItem, type ItemSnapshot, type ItemValues } from "@/lib/foreign-matter-624";

type MockFn = ReturnType<typeof vi.fn>;
const session = getServerSession as unknown as MockFn;
const as = (role: string | null, id = "hugo") => session.mockResolvedValue(role ? { user: { id, role, name: "Hugo Ayala", email: "hugo@example.com" } } : null);
const req = (method: string, body?: unknown) => new NextRequest("http://localhost/api/foreign-matter-624", { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const tick = (ms = 1000) => vi.setSystemTime(new Date(Date.now() + ms));
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const find = (id: string) => mem.state.items.find((e) => e.id === id)!;
const inst = (id: string) => mem.state.instances.find((i) => i.id === id)!;
const layout = (items: FmItem[]) => areasOf(items).map((a) => `${a.section === "glass_brittle" ? "G" : "K"} ${a.name}: ${a.items.map((i) => `${i.name}×${i.expectedQuantity}`).join(", ")}`);

function seed() {
  const add = (id: string, section: string, areaName: string, name: string, sortOrder: number, expectedQuantity = 1) =>
    mem.state.items.push({ id, facility: "624", section, areaName, name, expectedQuantity, sortOrder, retiredAt: null });
  add("l1", "glass_brittle", "Production and Storage Area", "Shatter Proof Lamps", 10, 58);
  add("l2", "glass_brittle", "Production and Storage Area", "Clock", 20);
  add("f1", "glass_brittle", "Walk In Fridge", "Light Bulbs", 30);
  add("f2", "glass_brittle", "Walk In Fridge", "Thermometer", 40);
  add("k1", "knives_blades", "Production and Storage Area", "Scissors", 50);
}
/** The twice-a-month rule's tasks: due the 15th and the last day. */
function task(id: string, due: string, status: string, formKey = "foreign_matter_624") {
  mem.state.instances.push({
    id, dueDate: new Date(`${due}T00:00:00Z`), status, createdAt: new Date("2026-11-01T00:00:00Z"), ownerUserId: null, completedBySubmissionId: null,
    rule: { formKey, ownerId: "hugo", facility: { name: "624" }, windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "half_month" },
  });
}
const FILLED: ItemValues[] = [
  { itemId: "l1", result: "NOT_OK", comment: "Two lamps missing", foundQuantity: 56 }, { itemId: "l2", result: "OK" },
  { itemId: "f1", result: "OK", comment: "Clean" }, { itemId: "f2", result: "OK" }, { itemId: "k1", result: "OK" },
];
async function open(body: Record<string, unknown> = {}) {
  const res = await OPEN(req("POST", body));
  return { status: res.status, ...(await res.json()) } as { status: number; record: { id: string; updatedAt: string; period: string; status: string; linkedInstanceId: string | null }; items: FmItem[]; task: { id: string; dueDate: string } | null; isCurrentPeriod: boolean; error?: string };
}
const save = async (id: string, body: Record<string, unknown>) => SAVE(req("PATCH", body), { params: { id } });
const edit = (id: string, body: Record<string, unknown>) => EDIT(req("PATCH", body), { params: { id } });
const area = (body: Record<string, unknown>) => AREA(req("PATCH", body));
const answer = async (r: Promise<Response>) => { const res = await r; return [res.status, (await res.json()).error]; };
async function filled(openBody: Record<string, unknown> = {}, values: ItemValues[] = FILLED, initials = "HA") {
  const o = await open(openBody);
  tick();
  await save(o.record.id, { values, initials, date: "2026-11-24", time: "10:05", expectedUpdatedAt: o.record.updatedAt });
  tick();
  return o.record.id;
}

beforeEach(() => {
  vi.clearAllMocks();
  at("2026-11-24T18:00:00Z"); // Tuesday 10:00 Pacific, second half of November (11/16 – 11/30)
  Object.assign(mem.state, { items: [], records: [], instances: [], audits: [], version: 1, seq: 0 });
  seed();
  task("tA", "2026-11-15", "OVERDUE");
  task("tB", "2026-11-30", "UPCOMING");
  task("tC", "2026-12-15", "UPCOMING");
  task("verif", "2026-11-30", "UPCOMING", "verification_624");
  as("SUPERVISOR");
  for (const m of ["error", "log", "warn"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("opening the form", () => {
  it("creates one draft for the current Pacific half-month and returns the live list and the period's task", async () => {
    const o = await open();
    expect(o.record).toMatchObject({ period: "2026-11-B", status: "draft", linkedInstanceId: "tB", listVersion: 1 });
    expect((mem.state.records[0].periodStart as Date).toISOString().slice(0, 10)).toBe("2026-11-16");
    expect((mem.state.records[0].periodEnd as Date).toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(o.items.map((i) => i.id)).toEqual(["l1", "l2", "f1", "f2", "k1"]);
    expect(o.task).toEqual({ id: "tB", dueDate: "2026-11-30" });
    expect(o.isCurrentPeriod).toBe(true);
    await open();
    expect(mem.state.records).toHaveLength(1); // unique per facility and period
  });

  it("the period is the Pacific one: the evening of the 15th in California is still the first half", async () => {
    at("2026-12-16T06:30:00Z"); // 10:30 PM on the 15th, Pacific
    expect((await open()).record.period).toBe("2026-12-A");
    at("2026-12-16T08:30:00Z");
    expect((await open()).record.period).toBe("2026-12-B");
  });

  it("opened from a task's Start button it opens THAT task's period — also when the task is overdue", async () => {
    const past = await open({ taskId: "tA" });
    expect(past.record).toMatchObject({ period: "2026-11-A", linkedInstanceId: "tA" });
    expect(past.task).toEqual({ id: "tA", dueDate: "2026-11-15" });
    expect(past.isCurrentPeriod).toBe(false);
    expect((await open({ taskId: "tA" })).record.id).toBe(past.record.id); // continues the same draft
    expect((await open({ taskId: "tB" })).record.period).toBe("2026-11-B");
  });

  it("another form's task id is ignored; a period that has not started cannot be opened", async () => {
    expect((await open({ taskId: "verif" })).record.period).toBe("2026-11-B");
    const future = await open({ taskId: "tC" });
    expect([future.status, future.error]).toEqual([400, "That period has not started yet."]);
    expect((await open({ period: "nonsense" })).status).toBe(400);
    expect((await open({ period: "2026-11-A" })).record.period).toBe("2026-11-A");
  });

  it("needs a signed-in supervisor or admin", async () => {
    as(null);
    expect((await OPEN(req("POST", {}))).status).toBe(401);
    expect((await LIST()).status).toBe(401);
    as("VIEWER");
    expect((await OPEN(req("POST", {}))).status).toBe(403);
    expect(mem.state.records).toHaveLength(0);
  });
});

describe("draft autosave", () => {
  it("saves values keyed by item id, stamps checkedAt, drops a found quantity on an OK, updates the counts", async () => {
    const o = await open();
    tick();
    const res = await save(o.record.id, { values: [...FILLED.slice(0, 1), { itemId: "l2", result: "OK", foundQuantity: 3 }, ...FILLED.slice(2)], initials: "ha", date: "2026-11-24", time: "10:05", expectedUpdatedAt: o.record.updatedAt });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.progress).toEqual({ checked: 5, total: 5, ok: 4, notOk: 1 });
    const stored = splitStored(mem.state.records[0].items);
    expect(stored.entries.map((v) => v.itemId)).toEqual(["l1", "l2", "f1", "f2", "k1"]);
    expect(stored.entries[0]).toMatchObject({ result: "NOT_OK", comment: "Two lamps missing", foundQuantity: 56, checkedAt: "2026-11-24T18:00:01.000Z", expectedAtCheck: 58 });
    expect(stored.entries[1].foundQuantity).toBeNull();
    expect(stored.header).toEqual({ kind: "header", date: "2026-11-24", time: "10:05" });
    expect(mem.state.records[0]).toMatchObject({ initials: "HA", okCount: 4, failCount: 1, lastEditedBy: "Hugo Ayala" });
  });

  it("returns 409 with the server copy when another save came in meanwhile, and writes nothing", async () => {
    const o = await open();
    tick();
    await save(o.record.id, { values: [{ itemId: "l2", result: "OK" }], expectedUpdatedAt: o.record.updatedAt });
    tick();
    const res = await save(o.record.id, { values: [{ itemId: "l2", result: "NOT_OK", comment: "x" }], expectedUpdatedAt: o.record.updatedAt });
    const body = await res.json();
    expect([res.status, body.code]).toEqual([409, "conflict"]);
    expect(splitStored(mem.state.records[0].items).entries[0].result).toBe("OK");
  });

  it("refuses a body without values, an unknown record, other roles, and a submitted record", async () => {
    const id = await filled();
    expect((await save(id, { initials: "HA" })).status).toBe(400);
    expect((await save("nope", { values: [] })).status).toBe(404);
    await SUBMIT(req("POST", {}), { params: { id } });
    expect((await (await save(id, { values: FILLED })).json()).code).toBe("already_submitted");
    as("VIEWER");
    expect((await save(id, { values: FILLED })).status).toBe(403);
  });
});

describe("editing the list", () => {
  it.each(["ADMIN", "SUPERVISOR"])("%s may add, rename, change the quantity, the area and the section, move and retire; each change bumps the list version", async (role) => {
    as(role);
    const added = await (await ADD(req("POST", { section: "glass_brittle", areaName: "walk in fridge", name: "  Door Seal ", expectedQuantity: 2 }))).json();
    expect(added.listVersion).toBe(2);
    expect(layout(added.items)[1]).toBe("G Walk In Fridge: Light Bulbs×1, Thermometer×1, Door Seal×2"); // end of the existing area
    const roof = await (await ADD(req("POST", { section: "glass_brittle", areaName: "Roof", name: "Skylight", expectedQuantity: 0 }))).json();
    expect(layout(roof.items)).toEqual([
      "G Production and Storage Area: Shatter Proof Lamps×58, Clock×1", "G Walk In Fridge: Light Bulbs×1, Thermometer×1, Door Seal×2", "G Roof: Skylight×0", "K Production and Storage Area: Scissors×1",
    ]);

    await edit("l2", { name: "Wall Clock" });
    expect(find("l2").name).toBe("Wall Clock");
    await edit("l1", { expectedQuantity: 60 });
    expect(find("l1").expectedQuantity).toBe(60);
    await edit("l1", { expectedQuantity: 0 });
    expect(find("l1").expectedQuantity).toBe(0);

    const moved = await (await edit("f2", { move: "up" })).json();
    expect(layout(moved.items)[1]).toBe("G Walk In Fridge: Thermometer×1, Light Bulbs×1, Door Seal×2");

    const regrouped = await (await edit("l2", { areaName: "Walk In Fridge" })).json();
    expect(layout(regrouped.items)[1]).toBe("G Walk In Fridge: Thermometer×1, Light Bulbs×1, Door Seal×2, Wall Clock×1");
    const resectioned = await (await edit("l2", { section: "knives_blades", areaName: "Production and Storage Area" })).json();
    expect(layout(resectioned.items).at(-1)).toBe("K Production and Storage Area: Scissors×1, Wall Clock×1");

    const retired = await (await edit("f1", { retire: true })).json();
    expect(retired.items.map((i: FmItem) => i.id)).not.toContain("f1");
    expect(find("f1").retiredAt).toBeInstanceOf(Date); // retired, never deleted
    expect(mem.state.items).toHaveLength(7);
    expect(mem.state.version).toBe(10); // nine changes after version 1
  });

  it("anyone else is refused and nothing changes", async () => {
    as(null);
    expect((await ADD(req("POST", { section: "glass_brittle", areaName: "Ovens", name: "X" }))).status).toBe(401);
    expect((await edit("l1", { retire: true })).status).toBe(401);
    expect((await area({ section: "glass_brittle", areaName: "Walk In Fridge", retire: true })).status).toBe(401);
    expect((await ITEMS()).status).toBe(401);
    as("VIEWER");
    expect((await ADD(req("POST", { section: "glass_brittle", areaName: "Ovens", name: "X" }))).status).toBe(403);
    for (const body of [{ name: "X" }, { expectedQuantity: 9 }, { areaName: "X" }, { section: "knives_blades" }, { move: "down" }, { retire: true }]) expect((await edit("l1", body)).status).toBe(403);
    expect((await area({ section: "glass_brittle", areaName: "Walk In Fridge", rename: "X" })).status).toBe(403);
    expect(mem.state.items.filter((i) => i.retiredAt === null)).toHaveLength(5);
    expect(find("l1")).toMatchObject({ name: "Shatter Proof Lamps", expectedQuantity: 58, areaName: "Production and Storage Area", section: "glass_brittle" });
    expect(mem.state.version).toBe(1);
  });

  it("refuses bad input with a clear message", async () => {
    expect(await answer(ADD(req("POST", { section: "glass_brittle", areaName: "Ovens", name: " " })))).toEqual([400, "Enter a name for the item."]);
    expect(await answer(ADD(req("POST", { section: "glass_brittle", name: "Screen" })))).toEqual([400, "Choose an area or type a new area name."]);
    expect(await answer(ADD(req("POST", { section: "tools", areaName: "Ovens", name: "Screen" })))).toEqual([400, "Choose a section."]);
    expect(await answer(ADD(req("POST", { section: "glass_brittle", areaName: "Ovens", name: "Screen", expectedQuantity: 2.5 })))).toEqual([400, "The expected quantity must be a whole number, 0 or more."]);
    expect(await answer(edit("l1", { expectedQuantity: -1 }))).toEqual([400, "The expected quantity must be a whole number, 0 or more."]);
    expect(await answer(edit("l1", { expectedQuantity: "60" }))).toEqual([400, "The expected quantity must be a whole number, 0 or more."]);
    expect(await answer(edit("l1", { name: "" }))).toEqual([400, "Enter a name for the item."]);
    await edit("l1", { retire: true });
    expect((await edit("l1", { name: "Back" })).status).toBe(404);
    expect((await edit("nope", { name: "X" })).status).toBe(404);
    expect(mem.state.version).toBe(2);
  });

  it("names are unique within an area, case-insensitive: on add, on rename and on a move; the same name elsewhere is fine", async () => {
    expect(await answer(ADD(req("POST", { section: "glass_brittle", areaName: "Walk In Fridge", name: "thermometer" })))).toEqual([409, 'There is already an item called "thermometer" in Walk In Fridge.']);
    expect(await answer(edit("f1", { name: "THERMOMETER" }))).toEqual([409, 'There is already an item called "THERMOMETER" in Walk In Fridge.']);
    expect((await ADD(req("POST", { section: "glass_brittle", areaName: "Production and Storage Area", name: "Thermometer" }))).status).toBe(201); // another area
    const moved = mem.state.items.at(-1)!.id;
    expect(await answer(edit(moved, { areaName: "Walk In Fridge" }))).toEqual([409, 'There is already an item called "Thermometer" in Walk In Fridge.']);
    expect((await ADD(req("POST", { section: "knives_blades", areaName: "Production and Storage Area", name: "Clock" }))).status).toBe(201); // other section
    expect((await edit("f2", { name: "thermometer" })).status).toBe(200); // re-typing its own name with other capitals
    expect(mem.state.items).toHaveLength(7);
  });

  it("renaming an area renames it on all its items; retiring an area retires all its items — each says how many", async () => {
    const renamed = await (await area({ section: "glass_brittle", areaName: "Walk In Fridge", rename: " Walk-in Cooler " })).json();
    expect(renamed.changed).toBe(2);
    expect(layout(renamed.items)[1]).toBe("G Walk-in Cooler: Light Bulbs×1, Thermometer×1");
    expect(renamed.listVersion).toBe(2);
    // only that section's area of that name
    const knives = await (await area({ section: "knives_blades", areaName: "Production and Storage Area", rename: "Tool Wall" })).json();
    expect(layout(knives.items)).toEqual(["G Production and Storage Area: Shatter Proof Lamps×58, Clock×1", "G Walk-in Cooler: Light Bulbs×1, Thermometer×1", "K Tool Wall: Scissors×1"]);

    const retired = await (await area({ section: "glass_brittle", areaName: "Walk-in Cooler", retire: true })).json();
    expect(retired.changed).toBe(2);
    expect(retired.items.map((i: FmItem) => i.id)).toEqual(["l1", "l2", "k1"]);
    expect(find("f1").retiredAt).toBeInstanceOf(Date);
    expect(find("f2").retiredAt).toBeInstanceOf(Date);
    expect(mem.state.items).toHaveLength(5); // never deleted
    expect(mem.state.version).toBe(4);
  });

  it("an area rename is refused when empty, unknown, or when merging would put two items of one name in an area", async () => {
    expect(await answer(area({ section: "glass_brittle", areaName: "Walk In Fridge", rename: " " }))).toEqual([400, "Choose an area or type a new area name."]);
    expect(await answer(area({ section: "glass_brittle", areaName: "Nowhere", rename: "X" }))).toEqual([404, "That area has no items."]);
    expect(await answer(area({ section: "oops", areaName: "Walk In Fridge", rename: "X" }))).toEqual([400, "Choose a section and an area."]);
    await ADD(req("POST", { section: "glass_brittle", areaName: "Production and Storage Area", name: "Thermometer" }));
    expect(await answer(area({ section: "glass_brittle", areaName: "Walk In Fridge", rename: "production and storage area" }))).toEqual([409, 'There is already an item called "Thermometer" in Production and Storage Area.']);
    expect(find("f1").areaName).toBe("Walk In Fridge");
    // a merge without a clash is allowed and uses the existing area's spelling
    await edit(mem.state.items.at(-1)!.id, { retire: true });
    const merged = await (await area({ section: "glass_brittle", areaName: "Walk In Fridge", rename: "production and storage area" })).json();
    expect(layout(merged.items)[0]).toBe("G Production and Storage Area: Shatter Proof Lamps×58, Clock×1, Light Bulbs×1, Thermometer×1");
  });

  it("the open draft follows the live list: new item blank, rename shown, retired item's values dropped, quantity change keeps the result", async () => {
    const o = await open();
    tick();
    const saved = await (await save(o.record.id, { values: FILLED, initials: "HA", expectedUpdatedAt: o.record.updatedAt })).json();
    await edit("f2", { retire: true });
    await edit("l2", { name: "Wall Clock" });
    await edit("l1", { expectedQuantity: 60 });
    await ADD(req("POST", { section: "glass_brittle", areaName: "Ovens", name: "Screen", expectedQuantity: 3 }));

    const reopened = await (await READ(req("GET"), { params: { id: o.record.id } })).json();
    expect(reopened.items.map((i: FmItem) => `${i.name}×${i.expectedQuantity}`)).toEqual(["Shatter Proof Lamps×60", "Wall Clock×1", "Light Bulbs×1", "Screen×3", "Scissors×1"]);
    // the stored answer for the lamps was given against 58: the result is kept and the hint applies
    const lamps = splitStored(reopened.record.items).entries.find((v) => v.itemId === "l1")!;
    expect(lamps).toMatchObject({ result: "NOT_OK", expectedAtCheck: 58 });
    expect(quantityChangedSinceCheck(reopened.items[0], lamps)).toBe(true);

    tick();
    const after = await (await save(o.record.id, { values: saved.values, expectedUpdatedAt: saved.updatedAt })).json();
    expect(after.values.map((v: ItemValues) => v.itemId)).toEqual(["l1", "l2", "f1", "k1"]); // f2 is gone with its values
    expect(after.progress).toEqual({ checked: 4, total: 5, ok: 3, notOk: 1 });

    tick();
    const blocked = await SUBMIT(req("POST", {}), { params: { id: o.record.id } });
    expect(blocked.status).toBe(422);
    expect((await blocked.json()).problems).toEqual(["Ovens: Screen needs OK or Not OK."]);
  });
});

describe("submit", () => {
  it("lists what is missing, by area, and writes nothing", async () => {
    const id = await filled({}, [{ itemId: "l1", result: "NOT_OK" }, { itemId: "f1", result: "OK" }], "");
    const res = await SUBMIT(req("POST", {}), { params: { id } });
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toEqual([
      "Enter your initials at the top.",
      "Glass and Brittle, Production and Storage Area: Shatter Proof Lamps is Not OK and needs a comment.",
      "Glass and Brittle, Production and Storage Area: Clock needs OK or Not OK.",
      "Walk In Fridge: Thermometer needs OK or Not OK.",
      "Knives and Blades, Production and Storage Area: Scissors needs OK or Not OK.",
    ]);
    expect(mem.state.records[0].status).toBe("draft");
    expect(inst("tB").status).toBe("UPCOMING");
  });

  it("a Not OK with its comment does not block; the record stores a full snapshot and the list version", async () => {
    const id = await filled();
    expect((await SUBMIT(req("POST", {}), { params: { id } })).status).toBe(200);
    const rec = mem.state.records[0];
    expect(rec).toMatchObject({ status: "submitted", okCount: 4, failCount: 1, conductedBy: "Hugo Ayala", submittedById: "hugo", listVersion: 1, linkedInstanceId: "tB" });
    const { snapshots, header } = splitStored(rec.items);
    expect(snapshots.map((s: ItemSnapshot) => [s.position, s.section, s.areaName, s.name, s.expectedQuantity, s.result, s.comment, s.foundQuantity])).toEqual([
      [1, "glass_brittle", "Production and Storage Area", "Shatter Proof Lamps", 58, "NOT_OK", "Two lamps missing", 56],
      [2, "glass_brittle", "Production and Storage Area", "Clock", 1, "OK", "", null],
      [3, "glass_brittle", "Walk In Fridge", "Light Bulbs", 1, "OK", "Clean", null],
      [4, "glass_brittle", "Walk In Fridge", "Thermometer", 1, "OK", "", null],
      [5, "knives_blades", "Production and Storage Area", "Scissors", 1, "OK", "", null],
    ]);
    expect(Object.keys(snapshots[0]).sort()).toEqual(["areaName", "checkedAt", "comment", "expectedQuantity", "foundQuantity", "itemId", "name", "position", "result", "section"]);
    expect(snapshots.every((s: ItemSnapshot) => s.checkedAt === "2026-11-24T18:00:01.000Z")).toBe(true);
    expect(header).toEqual({ kind: "header", date: "2026-11-24", time: "10:05" });
  });

  it("old records are unchanged by later edits to the list", async () => {
    const id = await filled();
    await SUBMIT(req("POST", {}), { params: { id } });
    const before = JSON.stringify(mem.state.records[0].items);
    await edit("l1", { name: "LED Lamps" });
    await edit("l1", { expectedQuantity: 70 });
    await edit("l2", { section: "knives_blades" });
    await area({ section: "glass_brittle", areaName: "Walk In Fridge", rename: "Cooler" });
    await area({ section: "glass_brittle", areaName: "Cooler", retire: true });
    await ADD(req("POST", { section: "glass_brittle", areaName: "Roof", name: "Skylight" }));
    expect(JSON.stringify(mem.state.records[0].items)).toBe(before);
    const read = await (await READ(req("GET"), { params: { id } })).json();
    expect(splitStored(read.record.items).snapshots[0]).toMatchObject({ name: "Shatter Proof Lamps", expectedQuantity: 58 });
    expect(read.items).toEqual([]);
    expect(mem.state.records[0].listVersion).toBe(1);
    expect((await SUBMIT(req("POST", {}), { params: { id } })).status).toBe(409); // cannot be submitted twice
  });
});

describe("the task (due on the period's last day) — real completion code", () => {
  it("from the form, with no task id: completes this period's task on time and no other", async () => {
    const id = await filled();
    mem.state.records[0].linkedInstanceId = null;
    const body = await (await SUBMIT(req("POST", {}), { params: { id } })).json();
    expect(body.completedInstanceId).toBe("tB");
    expect(inst("tB")).toMatchObject({ status: "DONE", completedLate: false, daysLate: null, completedBySubmissionId: id, doneById: "hugo" });
    expect(inst("tA").status).toBe("OVERDUE"); // last period's overdue task is not the one completed
    expect(inst("verif").status).toBe("UPCOMING"); // nor the other form's task due the same day
  });

  it("on the due date itself it is on time; from the task id as well", async () => {
    at("2026-11-30T20:00:00Z");
    const id = await filled({ taskId: "tB" });
    await SUBMIT(req("POST", { taskId: "tB" }), { params: { id } });
    expect(inst("tB")).toMatchObject({ status: "DONE", completedLate: false });
  });

  it("a past, overdue period opened from its task: that period's draft, completed late, the current task untouched", async () => {
    const id = await filled({ taskId: "tA" });
    expect(mem.state.records[0].period).toBe("2026-11-A");
    const body = await (await SUBMIT(req("POST", { taskId: "tA" }), { params: { id } })).json();
    expect(body.completedInstanceId).toBe("tA");
    expect(inst("tA")).toMatchObject({ status: "DONE", completedLate: true, daysLate: 9 }); // due 11/15, done 11/24
    expect(mem.state.audits.at(-1)!.note).toContain("9 day(s) late");
    expect(inst("tB").status).toBe("UPCOMING");
    expect((await open()).record).toMatchObject({ period: "2026-11-B", status: "draft" });
  });

  it("a task id from another period is not completed by this record; a period with no task completes nothing", async () => {
    const id = await filled();
    expect((await (await SUBMIT(req("POST", { taskId: "tA" }), { params: { id } })).json()).completedInstanceId).toBe("tB");
    expect(inst("tA").status).toBe("OVERDUE");

    mem.state.records = []; mem.state.instances = mem.state.instances.filter((i) => i.id !== "tB"); inst("tA").status = "OVERDUE";
    const id2 = await filled();
    const res = await SUBMIT(req("POST", {}), { params: { id: id2 } });
    expect(res.status).toBe(200);
    expect((await res.json()).completedInstanceId).toBeNull();
    expect(inst("tA").status).toBe("OVERDUE");
  });
});

describe("mark in progress and 'Open this period' progress (real route and provider)", () => {
  const mark = (body: Record<string, unknown>) => MARK(new NextRequest("http://localhost/api/task-instances/mark-in-progress", { method: "POST", body: JSON.stringify(body) }));
  const progress = async (...ids: string[]) =>
    Object.fromEntries(await fetchTaskProgress(ids.map((id) => ({ id, dueDate: inst(id).dueDate, rule: { formKey: "foreign_matter_624" } })), prisma as never));

  it("the page sends the task's due date and exactly that period's task is marked", async () => {
    const o = await open();
    expect(await (await mark({ formKey: "foreign_matter_624", facilityName: "624", dueDate: o.task!.dueDate })).json()).toEqual({ id: "tB", status: "IN_PROGRESS" });
    expect(inst("tA").status).toBe("OVERDUE"); // without the due date the oldest overdue task would have been chosen
    expect(inst("verif").status).toBe("UPCOMING");
    const past = await open({ taskId: "tA" });
    await mark({ formKey: "foreign_matter_624", facilityName: "624", dueDate: past.task!.dueDate });
    expect(inst("tA").status).toBe("IN_PROGRESS");
  });

  it("progress is checked items out of live items, found by the linked task or by the period end being the task's due date", async () => {
    const o = await open();
    tick();
    await save(o.record.id, { values: [{ itemId: "l1", result: "OK" }, { itemId: "l2", result: "NOT_OK" }, { itemId: "f1", comment: "only a comment" }], expectedUpdatedAt: o.record.updatedAt });
    expect(await progress("tB", "tC")).toEqual({ tB: { done: 2, total: 5 } });
    mem.state.records[0].linkedInstanceId = null;
    expect(await progress("tB")).toEqual({ tB: { done: 2, total: 5 } });
    await edit("l2", { retire: true });
    await ADD(req("POST", { section: "glass_brittle", areaName: "Ovens", name: "Screen" }));
    expect(await progress("tB")).toEqual({ tB: { done: 1, total: 5 } }); // follows the live list
  });

  it("'Mark all OK' values save like any other and count toward progress; nothing shows once submitted", async () => {
    const o = await open();
    const fridge = areasOf(o.items)[1];
    const values = [{ itemId: "f1", result: "NOT_OK" as const, comment: "Flickers" }, ...markAllOk(fridge.items, { f1: { itemId: "f1", result: "NOT_OK", comment: "Flickers" } }, new Date().toISOString())];
    tick();
    const data = await (await save(o.record.id, { values, expectedUpdatedAt: o.record.updatedAt })).json();
    expect(data.values.map((v: ItemValues) => [v.itemId, v.result])).toEqual([["f1", "NOT_OK"], ["f2", "OK"]]); // the Not OK was not overwritten
    expect(await progress("tB")).toEqual({ tB: { done: 2, total: 5 } });
    const id = await filled({ taskId: "tA" });
    await SUBMIT(req("POST", {}), { params: { id } });
    expect(await progress("tA")).toEqual({});
  });
});

describe("records list and delete", () => {
  it("delete is admin only, reopens the task the record had completed (real code) and removes the record", async () => {
    const id = await filled();
    await SUBMIT(req("POST", {}), { params: { id } });
    expect(inst("tB").status).toBe("DONE");
    expect((await REMOVE(req("DELETE"), { params: { id } })).status).toBe(403);
    as("ADMIN", "carlos");
    expect(await (await REMOVE(req("DELETE"), { params: { id } })).json()).toEqual({ success: true });
    expect(mem.state.records).toHaveLength(0);
    expect(inst("tB")).toMatchObject({ status: "UPCOMING", completedBySubmissionId: null }); // due 11/30, today is 11/24
    expect(mem.state.audits.at(-1)).toMatchObject({ instanceId: "tB", action: "reopened", note: "Foreign Matter Inspection record for November 16–30, 2026 deleted by admin" });
    expect((await REMOVE(req("DELETE"), { params: { id } })).status).toBe(404);
  });

  it("the list returns the records", async () => {
    await open();
    expect(await (await LIST()).json()).toHaveLength(1);
  });
});
