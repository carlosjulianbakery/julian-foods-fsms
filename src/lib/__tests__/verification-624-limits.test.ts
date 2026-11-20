import { describe, it, expect } from "vitest";
import {
  buildSnapshot, cleanSpec, clearScaleReadings, defaultSpec, fixedResult, hasSpec, iceBounds, iceWaterResult, instructionsFor, instructionsVerOf, itemResult,
  marginText, progressOf, referenceOptions, scaleBounds, scalePointPatch, scalePointResult, scaleResult, scaleSpecOf, specChangeClearsReadings, specProblem,
  splitStored, submitProblems, thermometerToleranceOf, valuesForLiveList, viewOfSnapshot, withCheckedAt,
  INSTRUCTIONS, INSTRUCTIONS_BY_VERSION, INSTRUCTIONS_VER_VERIFICATION, type Equipment, type ItemValues, type ScaleSpec,
} from "@/lib/verification-624";

const eq = (id: string, section: Equipment["section"], name: string, sortOrder: number, over: Partial<Equipment> = {}): Equipment =>
  ({ id, section, name, location: section === "scale" ? "624 Garrison" : "", inUse: true, sortOrder, ...over });
const G = (testWeight: number, tolerance: number) => ({ testWeight, weightUnit: "g", tolerance });

/** The production list as it stands after this change. */
const LIST: Equipment[] = [
  eq("p1", "portable_thermometer", "Dial Probe Thermometer", 10, { tolerance: 1 }),
  eq("p2", "portable_thermometer", "Digital Probe Thermometer", 20, { tolerance: 1 }),
  eq("f1", "fixed_thermometer", "Cold Room Thermometer", 10, { tolerance: 5 }),
  eq("s1", "scale", "Digital Scale", 10, G(500, 45)),
  eq("s2", "scale", "Platform Dial Scale", 20, G(500, 45)),
  eq("k1", "scale", "Kitchen Scale 1", 30, G(50, 1)),
];
const item = (id: string) => LIST.find((e) => e.id === id)!;
const v = (equipmentId: string, over: Partial<ItemValues> = {}): ItemValues => ({ equipmentId, ...over });
const grams = (points: (number | null)[], weight: number): Partial<ItemValues> => ({ points, pointsUnit: "g", pointsWeight: weight });
const five = (n: number) => [n, n, n, n, n];
const KITCHEN: ScaleSpec = { unit: "g", testWeight: 50, tolerance: 1 };
const BIG: ScaleSpec = { unit: "g", testWeight: 500, tolerance: 45 };
const LB: ScaleSpec = { unit: "lb", testWeight: 1.1, tolerance: 0.1 };

