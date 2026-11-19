import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory database that enforces the real unique index (ruleId, dueDate, label) ──
const db = vi.hoisted(() => {
  type Row = {
    id: string; ruleId: string; dueDate: Date; label: string; calendarKey: string | null; status: string;
    completedBySubmissionId: string | null; sortKey: number | null; createdAt: Date; needsAdminReview: boolean; source: string; ownerUserId: null;
  };
  const state = { rows: [] as Row[], seq: 0, log: [] as string[] };
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const clash = (r: { ruleId: string; dueDate: Date; label: string }, selfId?: string) =>
    state.rows.some((x) => x.id !== selfId && x.ruleId === r.ruleId && day(x.dueDate) === day(r.dueDate) && x.label === r.label);
  return { state, day, clash };
});

vi.mock("@/lib/prisma", () => {
  const { state, clash } = db;
  return {
    prisma: {
      facility: { findMany: vi.fn(async () => [{ id: "fac-jb", name: "Julian Bakery", calendarTabName: "Julian Bakery" }]), update: vi.fn(async () => ({})) },
      taskRule: { findMany: vi.fn() },
      ruleInstance: {
        findMany: vi.fn(async (a: { where: { ruleId: { in: string[] } } }) => state.rows.filter((r) => a.where.ruleId.in.includes(r.ruleId)).map((r) => ({ ...r }))),
        count: vi.fn(async () => state.rows.length),
        createMany: vi.fn(async (a: { data: Array<Partial<(typeof state.rows)[number]> & { ruleId: string; dueDate: Date; label: string }> }) => {
          let count = 0;
          for (const d of a.data) {
            if (clash(d)) { state.log.push(`insert skipped (duplicate label): ${d.label}`); continue; }
            state.rows.push({ id: `new-${++state.seq}`, calendarKey: null, status: "UPCOMING", completedBySubmissionId: null, sortKey: null, createdAt: new Date(), needsAdminReview: false, source: "SCHEDULE", ownerUserId: null, ...d } as (typeof state.rows)[number]);
            state.log.push(`created: ${d.label || d.calendarKey}`);
            count++;
          }
          return { count };
        }),
        deleteMany: vi.fn(async (a: { where: { id: { in: string[] } } }) => {
          for (const id of a.where.id.in) state.log.push(`deleted: ${id}`);
          state.rows = state.rows.filter((r) => !a.where.id.in.includes(r.id));
          return { count: a.where.id.in.length };
        }),
        updateMany: vi.fn(async (a: { where: { id: { in: string[] } }; data: { needsAdminReview?: boolean } }) => {
          for (const r of state.rows) if (a.where.id.in.includes(r.id) && a.data.needsAdminReview) { r.needsAdminReview = true; state.log.push(`flagged: ${r.id}`); }
          return { count: a.where.id.in.length };
        }),
        update: vi.fn(async (a: { where: { id: string }; data: { label?: string; sortKey?: number | null } }) => {
          const r = state.rows.find((x) => x.id === a.where.id)!;
          if (a.data.label !== undefined) {
            if (clash({ ...r, label: a.data.label }, r.id)) throw new Error("Unique constraint failed on (ruleId, dueDate, label)");
            state.log.push(`label: ${r.id} "${r.label}" → "${a.data.label}"`);
            r.label = a.data.label;
          }
          if (a.data.sortKey !== undefined) { state.log.push(`position: ${r.id} ${r.sortKey} → ${a.data.sortKey}`); r.sortKey = a.data.sortKey; }
          return r;
        }),
      },
      notification: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    },
  };
});
vi.mock("@/lib/google-sheets-fetcher", () => ({ fetchSheetRows: vi.fn(async () => ({ rows: [] })), invalidateSheetCache: vi.fn() }));
vi.mock("@/lib/sheet-parser", () => ({ parseDaysInRange: vi.fn() }));
vi.mock("@/lib/pacific-time", () => ({
  getPacificToday: vi.fn(() => "2026-11-19"),
  addDaysToDateStr: vi.fn((date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }),
}));

