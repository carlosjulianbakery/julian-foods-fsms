import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── In-memory database. Task completion and reopening run their REAL code against it. ──
const mem = vi.hoisted(() => {
  type Item = { id: string; facility: string; groupName: string; name: string; description: string; sortOrder: number; retiredAt: Date | null };
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
    facilitiesChecklistItem: {
      findMany: vi.fn(async () => [...live()].sort((x, y) => x.sortOrder - y.sortOrder)),
      findUnique: vi.fn(async (a: { where: { id: string } }) => state.items.find((e) => e.id === a.where.id) ?? null),
      create: vi.fn(async (a: { data: Partial<Item> }) => { const e = { id: `item-${++state.seq}`, facility: "624", description: "", sortOrder: 0, retiredAt: null, ...a.data } as Item; state.items.push(e); return e; }),
      update: vi.fn(async (a: { where: { id: string }; data: Partial<Item> }) => Object.assign(state.items.find((e) => e.id === a.where.id)!, a.data)),
    },
    facilitiesChecklistList: {
      findUnique: vi.fn(async () => ({ version: state.version })),
      upsert: vi.fn(async () => ({ version: ++state.version })),
    },
    facilitiesChecklistRecord: {
      findUnique: vi.fn(async (a: { where: { id?: string; facility_period?: { period: string } } }) =>
        state.records.find((r) => (a.where.id ? r.id === a.where.id : r.period === a.where.facility_period!.period)) ?? null),
      findMany: vi.fn(async (a?: { where?: { status?: string; OR?: Array<{ linkedInstanceId?: { in: string[] }; periodStart?: { lte: Date }; periodEnd?: { gte: Date } }> } }) =>
        state.records.filter((r) =>
          (!a?.where?.status || r.status === a.where.status) &&
          (!a?.where?.OR || a.where.OR.some((c) => (c.linkedInstanceId ? c.linkedInstanceId.in.includes(r.linkedInstanceId ?? "") : r.periodStart <= c.periodStart!.lte && r.periodEnd >= c.periodEnd!.gte))))),
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
import { GET as LIST, POST as OPEN } from "@/app/api/facilities-checklist-624/route";
import { GET as READ, PATCH as SAVE, DELETE as REMOVE } from "@/app/api/facilities-checklist-624/[id]/route";
import { POST as SUBMIT } from "@/app/api/facilities-checklist-624/[id]/submit/route";
import { GET as ITEMS, POST as ADD } from "@/app/api/facilities-checklist-624/items/route";
import { PATCH as EDIT } from "@/app/api/facilities-checklist-624/items/[id]/route";
import { POST as MARK } from "@/app/api/task-instances/mark-in-progress/route";
import { fetchTaskProgress } from "@/lib/task-progress";
import { groupsOf, splitStored, type ChecklistItem, type ItemSnapshot, type ItemValues } from "@/lib/facilities-checklist-624";

type MockFn = ReturnType<typeof vi.fn>;
const session = getServerSession as unknown as MockFn;
const as = (role: string | null, id = "hugo") => session.mockResolvedValue(role ? { user: { id, role, name: "Hugo Ayala", email: "hugo@example.com" } } : null);
const req = (method: string, body?: unknown) => new NextRequest("http://localhost/api/facilities-checklist-624", { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const tick = (ms = 1000) => vi.setSystemTime(new Date(Date.now() + ms));
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const find = (id: string) => mem.state.items.find((e) => e.id === id)!;
const inst = (id: string) => mem.state.instances.find((i) => i.id === id)!;
const names = (items: ChecklistItem[]) => groupsOf(items).map((g) => `${g.name}: ${g.items.map((i) => i.name).join(", ")}`);

function seed() {
  const add = (id: string, groupName: string, name: string, sortOrder: number) =>
    mem.state.items.push({ id, facility: "624", groupName, name, description: `Inspect ${name}.`, sortOrder, retiredAt: null });
  add("d1", "Doors", "Production Doors", 10);
  add("d2", "Doors", "Emergency doors", 20);
  add("c1", "Ceilings", "Production Ceiling", 60);
  add("s1", "Sinks", "Sinks", 140);
}
/** The weekly rule's tasks: due every Thursday, window from Monday. */
function task(id: string, due: string, status: string, formKey = "facilities_checklist_624", facility = "624") {
  mem.state.instances.push({
    id, dueDate: new Date(`${due}T00:00:00Z`), status, createdAt: new Date("2026-11-20T00:00:00Z"), ownerUserId: null, completedBySubmissionId: null,
    rule: { formKey, ownerId: "hugo", facility: { name: facility }, windowMode: "PERIOD_START", windowDaysBefore: null, recurrenceUnit: "week" },
  });
}
const ALL_OK: ItemValues[] = [
  { itemId: "d1", result: "OK" }, { itemId: "d2", result: "NOT_OK", correctiveAction: "Fixed the latch" },
  { itemId: "c1", result: "OK", note: "Clean" }, { itemId: "s1", result: "OK" },
];
async function open(body: Record<string, unknown> = {}) {
  const res = await OPEN(req("POST", body));
  return { status: res.status, ...(await res.json()) } as { status: number; record: { id: string; updatedAt: string; period: string; status: string; linkedInstanceId: string | null }; items: ChecklistItem[]; task: { id: string; dueDate: string } | null; isCurrentWeek: boolean; error?: string };
}
const save = async (id: string, body: Record<string, unknown>) => SAVE(req("PATCH", body), { params: { id } });
const edit = (id: string, body: Record<string, unknown>) => EDIT(req("PATCH", body), { params: { id } });
/** Opens a draft, fills it in completely and returns its id. */
async function filled(openBody: Record<string, unknown> = {}, values: ItemValues[] = ALL_OK, initials = "HA") {
  const o = await open(openBody);
  tick();
  await save(o.record.id, { values, initials, date: "2026-11-24", time: "10:05", expectedUpdatedAt: o.record.updatedAt });
  tick();
  return o.record.id;
}

beforeEach(() => {
  vi.clearAllMocks();
  at("2026-11-24T18:00:00Z"); // Tuesday 10:00 Pacific, week 48 (Mon 11/23 – Sun 11/29)
  Object.assign(mem.state, { items: [], records: [], instances: [], audits: [], version: 1, seq: 0 });
  seed();
  task("t47", "2026-11-19", "OVERDUE");
  task("t48", "2026-11-26", "UPCOMING");
  task("t49", "2026-12-03", "UPCOMING");
  task("other-form", "2026-11-26", "UPCOMING", "verification_624");
  as("SUPERVISOR");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("opening the form", () => {
  it("creates one draft for the current Pacific week, with the week's Monday and Sunday, and returns the live checklist and the week's task", async () => {
    const o = await open();
    expect(o.record).toMatchObject({ period: "2026-W48", status: "draft", linkedInstanceId: "t48", listVersion: 1 });
    expect((mem.state.records[0].periodStart as Date).toISOString().slice(0, 10)).toBe("2026-11-23");
    expect((mem.state.records[0].periodEnd as Date).toISOString().slice(0, 10)).toBe("2026-11-29");
    expect(o.items.map((i) => i.id)).toEqual(["d1", "d2", "c1", "s1"]);
    expect(o.task).toEqual({ id: "t48", dueDate: "2026-11-26" }); // due Thursday, not the week's last day
    expect(o.isCurrentWeek).toBe(true);
    await open();
    expect(mem.state.records).toHaveLength(1); // unique per facility and week
  });

  it("the week is the Pacific week: Sunday evening in California is still the old week, although UTC is already Monday", async () => {
    at("2026-11-30T06:30:00Z");
    expect((await open()).record.period).toBe("2026-W48");
    at("2026-11-30T08:30:00Z");
    expect((await open()).record.period).toBe("2026-W49");
  });

  it("a week across the year boundary gets the ISO week-year key", async () => {
    at("2027-01-01T20:00:00Z");
    const o = await open();
    expect(o.record.period).toBe("2026-W53");
    expect((mem.state.records[0].periodEnd as Date).toISOString().slice(0, 10)).toBe("2027-01-03");
  });

  it("opened from a task's Start button, it opens THAT task's week — also when the task is overdue", async () => {
    const past = await open({ taskId: "t47" });
    expect(past.record).toMatchObject({ period: "2026-W47", status: "draft", linkedInstanceId: "t47" });
    expect(past.task).toEqual({ id: "t47", dueDate: "2026-11-19" });
    expect(past.isCurrentWeek).toBe(false);
    const again = await open({ taskId: "t47" });
    expect(again.record.id).toBe(past.record.id); // continues the same draft
    expect((await open({ taskId: "t48" })).record.period).toBe("2026-W48");
  });

  it("a task id that is not this form's task is ignored; a week that has not started cannot be opened", async () => {
    expect((await open({ taskId: "other-form" })).record.period).toBe("2026-W48");
    expect((await open({ taskId: "does-not-exist" })).record.period).toBe("2026-W48");
    const future = await open({ taskId: "t49" });
    expect(future.status).toBe(400);
    expect(future.error).toBe("That week has not started yet.");
    expect((await open({ period: "2026-W50" })).status).toBe(400);
    expect((await open({ period: "nonsense" })).status).toBe(400);
    expect((await open({ period: "2026-W47" })).record.period).toBe("2026-W47"); // a past week by name (Continue on a draft)
  });

  it("a week with no task still opens, with no task to mark", async () => {
    mem.state.instances = [];
    const o = await open();
    expect(o.record).toMatchObject({ period: "2026-W48", linkedInstanceId: null });
    expect(o.task).toBeNull();
  });

  it("needs a signed-in supervisor or admin", async () => {
    as(null);
    expect((await OPEN(req("POST", {}))).status).toBe(401);
    expect((await LIST()).status).toBe(401);
    as("VIEWER");
    expect((await OPEN(req("POST", {}))).status).toBe(403);
    expect((await LIST()).status).toBe(403);
    expect(mem.state.records).toHaveLength(0);
  });
});

describe("draft autosave", () => {
  it("saves values keyed by item id, stamps checkedAt per item, updates the counts and the header", async () => {
    const o = await open();
    tick();
    const res = await save(o.record.id, { values: ALL_OK, initials: "ha", date: "2026-11-24", time: "10:05", expectedUpdatedAt: o.record.updatedAt });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.progress).toEqual({ checked: 4, total: 4, ok: 3, notOk: 1 });
    const stored = splitStored(mem.state.records[0].items);
    expect(stored.entries.map((v) => v.itemId)).toEqual(["d1", "d2", "c1", "s1"]);
    expect(stored.entries.every((v) => v.checkedAt === "2026-11-24T18:00:01.000Z")).toBe(true);
    expect(stored.header).toEqual({ kind: "header", date: "2026-11-24", time: "10:05" });
    expect(mem.state.records[0]).toMatchObject({ initials: "HA", okCount: 3, failCount: 1, lastEditedBy: "Hugo Ayala" });
  });

  it("checkedAt is set when the result is first set and does not move when the result or the note changes later", async () => {
    const o = await open();
    tick();
    const first = await (await save(o.record.id, { values: [{ itemId: "d1", note: "looking" }], expectedUpdatedAt: o.record.updatedAt })).json();
    expect(first.values[0].checkedAt).toBeNull(); // a note alone is not a check
    tick(60_000);
    const second = await (await save(o.record.id, { values: [{ itemId: "d1", result: "OK", note: "looking" }], expectedUpdatedAt: first.updatedAt })).json();
    expect(second.values[0].checkedAt).toBe("2026-11-24T18:01:01.000Z");
    tick(60_000);
    const third = await (await save(o.record.id, { values: [{ itemId: "d1", result: "NOT_OK", note: "changed" }], expectedUpdatedAt: second.updatedAt })).json();
    expect(third.values[0].checkedAt).toBe("2026-11-24T18:01:01.000Z");
  });

  it("returns 409 with the server copy when another save came in meanwhile, and writes nothing", async () => {
    const o = await open();
    tick();
    await save(o.record.id, { values: [{ itemId: "d1", result: "OK" }], expectedUpdatedAt: o.record.updatedAt }); // someone else
    tick();
    const res = await save(o.record.id, { values: [{ itemId: "d1", result: "NOT_OK" }], expectedUpdatedAt: o.record.updatedAt }); // stale
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("conflict");
    expect(splitStored(body.record.items).entries[0].result).toBe("OK");
    expect(splitStored(mem.state.records[0].items).entries[0].result).toBe("OK");
  });

  it("drops values for checks that are no longer on the list; refuses a body without values", async () => {
    const o = await open();
    tick();
    const data = await (await save(o.record.id, { values: [{ itemId: "d1", result: "OK" }, { itemId: "retired-long-ago", result: "OK" }], expectedUpdatedAt: o.record.updatedAt })).json();
    expect(data.values.map((v: ItemValues) => v.itemId)).toEqual(["d1"]);
    expect((await save(o.record.id, { initials: "HA" })).status).toBe(400);
    expect((await save("nope", { values: [] })).status).toBe(404);
  });

  it("a submitted record can no longer be saved; others are refused", async () => {
    const id = await filled();
    await SUBMIT(req("POST", {}), { params: { id } });
    const res = await save(id, { values: ALL_OK });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already_submitted");
    as("VIEWER");
    expect((await save(id, { values: ALL_OK })).status).toBe(403);
    as(null);
    expect((await save(id, { values: ALL_OK })).status).toBe(401);
  });
});

describe("editing the checklist", () => {
  it.each(["ADMIN", "SUPERVISOR"])("%s may add, rename, edit the description, move, change the group and retire; each change bumps the list version", async (role) => {
    as(role);
    const added = await (await ADD(req("POST", { name: "  Side door ", description: " Check the hinges. ", groupName: "doors" }))).json();
    expect(added.listVersion).toBe(2);
    expect(names(added.items)[0]).toBe("Doors: Production Doors, Emergency doors, Side door"); // end of the existing group
    expect(mem.state.items.at(-1)).toMatchObject({ name: "Side door", description: "Check the hinges.", groupName: "Doors", createdById: "hugo" });

    const roof = await (await ADD(req("POST", { name: "Roof hatch", description: "", groupName: "Roof" }))).json();
    expect(groupsOf(roof.items as ChecklistItem[]).map((g) => g.name)).toEqual(["Doors", "Ceilings", "Sinks", "Roof"]); // a new group goes last

    const renamed = await (await edit("c1", { name: "Production ceiling (main room)" })).json();
    expect(renamed.listVersion).toBe(4);
    expect(find("c1").name).toBe("Production ceiling (main room)");

    await edit("c1", { description: "Look for cracks and dirt." });
    expect(find("c1").description).toBe("Look for cracks and dirt.");
    await edit("c1", { description: "" }); // a description may be emptied
    expect(find("c1").description).toBe("");

    const moved = await (await edit("d2", { move: "up" })).json();
    expect(names(moved.items)[0]).toBe("Doors: Emergency doors, Production Doors, Side door");
    const back = await (await edit("d2", { move: "down" })).json();
    expect(names(back.items)[0]).toBe("Doors: Production Doors, Emergency doors, Side door");

    const regrouped = await (await edit("s1", { groupName: "Doors" })).json();
    expect(names(regrouped.items)[0]).toBe("Doors: Production Doors, Emergency doors, Side door, Sinks");
    const newGroup = await (await edit("s1", { groupName: "Plumbing" })).json();
    expect(names(newGroup.items).at(-1)).toBe("Plumbing: Sinks");

    const retired = await (await edit("d1", { retire: true })).json();
    expect(retired.items.map((i: ChecklistItem) => i.id)).not.toContain("d1");
    expect(find("d1").retiredAt).toBeInstanceOf(Date); // retired, never deleted
    expect(find("d1")).toMatchObject({ retiredById: "hugo" });
    expect(mem.state.items).toHaveLength(6);
    expect(retired.listVersion).toBe(mem.state.version);
    expect(mem.state.version).toBe(11); // ten changes after version 1
  });

  it("anyone else is refused and nothing changes", async () => {
    as(null);
    expect((await ADD(req("POST", { name: "X", groupName: "Doors" }))).status).toBe(401);
    expect((await edit("d1", { retire: true })).status).toBe(401);
    expect((await ITEMS()).status).toBe(401);
    as("VIEWER");
    expect((await ADD(req("POST", { name: "X", groupName: "Doors" }))).status).toBe(403);
    for (const body of [{ name: "X" }, { description: "X" }, { groupName: "X" }, { move: "down" }, { retire: true }]) expect((await edit("d1", body)).status).toBe(403);
    expect((await ITEMS()).status).toBe(403);
    expect(mem.state.items).toHaveLength(4);
    expect(find("d1")).toMatchObject({ name: "Production Doors", groupName: "Doors", sortOrder: 10, retiredAt: null });
    expect(mem.state.version).toBe(1);
  });

  it("refuses an empty name or group, over-long text, and a retired or unknown item — with a clear message", async () => {
    const refuse = async (r: Promise<Response>) => { const res = await r; return [res.status, (await res.json()).error]; };
    expect(await refuse(ADD(req("POST", { name: "  ", groupName: "Doors" })))).toEqual([400, "Enter a name for the check."]);
    expect(await refuse(ADD(req("POST", { name: "Side door" })))).toEqual([400, "Choose a group or type a new group name."]);
    expect(await refuse(ADD(req("POST", { name: "x".repeat(121), groupName: "Doors" })))).toEqual([400, "The name is too long (120 characters at most)."]);
    expect(await refuse(edit("d1", { name: " " }))).toEqual([400, "Enter a name for the check."]);
    expect(await refuse(edit("d1", { groupName: "" }))).toEqual([400, "Choose a group or type a new group name."]);
    expect(await refuse(edit("d1", { description: "x".repeat(401) }))).toEqual([400, "The description is too long (400 characters at most)."]);
    await edit("d1", { retire: true });
    expect((await edit("d1", { name: "Back again" })).status).toBe(404);
    expect((await edit("nope", { name: "X" })).status).toBe(404);
  });

  it("moving the first item up or the last down changes no order", async () => {
    await edit("d1", { move: "up" });
    await edit("d2", { move: "down" });
    expect(names((await (await ITEMS()).json()).items)).toEqual(["Doors: Production Doors, Emergency doors", "Ceilings: Production Ceiling", "Sinks: Sinks"]);
  });

  it("the open draft follows the live list: a new check is blank, a rename shows, a retired check's values are dropped on the next save", async () => {
    const o = await open();
    tick();
    const saved = await (await save(o.record.id, { values: ALL_OK, initials: "HA", expectedUpdatedAt: o.record.updatedAt })).json();
    await edit("d2", { retire: true });
    await edit("d1", { name: "Main doors" });
    await ADD(req("POST", { name: "Roof hatch", description: "", groupName: "Roof" }));

    const reopened = await (await READ(req("GET"), { params: { id: o.record.id } })).json();
    expect(reopened.items.map((i: ChecklistItem) => i.name)).toEqual(["Main doors", "Production Ceiling", "Sinks", "Roof hatch"]);

    tick();
    const after = await (await save(o.record.id, { values: ALL_OK, expectedUpdatedAt: saved.updatedAt })).json();
    expect(after.values.map((v: ItemValues) => v.itemId)).toEqual(["d1", "c1", "s1"]); // d2's Not OK and corrective action are gone
    expect(after.progress).toEqual({ checked: 3, total: 4, ok: 3, notOk: 0 });
    expect(mem.state.records[0].listVersion).toBe(4);

    tick();
    const blocked = await SUBMIT(req("POST", {}), { params: { id: o.record.id } });
    expect(blocked.status).toBe(422);
    expect((await blocked.json()).problems).toEqual(["Roof hatch needs OK or Not OK."]);
  });
});

describe("submit", () => {
  it("says in plain words what is missing and writes nothing", async () => {
    const id = await filled({}, [{ itemId: "d1", result: "OK" }, { itemId: "d2", result: "NOT_OK" }], "");
    const res = await SUBMIT(req("POST", {}), { params: { id } });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.problems).toEqual([
      "Enter your initials at the top.", "Emergency doors is Not OK and needs a corrective action.",
      "Production Ceiling needs OK or Not OK.", "Sinks needs OK or Not OK.",
    ]);
    expect(mem.state.records[0].status).toBe("draft");
    expect(inst("t48").status).toBe("UPCOMING");
  });

  it("a Not OK with a corrective action does not block; the record stores a full snapshot and the list version", async () => {
    const id = await filled();
    const res = await SUBMIT(req("POST", {}), { params: { id } });
    expect(res.status).toBe(200);
    const rec = mem.state.records[0];
    expect(rec).toMatchObject({ status: "submitted", okCount: 3, failCount: 1, conductedBy: "Hugo Ayala", submittedById: "hugo", listVersion: 1, linkedInstanceId: "t48" });
    const { snapshots, header } = splitStored(rec.items);
    expect(snapshots.map((s: ItemSnapshot) => [s.position, s.groupName, s.name, s.description, s.result, s.correctiveAction, s.note])).toEqual([
      [1, "Doors", "Production Doors", "Inspect Production Doors.", "OK", "", ""],
      [2, "Doors", "Emergency doors", "Inspect Emergency doors.", "NOT_OK", "Fixed the latch", ""],
      [3, "Ceilings", "Production Ceiling", "Inspect Production Ceiling.", "OK", "", "Clean"],
      [4, "Sinks", "Sinks", "Inspect Sinks.", "OK", "", ""],
    ]);
    expect(snapshots.every((s: ItemSnapshot) => s.checkedAt === "2026-11-24T18:00:01.000Z")).toBe(true);
    expect(header).toEqual({ kind: "header", date: "2026-11-24", time: "10:05" });
  });

  it("old records are unchanged by later edits to the checklist", async () => {
    const id = await filled();
    await SUBMIT(req("POST", {}), { params: { id } });
    const before = JSON.stringify(mem.state.records[0].items);
    await edit("d1", { name: "Renamed afterwards" });
    await edit("d1", { description: "New text" });
    await edit("c1", { groupName: "Doors" });
    await edit("d2", { retire: true });
    await ADD(req("POST", { name: "Roof hatch", description: "", groupName: "Roof" }));
    expect(JSON.stringify(mem.state.records[0].items)).toBe(before);
    const read = await (await READ(req("GET"), { params: { id } })).json();
    expect(splitStored(read.record.items).snapshots.map((s) => `${s.groupName}/${s.name}`)).toEqual(["Doors/Production Doors", "Doors/Emergency doors", "Ceilings/Production Ceiling", "Sinks/Sinks"]);
    expect(read.items).toEqual([]); // a submitted record is read from its own snapshot
    expect(mem.state.records[0].listVersion).toBe(1);
  });

  it("cannot be submitted twice", async () => {
    const id = await filled();
    expect((await SUBMIT(req("POST", {}), { params: { id } })).status).toBe(200);
    expect((await SUBMIT(req("POST", {}), { params: { id } })).status).toBe(409);
    as("VIEWER");
    expect((await SUBMIT(req("POST", {}), { params: { id } })).status).toBe(403);
  });
});

describe("the task (due Thursday) — real completion code", () => {
  it("from the form, with no task id: Tuesday's submission completes the week's Thursday task, on time", async () => {
    const id = await filled();
    mem.state.records[0].linkedInstanceId = null; // as if the draft was opened before the task existed
    const body = await (await SUBMIT(req("POST", {}), { params: { id } })).json();
    expect(body.completedInstanceId).toBe("t48");
    expect(inst("t48")).toMatchObject({ status: "DONE", completedLate: false, daysLate: null, completedBySubmissionId: id, doneById: "hugo" });
    expect(inst("t47").status).toBe("OVERDUE"); // last week's overdue task is NOT the one completed
    expect(inst("t49").status).toBe("UPCOMING");
    expect(inst("other-form").status).toBe("UPCOMING");
    expect(mem.state.records[0].linkedInstanceId).toBe("t48");
  });

  it("from the task id the form was opened with", async () => {
    const id = await filled({ taskId: "t48" });
    const body = await (await SUBMIT(req("POST", { taskId: "t48" }), { params: { id } })).json();
    expect(body.completedInstanceId).toBe("t48");
    expect(inst("t48")).toMatchObject({ status: "DONE", completedLate: false });
  });

  it("on Thursday itself it is on time", async () => {
    at("2026-11-26T20:00:00Z");
    const id = await filled();
    await SUBMIT(req("POST", {}), { params: { id } });
    expect(inst("t48")).toMatchObject({ status: "DONE", completedLate: false, daysLate: null });
  });

  it("after Thursday, in the same week, it completes the task as late", async () => {
    at("2026-11-28T20:00:00Z"); // Saturday
    inst("t48").status = "OVERDUE";
    const id = await filled();
    const body = await (await SUBMIT(req("POST", {}), { params: { id } })).json();
    expect(body.completedInstanceId).toBe("t48");
    expect(inst("t48")).toMatchObject({ status: "DONE", completedLate: true, daysLate: 2 });
    expect(mem.state.audits.at(-1)).toMatchObject({ instanceId: "t48", action: "completed" });
    expect(mem.state.audits.at(-1)!.note).toContain("2 day(s) late");
  });

  it("a past, overdue week opened from its task: that week's draft, completed late, and the current week's task untouched", async () => {
    const id = await filled({ taskId: "t47" });
    expect(mem.state.records[0].period).toBe("2026-W47");
    const body = await (await SUBMIT(req("POST", { taskId: "t47" }), { params: { id } })).json();
    expect(body.completedInstanceId).toBe("t47");
    expect(inst("t47")).toMatchObject({ status: "DONE", completedLate: true, daysLate: 5, completedBySubmissionId: id }); // due 11/19, done 11/24
    expect(inst("t48").status).toBe("UPCOMING");
    // the current week can still be opened and filled afterwards
    expect((await open()).record).toMatchObject({ period: "2026-W48", status: "draft" });
  });

  it("a task id from another week is not completed by this week's record", async () => {
    const id = await filled();
    const body = await (await SUBMIT(req("POST", { taskId: "t47" }), { params: { id } })).json();
    expect(body.completedInstanceId).toBe("t48");
    expect(inst("t47").status).toBe("OVERDUE");
  });

  it("a week with no task completes nothing, and the submit still succeeds", async () => {
    mem.state.instances = mem.state.instances.filter((i) => i.id !== "t48");
    const id = await filled();
    const res = await SUBMIT(req("POST", {}), { params: { id } });
    expect(res.status).toBe(200);
    expect((await res.json()).completedInstanceId).toBeNull();
    expect(inst("t47").status).toBe("OVERDUE"); // no other week's task was taken instead
    expect(inst("t49").status).toBe("UPCOMING");
  });

  it("a task that was skipped is left alone", async () => {
    inst("t48").status = "SKIPPED";
    const id = await filled();
    const res = await SUBMIT(req("POST", {}), { params: { id } });
    expect(res.status).toBe(200);
    expect((await res.json()).completedInstanceId).toBeNull();
    expect(inst("t48").status).toBe("SKIPPED");
  });
});

describe("mark in progress, by the week's task due date (real route)", () => {
  const mark = (body: Record<string, unknown>) => MARK(new NextRequest("http://localhost/api/task-instances/mark-in-progress", { method: "POST", body: JSON.stringify(body) }));
  it("the page sends the due date the open route gave it, and exactly that week's task is marked", async () => {
    const o = await open();
    const res = await mark({ formKey: "facilities_checklist_624", facilityName: "624", dueDate: o.task!.dueDate });
    expect(await res.json()).toEqual({ id: "t48", status: "IN_PROGRESS" });
    expect(inst("t48").status).toBe("IN_PROGRESS");
    expect(inst("t47").status).toBe("OVERDUE"); // without the due date the oldest overdue task would have been chosen
    expect(inst("other-form").status).toBe("UPCOMING");
  });
  it("for a past week opened from its task, the past week's due date marks the past task", async () => {
    const o = await open({ taskId: "t47" });
    await mark({ formKey: "facilities_checklist_624", facilityName: "624", dueDate: o.task!.dueDate });
    expect(inst("t47").status).toBe("IN_PROGRESS");
    expect(inst("t48").status).toBe("UPCOMING");
  });
  it("a due date with no task marks nothing", async () => {
    expect((await mark({ formKey: "facilities_checklist_624", facilityName: "624", dueDate: "2026-12-10" })).status).toBe(404);
    expect(mem.state.instances.every((i) => i.status !== "IN_PROGRESS")).toBe(true);
  });
});

describe("'Open this period' progress (real provider)", () => {
  const tasks = (...ids: string[]) => ids.map((id) => ({ id, dueDate: inst(id).dueDate, rule: { formKey: "facilities_checklist_624" } }));
  const progress = async (...ids: string[]) => Object.fromEntries(await fetchTaskProgress(tasks(...ids), prisma as never));

  it("checked checks out of live checks, for the draft linked to the task", async () => {
    const o = await open();
    tick();
    await save(o.record.id, { values: [{ itemId: "d1", result: "OK" }, { itemId: "d2", result: "NOT_OK" }, { itemId: "c1", note: "only a note" }], expectedUpdatedAt: o.record.updatedAt });
    expect(await progress("t48")).toEqual({ t48: { done: 2, total: 4 } });
  });

  it("a draft not linked to the task is matched by the task's due date falling inside the draft's week", async () => {
    const o = await open();
    tick();
    await save(o.record.id, { values: [{ itemId: "d1", result: "OK" }], expectedUpdatedAt: o.record.updatedAt });
    mem.state.records[0].linkedInstanceId = null;
    expect(await progress("t48", "t49")).toEqual({ t48: { done: 1, total: 4 } }); // t49's Thursday is in another week
  });

  it("follows the live list: a retired check no longer counts, a new one raises the total", async () => {
    const o = await open();
    tick();
    await save(o.record.id, { values: ALL_OK, expectedUpdatedAt: o.record.updatedAt });
    await edit("d2", { retire: true });
    await ADD(req("POST", { name: "Roof hatch", description: "", groupName: "Roof" }));
    expect(await progress("t48")).toEqual({ t48: { done: 3, total: 4 } });
  });

  it("nothing is shown before anything is checked, or once the record is submitted", async () => {
    await open();
    expect(await progress("t48")).toEqual({});
    const id = await filled({ taskId: "t47" });
    await SUBMIT(req("POST", {}), { params: { id } });
    expect(await progress("t47")).toEqual({});
  });
});

describe("records list and delete", () => {
  it("delete is admin only, reopens the task the record had completed (real code) and removes the record", async () => {
    at("2026-11-28T20:00:00Z");
    const id = await filled();
    await SUBMIT(req("POST", {}), { params: { id } });
    expect(inst("t48").status).toBe("DONE");

    expect((await REMOVE(req("DELETE"), { params: { id } })).status).toBe(403);
    expect(mem.state.records).toHaveLength(1);

    as("ADMIN", "carlos");
    const res = await REMOVE(req("DELETE"), { params: { id } });
    expect(await res.json()).toEqual({ success: true });
    expect(mem.state.records).toHaveLength(0);
    expect(inst("t48")).toMatchObject({ status: "OVERDUE", completedBySubmissionId: null, completedLate: false, daysLate: null }); // due Thursday, today is Saturday
    expect(mem.state.audits.at(-1)).toMatchObject({ instanceId: "t48", action: "reopened", note: "Facilities Checklist record for Nov 23–29, 2026 deleted by admin" });
    expect((await REMOVE(req("DELETE"), { params: { id } })).status).toBe(404);
  });

  it("deleting a draft, or a record whose task was never completed, just removes it", async () => {
    const o = await open();
    as("ADMIN");
    expect((await REMOVE(req("DELETE"), { params: { id: o.record.id } })).status).toBe(200);
    expect(inst("t48").status).toBe("UPCOMING");
    expect(mem.state.audits).toHaveLength(0);
  });

  it("the list returns the records", async () => {
    await open();
    expect(await (await LIST()).json()).toHaveLength(1);
  });
});
