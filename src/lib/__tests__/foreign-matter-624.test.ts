import { describe, it, expect } from "vitest";
import {
  QUANTITY_CHANGED_HINT, SEED_ITEMS, SECTIONS, answerPatch, areaLabel, areasOf, buildSnapshot, hasEnteredValues, itemProblem, markAllOk, markAllOkQuestion,
  matchAreaName, nameTaken, nameTakenMessage, nextPeriod, parsePeriod, periodDates, periodForDate, planReorder, positionOf, progressOf, quantityChangedSinceCheck,
  retireAreaQuestion, retireQuestion, sortItems, sortOrderForNew, splitStored, submitProblems, submittedForDate, submittedPeriodMessage, valuesForLiveList,
  viewOfSnapshot, withCheckedAt, type FmItem, type ItemValues, type Section,
} from "@/lib/foreign-matter-624";

const it_ = (id: string, section: Section, areaName: string, name: string, sortOrder: number, expectedQuantity = 1): FmItem => ({ id, section, areaName, name, sortOrder, expectedQuantity });
const LIST: FmItem[] = [
  it_("l1", "glass_brittle", "Production and Storage Area", "Shatter Proof Lamps", 10, 58),
  it_("l2", "glass_brittle", "Production and Storage Area", "Clock", 20, 1),
  it_("f1", "glass_brittle", "Walk In Fridge", "Light Bulbs", 30, 1),
  it_("f2", "glass_brittle", "Walk In Fridge", "Thermometer", 40, 1),
  it_("k1", "knives_blades", "Production and Storage Area", "Scissors", 50, 1),
  it_("k2", "knives_blades", "Production and Storage Area", "Knife", 60, 1),
];
const v = (itemId: string, over: Partial<ItemValues> = {}): ItemValues => ({ itemId, ...over });
const map = (...list: ItemValues[]) => Object.fromEntries(list.map((x) => [x.itemId, x]));
const ALL_OK = map(...LIST.map((i) => v(i.id, { result: "OK" })));
const apply = (items: FmItem[], changes: { id: string; sortOrder: number; areaName: string; section: Section }[]) => items.map((i) => ({ ...i, ...(changes.find((c) => c.id === i.id) ?? {}) }));
const layout = (items: FmItem[]) => areasOf(items).map((a) => `${a.section === "glass_brittle" ? "G" : "K"} ${a.name}: ${a.items.map((i) => i.name).join(", ")}`);
const NOW = "2026-11-24T18:00:00.000Z";

describe("the seed list", () => {
  it("has 46 Glass and Brittle items in ten areas and 3 Knives and Blades items, 49 in all, with the approved spelling", () => {
    const items = SEED_ITEMS.map(([section, areaName, name, expectedQuantity], i) => it_(`s${i}`, section, areaName, name, (i + 1) * 10, expectedQuantity));
    const areas = areasOf(items);
    expect(items).toHaveLength(49);
    expect(areas.filter((a) => a.section === "glass_brittle").map((a) => [a.name, a.items.length])).toEqual([
      ["Production and Storage Area", 17], ["Walk In Fridge", 2], ["Air Compressor", 2], ["Ovens", 2], ["Bread Freezer at 3021", 2], ["Cameras", 1],
      ["Timers and Scales", 4], ["Restroom and Handwash Station", 3], ["Production Tools", 5], ["Machine Screens", 8],
    ]);
    expect(areas.filter((a) => a.section === "knives_blades").map((a) => [a.name, a.items.map((i) => i.name)])).toEqual([["Production and Storage Area", ["Scissors", "Blade", "Knife"]]]);
    const names = items.map((i) => i.name);
    for (const good of ["Air Pressure Gauge", "Pressure Gauge", "Measuring Cup", "Bread Packaging Round Panels", "Knife", "U-line Dial Scale", "1byone Scale Screen", "Vmag Screen"]) expect(names).toContain(good);
    for (const bad of ["Air Preassure Gauge", "Preassure Gauge", "Meassuring Cup", "Bread Packaging Round Pannels", "Knive"]) expect(names).not.toContain(bad);
    expect(items.find((i) => i.name === "Shatter Proof Lamps")!.expectedQuantity).toBe(58);
    expect(items.find((i) => i.name === "Bread Packaging Protectors")!.expectedQuantity).toBe(9);
  });
  it("numbering is automatic: positions run 1 to 49 with no duplicates, in list order", () => {
    const items = SEED_ITEMS.map(([section, areaName, name, q], i) => it_(`s${i}`, section, areaName, name, (i + 1) * 10, q));
    expect(items.map((i) => positionOf(items, i.id))).toEqual(Array.from({ length: 49 }, (_, k) => k + 1));
    expect(positionOf(items, "s46")).toBe(47); // Scissors, first of the second section
    // names are unique inside each area (the same name in different areas is fine: Thermometer, Screen, Light Bulbs)
    for (const i of items) expect(nameTaken(items, i.section, i.areaName, i.name, i.id), `${i.areaName}/${i.name}`).toBe(false);
  });
});

