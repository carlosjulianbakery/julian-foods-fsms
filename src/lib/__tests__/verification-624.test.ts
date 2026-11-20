import { describe, it, expect } from "vitest";
import {
  buildSnapshot, fixedResult, iceWaterResult, itemResult, parsePeriod, periodForDate, periodLabel, portablePassed, positionOf, progressOf,
  referenceOptions, scalePointResult, scaleResult, splitStored, submitProblems, toHundredths, toTenths, valuesForLiveList, viewOfSnapshot, withCheckedAt,
  INSTRUCTIONS, type Equipment, type ItemValues,
} from "@/lib/verification-624";

const eq = (id: string, section: Equipment["section"], name: string, sortOrder: number, over: Partial<Equipment> = {}): Equipment =>
  ({ id, section, name, location: section === "scale" ? "624 Garrison" : "", inUse: true, sortOrder, ...over });
const LIST: Equipment[] = [
  eq("p1", "portable_thermometer", "Dial Probe Thermometer", 10),
  eq("p2", "portable_thermometer", "Dial Oven Thermometer", 20),
  eq("p3", "portable_thermometer", "Dial Oven Thermometer #2", 30, { inUse: false }),
  eq("f1", "fixed_thermometer", "Cold Room Thermometer", 10),
  eq("s1", "scale", "Digital Scale", 10),
];
const v = (equipmentId: string, over: Partial<ItemValues> = {}): ItemValues => ({ equipmentId, ...over });
const map = (...list: ItemValues[]) => Object.fromEntries(list.map((x) => [x.equipmentId, x]));
const GOOD_SCALE = [1.1, 1.1, 1.1, 1.1, 1.1];

describe("ranges at the exact boundaries", () => {
  it("portable: 31.0 and 33.0 pass, 30.9 and 33.1 fail", () => {
    expect([31.0, 32, 33.0].map(iceWaterResult)).toEqual(["OK", "OK", "OK"]);
    expect([30.9, 33.1, 0, -5].map(iceWaterResult)).toEqual(["NOT_OK", "NOT_OK", "NOT_OK", "NOT_OK"]);
    expect(iceWaterResult(null)).toBeNull();
    expect(iceWaterResult(undefined)).toBeNull();
  });

  it("non-movable: a difference of exactly 5.0 passes in both directions, 5.1 fails", () => {
    expect(fixedResult(38.0, 43.0)).toBe("OK");
    expect(fixedResult(43.0, 38.0)).toBe("OK");
    expect(fixedResult(38.0, 43.1)).toBe("NOT_OK");
    expect(fixedResult(-2.5, 2.5)).toBe("OK");
    expect(fixedResult(350, 355.1)).toBe("NOT_OK");
    expect(fixedResult(38, null)).toBeNull();
  });

  it("scale point: 1.00 and 1.20 pass, 0.99 and 1.21 fail", () => {
    expect([1.0, 1.1, 1.2].map(scalePointResult)).toEqual(["OK", "OK", "OK"]);
    expect([0.99, 1.21].map(scalePointResult)).toEqual(["NOT_OK", "NOT_OK"]);
  });

  it("integer comparison: values that are inexact in floating point still land on the right side", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the reason for comparing integers
    expect(toTenths(32.99999999999999)).toBe(330);
    expect(iceWaterResult(30.999999999999996)).toBe("OK"); // 31.0 as typed after arithmetic
    expect(toHundredths(1.2000000000000002)).toBe(120);
    expect(scalePointResult(1.2000000000000002)).toBe("OK");
    expect(scalePointResult(0.1 + 0.9)).toBe("OK"); // 1.00
    expect(fixedResult(0.1 + 0.2, 5.3)).toBe("OK"); // 0.3 vs 5.3 = exactly 5.0
    expect(toTenths(33.04)).toBe(330); // entered to one decimal: 33.0
  });

  it("a scale fails if any one of its five points fails, and has no result until all five are entered", () => {
    expect(scaleResult(GOOD_SCALE)).toEqual({ overall: "OK", perPoint: ["OK", "OK", "OK", "OK", "OK"] });
    expect(scaleResult([1.1, 1.1, 1.25, 1.1, 1.1])).toEqual({ overall: "NOT_OK", perPoint: ["OK", "OK", "NOT_OK", "OK", "OK"] });
    expect(scaleResult([1.1, 1.1, null, 1.1, 1.1]).overall).toBeNull();
    expect(scaleResult(undefined).overall).toBeNull();
  });
});

