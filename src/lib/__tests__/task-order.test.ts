import { describe, it, expect } from "vitest";
import { compareTasks, sortTasks, applyRuleReorder, ranksFor, type OrderableTask } from "@/lib/task-order";

const RANK = { preop: 10, batch: 20, cleaning: 30, preop624: 40, batch624: 50, cleaning624: 60 };
let n = 0;
function t(label: string, rule: keyof typeof RANK | null, over: Partial<OrderableTask> = {}): OrderableTask {
  n++;
  return {
    id: `id-${String(n).padStart(3, "0")}`,
    dueDate: "2026-11-18",
    label,
    ruleId: rule ?? `unranked-${label}`,
    ruleSortOrder: rule ? RANK[rule] : null,
    ruleCreatedAt: "2026-11-11T19:55:00.000Z",
    sortKey: null,
    createdAt: "2026-11-13T20:28:23.786Z",
    ...over,
  };
}
const labels = (list: OrderableTask[]) => sortTasks(list).map((x) => x.label);

describe("compareTasks — the work order", () => {
  it("Pre-Op, then batch sheets in calendar order, then Cleaning", () => {
    expect(labels([
      t("Daily Cleaning", "cleaning"),
      t("ProGranola - Chocolate (50 Bowls)", "batch", { sortKey: 1 }),
      t("Pre-Op Inspection", "preop"),
      t("PreMix Powder - Egg Chocolate (3 Bowls)", "batch", { sortKey: 0 }),
    ])).toEqual(["Pre-Op Inspection", "PreMix Powder - Egg Chocolate (3 Bowls)", "ProGranola - Chocolate (50 Bowls)", "Daily Cleaning"]);
  });

  it("the real 2026-11-18: creation order had granola before premix and 624's Pre-Op after its batch sheet", () => {
    // Rows in the order the old query (dueDate, createdAt) returned them in production
    const asCreated = [
      t("Pre-Op Inspection", "preop", { createdAt: "2026-11-11T20:33:59.829Z" }),
      t("Daily Cleaning", "cleaning", { createdAt: "2026-11-11T20:33:59.829Z" }),
      t("Waffle Mix (4 Bowls lot 41)", "batch624", { sortKey: 0, createdAt: "2026-11-13T20:28:23.472Z" }),
      t("ProGranola - Chocolate (50 Bowls)", "batch", { sortKey: 1, createdAt: "2026-11-13T20:28:23.786Z" }),
      t("PreMix Powder - Egg Chocolate (3 Bowls)", "batch", { sortKey: 0, createdAt: "2026-11-13T20:28:23.786Z" }),
      t("Pre-Op Inspection — 624", "preop624", { createdAt: "2026-11-16T22:36:16.216Z" }),
      t("Daily Cleaning — 624", "cleaning624", { createdAt: "2026-11-17T02:48:11.231Z" }),
      t("Whole Grain Bread (1 Bowl)", "batch624", { sortKey: 1, createdAt: "2026-11-17T19:35:53.984Z" }),
    ];
    expect(labels(asCreated)).toEqual([
      "Pre-Op Inspection",
      "PreMix Powder - Egg Chocolate (3 Bowls)",
      "ProGranola - Chocolate (50 Bowls)",
      "Daily Cleaning",
      "Pre-Op Inspection — 624",
      "Waffle Mix (4 Bowls lot 41)",
      "Whole Grain Bread (1 Bowl)",
      "Daily Cleaning — 624",
    ]);
  });

  it("due date comes first: yesterday's Cleaning is listed before today's Pre-Op", () => {
    expect(labels([
      t("Pre-Op Inspection", "preop", { dueDate: "2026-11-19" }),
      t("Daily Cleaning", "cleaning", { dueDate: "2026-11-18" }),
    ])).toEqual(["Daily Cleaning", "Pre-Op Inspection"]);
  });

  it("rules without a rank come last, oldest rule first, and their tasks stay together", () => {
    expect(labels([
      t("B-2", null, { ruleId: "new-b", ruleCreatedAt: "2026-11-20T00:00:00.000Z", sortKey: 1 }),
      t("A-1", null, { ruleId: "new-a", ruleCreatedAt: "2026-11-19T00:00:00.000Z" }),
      t("Daily Cleaning", "cleaning"),
      t("B-1", null, { ruleId: "new-b", ruleCreatedAt: "2026-11-20T00:00:00.000Z", sortKey: 0 }),
    ])).toEqual(["Daily Cleaning", "A-1", "B-1", "B-2"]);
  });

  it("inside a rule, tasks without a calendar position come after those with one", () => {
    expect(labels([t("no position", "batch"), t("second", "batch", { sortKey: 1 }), t("first", "batch", { sortKey: 0 })]))
      .toEqual(["first", "second", "no position"]);
  });

  it("ties are stable: label, then creation time, then id — never input order", () => {
    const a = t("Same", "batch", { sortKey: 0, createdAt: "2026-11-13T20:00:00.000Z", id: "b" });
    const b = t("Same", "batch", { sortKey: 0, createdAt: "2026-11-13T20:00:00.000Z", id: "a" });
    const c = t("Same", "batch", { sortKey: 0, createdAt: "2026-11-12T20:00:00.000Z", id: "z" });
    expect(sortTasks([a, b, c]).map((x) => x.id)).toEqual(["z", "a", "b"]);
    expect(sortTasks([c, b, a]).map((x) => x.id)).toEqual(["z", "a", "b"]);
    expect(compareTasks(a, a)).toBe(0);
  });

  it("sortTasks does not mutate its input", () => {
    const list = [t("Daily Cleaning", "cleaning"), t("Pre-Op Inspection", "preop")];
    sortTasks(list);
    expect(list.map((x) => x.label)).toEqual(["Daily Cleaning", "Pre-Op Inspection"]);
  });
});