import { generateCalendarInstances } from "@/lib/calendar-generator";
import { keyIdentity, productSlug } from "@/lib/calendar-plan";
import { productNameFromTaskLabel } from "@/lib/product-name";
import { prisma } from "@/lib/prisma";
import { parseDaysInRange } from "@/lib/sheet-parser";

const BATCH = { id: "rule-batch", triggerType: "PRODUCTION_ANY", productName: null, ownerId: "ivan", facilityId: "fac-jb" };
const PREOP = { id: "rule-preop", triggerType: "PRODUCTION_DAY", productName: null, ownerId: "ivan", facilityId: "fac-jb" };
const D = "2026-11-23";

type Item = { item_type: string; product_name: string; base_unit_count: number | null; base_unit_label: string | null };
/** "Name (2 Bowls)" → a sheet line */
const line = (text: string): Item => {
  const m = text.match(/^(.*?)\s*\((\d+)\s*([^()]*)\)$/);
  return m ? { item_type: "production", product_name: m[1], base_unit_count: Number(m[2]), base_unit_label: m[3] || null }
           : { item_type: "production", product_name: text, base_unit_count: null, base_unit_label: null };
};
const sheet = (days: Record<string, string[]>) =>
  (parseDaysInRange as ReturnType<typeof vi.fn>).mockReturnValue(Object.entries(days).map(([iso_date, lines]) => ({ iso_date, items: lines.map(line) })));

let n = 0;
function seed(id: string, label: string, key: string, over: Partial<(typeof db.state.rows)[number]> = {}) {
  const date = /^(?:prod|day):(\d{4}-\d{2}-\d{2})/.exec(key)![1];
  db.state.rows.push({
    id, ruleId: key.startsWith("day:") ? PREOP.id : BATCH.id, dueDate: new Date(date + "T00:00:00Z"), label, calendarKey: key, status: "UPCOMING",
    completedBySubmissionId: null, sortKey: null, createdAt: new Date(Date.UTC(2026, 10, 13, 0, 0, n++)), needsAdminReview: false, source: "SCHEDULE", ownerUserId: null, ...over,
  });
}
const PREMIX = "PreMix Powder - Egg Chocolate (2 Bowls)";
const GRANOLA = "ProGranola - Chocolate (30 Bowls)";
/** The real 2026-11-23 rows: premix at position 0, granola at position 1, old-shape keys. */
function seedRealDay() {
  seed("preop", "", `day:${D}`);
  seed("premix", PREMIX, `prod:${D}:premix-powder---egg-chocolate:0`, { sortKey: 0 });
  seed("granola", GRANOLA, `prod:${D}:progranola---chocolate:1`, { sortKey: 1 });
}
const sync = () => generateCalendarInstances({});
const snapshot = () => db.state.rows.map((r) => `${r.id}|${r.label}|${r.calendarKey}|${r.status}|${r.sortKey}|${r.needsAdminReview}`).sort();
const row = (id: string) => db.state.rows.find((r) => r.id === id)!;
const writes = (kind: string) => db.state.log.filter((l) => l.startsWith(kind));

