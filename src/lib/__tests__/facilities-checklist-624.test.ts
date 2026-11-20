import { describe, it, expect } from "vitest";
import {
  buildSnapshot, groupsOf, hasEnteredValues, itemProblem, matchGroupName, nextPeriod, parsePeriod, periodDates, periodForDate, periodLabel, planReorder,
  positionOf, progressOf, retireQuestion, sortItems, sortOrderForNew, splitStored, submitProblems, submittedForDate, submittedPeriodMessage, taskInPeriod,
  valuesForLiveList, viewOfSnapshot, withCheckedAt, type ChecklistItem, type ItemValues,
} from "@/lib/facilities-checklist-624";

const it_ = (id: string, groupName: string, name: string, sortOrder: number, description = `Inspect ${name}.`): ChecklistItem => ({ id, groupName, name, description, sortOrder });
const LIST: ChecklistItem[] = [
  it_("d1", "Doors", "Production Doors", 10),
  it_("d2", "Doors", "Emergency doors", 20),
  it_("c1", "Ceilings", "Production Ceiling", 60),
  it_("w1", "Walls", "Walls of productions", 80),
  it_("s1", "Sinks", "Sinks", 140),
];
const v = (itemId: string, over: Partial<ItemValues> = {}): ItemValues => ({ itemId, ...over });
const map = (...list: ItemValues[]) => Object.fromEntries(list.map((x) => [x.itemId, x]));
const ALL_OK = map(...LIST.map((i) => v(i.id, { result: "OK" })));
const apply = (items: ChecklistItem[], changes: { id: string; sortOrder: number; groupName: string }[]) =>
  items.map((i) => ({ ...i, ...(changes.find((c) => c.id === i.id) ?? {}) }));
const names = (items: ChecklistItem[]) => groupsOf(items).map((g) => `${g.name}: ${g.items.map((i) => i.name).join(", ")}`);

describe("the list", () => {
  it("groups appear in the order of their first item; items by sort order inside the group", () => {
    const shuffled = [LIST[4], LIST[2], LIST[1], LIST[3], LIST[0]];
    expect(sortItems(shuffled).map((i) => i.id)).toEqual(["d1", "d2", "c1", "w1", "s1"]);
    expect(groupsOf(shuffled).map((g) => g.name)).toEqual(["Doors", "Ceilings", "Walls", "Sinks"]);
    expect(positionOf(LIST, "c1")).toBe(3);
  });

  it("an item added later to an existing group shows at the end of that group, not at the end of the form", () => {
    const added = [...LIST, it_("d9", "Doors", "Side door", sortOrderForNew(LIST))];
    expect(names(added)[0]).toBe("Doors: Production Doors, Emergency doors, Side door");
    expect(groupsOf(added).map((g) => g.name)).toEqual(["Doors", "Ceilings", "Walls", "Sinks"]);
  });

  it("an item in a new group makes that group the last one", () => {
    const added = [...LIST, it_("r1", "Roof", "Roof hatch", sortOrderForNew(LIST))];
    expect(groupsOf(added).map((g) => g.name)).toEqual(["Doors", "Ceilings", "Walls", "Sinks", "Roof"]);
    expect(sortOrderForNew(LIST)).toBe(150);
    expect(sortOrderForNew([])).toBe(10);
  });
});