describe("the list", () => {
  it("the two sections in fixed order; areas by first item; items by sort order", () => {
    const shuffled = [LIST[5], LIST[2], LIST[0], LIST[4], LIST[3], LIST[1]];
    expect(sortItems(shuffled).map((i) => i.id)).toEqual(["l1", "l2", "f1", "f2", "k1", "k2"]);
    expect(layout(shuffled)).toEqual(["G Production and Storage Area: Shatter Proof Lamps, Clock", "G Walk In Fridge: Light Bulbs, Thermometer", "K Production and Storage Area: Scissors, Knife"]);
    expect(SECTIONS).toEqual(["glass_brittle", "knives_blades"]);
  });
  it("an area with the same name in both sections is two areas", () => {
    expect(areasOf(LIST).filter((a) => a.name === "Production and Storage Area")).toHaveLength(2);
    expect(areaLabel(LIST, "knives_blades", "Production and Storage Area")).toBe("Knives and Blades, Production and Storage Area");
    expect(areaLabel(LIST, "glass_brittle", "Production and Storage Area")).toBe("Glass and Brittle, Production and Storage Area"); // named in full on both sides
    expect(areaLabel(LIST, "glass_brittle", "Walk In Fridge")).toBe("Walk In Fridge");
  });
  it("a new item goes to the end of its area; a new area goes last in its section, never into the other section", () => {
    const added = [...LIST, it_("n1", "glass_brittle", "Walk In Fridge", "Door Seal", sortOrderForNew(LIST)), it_("n2", "glass_brittle", "Roof", "Skylight", sortOrderForNew(LIST) + 10)];
    expect(layout(added)).toEqual([
      "G Production and Storage Area: Shatter Proof Lamps, Clock", "G Walk In Fridge: Light Bulbs, Thermometer, Door Seal", "G Roof: Skylight",
      "K Production and Storage Area: Scissors, Knife",
    ]);
  });
});