describe("inclusive boundaries, per unit", () => {
  it("50 g ± 1: 49.0 and 51.0 pass, 48.9 and 51.1 fail", () => {
    expect([49.0, 50, 51.0].map((n) => scalePointResult(n, KITCHEN))).toEqual(["OK", "OK", "OK"]);
    expect([48.9, 51.1, 0].map((n) => scalePointResult(n, KITCHEN))).toEqual(["NOT_OK", "NOT_OK", "NOT_OK"]);
    expect(scaleBounds(KITCHEN)).toEqual({ min: 490, max: 510, factor: 10 }); // tenths of a gram
  });

  it("500 g ± 45: 455.0 and 545.0 pass, 454.9 and 545.1 fail", () => {
    expect([455.0, 500, 545.0].map((n) => scalePointResult(n, BIG))).toEqual(["OK", "OK", "OK"]);
    expect([454.9, 545.1].map((n) => scalePointResult(n, BIG))).toEqual(["NOT_OK", "NOT_OK"]);
    expect(scaleBounds(BIG)).toEqual({ min: 4550, max: 5450, factor: 10 });
  });

  it("a scale read in lb, 1.10 ± 0.10: 1.00 and 1.20 pass, 0.99 and 1.21 fail (hundredths)", () => {
    expect([1.0, 1.1, 1.2].map((n) => scalePointResult(n, LB))).toEqual(["OK", "OK", "OK"]);
    expect([0.99, 1.21].map((n) => scalePointResult(n, LB))).toEqual(["NOT_OK", "NOT_OK"]);
    expect(scaleBounds(LB)).toEqual({ min: 100, max: 120, factor: 100 });
  });

  it("a scale read in oz, 16 ± 0.5: 15.50 and 16.50 pass, 15.49 and 16.51 fail (hundredths)", () => {
    const oz: ScaleSpec = { unit: "oz", testWeight: 16, tolerance: 0.5 };
    expect([15.5, 16.5].map((n) => scalePointResult(n, oz))).toEqual(["OK", "OK"]);
    expect([15.49, 16.51].map((n) => scalePointResult(n, oz))).toEqual(["NOT_OK", "NOT_OK"]);
  });

  it("portable, ± 1.0 °F around the fixed 32.0 °F: 31.0 and 33.0 pass, 30.9 and 33.1 fail", () => {
    expect([31.0, 33.0].map((n) => iceWaterResult(n, 1.0))).toEqual(["OK", "OK"]);
    expect([30.9, 33.1].map((n) => iceWaterResult(n, 1.0))).toEqual(["NOT_OK", "NOT_OK"]);
    expect(iceBounds(1.0)).toEqual({ min: 310, max: 330 });
  });

  it("portable with its own tolerance: ± 2.5 °F makes 29.5 and 34.5 pass, 29.4 and 34.6 fail — the target stays 32.0", () => {
    expect([29.5, 34.5].map((n) => iceWaterResult(n, 2.5))).toEqual(["OK", "OK"]);
    expect([29.4, 34.6].map((n) => iceWaterResult(n, 2.5))).toEqual(["NOT_OK", "NOT_OK"]);
    expect(iceBounds(0.5)).toEqual({ min: 315, max: 325 });
  });

  it("non-movable: a difference of exactly 5.0 °F passes both ways, 5.1 fails; with ± 2.0 the limit moves", () => {
    expect(fixedResult(38.0, 43.0, 5.0)).toBe("OK");
    expect(fixedResult(43.0, 38.0, 5.0)).toBe("OK");
    expect(fixedResult(38.0, 43.1, 5.0)).toBe("NOT_OK");
    expect(fixedResult(38.0, 40.0, 2.0)).toBe("OK");
    expect(fixedResult(38.0, 40.1, 2.0)).toBe("NOT_OK");
  });

  it("each item is judged by its OWN limits", () => {
    expect(itemResult(item("k1"), v("k1", grams(five(51), 50)))).toBe("OK");
    expect(itemResult(item("k1"), v("k1", grams([50, 50, 51.1, 50, 50], 50)))).toBe("NOT_OK");
    expect(itemResult(item("s1"), v("s1", grams(five(455), 500)))).toBe("OK");
    expect(itemResult(item("s1"), v("s1", grams(five(51), 500)))).toBe("NOT_OK"); // fine for a kitchen scale, not for this one
    expect(itemResult({ ...item("p1"), tolerance: 0.5 }, v("p1", { reading: 33 }))).toBe("NOT_OK");
    expect(itemResult(item("p1"), v("p1", { reading: 33 }))).toBe("OK");
    expect(itemResult({ ...item("f1"), tolerance: 2 }, v("f1", { referenceId: "p1", target: 38, fixedReading: 41 }))).toBe("NOT_OK");
    expect(itemResult(item("f1"), v("f1", { referenceId: "p1", target: 38, fixedReading: 41 }))).toBe("OK");
  });

  it("a portable only qualifies as reference within its own tolerance", () => {
    const values = { p1: v("p1", { reading: 33 }), p2: v("p2", { reading: 33 }) };
    const strict = LIST.map((e) => (e.id === "p2" ? { ...e, tolerance: 0.5 } : e));
    expect(referenceOptions(strict, values).map((e) => e.id)).toEqual(["p1"]);
  });
});