describe("validation of a check", () => {
  it("needs a name and a group; the description is optional", () => {
    expect(itemProblem({ name: "Side door", groupName: "Doors", description: "" })).toBeNull();
    expect(itemProblem({ name: "  ", groupName: "Doors" })).toBe("Enter a name for the check.");
    expect(itemProblem({ name: 5, groupName: "Doors" })).toBe("Enter a name for the check.");
    expect(itemProblem({ name: "Side door", groupName: " " })).toBe("Choose a group or type a new group name.");
    expect(itemProblem({ description: 7 })).toBe("The description must be text.");
  });
  it("limits the lengths", () => {
    expect(itemProblem({ name: "x".repeat(121) })).toBe("The name is too long (120 characters at most).");
    expect(itemProblem({ groupName: "x".repeat(61) })).toBe("The group name is too long (60 characters at most).");
    expect(itemProblem({ description: "x".repeat(401) })).toBe("The description is too long (400 characters at most).");
    expect(itemProblem({ name: "x".repeat(120), groupName: "x".repeat(60), description: "x".repeat(400) })).toBeNull();
  });
  it("only the fields that are sent are checked (a rename does not need a group)", () => {
    expect(itemProblem({ name: "New name" })).toBeNull();
    expect(itemProblem({})).toBeNull();
  });
  it("an existing group typed with other capitals or spaces is that group", () => {
    expect(matchGroupName(LIST, "  doors ")).toBe("Doors");
    expect(matchGroupName(LIST, "Roof")).toBe("Roof");
  });
});

describe("moving and regrouping", () => {
  it("up and down swap places with the neighbour in the same group", () => {
    expect(names(apply(LIST, planReorder(LIST, { id: "d2", move: "up" })))[0]).toBe("Doors: Emergency doors, Production Doors");
    expect(names(apply(LIST, planReorder(LIST, { id: "d1", move: "down" })))[0]).toBe("Doors: Emergency doors, Production Doors");
  });
  it("the first cannot move up, the last cannot move down, and a move never crosses into another group", () => {
    expect(planReorder(LIST, { id: "d1", move: "up" })).toEqual([]);
    expect(planReorder(LIST, { id: "d2", move: "down" })).toEqual([]);
    expect(planReorder(LIST, { id: "c1", move: "up" })).toEqual([]); // alone in Ceilings
    expect(planReorder(LIST, { id: "nope", move: "up" })).toEqual([]);
  });
  it("moving the first item of a group does not change the order of the groups", () => {
    const after = apply(LIST, planReorder(LIST, { id: "d1", move: "down" }));
    expect(groupsOf(after).map((g) => g.name)).toEqual(["Doors", "Ceilings", "Walls", "Sinks"]);
  });
  it("items that share a rank can still be reordered", () => {
    const tied = [it_("a", "Doors", "A", 10), it_("b", "Doors", "B", 10), it_("c", "Doors", "C", 10)];
    const after = apply(tied, planReorder(tied, { id: "c", move: "up" }));
    expect(sortItems(after).map((i) => i.name)).toEqual(["A", "C", "B"]);
  });
  it("changing the group puts the check at the end of that group", () => {
    const after = apply(LIST, planReorder(LIST, { id: "s1", groupName: "doors" }));
    expect(names(after)).toEqual(["Doors: Production Doors, Emergency doors, Sinks", "Ceilings: Production Ceiling", "Walls: Walls of productions"]);
  });
  it("a new group name starts a new group, placed last; the same group changes nothing", () => {
    const after = apply(LIST, planReorder(LIST, { id: "d2", groupName: "Exits" }));
    expect(names(after)).toEqual(["Doors: Production Doors", "Ceilings: Production Ceiling", "Walls: Walls of productions", "Sinks: Sinks", "Exits: Emergency doors"]);
    expect(planReorder(LIST, { id: "d2", groupName: " Doors " })).toEqual([]);
  });
});