describe("validation of an item", () => {
  it("name, area and section are required; the quantity is a whole number, 0 or more", () => {
    expect(itemProblem({ section: "glass_brittle", areaName: "Ovens", name: "Screen", expectedQuantity: 3 })).toBeNull();
    expect(itemProblem({ expectedQuantity: 0 })).toBeNull();
    expect(itemProblem({ name: " " })).toBe("Enter a name for the item.");
    expect(itemProblem({ areaName: "" })).toBe("Choose an area or type a new area name.");
    expect(itemProblem({ section: "tools" })).toBe("Choose a section.");
    for (const bad of [-1, 2.5, "3", NaN, null]) expect(itemProblem({ expectedQuantity: bad }), String(bad)).toBe("The expected quantity must be a whole number, 0 or more.");
    expect(itemProblem({ expectedQuantity: 100001 })).toBe("The expected quantity cannot be more than 100000.");
    expect(itemProblem({ name: "x".repeat(121) })).toBe("The name is too long (120 characters at most).");
    expect(itemProblem({ areaName: "x".repeat(81) })).toBe("The area name is too long (80 characters at most).");
    expect(itemProblem({})).toBeNull();
  });
  it("names are unique within an area, case-insensitive; the same name in another area or section is allowed", () => {
    expect(nameTaken(LIST, "glass_brittle", "Walk In Fridge", " thermometer ")).toBe(true);
    expect(nameTaken(LIST, "glass_brittle", "walk in fridge", "THERMOMETER")).toBe(true);
    expect(nameTaken(LIST, "glass_brittle", "Production and Storage Area", "Thermometer")).toBe(false);
    expect(nameTaken(LIST, "knives_blades", "Production and Storage Area", "Clock")).toBe(false); // Clock is in the other section's area
    expect(nameTaken(LIST, "glass_brittle", "Walk In Fridge", "Thermometer", "f2")).toBe(false); // the item itself
    expect(nameTakenMessage("Walk In Fridge", " Thermometer ")).toBe('There is already an item called "Thermometer" in Walk In Fridge.');
  });
  it("an existing area typed with other capitals is that area, within its own section", () => {
    expect(matchAreaName(LIST, "glass_brittle", " walk in FRIDGE ")).toBe("Walk In Fridge");
    expect(matchAreaName(LIST, "knives_blades", "walk in fridge")).toBe("walk in fridge"); // no such area in that section: a new one
  });
});

describe("moving, changing area and section", () => {
  it("up and down swap places inside the area; the ends do not move; nothing crosses into another area", () => {
    expect(layout(apply(LIST, planReorder(LIST, { id: "l2", move: "up" })))[0]).toBe("G Production and Storage Area: Clock, Shatter Proof Lamps");
    expect(planReorder(LIST, { id: "l1", move: "up" })).toEqual([]);
    expect(planReorder(LIST, { id: "l2", move: "down" })).toEqual([]);
    expect(planReorder(LIST, { id: "k2", move: "down" })).toEqual([]);
    expect(planReorder(LIST, { id: "nope", move: "up" })).toEqual([]);
  });
  it("changing the area puts the item at the end of that area; a new name starts a new area", () => {
    expect(layout(apply(LIST, planReorder(LIST, { id: "l2", areaName: "walk in fridge" })))).toEqual([
      "G Production and Storage Area: Shatter Proof Lamps", "G Walk In Fridge: Light Bulbs, Thermometer, Clock", "K Production and Storage Area: Scissors, Knife",
    ]);
    expect(layout(apply(LIST, planReorder(LIST, { id: "f2", areaName: "Freezer" })))).toContain("G Freezer: Thermometer");
    expect(planReorder(LIST, { id: "f2", areaName: " Walk In Fridge " })).toEqual([]);
  });
  it("changing the section moves the item to the area of the same name there", () => {
    const after = apply(LIST, planReorder(LIST, { id: "l2", section: "knives_blades" }));
    expect(layout(after)).toEqual(["G Production and Storage Area: Shatter Proof Lamps", "G Walk In Fridge: Light Bulbs, Thermometer", "K Production and Storage Area: Scissors, Knife, Clock"]);
    expect(layout(apply(LIST, planReorder(LIST, { id: "f1", section: "knives_blades", areaName: "Tool Wall" })))).toContain("K Tool Wall: Light Bulbs");
  });
});