beforeEach(() => {
  process.env.GOOGLE_SHEETS_API_KEY = "test-key";
  vi.clearAllMocks();
  db.state.rows = []; db.state.seq = 0; db.state.log = []; n = 0;
  (prisma as unknown as { taskRule: { findMany: ReturnType<typeof vi.fn> } }).taskRule.findMany.mockResolvedValue([BATCH, PREOP]);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("reordering lines never creates, deletes or flags a task", () => {
  it("swap the two lines: same tasks, only their positions change", async () => {
    seedRealDay();
    sheet({ [D]: [GRANOLA, PREMIX] });
    const result = await sync();

    expect(result).toMatchObject({ totalCreated: 0, totalDeleted: 0, totalFlagged: 0 });
    expect(db.state.rows.map((r) => r.id).sort()).toEqual(["granola", "premix", "preop"]);
    expect([row("granola").sortKey, row("premix").sortKey]).toEqual([0, 1]);
    expect(writes("created").concat(writes("deleted"), writes("flagged"), writes("label"))).toEqual([]);
  });

  it("insert a production at the top: one new task, the others keep their ids and move down", async () => {
    seedRealDay();
    sheet({ [D]: ["Organic Seed Crackers - Parmesan (4 Bowls)", PREMIX, GRANOLA] });
    const result = await sync();

    expect(result).toMatchObject({ totalCreated: 1, totalDeleted: 0, totalFlagged: 0 });
    const created = db.state.rows.find((r) => r.id.startsWith("new-"))!;
    expect(created).toMatchObject({ label: "Organic Seed Crackers - Parmesan (4 Bowls)", calendarKey: `prod:${D}:organic-seed-crackers---parmesan:0`, sortKey: 0 });
    expect([row("premix").sortKey, row("granola").sortKey]).toEqual([1, 2]);
  });

  it("remove a line: only that task is deleted", async () => {
    seedRealDay();
    sheet({ [D]: [GRANOLA] });
    const result = await sync();

    expect(result).toMatchObject({ totalCreated: 0, totalDeleted: 1, totalFlagged: 0 });
    expect(writes("deleted")).toEqual(["deleted: premix"]);
    expect(row("granola")).toMatchObject({ sortKey: 0, label: GRANOLA });
  });

  it("a started task and a done task survive an insert above them without being flagged", async () => {
    seed("preop", "", `day:${D}`);
    seed("premix", PREMIX, `prod:${D}:premix-powder---egg-chocolate:0`, { sortKey: 0, status: "IN_PROGRESS" });
    seed("granola", GRANOLA, `prod:${D}:progranola---chocolate:1`, { sortKey: 1, status: "DONE", completedBySubmissionId: "sheet-1" });
    sheet({ [D]: ["Whole Grain Bread (1 Bowl)", GRANOLA, PREMIX] });
    const result = await sync();

    expect(result).toMatchObject({ totalCreated: 1, totalDeleted: 0, totalFlagged: 0 });
    expect(row("premix")).toMatchObject({ status: "IN_PROGRESS", needsAdminReview: false, sortKey: 2 });
    expect(row("granola")).toMatchObject({ status: "DONE", needsAdminReview: false, sortKey: 1 });
  });
});

describe("same product twice in a day", () => {
  it("different quantities: two tasks, numbered by run, no '#'", async () => {
    sheet({ [D]: ["Bread (2 Bowls)", "Rolls (1 Bowl)", "Bread (3 Bowls)"] });
    await sync();
    const bread = db.state.rows.filter((r) => r.label.startsWith("Bread")).map((r) => [r.label, r.calendarKey, r.sortKey]);
    expect(bread).toEqual([["Bread (2 Bowls)", `prod:${D}:bread:0`, 0], ["Bread (3 Bowls)", `prod:${D}:bread:1`, 2]]);
  });

  it("identical quantity: the second run gets '#2' before the quantity instead of being silently dropped", async () => {
    sheet({ [D]: [PREMIX, GRANOLA, PREMIX] });
    const result = await sync();

    expect(result.totalCreated).toBe(4); // pre-op + three batch sheets
    expect(db.state.rows.filter((r) => r.calendarKey?.includes("premix")).map((r) => [r.label, r.calendarKey])).toEqual([
      [PREMIX, `prod:${D}:premix-powder---egg-chocolate:0`],
      ["PreMix Powder - Egg Chocolate #2 (2 Bowls)", `prod:${D}:premix-powder---egg-chocolate:1`],
    ]);
    expect(writes("insert skipped")).toEqual([]);
  });

  it("removing the first of two runs deletes an untouched task and keeps the one with work on it", async () => {
    seed("run-a", "Bread (2 Bowls)", `prod:${D}:bread:0`, { sortKey: 0 });
    seed("run-b", "Bread (3 Bowls)", `prod:${D}:bread:1`, { sortKey: 1, status: "IN_PROGRESS" });
    sheet({ [D]: ["Bread (5 Bowls)"] }); // one run left, with a new quantity
    const result = await sync();

    expect(result).toMatchObject({ totalDeleted: 1, totalFlagged: 0 });
    expect(db.state.rows.map((r) => r.id)).toEqual(["run-b", "new-1"]); // new-1 is the pre-op task
    expect(row("run-b")).toMatchObject({ status: "IN_PROGRESS", label: "Bread (5 Bowls)" });
  });
});

describe("quantity or wording changes", () => {
  it("an open task's label is updated in place — same id, no new task", async () => {
    seedRealDay();
    sheet({ [D]: [PREMIX, "ProGranola - Chocolate (40 Bowls)"] });
    const result = await sync();

    expect(result).toMatchObject({ totalCreated: 0, totalDeleted: 0, totalFlagged: 0 });
    expect(result.results[0].labelsUpdated).toBe(1);
    expect(row("granola").label).toBe("ProGranola - Chocolate (40 Bowls)");
  });

  it.each(["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"])("%s is open: label follows the sheet", async (status) => {
    seed("granola", GRANOLA, `prod:${D}:progranola---chocolate:0`, { sortKey: 0, status });
    sheet({ [D]: ["ProGranola - Chocolate (40 Bowls)"] });
    await sync();
    expect(row("granola").label).toBe("ProGranola - Chocolate (40 Bowls)");
  });

  it.each(["DONE", "SKIPPED", "MISSED"])("%s keeps the label it was recorded with, and is neither flagged nor duplicated", async (status) => {
    seed("granola", GRANOLA, `prod:${D}:progranola---chocolate:0`, { sortKey: 0, status });
    sheet({ [D]: ["ProGranola - Chocolate (40 Bowls)"] });
    const result = await sync();

    expect(row("granola")).toMatchObject({ label: GRANOLA, status, needsAdminReview: false });
    expect(db.state.rows.filter((r) => r.calendarKey?.startsWith("prod:"))).toHaveLength(1);
    expect(result).toMatchObject({ totalDeleted: 0, totalFlagged: 0 });
  });

  it("an update that would collide with another task's label gets '#2' instead of breaking the unique index", async () => {
    // Two runs of Bread: the first is DONE and keeps "Bread (2 Bowls)"; the open one is changed on the sheet to 2 Bowls too
    seed("done-run", "Bread (2 Bowls)", `prod:${D}:bread:0`, { sortKey: 0, status: "DONE", completedBySubmissionId: "sheet-1" });
    seed("open-run", "Bread (3 Bowls)", `prod:${D}:bread:1`, { sortKey: 1 });
    sheet({ [D]: ["Bread (2 Bowls)", "Bread (2 Bowls)"] });
    const result = await sync();

    expect(row("done-run").label).toBe("Bread (2 Bowls)");
    expect(row("open-run").label).toBe("Bread #2 (2 Bowls)");
    expect(result).toMatchObject({ totalDeleted: 0, totalFlagged: 0 });
    expect((prisma as unknown as { ruleInstance: { update: ReturnType<typeof vi.fn> } }).ruleInstance.update).toHaveBeenCalled(); // and it did not throw
    expect(productNameFromTaskLabel(row("open-run").label)).toBe("Bread");
  });

  it("chained renames are applied in an order the unique index accepts", async () => {
    seed("a", "Bread (2 Bowls)", `prod:${D}:bread:0`, { sortKey: 0 });
    seed("b", "Bread (3 Bowls)", `prod:${D}:bread:1`, { sortKey: 1 });
    sheet({ [D]: ["Bread (3 Bowls)", "Bread (4 Bowls)"] }); // first run takes the label the second run is giving up
    await sync();
    expect(db.state.rows.filter((r) => r.label.startsWith("Bread")).map((r) => r.label).sort()).toEqual(["Bread (3 Bowls)", "Bread (4 Bowls)"]);
    expect(db.state.rows.filter((r) => r.label.startsWith("Bread")).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
});

describe("a production that really changed is still removed and added", () => {
  it("product renamed: the untouched task is deleted and a new one created", async () => {
    seedRealDay();
    sheet({ [D]: [PREMIX, "ProGranola Chocolate (30 Bowls)"] });
    const result = await sync();
    expect(result).toMatchObject({ totalCreated: 1, totalDeleted: 1, totalFlagged: 0 });
    expect(writes("deleted")).toEqual(["deleted: granola"]);
    expect(db.state.rows.find((r) => r.id.startsWith("new-"))).toMatchObject({ label: "ProGranola Chocolate (30 Bowls)", calendarKey: `prod:${D}:progranola-chocolate:0` });
  });

  it("moved to another day: untouched → deleted and recreated there; started → kept and flagged", async () => {
    seedRealDay();
    sheet({ [D]: [PREMIX], "2026-11-24": [GRANOLA] });
    let result = await sync();
    expect(result).toMatchObject({ totalDeleted: 1, totalFlagged: 0 });
    expect(db.state.rows.find((r) => r.label === GRANOLA)).toMatchObject({ calendarKey: "prod:2026-11-24:progranola---chocolate:0" });

    db.state.rows = []; db.state.log = [];
    seedRealDay();
    row("granola").status = "IN_PROGRESS";
    sheet({ [D]: [PREMIX], "2026-11-24": [GRANOLA] });
    result = await sync();
    expect(result).toMatchObject({ totalDeleted: 0, totalFlagged: 1 });
    expect(row("granola")).toMatchObject({ status: "IN_PROGRESS", needsAdminReview: true });
  });
});

describe("rollout: old-shape keys, the key rewrite, idempotency", () => {
  const TODAY_LINES = [
    "Organic Seed Crackers - Salt & Pepper (2 Bowls)", "Protein Powder - Egg Unflavored (600 units EXP 05/12/26)",
    "Protein Powder - Egg Chocolate (55 Pouches)", "PureMonk Sweetener (50 Containers)",
  ];
  const OLD_KEYS = ["organic-seed-crackers---salt--pepper:0", "protein-powder---egg-unflavored:1", "protein-powder---egg-chocolate:2", "puremonk-sweetener:3"];
  function seedToday(keys: string[]) {
    seed("preop-today", "", "day:2026-11-19", { status: "DONE" });
    TODAY_LINES.forEach((label, i) => seed(`t${i}`, label, `prod:2026-11-19:${keys[i]}`, { sortKey: i, status: "DONE", completedBySubmissionId: `s${i}` }));
  }

  it("old-shape keys (trailing number = line position) are matched as they are: nothing changes", async () => {
    seedToday(OLD_KEYS);
    seedRealDay();
    const before = snapshot();
    sheet({ "2026-11-19": TODAY_LINES, [D]: [PREMIX, GRANOLA] });
    const result = await sync();

    expect(result).toMatchObject({ totalCreated: 0, totalDeleted: 0, totalFlagged: 0 });
    expect(result.results[0]).toMatchObject({ labelsUpdated: 0, positionsUpdated: 0 });
    expect(snapshot()).toEqual(before);
    expect(db.state.log).toEqual([]);
  });

  it("after the key rewrite (every first run numbered 0) nothing changes either", async () => {
    seedToday(OLD_KEYS.map((k) => k.replace(/:\d+$/, ":0")));
    seed("preop", "", `day:${D}`);
    seed("premix", PREMIX, `prod:${D}:premix-powder---egg-chocolate:0`, { sortKey: 0 });
    seed("granola", GRANOLA, `prod:${D}:progranola---chocolate:0`, { sortKey: 1 });
    const before = snapshot();
    sheet({ "2026-11-19": TODAY_LINES, [D]: [PREMIX, GRANOLA] });
    await sync();
    expect(snapshot()).toEqual(before);
    expect(db.state.log).toEqual([]);
  });

  it("running the sync twice changes nothing the second time", async () => {
    sheet({ [D]: [PREMIX, GRANOLA, PREMIX, "Bread (1 Bowl)"] });
    await sync();
    const after = snapshot();
    db.state.log = [];
    const second = await sync();
    expect(second).toMatchObject({ totalCreated: 0, totalDeleted: 0, totalFlagged: 0 });
    expect(snapshot()).toEqual(after);
    expect(db.state.log).toEqual([]);
  });

  it("key rewrite expression on the 17 real production keys: 6 change, none collide, identities are untouched", () => {
    const REAL: [string, string, number][] = [ // rule, key, sortKey
      ["jb", "prod:2026-11-16:organic-seed-crackers---salt--pepper:0", 0], ["624", "prod:2026-11-16:cinnamon-raisin-bread:0", 0],
      ["jb", "prod:2026-11-17:organic-seed-crackers---parmesan:0", 0], ["624", "prod:2026-11-17:multi-grain-bread:0", 0],
      ["jb", "prod:2026-11-18:premix-powder---egg-chocolate:0", 0], ["jb", "prod:2026-11-18:progranola---chocolate:1", 1],
      ["624", "prod:2026-11-18:waffle-mix:0", 0], ["624", "prod:2026-11-18:whole-grain-bread:1", 1],
      ["jb", "prod:2026-11-19:organic-seed-crackers---salt--pepper:0", 0], ["jb", "prod:2026-11-19:protein-powder---egg-unflavored:1", 1],
      ["jb", "prod:2026-11-19:protein-powder---egg-chocolate:2", 2], ["jb", "prod:2026-11-19:puremonk-sweetener:3", 3],
      ["jb", "prod:2026-11-23:premix-powder---egg-chocolate:0", 0], ["jb", "prod:2026-11-23:progranola---chocolate:1", 1],
      ["624", "prod:2026-11-24:dinner-roll:0", 0], ["jb", "prod:2026-11-24:organic-seed-crackers---salt--pepper:0", 0],
      ["jb", "prod:2026-11-25:organic-seed-crackers---parmesan:0", 0],
    ];
    // Mirrors the SQL: ROW_NUMBER() OVER (PARTITION BY rule, date, product ORDER BY sortKey, old number) - 1
    const seen = new Map<string, number>();
    const rewritten = [...REAL]
      .sort((a, b) => a[2] - b[2])
      .map(([rule, key]) => {
        const group = `${rule}|${keyIdentity(key)}`;
        const run = seen.get(group) ?? 0;
        seen.set(group, run + 1);
        return { rule, old: key, next: `${keyIdentity(key)}:${run}` };
      });
    expect(rewritten.filter((r) => r.old !== r.next)).toHaveLength(6);
    expect(new Set(rewritten.map((r) => `${r.rule}|${r.next}`)).size).toBe(17);
    expect(rewritten.every((r) => r.next.endsWith(":0") && keyIdentity(r.next) === keyIdentity(r.old))).toBe(true);
  });

  it("key helpers", () => {
    expect(keyIdentity("prod:2026-11-23:progranola---chocolate:1")).toBe("prod:2026-11-23:progranola---chocolate");
    expect(keyIdentity("day:2026-11-23")).toBe("day:2026-11-23");
    expect(productSlug("ProGranola - Chocolate")).toBe("progranola---chocolate"); // unchanged from the keys already stored
    expect(productSlug("Organic Seed Crackers - Salt & Pepper")).toBe("organic-seed-crackers---salt--pepper");
    expect(productSlug("ProGranola – Chocolate")).toBe("progranola---chocolate"); // en dash = hyphen, as on the schedule
  });
});

describe("product is still read from updated and '#2' labels", () => {
  it("label parser: '#2' before the quantity, changed quantities, long unit text", () => {
    expect(productNameFromTaskLabel("Bread #2 (2 Bowls)")).toBe("Bread");
    expect(productNameFromTaskLabel("PreMix Powder - Egg Chocolate #2 (2 Bowls)")).toBe("PreMix Powder - Egg Chocolate");
    expect(productNameFromTaskLabel("ProGranola - Chocolate (40 Bowls)")).toBe("ProGranola - Chocolate");
    expect(productNameFromTaskLabel("Protein Powder - Egg Unflavored #3 (600 units EXP 05/12/26)")).toBe("Protein Powder - Egg Unflavored");
    expect(productNameFromTaskLabel("Bread #2")).toBe("Bread");
  });

});

describe("once-a-day tasks are unaffected", () => {
  it("one Pre-Op per production day, matched by its day key", async () => {
    seed("preop", "", `day:${D}`);
    sheet({ [D]: [PREMIX], "2026-11-24": [GRANOLA] });
    await sync();
    expect(db.state.rows.filter((r) => r.ruleId === PREOP.id).map((r) => [r.id, r.calendarKey])).toEqual([["preop", `day:${D}`], ["new-3", "day:2026-11-24"]]);
  });
});