describe("results are computed, never chosen", () => {
  it("non-movable needs a reference before it has a result", () => {
    expect(itemResult("fixed_thermometer", v("f1", { target: 38, fixedReading: 39 }))).toBeNull();
    expect(itemResult("fixed_thermometer", v("f1", { referenceId: "p1", target: 38, fixedReading: 39 }))).toBe("OK");
  });

  it("reference dropdown: only in-use portables that passed in this record (a passing re-check counts)", () => {
    const values = map(v("p1", { reading: 32 }), v("p2", { reading: 36, recheck: 32.4 }), v("p3", { reading: 32 }));
    expect(referenceOptions(LIST, values).map((e) => e.id)).toEqual(["p1", "p2"]); // p3 is not in use
    expect(referenceOptions(LIST, map(v("p1", { reading: 35 }), v("p2", { reading: 36, recheck: 34 })))).toEqual([]);
    expect(portablePassed(v("p2", { reading: 36, recheck: 32.4 }))).toBe(true);
    // the item itself stays Not OK: the first reading failed and needs a corrective action
    expect(itemResult("portable_thermometer", v("p2", { reading: 36, recheck: 32.4 }))).toBe("NOT_OK");
  });

  it("progress counts in-use items only", () => {
    const values = map(v("p1", { reading: 32 }), v("p2", { reading: 40 }), v("s1", { points: GOOD_SCALE }));
    expect(progressOf(LIST, values)).toEqual({ verified: 3, total: 4, ok: 2, notOk: 1, notInUse: 1 });
    expect(progressOf(LIST, {})).toEqual({ verified: 0, total: 4, ok: 0, notOk: 0, notInUse: 1 });
  });

  it("checkedAt is stamped when an item first gets a result, kept afterwards, and cleared if the result goes away", () => {
    const first = withCheckedAt("portable_thermometer", undefined, v("p1", { reading: 32 }), "2026-11-20T18:00:00.000Z");
    expect(first.checkedAt).toBe("2026-11-20T18:00:00.000Z");
    const later = withCheckedAt("portable_thermometer", first, { ...first, reading: 32.5 }, "2026-11-20T19:00:00.000Z");
    expect(later.checkedAt).toBe("2026-11-20T18:00:00.000Z");
    expect(withCheckedAt("portable_thermometer", later, { ...later, reading: null }, "2026-11-20T20:00:00.000Z").checkedAt).toBeNull();
    expect(withCheckedAt("scale", undefined, v("s1", { points: [1.1, null, null, null, null] }), "x").checkedAt).toBeNull();
  });
});

describe("submit validation, in plain words", () => {
  const complete = map(v("p1", { reading: 32 }), v("p2", { reading: 32.2 }), v("f1", { referenceId: "p1", target: 38, fixedReading: 39 }), v("s1", { points: GOOD_SCALE }));

  it("a complete form with initials has nothing missing", () => {
    expect(submitProblems(LIST, complete, "HGA")).toEqual([]);
  });

  it("names what is missing for each kind of item, and skips items not in use", () => {
    expect(submitProblems(LIST, {}, "")).toEqual([
      "Enter your initials at the top.",
      "Dial Probe Thermometer needs its ice water reading.",
      "Dial Oven Thermometer needs its ice water reading.",
      "Cold Room Thermometer needs a reference thermometer.",
      "Digital Scale needs all five weight readings.",
    ]);
    expect(submitProblems(LIST, { ...complete, f1: v("f1", { referenceId: "p1", target: 38 }) }, "HGA")).toEqual([
      "Cold Room Thermometer needs the target value and its own reading.",
    ]);
  });

  it("a Not OK item does not block submission once it has a corrective action", () => {
    const failing = { ...complete, p2: v("p2", { reading: 36 }) };
    expect(submitProblems(LIST, failing, "HGA")).toEqual(["Dial Oven Thermometer is Not OK and needs a corrective action."]);
    expect(submitProblems(LIST, { ...failing, p2: v("p2", { reading: 36, correctiveAction: "   " }) }, "HGA")).toHaveLength(1);
    expect(submitProblems(LIST, { ...failing, p2: v("p2", { reading: 36, correctiveAction: "Recalibrated the dial" }) }, "HGA")).toEqual([]);
  });
});