describe("answers", () => {
  it("progress counts items with a result, overall and per area", () => {
    const values = map(v("l1", { result: "OK" }), v("f1", { result: "NOT_OK" }), v("f2", { comment: "later" }));
    expect(progressOf(LIST, values)).toEqual({ checked: 2, total: 6, ok: 1, notOk: 1 });
    const fridge = areasOf(LIST)[1];
    expect(progressOf(fridge.items, values)).toEqual({ checked: 1, total: 2, ok: 0, notOk: 1 });
  });
  it("submit lists what is missing in plain words, by area, and needs initials", () => {
    expect(submitProblems(LIST, map(v("l1", { result: "OK" }), v("f1", { result: "OK" }), v("k1", { result: "OK" })), "")).toEqual([
      "Enter your initials at the top.",
      "Glass and Brittle, Production and Storage Area: Clock needs OK or Not OK.",
      "Walk In Fridge: Thermometer needs OK or Not OK.",
      "Knives and Blades, Production and Storage Area: Knife needs OK or Not OK.",
    ]);
    expect(submitProblems(LIST, ALL_OK, "HA")).toEqual([]);
    expect(submitProblems([], {}, "HA")).toEqual(["The list has no items. Add at least one in Edit list."]);
  });
  it("a Not OK needs a comment — and then no longer blocks submission; a comment on OK is optional", () => {
    const failing = { ...ALL_OK, f2: v("f2", { result: "NOT_OK" }) };
    expect(submitProblems(LIST, failing, "HA")).toEqual(["Walk In Fridge: Thermometer is Not OK and needs a comment."]);
    expect(submitProblems(LIST, { ...failing, f2: v("f2", { result: "NOT_OK", comment: "  " }) }, "HA")).toHaveLength(1);
    expect(submitProblems(LIST, { ...failing, f2: v("f2", { result: "NOT_OK", comment: "Cracked lens", foundQuantity: 0 }) }, "HA")).toEqual([]);
  });
  it("the found quantity belongs to a Not OK only: it is dropped when the item goes back to OK", () => {
    expect(answerPatch(LIST[0], "OK")).toEqual({ result: "OK", expectedAtCheck: 58, foundQuantity: null });
    expect(answerPatch(LIST[0], "NOT_OK")).toEqual({ result: "NOT_OK", expectedAtCheck: 58 });
    const kept = valuesForLiveList(LIST, [v("l1", { result: "NOT_OK", foundQuantity: 56, comment: "Two missing" })]);
    expect(kept.l1.foundQuantity).toBe(56);
    const back = valuesForLiveList(LIST, [v("l1", { result: "OK", foundQuantity: 56, comment: "Two missing" })]);
    expect(back.l1.foundQuantity).toBeNull();
    expect(back.l1.comment).toBe("Two missing"); // the comment stays
    for (const bad of [-1, 2.5, "7" as unknown as number]) expect(valuesForLiveList(LIST, [v("l1", { result: "NOT_OK", foundQuantity: bad })]).l1.foundQuantity).toBeNull();
    expect(valuesForLiveList(LIST, [v("l1", { result: "NOT_OK", foundQuantity: 0 })]).l1.foundQuantity).toBe(0);
  });
  it("checkedAt is stamped when the result is first set, kept afterwards, cleared if the result goes away", () => {
    const first = withCheckedAt(undefined, v("l1", { result: "OK" }), NOW, 58);
    expect(first).toMatchObject({ checkedAt: NOW, expectedAtCheck: 58 });
    expect(withCheckedAt(first, { ...first, result: "NOT_OK" }, "2026-11-24T19:00:00.000Z", 58).checkedAt).toBe(NOW);
    expect(withCheckedAt(first, { ...first, result: null }, "x", 58)).toMatchObject({ checkedAt: null, expectedAtCheck: null });
    expect(withCheckedAt(undefined, v("l1", { comment: "only a comment" }), "x", 58).checkedAt).toBeNull();
  });
});