describe("comparison is done on integers, never floating point", () => {
  it("bounds are whole numbers in the unit's own scale", () => {
    for (const spec of [KITCHEN, BIG, LB, { unit: "oz", testWeight: 17.64, tolerance: 0.35 } as ScaleSpec, { unit: "g", testWeight: 50.3, tolerance: 0.4 } as ScaleSpec]) {
      const b = scaleBounds(spec);
      expect(Number.isInteger(b.min) && Number.isInteger(b.max)).toBe(true);
    }
  });

  it("sums that are inexact in floating point still land on the boundary", () => {
    expect(50.1 + 0.2).not.toBe(50.3); // why integers are used: the upper bound would be 50.300000000000004
    expect(scalePointResult(50.3, { unit: "g", testWeight: 50.1, tolerance: 0.2 })).toBe("OK");
    expect(scalePointResult(50.4, { unit: "g", testWeight: 50.1, tolerance: 0.2 })).toBe("NOT_OK");
    expect(50.3 + 0.4).not.toBe(50.7); // and here it would be 50.699999999999996, wrongly failing 50.7
    expect(scalePointResult(50.7, { unit: "g", testWeight: 50.3, tolerance: 0.4 })).toBe("OK");
    expect(scalePointResult(50.8, { unit: "g", testWeight: 50.3, tolerance: 0.4 })).toBe("NOT_OK");
    expect(1.1 + 0.1).not.toBe(1.2);
    expect(scalePointResult(1.2, LB)).toBe("OK");
    expect(scalePointResult(1.2000000000000002, LB)).toBe("OK");
    expect(scalePointResult(545.0000000000001, BIG)).toBe("OK");
    expect(scalePointResult(48.99999999999999, KITCHEN)).toBe("OK"); // 49.0 as typed, after arithmetic
    expect(iceWaterResult(32 + 2.2 + 0.3, 2.5)).toBe("OK"); // 34.5
    expect(fixedResult(0.1 + 0.2, 2.3, 2.0)).toBe("OK"); // exactly 2.0 apart
  });
});

describe("what each card says", () => {
  it("scales in grams", () => {
    expect(marginText(item("k1"))).toBe("Test weight 50 g, margin ± 1 g (49.0 to 51.0 g)");
    expect(marginText(item("s1"))).toBe("Test weight 500 g, margin ± 45 g (455.0 to 545.0 g)");
    expect(marginText({ section: "scale", ...G(50.5, 0.5) })).toBe("Test weight 50.5 g, margin ± 0.5 g (50.0 to 51.0 g)");
  });
  it("scales in lb and oz use two decimals", () => {
    expect(marginText({ section: "scale", testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 })).toBe("Test weight 1.10 lb, margin ± 0.10 lb (1.00 to 1.20 lb)");
    expect(marginText({ section: "scale", testWeight: 16, weightUnit: "oz", tolerance: 0.5 })).toBe("Test weight 16.00 oz, margin ± 0.50 oz (15.50 to 16.50 oz)");
  });
  it("thermometers", () => {
    expect(marginText(item("p1"))).toBe("Ice water 32.0 °F, margin ± 1.0 °F (31.0 to 33.0 °F)");
    expect(marginText({ section: "portable_thermometer", tolerance: 2.5 })).toBe("Ice water 32.0 °F, margin ± 2.5 °F (29.5 to 34.5 °F)");
    expect(marginText(item("f1"))).toBe("Margin ± 5.0 °F from the reference reading");
  });
  it("an item stored before per-item limits has no such line (it is shown as it was)", () => {
    expect(marginText({ section: "scale" })).toBeNull();
    expect(marginText({ section: "portable_thermometer" })).toBeNull();
    expect(marginText({ section: "fixed_thermometer", tolerance: null })).toBeNull();
  });
});