describe("the draft follows the live equipment list", () => {
  const values = map(v("p1", { reading: 32 }), v("p2", { reading: 32 }), v("f1", { referenceId: "p2", target: 38, fixedReading: 39 }));

  it("a new item appears blank; a renamed item keeps its values (they are keyed by id)", () => {
    const live = [...LIST.map((e) => (e.id === "p1" ? { ...e, name: "Dial Probe (new name)" } : e)), eq("p9", "portable_thermometer", "Brand New", 40)];
    const out = valuesForLiveList(live, values);
    expect(out.p1.reading).toBe(32);
    expect(out.p9).toBeUndefined();
    expect(progressOf(live, out).total).toBe(5);
  });

  it("a retired item disappears with its values, and a reference to it is cleared", () => {
    const out = valuesForLiveList(LIST.filter((e) => e.id !== "p2"), values);
    expect(out.p2).toBeUndefined();
    expect(out.f1.referenceId).toBeNull();
    expect(itemResult("fixed_thermometer", out.f1)).toBeNull();
  });

  it("a reference is also cleared when that portable no longer passes or is marked not in use", () => {
    expect(valuesForLiveList(LIST, { ...values, p2: v("p2", { reading: 40 }) }).f1.referenceId).toBeNull();
    expect(valuesForLiveList(LIST.map((e) => (e.id === "p2" ? { ...e, inUse: false } : e)), values).f1.referenceId).toBeNull();
  });

  it("accepts the stored array form and ignores entries without an equipment id", () => {
    expect(Object.keys(valuesForLiveList(LIST, [v("p1", { reading: 32 }), v("gone", { reading: 1 })]))).toEqual(["p1"]);
    expect(valuesForLiveList(LIST, null)).toEqual({});
  });
});

describe("snapshot at submit", () => {
  const values = map(
    v("p1", { reading: 32, checkedAt: "2026-11-20T18:00:00.000Z" }),
    v("p2", { reading: 36, recheck: 32.1, correctiveAction: "Recalibrated", notes: "Loose dial" }),
    v("f1", { referenceId: "p1", target: 38, fixedReading: 44 , correctiveAction: "Tagged for service" }),
    v("s1", { points: [1.1, 1.1, 1.3, 1.1, 1.1], correctiveAction: "Levelled the scale" }),
  );
  const snap = buildSnapshot(LIST, values);

  it("stores names, locations, in-use flags, positions, readings, results, corrective actions and the reference used", () => {
    expect(snap.items.map((i) => [i.section, i.position, i.name, i.inUse, i.result])).toEqual([
      ["portable_thermometer", 1, "Dial Probe Thermometer", true, "OK"],
      ["portable_thermometer", 2, "Dial Oven Thermometer", true, "NOT_OK"],
      ["portable_thermometer", 3, "Dial Oven Thermometer #2", false, null],
      ["fixed_thermometer", 1, "Cold Room Thermometer", true, "NOT_OK"],
      ["scale", 1, "Digital Scale", true, "NOT_OK"],
    ]);
    expect(snap.items[1]).toMatchObject({ reading: 36, recheck: 32.1, correctiveAction: "Recalibrated", notes: "Loose dial" });
    expect(snap.items[3]).toMatchObject({ referenceId: "p1", referenceName: "Dial Probe Thermometer", target: 38, fixedReading: 44 });
    expect(snap.items[4]).toMatchObject({ location: "624 Garrison", points: [1.1, 1.1, 1.3, 1.1, 1.1], pointResults: ["OK", "OK", "NOT_OK", "OK", "OK"] });
    expect(snap.items[0].checkedAt).toBe("2026-11-20T18:00:00.000Z");
    expect({ ok: snap.okCount, fail: snap.failCount, notInUse: snap.notInUseCount }).toEqual({ ok: 1, fail: 3, notInUse: 1 });
  });

  it("a later rename or retirement does not change what the snapshot shows", () => {
    const renamedLive = LIST.filter((e) => e.id !== "s1").map((e) => (e.id === "p1" ? { ...e, name: "Renamed later" } : e));
    expect(renamedLive.find((e) => e.id === "p1")!.name).toBe("Renamed later");
    const view = viewOfSnapshot(snap.items);
    expect(view.equipment.map((e) => e.name)).toContain("Dial Probe Thermometer");
    expect(view.equipment.map((e) => e.name)).toContain("Digital Scale");
    expect(progressOf(view.equipment, view.values)).toEqual({ verified: 4, total: 4, ok: 1, notOk: 3, notInUse: 1 });
  });

  it("the header entry is kept apart from the items", () => {
    const stored = [...snap.items, { kind: "header", date: "2026-11-20", time: "09:30" }];
    const split = splitStored(stored);
    expect(split.header).toEqual({ kind: "header", date: "2026-11-20", time: "09:30" });
    expect(split.snapshots).toHaveLength(5);
    expect(splitStored(null)).toEqual({ header: null, entries: [], snapshots: [] });
  });

  it("position is the place within the section", () => {
    expect(positionOf(LIST, "p3")).toBe(3);
    expect(positionOf(LIST, "f1")).toBe(1);
    expect(positionOf(LIST, "missing")).toBe(0);
  });
});