describe("Mark all OK for an area", () => {
  const area = areasOf(LIST)[0]; // Production and Storage Area: Shatter Proof Lamps, Clock
  it("fills only the items with no result yet and stamps them", () => {
    expect(markAllOk(area.items, {}, NOW)).toEqual([
      { itemId: "l1", result: "OK", foundQuantity: null, checkedAt: NOW, expectedAtCheck: 58 },
      { itemId: "l2", result: "OK", foundQuantity: null, checkedAt: NOW, expectedAtCheck: 1 },
    ]);
  });
  it("never overwrites a Not OK or an existing OK, and keeps a comment already typed on an unchecked item", () => {
    const values = map(v("l1", { result: "NOT_OK", comment: "Two missing", foundQuantity: 56, checkedAt: "2026-11-23T18:00:00.000Z" }), v("l2", { comment: "ticks loudly" }));
    const out = markAllOk(area.items, values, NOW);
    expect(out.map((x) => x.itemId)).toEqual(["l2"]);
    expect(out[0]).toMatchObject({ result: "OK", comment: "ticks loudly", checkedAt: NOW });
    const done = map(v("l1", { result: "OK", checkedAt: "2026-11-23T18:00:00.000Z" }), v("l2", { result: "NOT_OK", comment: "x" }));
    expect(markAllOk(area.items, done, NOW)).toEqual([]);
  });
  it("only that area is touched", () => {
    expect(markAllOk(area.items, {}, NOW).some((x) => ["f1", "f2", "k1", "k2"].includes(x.itemId))).toBe(false);
  });
  it("the confirmation names the count and the area", () => {
    const seventeen = { name: "Production and Storage Area", items: Array.from({ length: 17 }, (_, i) => ({ id: `x${i}` })) };
    expect(markAllOkQuestion(seventeen, {})).toBe("Mark the 17 unchecked items in Production and Storage Area as OK?");
    expect(markAllOkQuestion(area, map(v("l1", { result: "NOT_OK" })))).toBe("Mark the 1 unchecked item in Production and Storage Area as OK?");
    expect(markAllOkQuestion(area, map(v("l1", { result: "OK" }), v("l2", { result: "OK" })))).toBeNull(); // nothing left to mark
  });
});

describe("the draft follows the live list", () => {
  const values = map(v("l1", { result: "OK", expectedAtCheck: 58 }), v("f2", { result: "NOT_OK", comment: "Cracked" }));
  it("a new item appears blank; a renamed item keeps its values; a retired item disappears with its values", () => {
    const live = [...LIST.filter((i) => i.id !== "f2").map((i) => (i.id === "l1" ? { ...i, name: "LED Lamps" } : i)), it_("n1", "glass_brittle", "Ovens", "Screen", 100, 3)];
    const out = valuesForLiveList(live, values);
    expect(out.l1.result).toBe("OK");
    expect(out.f2).toBeUndefined();
    expect(out.n1).toBeUndefined();
    expect(submitProblems(live, out, "HA")).toContain("Ovens: Screen needs OK or Not OK.");
  });
  it("retiring asks first, and says so when something was already entered; an area's question names its count", () => {
    expect(hasEnteredValues(values.f2)).toBe(true);
    expect(hasEnteredValues(v("x", { foundQuantity: 0 }))).toBe(true);
    expect(hasEnteredValues(v("x", { comment: " ", checkedAt: null }))).toBe(false);
    expect(retireQuestion(LIST[3], values.f2)).toBe('Retire "Thermometer"? What was already entered for it in this form will be removed.');
    expect(retireQuestion(LIST[1], undefined)).toBe('Retire "Clock"? It will no longer appear in future forms.');
    const fridge = areasOf(LIST)[1];
    expect(retireAreaQuestion(fridge, values)).toBe("Retire the area Walk In Fridge and its 2 items? What was already entered for 1 of them in this form will be removed.");
    expect(retireAreaQuestion(fridge, {})).toBe("Retire the area Walk In Fridge and its 2 items? They will no longer appear in future forms.");
    expect(retireAreaQuestion({ name: "Cameras", items: [{ id: "c" }] }, {})).toBe("Retire the area Cameras and its 1 item? They will no longer appear in future forms.");
  });
  it("when the expected quantity of an answered item changes, the result is kept and a hint appears until it is answered again", () => {
    const sixty = { ...LIST[0], expectedQuantity: 60 };
    const out = valuesForLiveList([sixty, ...LIST.slice(1)], values);
    expect(out.l1.result).toBe("OK"); // kept
    expect(quantityChangedSinceCheck(sixty, out.l1)).toBe(true);
    expect(QUANTITY_CHANGED_HINT).toBe("Expected quantity changed since this was checked");
    expect(quantityChangedSinceCheck(LIST[0], out.l1)).toBe(false); // same quantity: no hint
    expect(quantityChangedSinceCheck(sixty, { ...out.l1, ...answerPatch(sixty, "OK") })).toBe(false); // answered again
    expect(quantityChangedSinceCheck(sixty, v("l1", { comment: "x", expectedAtCheck: 58 }))).toBe(false); // not answered: nothing to hint at
    expect(quantityChangedSinceCheck(sixty, v("l1", { result: "OK" }))).toBe(false); // answered before quantities were recorded
  });
});