describe("validation in the equipment editor", () => {
  it("accepts the starting values of every item", () => {
    for (const e of LIST) expect(specProblem(e.section, e), e.name).toBeNull();
    expect(specProblem("scale", { testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 })).toBeNull();
    expect(specProblem("portable_thermometer", { tolerance: 10 })).toBeNull();
    expect(specProblem("fixed_thermometer", { tolerance: 0.1 })).toBeNull();
  });

  it("scales: positive numbers, a known unit, tolerance smaller than the test weight", () => {
    expect(specProblem("scale", { testWeight: 0, weightUnit: "g", tolerance: 1 })).toBe("The test weight must be a number greater than 0.");
    expect(specProblem("scale", { testWeight: -5, weightUnit: "g", tolerance: 1 })).toBe("The test weight must be a number greater than 0.");
    expect(specProblem("scale", { testWeight: NaN, weightUnit: "g", tolerance: 1 })).toBe("The test weight must be a number greater than 0.");
    expect(specProblem("scale", { testWeight: "50", weightUnit: "g", tolerance: 1 })).toBe("The test weight must be a number greater than 0.");
    expect(specProblem("scale", { testWeight: 50, weightUnit: "g", tolerance: 0 })).toBe("The tolerance must be a number greater than 0.");
    expect(specProblem("scale", { testWeight: 50, weightUnit: "g", tolerance: undefined })).toBe("The tolerance must be a number greater than 0.");
    expect(specProblem("scale", { testWeight: 50, weightUnit: "g", tolerance: 50 })).toBe("The tolerance must be smaller than the test weight.");
    expect(specProblem("scale", { testWeight: 50, weightUnit: "g", tolerance: 60 })).toBe("The tolerance must be smaller than the test weight.");
    expect(specProblem("scale", { testWeight: 50, weightUnit: "kg", tolerance: 1 })).toBe("Choose a unit: g, lb or oz.");
    expect(specProblem("scale", { testWeight: 50, tolerance: 1 })).toBe("Choose a unit: g, lb or oz.");
    expect(specProblem("scale", { testWeight: 1e9, weightUnit: "g", tolerance: 1 })).toBe("The test weight cannot be more than 100000.");
  });

  it("scales: no more decimals than the unit is read with", () => {
    expect(specProblem("scale", { testWeight: 50.25, weightUnit: "g", tolerance: 1 })).toBe("Test weight: Use at most 1 decimal for grams.");
    expect(specProblem("scale", { testWeight: 50, weightUnit: "g", tolerance: 0.05 })).toBe("Tolerance: Use at most 1 decimal for grams.");
    expect(specProblem("scale", { testWeight: 1.105, weightUnit: "lb", tolerance: 0.1 })).toBe("Test weight: Use at most 2 decimals for lb.");
    expect(specProblem("scale", { testWeight: 16, weightUnit: "oz", tolerance: 0.125 })).toBe("Tolerance: Use at most 2 decimals for oz.");
    expect(specProblem("scale", { testWeight: 17.64, weightUnit: "oz", tolerance: 0.35 })).toBeNull();
  });

  it("thermometers: a positive tolerance of at most 10 °F, one decimal", () => {
    for (const section of ["portable_thermometer", "fixed_thermometer"] as const) {
      expect(specProblem(section, { tolerance: 0 })).toBe("The tolerance must be a number greater than 0.");
      expect(specProblem(section, { tolerance: -1 })).toBe("The tolerance must be a number greater than 0.");
      expect(specProblem(section, {})).toBe("The tolerance must be a number greater than 0.");
      expect(specProblem(section, { tolerance: 10.1 })).toBe("The tolerance cannot be more than 10 °F.");
      expect(specProblem(section, { tolerance: 25 })).toBe("The tolerance cannot be more than 10 °F.");
      expect(specProblem(section, { tolerance: 1.25 })).toBe("Tolerance: use at most 1 decimal for °F.");
      expect(specProblem(section, { tolerance: 10 })).toBeNull();
    }
  });

  it("what is saved is rounded to the precision it is compared at; thermometers never get a weight or unit", () => {
    expect(cleanSpec("scale", { testWeight: 50.1 + 0.2, weightUnit: "g", tolerance: 0.1 + 0.2 })).toEqual({ weightUnit: "g", testWeight: 50.3, tolerance: 0.3 });
    expect(cleanSpec("portable_thermometer", { tolerance: 1.5, testWeight: 9, weightUnit: "g" })).toEqual({ weightUnit: null, testWeight: null, tolerance: 1.5 });
  });

  it("a new item starts with: scale 500 g ± 45, portable ± 1.0 °F, non-movable ± 5.0 °F", () => {
    expect(defaultSpec("scale")).toEqual({ testWeight: 500, weightUnit: "g", tolerance: 45 });
    expect(defaultSpec("portable_thermometer")).toEqual({ testWeight: null, weightUnit: null, tolerance: 1 });
    expect(defaultSpec("fixed_thermometer")).toEqual({ testWeight: null, weightUnit: null, tolerance: 5 });
    for (const s of ["scale", "portable_thermometer", "fixed_thermometer"] as const) expect(specProblem(s, defaultSpec(s))).toBeNull();
  });
});

