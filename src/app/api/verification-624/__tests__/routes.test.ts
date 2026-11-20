import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── In-memory database ────────────────────────────────────────────────────────
const mem = vi.hoisted(() => {
  type Eq = { id: string; facility: string; section: string; name: string; location: string; inUse: boolean; sortOrder: number; retiredAt: Date | null; testWeight?: number | null; weightUnit?: string | null; tolerance?: number | null };
  type Rec = Record<string, unknown> & { id: string; period: string; status: string; items: unknown[]; updatedAt: Date; initials: string; linkedInstanceId: string | null; periodEnd: Date };
  const state = { equipment: [] as Eq[], records: [] as Rec[], version: 1, seq: 0 };
  return { state };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/task-completion", () => ({ completeRuleInstanceForSubmission: vi.fn(), reopenInstanceForSubmissionDeletion: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const { state } = mem;
  type Eq = (typeof state.equipment)[number];
  const live = (w: { section?: string }) => state.equipment.filter((e) => e.retiredAt === null && (!w.section || e.section === w.section));
  const prisma = {
    verification624Equipment: {
      findMany: vi.fn(async (a: { where: { section?: string } }) => [...live(a.where)].sort((x, y) => x.sortOrder - y.sortOrder)),
      findUnique: vi.fn(async (a: { where: { id: string } }) => state.equipment.find((e) => e.id === a.where.id) ?? null),
      aggregate: vi.fn(async (a: { where: { section?: string } }) => ({ _max: { sortOrder: live(a.where).reduce((m, e) => Math.max(m, e.sortOrder), 0) || null } })),
      count: vi.fn(async () => live({}).filter((e) => e.inUse).length),
      create: vi.fn(async (a: { data: Partial<Eq> }) => { const e = { id: `eq-${++state.seq}`, facility: "624", location: "", inUse: true, sortOrder: 0, retiredAt: null, ...a.data } as Eq; state.equipment.push(e); return e; }),
      update: vi.fn(async (a: { where: { id: string }; data: Partial<Eq> }) => Object.assign(state.equipment.find((e) => e.id === a.where.id)!, a.data)),
    },
    verification624List: {
      findUnique: vi.fn(async () => ({ version: state.version })),
      upsert: vi.fn(async () => ({ version: ++state.version })),
    },
    verification624Record: {
      findUnique: vi.fn(async (a: { where: { id?: string; facility_period?: { period: string } } }) =>
        state.records.find((r) => (a.where.id ? r.id === a.where.id : r.period === a.where.facility_period!.period)) ?? null),
      findMany: vi.fn(async () => state.records),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        const r = { id: `rec-${++state.seq}`, initials: "", notes: null, okCount: 0, failCount: 0, notInUseCount: 0, updatedAt: new Date(), ...a.data } as unknown as (typeof state.records)[number];
        state.records.push(r); return r;
      }),
      updateMany: vi.fn(async (a: { where: { id: string; status: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        const r = state.records.find((x) => x.id === a.where.id && x.status === a.where.status && x.updatedAt.getTime() === a.where.updatedAt.getTime());
        if (!r) return { count: 0 };
        Object.assign(r, a.data); return { count: 1 };
      }),
      delete: vi.fn(async (a: { where: { id: string } }) => { state.records = state.records.filter((r) => r.id !== a.where.id); return {}; }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return { prisma };
});

import { getServerSession } from "next-auth";
import { completeRuleInstanceForSubmission, reopenInstanceForSubmissionDeletion } from "@/lib/task-completion";
import { GET as LIST, POST as OPEN } from "@/app/api/verification-624/route";
import { GET as READ, PATCH as SAVE, DELETE as REMOVE } from "@/app/api/verification-624/[id]/route";
import { POST as SUBMIT } from "@/app/api/verification-624/[id]/submit/route";
import { GET as EQUIPMENT, POST as ADD } from "@/app/api/verification-624/equipment/route";
import { PATCH as EDIT } from "@/app/api/verification-624/equipment/[id]/route";
import { splitStored, type ItemSnapshot, type ItemValues } from "@/lib/verification-624";

type MockFn = ReturnType<typeof vi.fn>;
const session = getServerSession as unknown as MockFn;
const complete = completeRuleInstanceForSubmission as unknown as MockFn;
const reopen = reopenInstanceForSubmissionDeletion as unknown as MockFn;
const as = (role: string | null, id = "hugo") => session.mockResolvedValue(role ? { user: { id, role, name: "Hugo Ayala", email: "hugo@example.com" } } : null);
const req = (method: string, body?: unknown) => new NextRequest("http://localhost/api/verification-624", { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const tick = (ms = 1000) => vi.setSystemTime(new Date(Date.now() + ms));

function seed() {
  const add = (id: string, section: string, name: string, sortOrder: number, inUse = true) =>
    mem.state.equipment.push({ id, facility: "624", section, name, location: section === "scale" ? "624 Garrison" : "", inUse, sortOrder, retiredAt: null });
  add("p1", "portable_thermometer", "Dial Probe Thermometer", 10);
  add("p2", "portable_thermometer", "Dial Oven Thermometer", 20);
  add("p3", "portable_thermometer", "Dial Oven Thermometer #2", 30, false);
  add("f1", "fixed_thermometer", "Cold Room Thermometer", 10);
  add("s1", "scale", "Digital Scale", 10);
}
const COMPLETE: ItemValues[] = [
  { equipmentId: "p1", reading: 32 },
  { equipmentId: "p2", reading: 36, recheck: 32.2, correctiveAction: "Recalibrated the dial" },
  { equipmentId: "f1", referenceId: "p1", target: 38, fixedReading: 39.5 },
  { equipmentId: "s1", points: [1.1, 1.1, 1.1, 1.1, 1.1] },
];
async function openDraft(taskId: string | null = null) {
  const data = await (await OPEN(req("POST", { taskId }))).json();
  return data.record as { id: string; updatedAt: string; period: string; status: string };
}
const save = async (id: string, body: Record<string, unknown>) => SAVE(req("PATCH", body), { params: { id } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-11-20T18:00:00Z")); // 10:00 Pacific, second half of November
  mem.state.equipment = []; mem.state.records = []; mem.state.version = 1; mem.state.seq = 0;
  seed();
  as("SUPERVISOR");
  complete.mockResolvedValue("task-nov-b");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("opening the form", () => {
  it("creates one draft for the current half-month and returns the live list", async () => {
    const res = await OPEN(req("POST", { taskId: "task-nov-b" }));
    const data = await res.json();
    expect(data.record).toMatchObject({ period: "2026-11-B", status: "draft", linkedInstanceId: "task-nov-b", listVersion: 1 });
    expect(new Date(data.record.periodEnd).toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(data.equipment.map((e: { id: string }) => e.id)).toEqual(["p1", "p2", "p3", "f1", "s1"]);
    await OPEN(req("POST", {}));
    expect(mem.state.records).toHaveLength(1); // unique per facility and period
  });

  it("first half of the month gets period A, due on the 15th", async () => {
    vi.setSystemTime(new Date("2026-12-03T18:00:00Z"));
    const r = await openDraft();
    expect(r.period).toBe("2026-12-A");
    expect((mem.state.records[0].periodEnd as Date).toISOString().slice(0, 10)).toBe("2026-12-15");
  });

  it("needs a signed-in supervisor or admin", async () => {
    as(null);
    expect((await OPEN(req("POST", {}))).status).toBe(401);
    expect((await LIST()).status).toBe(401);
    as("VIEWER");
    expect((await OPEN(req("POST", {}))).status).toBe(403);
  });
});

describe("draft autosave", () => {
  it("saves values keyed by equipment id, stamps checkedAt, updates the counts", async () => {
    const draft = await openDraft();
    tick();
    const res = await save(draft.id, { values: COMPLETE, initials: "hga", date: "2026-11-20", time: "10:05", expectedUpdatedAt: draft.updatedAt });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.progress).toEqual({ verified: 4, total: 4, ok: 3, notOk: 1, notInUse: 1 });
    const stored = splitStored(mem.state.records[0].items);
    expect(stored.entries.map((v) => v.equipmentId)).toEqual(["p1", "p2", "f1", "s1"]);
    expect(stored.entries.every((v) => v.checkedAt === "2026-11-20T18:00:01.000Z")).toBe(true);
    expect(stored.header).toEqual({ kind: "header", date: "2026-11-20", time: "10:05" });
    expect(mem.state.records[0]).toMatchObject({ initials: "HGA", okCount: 3, failCount: 1, notInUseCount: 1 });
  });

  it("returns 409 with the server copy when another save came in meanwhile, and writes nothing", async () => {
    const draft = await openDraft();
    tick();
    const first = await (await save(draft.id, { values: [{ equipmentId: "p1", reading: 32 }], expectedUpdatedAt: draft.updatedAt })).json();
    tick();
    const stale = await save(draft.id, { values: [{ equipmentId: "p1", reading: 99 }], expectedUpdatedAt: draft.updatedAt }); // still the old timestamp
    const body = await stale.json();

    expect(stale.status).toBe(409);
    expect(body.code).toBe("conflict");
    expect(splitStored(body.record.items).entries[0].reading).toBe(32);
    expect(splitStored(mem.state.records[0].items).entries[0].reading).toBe(32);
    // with the fresh timestamp the save goes through
    expect((await save(draft.id, { values: [{ equipmentId: "p1", reading: 31.5 }], expectedUpdatedAt: first.updatedAt })).status).toBe(200);
  });

  it("drops values for equipment that is no longer on the live list", async () => {
    const draft = await openDraft();
    tick();
    await save(draft.id, { values: [...COMPLETE, { equipmentId: "gone", reading: 32 }], expectedUpdatedAt: draft.updatedAt });
    expect(splitStored(mem.state.records[0].items).entries.map((v) => v.equipmentId)).not.toContain("gone");
  });

  it("a submitted record can no longer be saved", async () => {
    const draft = await openDraft();
    mem.state.records[0].status = "submitted";
    const res = await save(draft.id, { values: COMPLETE });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already_submitted");
  });
});

describe("editing the equipment list", () => {
  it.each(["ADMIN", "SUPERVISOR"])("%s may add, rename, change in-use, move and retire; each change bumps the list version", async (role) => {
    as(role);
    const added = await (await ADD(req("POST", { section: "scale", name: "  Floor Scale ", location: "Dock" }))).json();
    expect(added.listVersion).toBe(2);
    expect(added.equipment.at(-1)).toMatchObject({ section: "scale", name: "Floor Scale", location: "Dock", sortOrder: 20, inUse: true });

    const renamed = await (await EDIT(req("PATCH", { name: "Cold Room Thermometer (door)" }), { params: { id: "f1" } })).json();
    expect(renamed.listVersion).toBe(3);
    expect(renamed.equipment.find((e: { id: string }) => e.id === "f1").name).toBe("Cold Room Thermometer (door)");

    const toggled = await (await EDIT(req("PATCH", { inUse: true }), { params: { id: "p3" } })).json();
    expect(toggled.equipment.find((e: { id: string }) => e.id === "p3").inUse).toBe(true);

    const moved = await (await EDIT(req("PATCH", { move: "up" }), { params: { id: "p2" } })).json();
    expect(moved.equipment.filter((e: { section: string }) => e.section === "portable_thermometer").map((e: { id: string }) => e.id)).toEqual(["p2", "p1", "p3"]);

    const retired = await (await EDIT(req("PATCH", { retire: true }), { params: { id: "s1" } })).json();
    expect(retired.listVersion).toBe(6);
    expect(retired.equipment.map((e: { id: string }) => e.id)).not.toContain("s1");
    expect(mem.state.equipment.find((e) => e.id === "s1")!.retiredAt).toBeInstanceOf(Date); // retired, not deleted
    expect(mem.state.equipment).toHaveLength(6);
  });

  it("anyone else is refused and nothing changes", async () => {
    as(null);
    expect((await ADD(req("POST", { section: "scale", name: "X" }))).status).toBe(401);
    expect((await EDIT(req("PATCH", { retire: true }), { params: { id: "s1" } })).status).toBe(401);
    expect((await EQUIPMENT()).status).toBe(401);
    as("VIEWER");
    expect((await ADD(req("POST", { section: "scale", name: "X" }))).status).toBe(403);
    expect((await EDIT(req("PATCH", { name: "X" }), { params: { id: "s1" } })).status).toBe(403);
    expect(mem.state.equipment).toHaveLength(5);
    expect(mem.state.version).toBe(1);
  });

  it("rejects an empty name, an unknown section, and a retired or unknown item", async () => {
    expect((await ADD(req("POST", { section: "scale", name: "  " }))).status).toBe(400);
    expect((await ADD(req("POST", { section: "oven", name: "X" }))).status).toBe(400);
    expect((await EDIT(req("PATCH", { name: " " }), { params: { id: "s1" } })).status).toBe(400);
    await EDIT(req("PATCH", { retire: true }), { params: { id: "s1" } });
    expect((await EDIT(req("PATCH", { name: "Back again" }), { params: { id: "s1" } })).status).toBe(404);
    expect((await EDIT(req("PATCH", { name: "X" }), { params: { id: "nope" } })).status).toBe(404);
  });

  it("the open draft follows the live list: retiring an item with values drops them on the next save", async () => {
    const draft = await openDraft();
    tick();
    const saved = await (await save(draft.id, { values: COMPLETE, expectedUpdatedAt: draft.updatedAt })).json();
    await EDIT(req("PATCH", { retire: true }), { params: { id: "s1" } });
    await ADD(req("POST", { section: "portable_thermometer", name: "Infrared Thermometer" }));

    const reopened = await (await READ(req("GET"), { params: { id: draft.id } })).json();
    expect(reopened.equipment.map((e: { name: string }) => e.name)).toContain("Infrared Thermometer");
    expect(reopened.equipment.map((e: { id: string }) => e.id)).not.toContain("s1");

    tick();
    const after = await (await save(draft.id, { values: COMPLETE, expectedUpdatedAt: saved.updatedAt })).json();
    expect(after.values.map((v: ItemValues) => v.equipmentId)).toEqual(["p1", "p2", "f1"]);
    expect(after.progress.total).toBe(4); // p1, p2, f1 and the new blank item
    expect(mem.state.records[0].listVersion).toBe(3);
  });
});

describe("submit", () => {
  async function filled(values: ItemValues[] = COMPLETE, initials = "HGA") {
    const draft = await openDraft("task-nov-b");
    tick();
    await save(draft.id, { values, initials, date: "2026-11-20", time: "10:05", expectedUpdatedAt: draft.updatedAt });
    tick();
    return draft.id;
  }

  it("says in plain words what is missing and writes nothing", async () => {
    const id = await filled([{ equipmentId: "p1", reading: 32 }, { equipmentId: "p2", reading: 36 }], "");
    const res = await SUBMIT(req("POST", {}), { params: { id } });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.problems).toEqual([
      "Enter your initials at the top.",
      "Dial Oven Thermometer is Not OK and needs a corrective action.",
      "Cold Room Thermometer needs a reference thermometer.",
      "Digital Scale needs all five weight readings.",
    ]);
    expect(mem.state.records[0].status).toBe("draft");
    expect(complete).not.toHaveBeenCalled();
  });

  it("stores a full snapshot and completes that period's task (task id and the period's due date)", async () => {
    const id = await filled();
    const res = await SUBMIT(req("POST", {}), { params: { id } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, completedInstanceId: "task-nov-b" });

    const rec = mem.state.records[0];
    expect(rec).toMatchObject({ status: "submitted", okCount: 3, failCount: 1, notInUseCount: 1, conductedBy: "Hugo Ayala", submittedById: "hugo", listVersion: 1 });
    const { snapshots, header } = splitStored(rec.items);
    expect(snapshots.map((s: ItemSnapshot) => [s.name, s.inUse, s.result])).toEqual([
      ["Dial Probe Thermometer", true, "OK"], ["Dial Oven Thermometer", true, "NOT_OK"], ["Dial Oven Thermometer #2", false, null],
      ["Cold Room Thermometer", true, "OK"], ["Digital Scale", true, "OK"],
    ]);
    expect(snapshots[3]).toMatchObject({ referenceId: "p1", referenceName: "Dial Probe Thermometer", target: 38, fixedReading: 39.5 });
    expect(snapshots[1].checkedAt).toBe("2026-11-20T18:00:01.000Z");
    expect(header).toEqual({ kind: "header", date: "2026-11-20", time: "10:05", instructionsVer: "v1.1" });
    expect(complete.mock.calls[0][0]).toMatchObject({ formKey: "verification_624", facilityName: "624", submissionId: id, submissionDate: "2026-11-30", taskId: "task-nov-b", userId: "hugo" });
  });

  it("old records are unchanged by later edits to the equipment list", async () => {
    const id = await filled();
    await SUBMIT(req("POST", {}), { params: { id } });
    const before = JSON.stringify(mem.state.records[0].items);

    await EDIT(req("PATCH", { name: "Renamed afterwards" }), { params: { id: "p1" } });
    await EDIT(req("PATCH", { retire: true }), { params: { id: "s1" } });
    await EDIT(req("PATCH", { inUse: false }), { params: { id: "f1" } });

    expect(JSON.stringify(mem.state.records[0].items)).toBe(before);
    const read = await (await READ(req("GET"), { params: { id } })).json();
    expect(splitStored(read.record.items).snapshots.map((s) => s.name)).toEqual([
      "Dial Probe Thermometer", "Dial Oven Thermometer", "Dial Oven Thermometer #2", "Cold Room Thermometer", "Digital Scale",
    ]);
    expect(read.equipment).toEqual([]); // a submitted record is read from its own snapshot
  });

  it("cannot be submitted twice; a failed task completion does not fail the submit", async () => {
    complete.mockRejectedValue(new Error("db hiccup"));
    const id = await filled();
    expect((await SUBMIT(req("POST", {}), { params: { id } })).status).toBe(200);
    expect((await SUBMIT(req("POST", {}), { params: { id } })).status).toBe(409);
  });
});

describe("records list and delete", () => {
  it("delete is admin only, reopens the task and removes the record", async () => {
    const draft = await openDraft();
    expect((await REMOVE(req("DELETE"), { params: { id: draft.id } })).status).toBe(403);
    expect(mem.state.records).toHaveLength(1);

    as("ADMIN", "carlos");
    const res = await REMOVE(req("DELETE"), { params: { id: draft.id } });
    expect(await res.json()).toEqual({ success: true });
    expect(reopen.mock.calls[0][0]).toMatchObject({ submissionId: draft.id, userId: "carlos" });
    expect(mem.state.records).toHaveLength(0);
  });

  it("if the task cannot be reopened the record is still deleted and a warning is returned", async () => {
    const draft = await openDraft();
    as("ADMIN");
    reopen.mockRejectedValue(new Error("nope"));
    const body = await (await REMOVE(req("DELETE"), { params: { id: draft.id } })).json();
    expect(body.success).toBe(true);
    expect(body.warning).toContain("could not be reopened");
  });

  it("the list returns the records", async () => {
    await openDraft();
    expect(await (await LIST()).json()).toHaveLength(1);
  });
});

// ── Per-item limits: test weight, unit and tolerance ────────────────────────────
describe("per-item limits", () => {
  const G500 = { testWeight: 500, weightUnit: "g", tolerance: 45 };
  const find = (id: string) => mem.state.equipment.find((e) => e.id === id)!;
  const edit = (id: string, body: Record<string, unknown>) => EDIT(req("PATCH", body), { params: { id } });
  const grams = (n: number, weight: number) => ({ points: [n, n, n, n, n], pointsUnit: "g", pointsWeight: weight });
  /** The list as it is in production: every item has its own limits. */
  function withLimits() {
    Object.assign(find("p1"), { tolerance: 1 }); Object.assign(find("p2"), { tolerance: 1 }); Object.assign(find("p3"), { tolerance: 1 });
    Object.assign(find("f1"), { tolerance: 5 }); Object.assign(find("s1"), G500);
    mem.state.equipment.push({ id: "k1", facility: "624", section: "scale", name: "Kitchen Scale 1", location: "624 Garrison", inUse: true, sortOrder: 20, retiredAt: null, testWeight: 50, weightUnit: "g", tolerance: 1 });
  }
  const FILLED: ItemValues[] = [
    { equipmentId: "p1", reading: 32 }, { equipmentId: "p2", reading: 32.5 },
    { equipmentId: "f1", referenceId: "p1", target: 38, fixedReading: 39.5 },
    { equipmentId: "s1", ...grams(520, 500) }, { equipmentId: "k1", ...grams(50, 50) },
  ];

  it("a new item starts with the standard limits: scale 500 g ± 45, portable ± 1.0 °F, non-movable ± 5.0 °F", async () => {
    const list = (await (await ADD(req("POST", { section: "scale", name: "Floor Scale", location: "Dock" }))).json()).equipment;
    expect(list.at(-1)).toMatchObject({ name: "Floor Scale", testWeight: 500, weightUnit: "g", tolerance: 45 });
    await ADD(req("POST", { section: "portable_thermometer", name: "Infrared" }));
    await ADD(req("POST", { section: "fixed_thermometer", name: "Walk-in" }));
    expect(mem.state.equipment.find((e) => e.name === "Infrared")).toMatchObject({ tolerance: 1, testWeight: null, weightUnit: null });
    expect(mem.state.equipment.find((e) => e.name === "Walk-in")).toMatchObject({ tolerance: 5, testWeight: null, weightUnit: null });
  });

  it.each(["ADMIN", "SUPERVISOR"])("%s may change a scale's test weight, unit and tolerance and a thermometer's tolerance; each change bumps the list version", async (role) => {
    withLimits(); as(role);
    const res = await edit("k1", { testWeight: 100, weightUnit: "g", tolerance: 2 });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.listVersion).toBe(2);
    expect(body.equipment.find((e: { id: string }) => e.id === "k1")).toMatchObject({ testWeight: 100, weightUnit: "g", tolerance: 2 });

    expect((await edit("s1", { testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 })).status).toBe(200);
    expect(find("s1")).toMatchObject({ testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 });
    expect((await edit("s1", { tolerance: 0.05 })).status).toBe(200); // tolerance alone: weight and unit stay
    expect(find("s1")).toMatchObject({ testWeight: 1.1, weightUnit: "lb", tolerance: 0.05 });

    expect((await edit("p1", { tolerance: 0.5 })).status).toBe(200);
    expect((await edit("f1", { tolerance: 3 })).status).toBe(200);
    expect(find("p1").tolerance).toBe(0.5);
    expect(find("f1").tolerance).toBe(3);
    expect(mem.state.version).toBe(6);
  });

  it("anyone else is refused and no limit changes", async () => {
    withLimits();
    as(null);
    expect((await edit("k1", { testWeight: 100, weightUnit: "g", tolerance: 2 })).status).toBe(401);
    as("VIEWER");
    expect((await edit("k1", { testWeight: 100, weightUnit: "g", tolerance: 2 })).status).toBe(403);
    expect((await edit("p1", { tolerance: 9 })).status).toBe(403);
    expect(find("k1")).toMatchObject({ testWeight: 50, tolerance: 1 });
    expect(find("p1").tolerance).toBe(1);
    expect(mem.state.version).toBe(1);
  });

  it("limits that make no sense are refused with a clear message and nothing is saved", async () => {
    withLimits();
    const refuse = async (id: string, body: Record<string, unknown>) => { const r = await edit(id, body); return [r.status, (await r.json()).error]; };
    expect(await refuse("k1", { testWeight: 0 })).toEqual([400, "The test weight must be a number greater than 0."]);
    expect(await refuse("k1", { testWeight: -50 })).toEqual([400, "The test weight must be a number greater than 0."]);
    expect(await refuse("k1", { testWeight: "abc" })).toEqual([400, "The test weight must be a number greater than 0."]);
    expect(await refuse("k1", { tolerance: 0 })).toEqual([400, "The tolerance must be a number greater than 0."]);
    expect(await refuse("k1", { tolerance: 50 })).toEqual([400, "The tolerance must be smaller than the test weight."]);
    expect(await refuse("k1", { testWeight: 0.5 })).toEqual([400, "The tolerance must be smaller than the test weight."]); // against the tolerance it already has
    expect(await refuse("k1", { weightUnit: "kg" })).toEqual([400, "Choose a unit: g, lb or oz."]);
    expect(await refuse("k1", { testWeight: 50.25 })).toEqual([400, "Test weight: Use at most 1 decimal for grams."]);
    expect(await refuse("p1", { tolerance: 10.5 })).toEqual([400, "The tolerance cannot be more than 10 °F."]);
    expect(await refuse("f1", { tolerance: 11 })).toEqual([400, "The tolerance cannot be more than 10 °F."]);
    expect(await refuse("f1", { tolerance: -1 })).toEqual([400, "The tolerance must be a number greater than 0."]);
    expect(await refuse("p1", { tolerance: null })).toEqual([400, "The tolerance must be a number greater than 0."]);
    expect(find("k1")).toMatchObject({ testWeight: 50, weightUnit: "g", tolerance: 1 });
    expect(mem.state.version).toBe(1);
  });

  it("a thermometer never gets a test weight or a unit; the ice water target is not editable", async () => {
    withLimits();
    expect((await edit("p1", { testWeight: 40, weightUnit: "g", target: 40, tolerance: 2 })).status).toBe(200);
    expect(find("p1")).toMatchObject({ tolerance: 2, testWeight: null, weightUnit: null });
    expect(find("p1")).not.toHaveProperty("target");
    expect((await edit("p1", { testWeight: 40 })).status).toBe(200); // ignored, nothing to validate
    expect(find("p1").tolerance).toBe(2);
  });

  it("changing ONLY a tolerance keeps the readings of the open draft and re-evaluates the result", async () => {
    withLimits();
    const draft = await openDraft();
    tick();
    const first = await (await save(draft.id, { values: FILLED, initials: "HA", date: "2026-11-20", time: "10:05", expectedUpdatedAt: draft.updatedAt })).json();
    expect(first.progress).toMatchObject({ ok: 5, notOk: 0 }); // 520 g is inside 500 ± 45

    await edit("s1", { tolerance: 10 });
    tick();
    const second = await (await save(draft.id, { values: FILLED, expectedUpdatedAt: first.updatedAt })).json();
    const s1 = second.values.find((v: ItemValues) => v.equipmentId === "s1");
    expect(s1.points).toEqual([520, 520, 520, 520, 520]); // kept
    expect(s1.previousPoints).toBeUndefined();
    expect(second.progress).toMatchObject({ ok: 4, notOk: 1 }); // 520 g is outside 500 ± 10

    await edit("p2", { tolerance: 0.4 });
    tick();
    const third = await (await save(draft.id, { values: FILLED, expectedUpdatedAt: second.updatedAt })).json();
    expect(third.values.find((v: ItemValues) => v.equipmentId === "p2").reading).toBe(32.5);
    expect(third.progress).toMatchObject({ ok: 3, notOk: 2 });
  });

  it("changing a scale's unit: its readings in the draft are set aside unconverted, only for that scale, and submit waits for new ones", async () => {
    withLimits();
    const draft = await openDraft();
    tick();
    const first = await (await save(draft.id, { values: FILLED, initials: "HA", date: "2026-11-20", time: "10:05", expectedUpdatedAt: draft.updatedAt })).json();

    await edit("s1", { testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 });
    tick();
    const second = await (await save(draft.id, { values: FILLED, expectedUpdatedAt: first.updatedAt })).json();
    const s1 = second.values.find((v: ItemValues) => v.equipmentId === "s1");
    expect(s1.points).toBeUndefined();
    expect(s1).toMatchObject({ previousPoints: [520, 520, 520, 520, 520], previousUnit: "g", previousWeight: 500, checkedAt: null });
    expect(second.values.find((v: ItemValues) => v.equipmentId === "k1").points).toEqual([50, 50, 50, 50, 50]); // the other scale is untouched
    expect(second.progress).toMatchObject({ verified: 4, ok: 4 });

    tick();
    const blocked = await SUBMIT(req("POST", {}), { params: { id: draft.id } });
    expect(blocked.status).toBe(422);
    expect((await blocked.json()).problems).toEqual(["Digital Scale needs its five weight readings entered again in lb (the earlier g readings were not converted)."]);
  });

  it("the draft that was open when the scales moved to grams: lb readings kept aside, then re-entered in grams and submitted with its limits", async () => {
    const draft = await openDraft();
    tick();
    // saved while every scale was still read in lb (no limits on the list, no unit recorded with the readings)
    const before = await (await save(draft.id, { values: COMPLETE, initials: "HA", date: "2026-11-20", time: "11:10", expectedUpdatedAt: draft.updatedAt })).json();
    expect(before.progress).toMatchObject({ ok: 3, notOk: 1 });

    withLimits();
    find("k1").inUse = false;
    const reopened = await (await READ(req("GET"), { params: { id: draft.id } })).json();
    expect(reopened.equipment.find((e: { id: string }) => e.id === "s1")).toMatchObject(G500);
    expect(splitStored(reopened.record.items).entries.find((v) => v.equipmentId === "s1")!.points).toEqual([1.1, 1.1, 1.1, 1.1, 1.1]); // the stored draft itself was not touched

    tick();
    const reentered = COMPLETE.map((v) => (v.equipmentId === "s1" ? { equipmentId: "s1", ...grams(500, 500) } : v));
    const after = await (await save(draft.id, { values: reentered, expectedUpdatedAt: before.updatedAt })).json();
    expect(after.progress).toMatchObject({ ok: 3, notOk: 1, notInUse: 2 });

    tick();
    expect((await SUBMIT(req("POST", {}), { params: { id: draft.id } })).status).toBe(200);
    const { snapshots, header } = splitStored(mem.state.records[0].items);
    expect(snapshots.find((s: ItemSnapshot) => s.equipmentId === "s1")).toMatchObject({ weightUnit: "g", testWeight: 500, tolerance: 45, points: [500, 500, 500, 500, 500], result: "OK" });
    expect(snapshots.find((s: ItemSnapshot) => s.equipmentId === "p1")).toMatchObject({ tolerance: 1, reading: 32 });
    expect(snapshots.find((s: ItemSnapshot) => s.equipmentId === "f1")).toMatchObject({ tolerance: 5 });
    expect(snapshots.find((s: ItemSnapshot) => s.equipmentId === "k1")).toMatchObject({ inUse: false, weightUnit: "g", testWeight: 50, tolerance: 1 });
    expect(header).toMatchObject({ instructionsVer: "v1.1" });

    // a later change of limits does not alter the submitted record
    const frozen = JSON.stringify(mem.state.records[0].items);
    await edit("s1", { testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 });
    await edit("p1", { tolerance: 0.2 });
    expect(JSON.stringify(mem.state.records[0].items)).toBe(frozen);
  });
});