describe("snapshot at submit", () => {
  const values = map(
    v("l1", { result: "NOT_OK", comment: " Two missing ", foundQuantity: 56, checkedAt: NOW, expectedAtCheck: 58 }),
    v("l2", { result: "OK", comment: "", foundQuantity: 4 as number }), v("f1", { result: "OK" }), v("f2", { result: "OK", comment: "New probe" }),
    v("k1", { result: "OK" }), v("k2", { result: "OK" }),
  );
  const snap = buildSnapshot(LIST, values);
  it("stores section, area, name, expected quantity, position, result, comment, found quantity and time for every item", () => {
    expect(snap.items[0]).toEqual({ itemId: "l1", section: "glass_brittle", areaName: "Production and Storage Area", name: "Shatter Proof Lamps", expectedQuantity: 58, position: 1, result: "NOT_OK", comment: "Two missing", foundQuantity: 56, checkedAt: NOW });
    expect(snap.items.map((i) => [i.position, i.section, i.areaName, i.name, i.expectedQuantity, i.result])).toEqual([
      [1, "glass_brittle", "Production and Storage Area", "Shatter Proof Lamps", 58, "NOT_OK"], [2, "glass_brittle", "Production and Storage Area", "Clock", 1, "OK"],
      [3, "glass_brittle", "Walk In Fridge", "Light Bulbs", 1, "OK"], [4, "glass_brittle", "Walk In Fridge", "Thermometer", 1, "OK"],
      [5, "knives_blades", "Production and Storage Area", "Scissors", 1, "OK"], [6, "knives_blades", "Production and Storage Area", "Knife", 1, "OK"],
    ]);
    expect({ ok: snap.okCount, fail: snap.failCount }).toEqual({ ok: 5, fail: 1 });
  });
  it("a found quantity on an OK is not stored, and the draft-only quantity marker is not part of the record", () => {
    expect(snap.items[1].foundQuantity).toBeNull();
    expect(JSON.stringify(snap.items)).not.toContain("expectedAtCheck");
  });
  it("the expected quantity stored is the one in force at submit", () => {
    const later = buildSnapshot([{ ...LIST[0], expectedQuantity: 60 }, ...LIST.slice(1)], values);
    expect(later.items[0].expectedQuantity).toBe(60);
  });
  it("the record reads the same after the list is renamed, re-counted, moved or retired", () => {
    const view = viewOfSnapshot(snap.items);
    expect(layout(view.items)).toEqual(["G Production and Storage Area: Shatter Proof Lamps, Clock", "G Walk In Fridge: Light Bulbs, Thermometer", "K Production and Storage Area: Scissors, Knife"]);
    expect(view.items[0].expectedQuantity).toBe(58);
    expect(progressOf(view.items, view.values)).toEqual({ checked: 6, total: 6, ok: 5, notOk: 1 });
    const split = splitStored([...snap.items, { kind: "header", date: "2026-11-24", time: "10:05" }]);
    expect(split.header).toEqual({ kind: "header", date: "2026-11-24", time: "10:05" });
    expect(split.snapshots).toHaveLength(6);
  });
});