describe("applyRuleReorder / ranksFor — a drag in a view that shows only some rules", () => {
  const all = ["preop", "batch", "cleaning", "preop624", "batch624", "cleaning624", "sop"];

  it("moving Cleaning above Batch Sheets changes only those two slots", () => {
    expect(applyRuleReorder(all, ["preop", "cleaning", "batch"])).toEqual(["preop", "cleaning", "batch", "preop624", "batch624", "cleaning624", "sop"]);
  });

  it("reordering 624's rules leaves Julian Bakery's untouched", () => {
    expect(applyRuleReorder(all, ["cleaning624", "preop624", "batch624"])).toEqual(["preop", "batch", "cleaning", "cleaning624", "preop624", "batch624", "sop"]);
  });

  it("rules that are far apart trade the slots they already hold", () => {
    expect(applyRuleReorder(all, ["sop", "preop"])).toEqual(["sop", "batch", "cleaning", "preop624", "batch624", "cleaning624", "preop"]);
  });

  it("the same sequence back changes nothing", () => {
    expect(applyRuleReorder(all, ["preop", "batch", "cleaning"])).toEqual(all);
  });

  it("ranks are 10, 20, 30…", () => {
    expect(ranksFor(["a", "b", "c"])).toEqual([{ id: "a", sortOrder: 10 }, { id: "b", sortOrder: 20 }, { id: "c", sortOrder: 30 }]);
  });
});

describe("backfill expression — position taken from the end of calendarKey", () => {
  // Mirrors: (substring("calendarKey" from ':([0-9]+)$'))::int WHERE "calendarKey" ~ '^prod:.*:[0-9]+$'
  const backfill = (key: string | null) => (key && /^prod:.*:[0-9]+$/.test(key) ? parseInt(/:([0-9]+)$/.exec(key)![1], 10) : null);
  it("real key shapes from production", () => {
    expect(backfill("prod:2026-11-18:premix-powder---egg-chocolate:0")).toBe(0);
    expect(backfill("prod:2026-11-18:progranola---chocolate:1")).toBe(1);
    expect(backfill("prod:2026-11-19:puremonk-sweetener:3")).toBe(3);
    expect(backfill("prod:2026-11-19:organic-seed-crackers---salt--pepper:0")).toBe(0);
    expect(backfill("prod:2026-12-01:some-product:12")).toBe(12);
  });
  it("once-a-day tasks and tasks without a key get no position", () => {
    expect(backfill("day:2026-11-18")).toBeNull();
    expect(backfill(null)).toBeNull();
  });
});