describe("progress and submit validation, in plain words", () => {
  it("counts the checks that have a result", () => {
    expect(progressOf(LIST, map(v("d1", { result: "OK" }), v("d2", { result: "NOT_OK" }), v("c1", { note: "later" })))).toEqual({ checked: 2, total: 5, ok: 1, notOk: 1 });
    expect(progressOf(LIST, {})).toEqual({ checked: 0, total: 5, ok: 0, notOk: 0 });
  });
  it("every check needs a result, and initials are required", () => {
    expect(submitProblems(LIST, map(v("d1", { result: "OK" }), v("c1", { result: "OK" })), "")).toEqual([
      "Enter your initials at the top.", "Emergency doors needs OK or Not OK.", "Walls of productions needs OK or Not OK.", "Sinks needs OK or Not OK.",
    ]);
    expect(submitProblems(LIST, ALL_OK, "HA")).toEqual([]);
  });
  it("a Not OK needs a corrective action — and then no longer blocks submission", () => {
    const failing = { ...ALL_OK, w1: v("w1", { result: "NOT_OK" }) };
    expect(submitProblems(LIST, failing, "HA")).toEqual(["Walls of productions is Not OK and needs a corrective action."]);
    expect(submitProblems(LIST, { ...failing, w1: v("w1", { result: "NOT_OK", correctiveAction: "   " }) }, "HA")).toHaveLength(1);
    expect(submitProblems(LIST, { ...failing, w1: v("w1", { result: "NOT_OK", correctiveAction: "Patched the crack" }) }, "HA")).toEqual([]);
  });
  it("an OK needs nothing more, and a note is always optional", () => {
    expect(submitProblems(LIST, { ...ALL_OK, d1: v("d1", { result: "OK", note: "" }) }, "HA")).toEqual([]);
  });
  it("an empty checklist cannot be submitted", () => {
    expect(submitProblems([], {}, "HA")).toEqual(["The checklist has no items. Add at least one in Edit checklist."]);
  });
});

describe("checkedAt", () => {
  it("is stamped when a check first gets a result, kept afterwards, and cleared if the result goes away", () => {
    const first = withCheckedAt(undefined, v("d1", { result: "OK" }), "2026-11-24T18:00:00.000Z");
    expect(first.checkedAt).toBe("2026-11-24T18:00:00.000Z");
    const changed = withCheckedAt(first, { ...first, result: "NOT_OK" }, "2026-11-24T19:00:00.000Z");
    expect(changed.checkedAt).toBe("2026-11-24T18:00:00.000Z");
    expect(withCheckedAt(first, v("d1", { result: "NOT_OK" }), "2026-11-24T19:00:00.000Z").checkedAt).toBe("2026-11-24T18:00:00.000Z"); // the client lost it, the server keeps it
    expect(withCheckedAt(changed, { ...changed, result: null }, "x").checkedAt).toBeNull();
    expect(withCheckedAt(undefined, v("d1", { note: "only a note" }), "x").checkedAt).toBeNull();
  });
});

describe("the draft follows the live checklist", () => {
  const values = map(v("d1", { result: "OK" }), v("d2", { result: "NOT_OK", correctiveAction: "Fixed latch" }));
  it("a new check appears blank; a renamed check keeps its values (they are keyed by id)", () => {
    const live = [...LIST.map((i) => (i.id === "d1" ? { ...i, name: "Main production doors" } : i)), it_("n1", "Doors", "Side door", 150)];
    const out = valuesForLiveList(live, values);
    expect(out.d1.result).toBe("OK");
    expect(out.n1).toBeUndefined();
    expect(progressOf(live, out)).toMatchObject({ checked: 2, total: 6 });
    expect(submitProblems(live, out, "HA")).toContain("Side door needs OK or Not OK.");
  });
  it("a retired check disappears with its values", () => {
    const out = valuesForLiveList(LIST.filter((i) => i.id !== "d2"), values);
    expect(out.d2).toBeUndefined();
    expect(Object.keys(out)).toEqual(["d1"]);
  });
  it("accepts the stored array form and ignores entries without an item id", () => {
    expect(Object.keys(valuesForLiveList(LIST, [v("d1", { result: "OK" }), v("gone", { result: "OK" }), { kind: "header" } as never]))).toEqual(["d1"]);
    expect(valuesForLiveList(LIST, null)).toEqual({});
  });
  it("retiring asks first, and says so when something was already entered", () => {
    expect(hasEnteredValues(values.d1)).toBe(true);
    expect(hasEnteredValues(v("d1", { note: "dusty" }))).toBe(true);
    expect(hasEnteredValues(v("d1", { note: "  ", checkedAt: null }))).toBe(false);
    expect(hasEnteredValues(undefined)).toBe(false);
    expect(retireQuestion(LIST[1], values.d2)).toBe('Retire "Emergency doors"? What was already entered for it in this form will be removed.');
    expect(retireQuestion(LIST[2], undefined)).toBe('Retire "Production Ceiling"? It will no longer appear in future forms.');
  });
});