describe("changing a scale's unit or test weight in the middle of a draft", () => {
  const entered = { s1: v("s1", { ...grams(five(500), 500), checkedAt: "2026-11-20T18:00:00.000Z" }), k1: v("k1", grams(five(50), 50)), p1: v("p1", { reading: 32 }) };

  it("a reading records the unit and test weight it was taken with", () => {
    expect(scalePointPatch(item("k1"), undefined, 2, 50.2)).toEqual({ points: [null, null, 50.2, null, null], pointsUnit: "g", pointsWeight: 50 });
    expect(scalePointPatch(item("k1"), v("k1", grams([50, null, null, null, null], 50)), 1, 49.9).points).toEqual([50, 49.9, null, null, null]);
    expect(scalePointPatch({}, undefined, 0, 1.1)).toMatchObject({ pointsUnit: "lb", pointsWeight: 1.1 }); // a scale without its own limits
  });

  it("with readings entered: a new unit or a new test weight needs confirmation; a new tolerance does not", () => {
    expect(specChangeClearsReadings(item("s1"), { testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 }, entered.s1)).toBe(true);
    expect(specChangeClearsReadings(item("s1"), { testWeight: 200, weightUnit: "g", tolerance: 45 }, entered.s1)).toBe(true);
    expect(specChangeClearsReadings(item("s1"), { testWeight: 500, weightUnit: "oz", tolerance: 45 }, entered.s1)).toBe(true);
    expect(specChangeClearsReadings(item("s1"), { testWeight: 500, weightUnit: "g", tolerance: 10 }, entered.s1)).toBe(false);
    expect(specChangeClearsReadings(item("s1"), { tolerance: 10 }, entered.s1)).toBe(false);
  });

  it("without readings entered nothing needs confirming, whatever changes", () => {
    for (const none of [undefined, v("s1"), v("s1", { points: [null, null, null, null, null] }), v("s1", { notes: "dusty" })])
      expect(specChangeClearsReadings(item("s1"), { testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 }, none)).toBe(false);
    expect(specChangeClearsReadings(item("p1"), { tolerance: 3 }, entered.p1)).toBe(false); // thermometers never
  });

  it("after confirming, the readings of THAT scale only are cleared", () => {
    const out = clearScaleReadings(entered, "s1");
    expect(out.s1).toEqual({ equipmentId: "s1", checkedAt: null });
    expect(out.k1).toBe(entered.k1);
    expect(out.p1).toBe(entered.p1);
    expect(clearScaleReadings(entered, "nope")).toBe(entered);
    // notes and corrective action of that scale are kept
    expect(clearScaleReadings({ s1: v("s1", { ...grams(five(500), 500), notes: "dusty" }) }, "s1").s1).toEqual({ equipmentId: "s1", notes: "dusty", checkedAt: null });
  });

  it("changing only the tolerance keeps the readings and works the result out again", () => {
    const tighter = LIST.map((e) => (e.id === "s1" ? { ...e, tolerance: 10 } : e));
    const readings = { s1: v("s1", grams([500, 520, 500, 500, 500], 500)) };
    expect(itemResult(item("s1"), readings.s1)).toBe("OK"); // 520 is inside ± 45
    const out = valuesForLiveList(tighter, readings);
    expect(out.s1.points).toEqual([500, 520, 500, 500, 500]);
    expect(out.s1.previousPoints).toBeUndefined();
    expect(itemResult(tighter.find((e) => e.id === "s1")!, out.s1)).toBe("NOT_OK"); // outside ± 10
    expect(scaleResult(out.s1.points, scaleSpecOf(tighter.find((e) => e.id === "s1")!)).perPoint).toEqual(["OK", "NOT_OK", "OK", "OK", "OK"]);
    // the same for a thermometer: reading kept, result re-evaluated
    const strict = LIST.map((e) => (e.id === "p1" ? { ...e, tolerance: 0.5 } : e));
    const t = valuesForLiveList(strict, { p1: v("p1", { reading: 33 }) });
    expect(t.p1.reading).toBe(33);
    expect(itemResult(strict[0], t.p1)).toBe("NOT_OK");
  });
});