describe("periods: fixed halves of the month", () => {
  it("A is the 1st to the 15th, B is the 16th to the last day — for every month, February and leap years included", () => {
    const lastDays: Record<string, number> = { "01": 31, "02": 28, "03": 31, "04": 30, "05": 31, "06": 30, "07": 31, "08": 31, "09": 30, "10": 31, "11": 30, "12": 31 };
    for (const [m, last] of Object.entries(lastDays)) {
      expect(periodForDate(`2027-${m}-01`)).toEqual({ key: `2027-${m}-A`, start: `2027-${m}-01`, end: `2027-${m}-15`, half: "A" });
      expect(periodForDate(`2027-${m}-15`).key).toBe(`2027-${m}-A`);
      expect(periodForDate(`2027-${m}-16`)).toEqual({ key: `2027-${m}-B`, start: `2027-${m}-16`, end: `2027-${m}-${last}`, half: "B" });
      expect(periodForDate(`2027-${m}-${last}`).key).toBe(`2027-${m}-B`);
      expect(parsePeriod(`2027-${m}-B`)?.end).toBe(`2027-${m}-${last}`);
    }
    expect(periodForDate("2028-02-20").end).toBe("2028-02-29"); // leap year
    expect(periodForDate("2028-02-29").key).toBe("2028-02-B");
    expect(periodForDate("2100-02-20").end).toBe("2100-02-28"); // a century year that is not a leap year
    expect(periodForDate("2000-02-20").end).toBe("2000-02-29");
  });
  it("parses keys, rejects anything else, and names the dates", () => {
    expect(parsePeriod("2026-11-B")).toEqual({ key: "2026-11-B", start: "2026-11-16", end: "2026-11-30", half: "B" });
    for (const bad of ["2026-11", "2026-13-A", "2026-11-C", "2026-W48", "", "2026-1-A"]) expect(parsePeriod(bad), bad).toBeNull();
    expect(periodDates("2026-11-B")).toBe("November 16–30, 2026");
    expect(periodDates("2026-12-A")).toBe("December 1–15, 2026");
    expect(periodDates("2028-02-B")).toBe("February 16–29, 2028");
  });
  it("the next period, also across a month and a year", () => {
    expect(nextPeriod("2026-11-A")?.key).toBe("2026-11-B");
    expect(nextPeriod("2026-11-B")?.key).toBe("2026-12-A");
    expect(nextPeriod("2026-12-B")).toEqual({ key: "2027-01-A", start: "2027-01-01", end: "2027-01-15", half: "A" });
    expect(nextPeriod("nope")).toBeNull();
  });
  it("the message for a submitted period: who, when (Pacific date), and when the next form opens", () => {
    expect(submittedPeriodMessage({ period: "2026-11-B", submittedAt: "2026-11-24T20:03:00Z", submittedBy: "Hugo Ayala" })).toEqual({
      submitted: "The November 16–30, 2026 inspection was submitted on 11/24/2026 by Hugo Ayala.",
      next: "The next form, for December 1–15, 2026, opens on Tuesday, December 1, 2026 (Pacific time).",
      nextOpens: "2026-12-01",
    });
    expect(submittedPeriodMessage({ period: "2026-12-A", submittedAt: "2026-12-16T07:30:00Z", submittedBy: "Hugo Ayala" }).submitted).toContain("on 12/15/2026 by"); // 11:30 PM Pacific on the 15th
    expect(submittedPeriodMessage({ period: "2026-12-B", submittedAt: null, submittedBy: null })).toMatchObject({
      submitted: "The December 16–31, 2026 inspection was submitted.", next: "The next form, for January 1–15, 2027, opens on Friday, January 1, 2027 (Pacific time).",
    });
    const rows = [{ period: "2026-11-B", status: "submitted" }, { period: "2026-12-A", status: "draft" }];
    expect(submittedForDate(rows, "2026-11-30")?.period).toBe("2026-11-B");
    expect(submittedForDate(rows, "2026-12-01")).toBeNull();
  });
});