describe("snapshot at submit", () => {
  const values = map(
    v("d1", { result: "OK", checkedAt: "2026-11-24T18:00:00.000Z", note: " Clean " }),
    v("d2", { result: "NOT_OK", correctiveAction: " Fixed latch ", reInspected: true, reInspectedAt: "2026-11-24T19:00:00.000Z" }),
    v("c1", { result: "OK", correctiveAction: "left over from an earlier Not OK", reInspected: true }),
    v("w1", { result: "OK" }), v("s1", { result: "OK" }),
  );
  const snap = buildSnapshot(LIST, values);

  it("stores group, name, description, result, corrective action, note and time for every check, in form order", () => {
    expect(snap.items.map((i) => [i.position, i.groupName, i.name, i.result])).toEqual([
      [1, "Doors", "Production Doors", "OK"], [2, "Doors", "Emergency doors", "NOT_OK"], [3, "Ceilings", "Production Ceiling", "OK"],
      [4, "Walls", "Walls of productions", "OK"], [5, "Sinks", "Sinks", "OK"],
    ]);
    expect(snap.items[0]).toMatchObject({ description: "Inspect Production Doors.", note: "Clean", checkedAt: "2026-11-24T18:00:00.000Z", correctiveAction: "" });
    expect(snap.items[1]).toMatchObject({ correctiveAction: "Fixed latch", reInspected: true, reInspectedAt: "2026-11-24T19:00:00.000Z" });
    expect({ ok: snap.okCount, fail: snap.failCount }).toEqual({ ok: 4, fail: 1 });
  });
  it("a corrective action left over on a check that is now OK is not stored", () => {
    expect(snap.items[2]).toMatchObject({ correctiveAction: "", reInspected: false, reInspectedAt: null });
  });
  it("the record reads the same after the checklist is renamed, regrouped or retired", () => {
    const view = viewOfSnapshot(snap.items);
    expect(names(view.items)).toEqual(["Doors: Production Doors, Emergency doors", "Ceilings: Production Ceiling", "Walls: Walls of productions", "Sinks: Sinks"]);
    expect(progressOf(view.items, view.values)).toEqual({ checked: 5, total: 5, ok: 4, notOk: 1 });
  });
  it("the header entry is kept apart from the items", () => {
    const split = splitStored([...snap.items, { kind: "header", date: "2026-11-24", time: "10:05" }]);
    expect(split.header).toEqual({ kind: "header", date: "2026-11-24", time: "10:05" });
    expect(split.snapshots).toHaveLength(5);
    expect(splitStored(null)).toEqual({ header: null, entries: [], snapshots: [] });
  });
});