describe("periods", () => {
  it("A is the 1st to the 15th, B is the 16th to the last day", () => {
    expect(periodForDate("2026-11-01")).toEqual({ key: "2026-11-A", start: "2026-11-01", end: "2026-11-15", half: "A" });
    expect(periodForDate("2026-11-15").key).toBe("2026-11-A");
    expect(periodForDate("2026-11-16")).toEqual({ key: "2026-11-B", start: "2026-11-16", end: "2026-11-30", half: "B" });
    expect(periodForDate("2026-11-30").key).toBe("2026-11-B");
  });

  it("the second half ends on the real last day: 28, 29, 30 or 31", () => {
    expect(periodForDate("2027-02-20").end).toBe("2027-02-28");
    expect(periodForDate("2028-02-20").end).toBe("2028-02-29");
    expect(periodForDate("2026-04-16").end).toBe("2026-04-30");
    expect(periodForDate("2026-12-31").end).toBe("2026-12-31");
  });

  it("parses and labels period keys; rejects anything else", () => {
    expect(parsePeriod("2026-11-B")).toEqual({ key: "2026-11-B", start: "2026-11-16", end: "2026-11-30", half: "B" });
    expect(parsePeriod("2026-11-A")?.end).toBe("2026-11-15");
    for (const bad of ["2026-11", "2026-13-A", "2026-11-C", "", "2026-1-A"]) expect(parsePeriod(bad)).toBeNull();
    expect(periodLabel("2026-11-B")).toBe("November 2026 · 16–30");
    expect(periodLabel("2028-02-B")).toBe("February 2028 · 16–29");
  });
});

describe("instructions are the verbatim text", () => {
  it("scales, portable and non-movable procedures", () => {
    expect(INSTRUCTIONS.scale).toBe("Place the scale on a flat surface, away from any air flow or vibration for best results. Place the 500 gram weight over the points seen in the image in each corner and center. The margin is 1.10 lb ± 0.1 lb. Report any irregularity, e.g.: broken parts, sanitation, low battery, unusual noises, among others.");
    expect(INSTRUCTIONS.portable_thermometer).toBe("Place a container with water and ice in equal parts, place the thermometer 1 cm deep in the ice water, for 2 minutes until reaching 32°F (0°C), Report any irregularities, e.g. parts broken or missing, sanitation, low battery.");
    expect(INSTRUCTIONS.fixed_thermometer).toBe("Use a portable thermometer that has been recently verified for accuracy, and use its reading as the target value. Compare the reading of the non-movable thermometer to the target reading. Report any irregularities.");
  });
});