describe("the draft follows the live list: readings in another unit are never converted", () => {
  // The open draft in production when the scales moved to grams: both big scales had 1.1 lb at every point
  const draft: ItemValues[] = [
    v("p1", { reading: 32, checkedAt: "2026-11-20T19:02:00.000Z" }),
    v("f1", { referenceId: "p1", target: 40, fixedReading: 40 }),
    v("s1", { points: five(1.1), checkedAt: "2026-11-20T19:08:00.000Z" }),
    v("s2", { points: five(1.1), correctiveAction: "", notes: "ok" }),
  ];
  const out = valuesForLiveList(LIST, draft);

  it("the lb readings are set aside, kept as they were typed, and the scale waits for new readings", () => {
    expect(out.s1.points).toBeUndefined();
    expect(out.s1.previousPoints).toEqual(five(1.1)); // not 498.95, not anything else
    expect(out.s1).toMatchObject({ previousUnit: "lb", previousWeight: 1.1 });
    expect(out.s2.previousPoints).toEqual(five(1.1));
    expect(out.s2.notes).toBe("ok");
    expect(itemResult(item("s1"), out.s1)).toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/49[89]\.|500/); // nothing was converted to grams
  });

  it("the thermometer readings of that draft are untouched", () => {
    expect(out.p1).toEqual(draft[0]);
    expect(out.f1).toEqual(draft[1]);
    expect(progressOf(LIST, out)).toMatchObject({ verified: 2, ok: 2, notOk: 0 });
  });

  it("the form cannot be submitted until those scales are weighed again, and it says so", () => {
    const problems = submitProblems(LIST, out, "HA");
    expect(problems).toContain("Digital Scale needs its five weight readings entered again in g (the earlier lb readings were not converted).");
    expect(problems).toContain("Platform Dial Scale needs its five weight readings entered again in g (the earlier lb readings were not converted).");
    expect(problems).toContain("Kitchen Scale 1 needs all five weight readings.");
  });

  it("setting aside happens once; saving again changes nothing; the server clears checkedAt", () => {
    expect(valuesForLiveList(LIST, out)).toEqual(out);
    expect(withCheckedAt(item("s1"), draft[2], out.s1, "2026-11-20T20:00:00.000Z").checkedAt).toBeNull();
  });

  it("new readings in grams count, and are kept on the next pass", () => {
    const again = { ...out, s1: { ...out.s1, ...scalePointPatch(item("s1"), out.s1, 0, 500) } };
    for (let i = 1; i < 5; i++) again.s1 = { ...again.s1, ...scalePointPatch(item("s1"), again.s1, i, 500.5) };
    const next = valuesForLiveList(LIST, again);
    expect(next.s1.points).toEqual([500, 500.5, 500.5, 500.5, 500.5]);
    expect(itemResult(item("s1"), next.s1)).toBe("OK");
  });

  it("readings without a recorded unit (an old page still open) are treated as lb, so they never pass as grams", () => {
    const stale = valuesForLiveList(LIST, [v("k1", { points: five(50) })]);
    expect(stale.k1.points).toBeUndefined();
    expect(stale.k1.previousPoints).toEqual(five(50));
  });

  it("a scale whose test weight changed (same unit) is handled the same way", () => {
    const lighter = LIST.map((e) => (e.id === "s1" ? { ...e, testWeight: 200 } : e));
    const moved = valuesForLiveList(lighter, [v("s1", grams(five(500), 500))]);
    expect(moved.s1).toMatchObject({ previousPoints: five(500), previousUnit: "g", previousWeight: 500 });
    expect(moved.s1.points).toBeUndefined();
  });
});

describe("snapshot at submit", () => {
  const values = {
    p1: v("p1", { reading: 32 }), p2: v("p2", { reading: 33.5, correctiveAction: "Replaced" }),
    f1: v("f1", { referenceId: "p1", target: 38, fixedReading: 39.5 }),
    s1: v("s1", { ...grams(five(500), 500), previousPoints: five(1.1), previousUnit: "lb", previousWeight: 1.1 }),
    s2: v("s2", grams([500, 500, 546, 500, 500], 500)), k1: v("k1", grams(five(50.4), 50)),
  };
  const snap = buildSnapshot(LIST, values);
  const by = (id: string) => snap.items.find((i) => i.equipmentId === id)!;

  it("stores each item's unit, test weight and tolerance with its readings and results", () => {
    expect(by("k1")).toMatchObject({ weightUnit: "g", testWeight: 50, tolerance: 1, points: five(50.4), result: "OK" });
    expect(by("s2")).toMatchObject({ weightUnit: "g", testWeight: 500, tolerance: 45, result: "NOT_OK", pointResults: ["OK", "OK", "NOT_OK", "OK", "OK"] });
    expect(by("p1")).toMatchObject({ tolerance: 1, reading: 32, result: "OK" });
    expect(by("p2")).toMatchObject({ tolerance: 1, result: "NOT_OK" });
    expect(by("f1")).toMatchObject({ tolerance: 5, target: 38, fixedReading: 39.5, result: "OK" });
    expect(by("p1")).not.toHaveProperty("weightUnit");
    expect(snap.items.every((i) => hasSpec(i))).toBe(true);
  });

  it("readings that were set aside are not part of the record", () => {
    expect(JSON.stringify(snap.items)).not.toContain("previous");
    expect(by("s1").points).toEqual(five(500));
  });

  it("the record keeps showing its own limits after the equipment list changes", () => {
    const view = viewOfSnapshot(snap.items);
    expect(view.equipment.find((e) => e.id === "k1")).toMatchObject({ weightUnit: "g", testWeight: 50, tolerance: 1 });
    expect(marginText(view.equipment.find((e) => e.id === "k1")!)).toBe("Test weight 50 g, margin ± 1 g (49.0 to 51.0 g)");
    expect(progressOf(view.equipment, view.values)).toMatchObject({ ok: 4, notOk: 2 });
  });
});