describe("periods: one ISO week", () => {
  it("key, Monday and Sunday", () => {
    expect(periodForDate("2026-11-26")).toEqual({ key: "2026-W48", start: "2026-11-23", end: "2026-11-29" });
    expect(periodForDate("2026-12-03")).toEqual({ key: "2026-W49", start: "2026-11-30", end: "2026-12-06" });
    expect(periodForDate("2027-01-01")).toEqual({ key: "2026-W53", start: "2026-12-28", end: "2027-01-03" });
    expect(parsePeriod("2026-W48")).toEqual({ key: "2026-W48", start: "2026-11-23", end: "2026-11-29" });
    expect(parsePeriod("2026-11-B")).toBeNull();
  });
  it("the next week, also across a month and a year", () => {
    expect(nextPeriod("2026-W48")?.key).toBe("2026-W49");
    expect(nextPeriod("2026-W52")?.key).toBe("2026-W53");
    expect(nextPeriod("2026-W53")).toEqual({ key: "2027-W01", start: "2027-01-04", end: "2027-01-10" });
    expect(nextPeriod("nope")).toBeNull();
  });
  it("dates in words", () => {
    expect(periodDates("2026-W48")).toBe("Nov 23–29, 2026");
    expect(periodDates("2026-W49")).toBe("Nov 30 – Dec 6, 2026");
    expect(periodDates("2026-W53")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(periodLabel("2026-W48")).toBe("Week 48 · Nov 23–29, 2026");
  });
});

describe("the message for a submitted week", () => {
  it("who and when, and the Monday the next form opens", () => {
    expect(submittedPeriodMessage({ period: "2026-W48", submittedAt: "2026-11-26T20:03:00Z", submittedBy: "Hugo Ayala" })).toEqual({
      submitted: "The Nov 23–29, 2026 checklist was submitted on 11/26/2026 by Hugo Ayala.",
      next: "The next form, for Nov 30 – Dec 6, 2026, opens on Monday, November 30, 2026 (Pacific time).",
      nextOpens: "2026-11-30",
    });
  });
  it("across the year boundary", () => {
    expect(submittedPeriodMessage({ period: "2026-W53", submittedAt: "2026-12-31T18:00:00Z", submittedBy: "Hugo Ayala" })).toEqual({
      submitted: "The Dec 28, 2026 – Jan 3, 2027 checklist was submitted on 12/31/2026 by Hugo Ayala.",
      next: "The next form, for Jan 4–10, 2027, opens on Monday, January 4, 2027 (Pacific time).",
      nextOpens: "2027-01-04",
    });
  });
  it("the submitted date is the Pacific date", () => {
    // 05:30 UTC on Monday the 30th is still Sunday the 29th, 9:30 PM, in California
    expect(submittedPeriodMessage({ period: "2026-W48", submittedAt: "2026-11-30T05:30:00Z", submittedBy: "Hugo Ayala" }).submitted).toContain("on 11/29/2026 by");
    expect(submittedPeriodMessage({ period: "2026-W48", submittedAt: null, submittedBy: " " }).submitted).toBe("The Nov 23–29, 2026 checklist was submitted.");
  });
  it("only a submitted record of the week today falls in counts", () => {
    const rows = [{ period: "2026-W48", status: "submitted" }, { period: "2026-W47", status: "submitted" }, { period: "2026-W49", status: "draft" }];
    expect(submittedForDate(rows, "2026-11-23")?.period).toBe("2026-W48");
    expect(submittedForDate(rows, "2026-11-29")?.period).toBe("2026-W48");
    expect(submittedForDate(rows, "2026-11-30")).toBeNull(); // week 49 is only a draft
    expect(submittedForDate(rows, "2026-12-08")).toBeNull();
  });
});

describe("the task of a week", () => {
  const inst = (id: string, due: string, status = "UPCOMING") => ({ id, dueDate: new Date(`${due}T00:00:00Z`), status });
  const week48 = { start: "2026-11-23", end: "2026-11-29" };
  it("is the instance due inside Monday..Sunday (a Thursday), not the one due on the week's last day", () => {
    const all = [inst("w47", "2026-11-19", "OVERDUE"), inst("w48", "2026-11-26"), inst("w49", "2026-12-03")];
    expect(taskInPeriod(all, week48)?.id).toBe("w48");
    expect(taskInPeriod(all, { start: "2026-11-16", end: "2026-11-22" })?.id).toBe("w47");
    expect(taskInPeriod(all, { start: "2026-12-07", end: "2026-12-13" })).toBeNull();
  });
  it("works for any due weekday, including Monday and Sunday", () => {
    expect(taskInPeriod([inst("mon", "2026-11-23")], week48)?.id).toBe("mon");
    expect(taskInPeriod([inst("sun", "2026-11-29")], week48)?.id).toBe("sun");
    expect(taskInPeriod([inst("next-mon", "2026-11-30")], week48)).toBeNull();
  });
  it("an open task wins over a closed one in the same week", () => {
    expect(taskInPeriod([inst("skipped", "2026-11-25", "SKIPPED"), inst("open", "2026-11-26", "IN_PROGRESS")], week48)?.id).toBe("open");
    expect(taskInPeriod([inst("done", "2026-11-26", "DONE")], week48)?.id).toBe("done");
  });
});