describe("records stored before per-item limits", () => {
  const old = [
    { equipmentId: "p1", section: "portable_thermometer", name: "Dial Probe Thermometer", location: "", inUse: true, position: 1, result: "OK", reading: 33, recheck: null },
    { equipmentId: "f1", section: "fixed_thermometer", name: "Cold Room Thermometer", location: "", inUse: true, position: 1, result: "OK", referenceId: "p1", referenceName: "Dial Probe Thermometer", target: 38, fixedReading: 43 },
    { equipmentId: "s1", section: "scale", name: "Digital Scale", location: "624 Garrison", inUse: true, position: 1, result: "OK", points: [1.0, 1.1, 1.2, 1.1, 1.1], pointResults: ["OK", "OK", "OK", "OK", "OK"] },
    { kind: "header", date: "2026-11-14", time: "14:05" },
  ];
  const stored = splitStored(old);
  const view = viewOfSnapshot(stored.snapshots);

  it("default to what applied then: lb, 1.10 and 0.10 for every scale; 1.0 °F portables; 5.0 °F non-movables", () => {
    const scale = view.equipment.find((e) => e.id === "s1")!;
    expect(scale).not.toHaveProperty("weightUnit");
    expect(scaleSpecOf(scale)).toEqual({ unit: "lb", testWeight: 1.1, tolerance: 0.1 });
    expect(thermometerToleranceOf("portable_thermometer", view.equipment[0])).toBe(1.0);
    expect(thermometerToleranceOf("fixed_thermometer", view.equipment[1])).toBe(5.0);
    expect(view.equipment.some((e) => hasSpec(e))).toBe(false);
  });

  it("their results come out the same as when they were submitted", () => {
    for (const s of stored.snapshots) expect(itemResult(view.equipment.find((e) => e.id === s.equipmentId)!, view.values[s.equipmentId]), s.name).toBe(s.result);
    expect(progressOf(view.equipment, view.values)).toEqual({ verified: 3, total: 3, ok: 3, notOk: 0, notInUse: 0 });
  });

  it("they keep instructions v1.0; new records carry the version they were submitted with", () => {
    expect(instructionsVerOf(stored)).toBe("v1.0");
    expect(instructionsVerOf({ header: { kind: "header", date: "x", time: "y", instructionsVer: "v1.1" }, snapshots: stored.snapshots })).toBe("v1.1");
    expect(instructionsVerOf({ header: null, snapshots: buildSnapshot(LIST, {}).items })).toBe(INSTRUCTIONS_VER_VERIFICATION);
    expect(instructionsVerOf({ header: null, snapshots: [] })).toBe(INSTRUCTIONS_VER_VERIFICATION);
  });
});

describe("instructions v1.1", () => {
  it("the scale procedure is the new wording and no longer names 500 g or 1.10 lb; the others are unchanged", () => {
    expect(INSTRUCTIONS_VER_VERIFICATION).toBe("v1.1");
    expect(INSTRUCTIONS.scale).toBe("Place the scale on a flat surface, away from any air flow or vibration for best results. Place the test weight shown for that scale over the points seen in the image in each corner and center. The margin is the target weight shown for that scale, plus or minus its tolerance. Report any irregularity, e.g.: broken parts, sanitation, low battery, unusual noises, among others.");
    expect(INSTRUCTIONS.scale).not.toMatch(/500|1\.10|lb/);
    expect(INSTRUCTIONS.portable_thermometer).toBe(INSTRUCTIONS_BY_VERSION["v1.0"].portable_thermometer);
    expect(INSTRUCTIONS.fixed_thermometer).toBe(INSTRUCTIONS_BY_VERSION["v1.0"].fixed_thermometer);
    expect(instructionsFor("v1.0").scale).toContain("Place the 500 gram weight");
    expect(instructionsFor("v9.9")).toBe(INSTRUCTIONS);
  });
});
