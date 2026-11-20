/**
 * Scales & Thermometer Verification — 624. Pure rules shared by the form, the API routes and the PDF.
 * All range checks compare integers (tenths of a degree or gram, hundredths of a pound or ounce) so
 * 33.0, 51.0 or 1.20 never fail because of floating point.
 *
 * Each item carries its own limits (set in "Edit equipment"): a scale has a test weight, a unit and a
 * tolerance; a thermometer has a tolerance. An item WITHOUT those fields is one stored before they
 * existed and is read with the limits that applied then: every scale 1.10 lb ± 0.10 lb, portable
 * thermometers ± 1.0 °F, non-movable ± 5.0 °F.
 */

export const VERIFICATION_FORM_KEY = "verification_624";
export const VERIFICATION_FACILITY = "624";
/**
 * Instructions version history
 *   v1.0  Original sheet text. Scales: "Place the 500 gram weight … The margin is 1.10 lb ± 0.1 lb."
 *   v1.1  Scales: the procedure no longer names one weight or margin, because each scale now has its own
 *         test weight, unit and tolerance shown on its card. Portable and non-movable procedures unchanged.
 * A record keeps the version it was submitted with (see instructionsVerOf), so old records show v1.0.
 */
export const INSTRUCTIONS_VER_VERIFICATION = "v1.1";

export type Section = "portable_thermometer" | "fixed_thermometer" | "scale";
export const SECTIONS: Section[] = ["portable_thermometer", "fixed_thermometer", "scale"];

export const SECTION_TITLES: Record<Section, { en: string; es: string }> = {
  portable_thermometer: { en: "Portable Thermometers", es: "Termómetros Portátiles" },
  fixed_thermometer: { en: "Non-Movable Thermometers", es: "Termómetros Fijos" },
  scale: { en: "Scales", es: "Básculas" },
};

export const LABELS = {
  iceWater: { en: "Ice water reading (°F)", es: "Agua c/ Hielo 32 °F ± 1 °F" },
  conditions: { en: "Inspection conditions", es: "Condiciones de la Inspección" },
  corrective: { en: "Corrective actions", es: "Acciones Correctivas" },
} as const;

const PORTABLE_PROCEDURE =
  "Place a container with water and ice in equal parts, place the thermometer 1 cm deep in the ice water, for 2 minutes until reaching 32°F (0°C), Report any irregularities, e.g. parts broken or missing, sanitation, low battery.";
const FIXED_PROCEDURE =
  "Use a portable thermometer that has been recently verified for accuracy, and use its reading as the target value. Compare the reading of the non-movable thermometer to the target reading. Report any irregularities.";

export interface InstructionSet { scale: string; portable_thermometer: string; fixed_thermometer: string }

export const INSTRUCTIONS_BY_VERSION: Record<string, InstructionSet> = {
  "v1.0": {
    scale:
      "Place the scale on a flat surface, away from any air flow or vibration for best results. Place the 500 gram weight over the points seen in the image in each corner and center. The margin is 1.10 lb ± 0.1 lb. Report any irregularity, e.g.: broken parts, sanitation, low battery, unusual noises, among others.",
    portable_thermometer: PORTABLE_PROCEDURE,
    fixed_thermometer: FIXED_PROCEDURE,
  },
  "v1.1": {
    scale:
      "Place the scale on a flat surface, away from any air flow or vibration for best results. Place the test weight shown for that scale over the points seen in the image in each corner and center. The margin is the target weight shown for that scale, plus or minus its tolerance. Report any irregularity, e.g.: broken parts, sanitation, low battery, unusual noises, among others.",
    portable_thermometer: PORTABLE_PROCEDURE,
    fixed_thermometer: FIXED_PROCEDURE,
  },
};

/** The current text. */
export const INSTRUCTIONS: InstructionSet = INSTRUCTIONS_BY_VERSION[INSTRUCTIONS_VER_VERIFICATION];
export const instructionsFor = (version: string | null | undefined): InstructionSet => INSTRUCTIONS_BY_VERSION[version ?? ""] ?? INSTRUCTIONS;

/** The five weight positions, in the order the readings are stored. */
export const SCALE_POINTS = ["Center", "Front left", "Front right", "Back left", "Back right"] as const;

// ── Units and limits ─────────────────────────────────────────────────────────────

export type WeightUnit = "g" | "lb" | "oz";
export const WEIGHT_UNITS: WeightUnit[] = ["g", "lb", "oz"];
const isWeightUnit = (u: unknown): u is WeightUnit => (WEIGHT_UNITS as unknown[]).includes(u);

/** Readings are compared as integers: tenths for grams and °F, hundredths for lb and oz. */
export const unitFactor = (unit: WeightUnit): number => (unit === "g" ? 10 : 100);
/** Decimals a reading is entered and shown with: grams 1, lb and oz 2. */
export const unitDecimals = (unit: WeightUnit): 1 | 2 => (unit === "g" ? 1 : 2);

/** The ice water target is fixed here and is not editable. */
export const ICE_TARGET_TENTHS = 320; // 32.0 °F
export const MAX_THERMOMETER_TOLERANCE_F = 10;
export const MAX_TEST_WEIGHT = 100000;

/** What applied before per-item limits existed. */
export const LEGACY_SCALE = { unit: "lb" as WeightUnit, testWeight: 1.1, tolerance: 0.1 };
export const LEGACY_PORTABLE_TOLERANCE = 1.0;
export const LEGACY_FIXED_TOLERANCE = 5.0;

// The original fixed limits, as integers (still the limits of every item stored without its own)
export const ICE_MIN_TENTHS = 310; // 31.0 °F
export const ICE_MAX_TENTHS = 330; // 33.0 °F
export const FIXED_MAX_DIFF_TENTHS = 50; // 5.0 °F
export const SCALE_MIN_HUNDREDTHS = 100; // 1.00 lb
export const SCALE_MAX_HUNDREDTHS = 120; // 1.20 lb

export type Result = "OK" | "NOT_OK";

export interface Equipment {
  id: string;
  section: Section;
  name: string;
  location: string;
  inUse: boolean;
  sortOrder: number;
  /** Scales: the test weight, in weightUnit. */
  testWeight?: number | null;
  /** Scales: 'g' | 'lb' | 'oz'. */
  weightUnit?: string | null;
  /** ± around the target: in weightUnit for a scale, in °F for a thermometer. */
  tolerance?: number | null;
}

/** The limit fields of an item, wherever they come from (live list or a record's snapshot). */
export type SpecFields = Pick<Equipment, "testWeight" | "weightUnit" | "tolerance">;
export type ItemKind = SpecFields & { section: Section };

/** What the supervisor enters for one item. Stored keyed by equipment id. */
export interface ItemValues {
  equipmentId: string;
  /** Portable: ice water reading. */
  reading?: number | null;
  /** Portable: optional reading after a corrective action. */
  recheck?: number | null;
  /** Non-movable: which portable thermometer was the reference. */
  referenceId?: string | null;
  target?: number | null;
  fixedReading?: number | null;
  /** Scale: five readings in SCALE_POINTS order. */
  points?: (number | null)[];
  /** Scale: the unit and test weight the readings were taken with. Absent = lb and 1.10 (entered before units existed). */
  pointsUnit?: string | null;
  pointsWeight?: number | null;
  /** Scale, draft only: readings set aside (never converted) because the scale's unit or test weight changed. */
  previousPoints?: (number | null)[] | null;
  previousUnit?: string | null;
  previousWeight?: number | null;
  correctiveAction?: string;
  notes?: string;
  checkedAt?: string | null;
}

/** One item as stored in a submitted record: the values plus everything needed to read it later. */
export interface ItemSnapshot extends ItemValues {
  section: Section;
  name: string;
  location: string;
  inUse: boolean;
  position: number;
  result: Result | null;
  pointResults?: (Result | null)[];
  /** The limits that applied when the record was submitted. Absent on records stored before per-item limits. */
  testWeight?: number | null;
  weightUnit?: string | null;
  tolerance?: number | null;
  referenceName?: string | null;
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export const toTenths = (n: number) => Math.round(n * 10);
export const toHundredths = (n: number) => Math.round(n * 100);

const positive = (n: unknown): n is number => isNum(n) && n > 0;

/** True when the item carries its own limits (false = stored before they existed). */
export function hasSpec(item: ItemKind): boolean {
  return item.section === "scale" ? isWeightUnit(item.weightUnit) && positive(item.testWeight) && positive(item.tolerance) : positive(item.tolerance);
}

export interface ScaleSpec { unit: WeightUnit; testWeight: number; tolerance: number }

/** A scale's limits; one without its own gets what applied before: 1.10 lb ± 0.10 lb. */
export function scaleSpecOf(item: SpecFields | null | undefined): ScaleSpec {
  if (item && isWeightUnit(item.weightUnit) && positive(item.testWeight) && positive(item.tolerance))
    return { unit: item.weightUnit, testWeight: item.testWeight, tolerance: item.tolerance };
  return { ...LEGACY_SCALE };
}

/** A thermometer's tolerance in °F; one without its own gets what applied before (1.0 portable, 5.0 non-movable). */
export function thermometerToleranceOf(section: Section, item: SpecFields | null | undefined): number {
  if (item && positive(item.tolerance)) return item.tolerance;
  return section === "portable_thermometer" ? LEGACY_PORTABLE_TOLERANCE : LEGACY_FIXED_TOLERANCE;
}

/** Inclusive bounds of a scale reading, as integers in the unit's own scale (tenths of g, hundredths of lb/oz). */
export function scaleBounds(spec: ScaleSpec): { min: number; max: number; factor: number } {
  const factor = unitFactor(spec.unit);
  const target = Math.round(spec.testWeight * factor);
  const tol = Math.round(spec.tolerance * factor);
  return { min: target - tol, max: target + tol, factor };
}

/** Inclusive bounds of an ice water reading, in tenths of °F, around the fixed 32.0 °F target. */
export function iceBounds(tolerance: number = LEGACY_PORTABLE_TOLERANCE): { min: number; max: number } {
  const tol = toTenths(tolerance);
  return { min: ICE_TARGET_TENTHS - tol, max: ICE_TARGET_TENTHS + tol };
}

export function iceWaterResult(reading: number | null | undefined, tolerance: number = LEGACY_PORTABLE_TOLERANCE): Result | null {
  if (!isNum(reading)) return null;
  const t = toTenths(reading);
  const { min, max } = iceBounds(tolerance);
  return t >= min && t <= max ? "OK" : "NOT_OK";
}

export function fixedResult(target: number | null | undefined, reading: number | null | undefined, tolerance: number = LEGACY_FIXED_TOLERANCE): Result | null {
  if (!isNum(target) || !isNum(reading)) return null;
  return Math.abs(toTenths(target) - toTenths(reading)) <= toTenths(tolerance) ? "OK" : "NOT_OK";
}

export function scalePointResult(value: number | null | undefined, spec: ScaleSpec = LEGACY_SCALE): Result | null {
  if (!isNum(value)) return null;
  const { min, max, factor } = scaleBounds(spec);
  const n = Math.round(value * factor);
  return n >= min && n <= max ? "OK" : "NOT_OK";
}

export function scaleResult(points: (number | null | undefined)[] | undefined, spec: ScaleSpec = LEGACY_SCALE): { overall: Result | null; perPoint: (Result | null)[] } {
  const perPoint = SCALE_POINTS.map((_, i) => scalePointResult(points?.[i], spec));
  if (perPoint.some((r) => r === null)) return { overall: null, perPoint };
  return { overall: perPoint.every((r) => r === "OK") ? "OK" : "NOT_OK", perPoint };
}

const kindOf = (item: Section | ItemKind): ItemKind => (typeof item === "string" ? { section: item } : item);

/**
 * The computed result of an item; null while readings are missing. Never chosen by hand.
 * Pass the item itself so its own limits apply; a bare section name means the original limits.
 */
export function itemResult(item: Section | ItemKind, v: ItemValues | undefined): Result | null {
  if (!v) return null;
  const k = kindOf(item);
  if (k.section === "portable_thermometer") return iceWaterResult(v.reading, thermometerToleranceOf(k.section, k));
  if (k.section === "fixed_thermometer") return v.referenceId ? fixedResult(v.target, v.fixedReading, thermometerToleranceOf(k.section, k)) : null;
  return scaleResult(v.points, scaleSpecOf(k)).overall;
}

/** A portable thermometer may serve as reference if its reading — or its re-check — is in range. */
export function portablePassed(v: ItemValues | undefined, tolerance: number = LEGACY_PORTABLE_TOLERANCE): boolean {
  return iceWaterResult(v?.reading, tolerance) === "OK" || iceWaterResult(v?.recheck, tolerance) === "OK";
}

export function referenceOptions(equipment: Equipment[], values: Record<string, ItemValues>): Equipment[] {
  return equipment.filter((e) => e.section === "portable_thermometer" && e.inUse && portablePassed(values[e.id], thermometerToleranceOf(e.section, e)));
}

// ── What each card shows ─────────────────────────────────────────────────────────

const trimmed = (n: number, decimals: number) => String(Number(n.toFixed(decimals)));
/** A weight or tolerance in words: grams without trailing zeros (50, 1, 0.5), lb and oz with two decimals (1.10). */
export const formatWeight = (n: number, unit: WeightUnit): string => (unit === "g" ? trimmed(n, 1) : n.toFixed(2));
/** A reading as entered: grams 1 decimal, lb and oz 2 decimals. */
export const formatReading = (n: number, unit: WeightUnit): string => n.toFixed(unitDecimals(unit));

/**
 * The target and margin of an item, in plain words, e.g. "Test weight 50 g, margin ± 1 g (49.0 to 51.0 g)".
 * Null for an item stored before per-item limits existed: it is shown exactly as it was then.
 */
export function marginText(item: ItemKind): string | null {
  if (!hasSpec(item)) return null;
  if (item.section === "scale") {
    const spec = scaleSpecOf(item);
    const { min, max, factor } = scaleBounds(spec);
    const d = unitDecimals(spec.unit);
    return `Test weight ${formatWeight(spec.testWeight, spec.unit)} ${spec.unit}, margin ± ${formatWeight(spec.tolerance, spec.unit)} ${spec.unit} (${(min / factor).toFixed(d)} to ${(max / factor).toFixed(d)} ${spec.unit})`;
  }
  const tol = thermometerToleranceOf(item.section, item);
  if (item.section === "portable_thermometer") {
    const { min, max } = iceBounds(tol);
    return `Ice water 32.0 °F, margin ± ${tol.toFixed(1)} °F (${(min / 10).toFixed(1)} to ${(max / 10).toFixed(1)} °F)`;
  }
  return `Margin ± ${tol.toFixed(1)} °F from the reference reading`;
}

// ── Editing an item's limits ─────────────────────────────────────────────────────

export interface SpecInput { testWeight?: unknown; weightUnit?: unknown; tolerance?: unknown }

/** What a new item starts with. */
export function defaultSpec(section: Section): { testWeight: number | null; weightUnit: WeightUnit | null; tolerance: number } {
  if (section === "scale") return { testWeight: 500, weightUnit: "g", tolerance: 45 };
  return { testWeight: null, weightUnit: null, tolerance: section === "portable_thermometer" ? LEGACY_PORTABLE_TOLERANCE : LEGACY_FIXED_TOLERANCE };
}

const fitsPrecision = (n: number, factor: number) => Math.abs(n * factor - Math.round(n * factor)) < 1e-6;

/** Why these limits cannot be saved, in plain words; null when they are fine. */
export function specProblem(section: Section, spec: SpecInput): string | null {
  if (section === "scale") {
    if (!isWeightUnit(spec.weightUnit)) return "Choose a unit: g, lb or oz.";
    const unit = spec.weightUnit;
    const precision = unit === "g" ? "Use at most 1 decimal for grams." : `Use at most 2 decimals for ${unit}.`;
    if (!positive(spec.testWeight)) return "The test weight must be a number greater than 0.";
    if (spec.testWeight > MAX_TEST_WEIGHT) return `The test weight cannot be more than ${MAX_TEST_WEIGHT}.`;
    if (!fitsPrecision(spec.testWeight, unitFactor(unit))) return `Test weight: ${precision}`;
    if (!positive(spec.tolerance)) return "The tolerance must be a number greater than 0.";
    if (!fitsPrecision(spec.tolerance, unitFactor(unit))) return `Tolerance: ${precision}`;
    if (Math.round(spec.tolerance * unitFactor(unit)) >= Math.round(spec.testWeight * unitFactor(unit))) return "The tolerance must be smaller than the test weight.";
    return null;
  }
  if (!positive(spec.tolerance)) return "The tolerance must be a number greater than 0.";
  if (!fitsPrecision(spec.tolerance, 10)) return "Tolerance: use at most 1 decimal for °F.";
  if (toTenths(spec.tolerance) > MAX_THERMOMETER_TOLERANCE_F * 10) return `The tolerance cannot be more than ${MAX_THERMOMETER_TOLERANCE_F} °F.`;
  return null;
}

/** Valid limits, rounded to the precision they are compared at. Call after specProblem returned null. */
export function cleanSpec(section: Section, spec: SpecInput): { testWeight: number | null; weightUnit: WeightUnit | null; tolerance: number } {
  if (section === "scale") {
    const unit = spec.weightUnit as WeightUnit;
    const f = unitFactor(unit);
    return { weightUnit: unit, testWeight: Math.round((spec.testWeight as number) * f) / f, tolerance: Math.round((spec.tolerance as number) * f) / f };
  }
  return { weightUnit: null, testWeight: null, tolerance: toTenths(spec.tolerance as number) / 10 };
}

// ── Scale readings and the unit they were taken in ───────────────────────────────

export const scaleHasReadings = (v: ItemValues | undefined): boolean => (v?.points ?? []).some(isNum);

const sameWeighing = (a: { unit: string; testWeight: number }, b: ScaleSpec) =>
  a.unit === b.unit && Math.round(a.testWeight * unitFactor(b.unit)) === Math.round(b.testWeight * unitFactor(b.unit));

/** The change one reading makes: it records the unit and test weight the reading was taken with. */
export function scalePointPatch(item: SpecFields, v: ItemValues | undefined, index: number, value: number | null): Partial<ItemValues> {
  const spec = scaleSpecOf(item);
  return { points: SCALE_POINTS.map((_, j) => (j === index ? value : v?.points?.[j] ?? null)), pointsUnit: spec.unit, pointsWeight: spec.testWeight };
}

/**
 * True when saving these limits would make the readings already entered for this scale meaningless
 * (its unit or its test weight changes). A tolerance-only change never does: the readings stay and
 * only the result is worked out again.
 */
export function specChangeClearsReadings(item: Equipment, next: SpecInput, v: ItemValues | undefined): boolean {
  if (item.section !== "scale" || !scaleHasReadings(v)) return false;
  const now = scaleSpecOf(item);
  const unit = isWeightUnit(next.weightUnit) ? next.weightUnit : now.unit;
  const testWeight = positive(next.testWeight) ? next.testWeight : now.testWeight;
  return !sameWeighing({ unit, testWeight }, now);
}

/** Removes the readings of ONE scale (after the supervisor confirmed). Everything else is untouched. */
export function clearScaleReadings(values: Record<string, ItemValues>, equipmentId: string): Record<string, ItemValues> {
  const v = values[equipmentId];
  if (!v) return values;
  const { points: _p, pointsUnit: _u, pointsWeight: _w, previousPoints: _pp, previousUnit: _pu, previousWeight: _pw, ...rest } = v;
  return { ...values, [equipmentId]: { ...rest, checkedAt: null } };
}

export function sortEquipment(equipment: Equipment[]): Equipment[] {
  return [...equipment].sort(
    (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/** Position shown in the form ("#1, #2…"): the item's place within its section. */
export function positionOf(equipment: Equipment[], id: string): number {
  const item = equipment.find((e) => e.id === id);
  if (!item) return 0;
  return sortEquipment(equipment).filter((e) => e.section === item.section).findIndex((e) => e.id === id) + 1;
}

/**
 * The draft follows the live list: values for items that are no longer on the list are dropped,
 * a reference to a portable that no longer qualifies is cleared, and scale readings taken with
 * another unit or test weight are set aside until the scale is weighed again.
 */
export function valuesForLiveList(equipment: Equipment[], values: Record<string, ItemValues> | ItemValues[] | null | undefined): Record<string, ItemValues> {
  const input: ItemValues[] = Array.isArray(values) ? values : Object.values(values ?? {});
  const live = new Set(equipment.map((e) => e.id));
  const out: Record<string, ItemValues> = {};
  for (const v of input) if (v && live.has(v.equipmentId)) out[v.equipmentId] = { ...v };
  // Scale readings taken in another unit or with another test weight are never converted: they are set
  // aside (kept, shown as "entered before") and the scale waits for new readings.
  for (const e of equipment) {
    const v = out[e.id];
    if (e.section !== "scale" || !v || !scaleHasReadings(v)) continue;
    const entered = { unit: v.pointsUnit ?? LEGACY_SCALE.unit, testWeight: v.pointsWeight ?? LEGACY_SCALE.testWeight };
    if (sameWeighing(entered, scaleSpecOf(e))) continue;
    const { points, pointsUnit: _u, pointsWeight: _w, ...rest } = v;
    out[e.id] = { ...rest, previousPoints: points, previousUnit: entered.unit, previousWeight: entered.testWeight };
  }
  const refs = new Set(referenceOptions(equipment, out).map((e) => e.id));
  for (const v of Object.values(out)) if (v.referenceId && !refs.has(v.referenceId)) v.referenceId = null;
  return out;
}

export interface Progress { verified: number; total: number; ok: number; notOk: number; notInUse: number }

export function progressOf(equipment: Equipment[], values: Record<string, ItemValues>): Progress {
  const inUse = equipment.filter((e) => e.inUse);
  const results = inUse.map((e) => itemResult(e, values[e.id]));
  return {
    verified: results.filter((r) => r !== null).length,
    total: inUse.length,
    ok: results.filter((r) => r === "OK").length,
    notOk: results.filter((r) => r === "NOT_OK").length,
    notInUse: equipment.length - inUse.length,
  };
}

/** Plain-language list of what still blocks submission. Empty = ready. */
export function submitProblems(equipment: Equipment[], values: Record<string, ItemValues>, initials: string): string[] {
  const problems: string[] = [];
  if (!initials.trim()) problems.push("Enter your initials at the top.");
  for (const e of sortEquipment(equipment)) {
    if (!e.inUse) continue;
    const v = values[e.id];
    const result = itemResult(e, v);
    if (result === null) {
      const what =
        e.section === "portable_thermometer" ? "needs its ice water reading"
        : e.section === "fixed_thermometer"
          ? !v?.referenceId ? "needs a reference thermometer" : "needs the target value and its own reading"
          : v?.previousPoints && !scaleHasReadings(v)
            ? `needs its five weight readings entered again in ${scaleSpecOf(e).unit} (the earlier ${v.previousUnit ?? "lb"} readings were not converted)`
            : "needs all five weight readings";
      problems.push(`${e.name} ${what}.`);
    } else if (result === "NOT_OK" && !v?.correctiveAction?.trim()) {
      problems.push(`${e.name} is Not OK and needs a corrective action.`);
    }
  }
  return problems;
}

/** Full copy stored at submit, so later edits to the equipment list never change this record. */
export function buildSnapshot(equipment: Equipment[], values: Record<string, ItemValues>): { items: ItemSnapshot[]; okCount: number; failCount: number; notInUseCount: number } {
  const sorted = sortEquipment(equipment);
  const items = sorted.map((e): ItemSnapshot => {
    const v = values[e.id] ?? { equipmentId: e.id };
    const spec = e.section === "scale" ? scaleSpecOf(e) : null;
    const limits = spec
      ? { weightUnit: spec.unit, testWeight: spec.testWeight, tolerance: spec.tolerance }
      : { tolerance: thermometerToleranceOf(e.section, e) };
    const base = { equipmentId: e.id, section: e.section, name: e.name, location: e.location, inUse: e.inUse, position: positionOf(sorted, e.id), ...limits };
    if (!e.inUse) return { ...base, result: null, correctiveAction: "", notes: v.notes ?? "", checkedAt: null };
    const result = itemResult(e, v);
    const common = { ...base, result, correctiveAction: v.correctiveAction ?? "", notes: v.notes ?? "", checkedAt: v.checkedAt ?? null };
    if (e.section === "portable_thermometer") return { ...common, reading: v.reading ?? null, recheck: v.recheck ?? null };
    if (e.section === "fixed_thermometer")
      return { ...common, referenceId: v.referenceId ?? null, referenceName: sorted.find((x) => x.id === v.referenceId)?.name ?? null, target: v.target ?? null, fixedReading: v.fixedReading ?? null };
    return { ...common, points: SCALE_POINTS.map((_, i) => v.points?.[i] ?? null), pointResults: scaleResult(v.points, spec!).perPoint };
  });
  const p = progressOf(equipment, values);
  return { items, okCount: p.ok, failCount: p.notOk, notInUseCount: p.notInUse };
}

/** Stamps checkedAt the first time an item gets a result, and clears it if the result goes away. */
export function withCheckedAt(item: Section | ItemKind, before: ItemValues | undefined, after: ItemValues, nowIso: string): ItemValues {
  const had = itemResult(item, before) !== null;
  const has = itemResult(item, after) !== null;
  if (has && !had) return { ...after, checkedAt: before?.checkedAt ?? nowIso };
  if (!has) return { ...after, checkedAt: null };
  return { ...after, checkedAt: after.checkedAt ?? before?.checkedAt ?? nowIso };
}

// ── Periods ───────────────────────────────────────────────────────────────────

export interface Period { key: string; start: string; end: string; half: "A" | "B" }

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

/** The half-month period a Pacific date (YYYY-MM-DD) falls in. A = 1st–15th, B = 16th–last day. */
export function periodForDate(dateStr: string): Period {
  const [y, m, d] = dateStr.split("-").map(Number);
  return d <= 15
    ? { key: `${y}-${pad(m)}-A`, start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-15`, half: "A" }
    : { key: `${y}-${pad(m)}-B`, start: `${y}-${pad(m)}-16`, end: `${y}-${pad(m)}-${pad(lastDay(y, m))}`, half: "B" };
}

export function parsePeriod(key: string): Period | null {
  const m = /^(\d{4})-(\d{2})-([AB])$/.exec(key);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return periodForDate(`${m[1]}-${m[2]}-${m[3] === "A" ? "01" : "16"}`);
}

export function periodLabel(key: string): string {
  const p = parsePeriod(key);
  if (!p) return key;
  const month = new Date(`${p.start}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return `${month} · ${Number(p.start.slice(8))}–${Number(p.end.slice(8))}`;
}

/** The period that follows: A → B of the same month, B → A of the next month (December B → January A). */
export function nextPeriod(key: string): Period | null {
  const p = parsePeriod(key);
  if (!p) return null;
  if (p.half === "A") return periodForDate(`${p.start.slice(0, 8)}16`);
  const [y, m] = p.start.split("-").map(Number);
  return periodForDate(m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`);
}

const utcNoon = (dateStr: string) => new Date(`${dateStr}T12:00:00Z`);

/** A period's dates in a sentence: "November 16–30, 2026". */
export function periodDates(key: string): string {
  const p = parsePeriod(key);
  if (!p) return key;
  const month = utcNoon(p.start).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${Number(p.start.slice(8))}–${Number(p.end.slice(8))}, ${p.start.slice(0, 4)}`;
}

export interface SubmittedPeriodInfo { period: string; submittedAt: string | Date | null; submittedBy: string | null }

/**
 * What to say when a period's form is already submitted: who submitted it and when (Pacific date),
 * and when the next period's form opens (its first day, Pacific time).
 */
export function submittedPeriodMessage(info: SubmittedPeriodInfo): { submitted: string; next: string; nextOpens: string | null } {
  const on = info.submittedAt
    ? new Date(info.submittedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric" })
    : null;
  const submitted = `The ${periodDates(info.period)} verification was submitted${on ? ` on ${on}` : ""}${info.submittedBy?.trim() ? ` by ${info.submittedBy.trim()}` : ""}.`;
  const following = nextPeriod(info.period);
  if (!following) return { submitted, next: "", nextOpens: null };
  const opens = utcNoon(following.start).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return { submitted, next: `The next form, for ${periodDates(following.key)}, opens on ${opens} (Pacific time).`, nextOpens: following.start };
}

/** The submitted record of the period a Pacific date falls in, if there is one. */
export function submittedForDate<T extends { period: string; status: string }>(rows: T[], pacificDate: string): T | null {
  const key = periodForDate(pacificDate).key;
  return rows.find((r) => r.period === key && r.status === "submitted") ?? null;
}

// ── Stored shape ────────────────────────────────────────────────────────────────

/** Date and time shown in the form header. Kept inside the record's items JSON (no column exists for them). */
export interface HeaderEntry { kind: "header"; date: string; time: string; instructionsVer?: string }

/** The instructions a record was filled with. Records from before the version was stored are told apart by their snapshot. */
export function instructionsVerOf(stored: { header: HeaderEntry | null; snapshots: ItemSnapshot[] }): string {
  if (stored.header?.instructionsVer) return stored.header.instructionsVer;
  return stored.snapshots.length === 0 || stored.snapshots.some((s) => hasSpec(s)) ? INSTRUCTIONS_VER_VERIFICATION : "v1.0";
}

export function splitStored(items: unknown): { header: HeaderEntry | null; entries: ItemValues[]; snapshots: ItemSnapshot[] } {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  const header = (list.find((x) => x && x.kind === "header") as unknown as HeaderEntry | undefined) ?? null;
  const rest = list.filter((x) => x && x.kind !== "header" && typeof x.equipmentId === "string");
  return { header, entries: rest as unknown as ItemValues[], snapshots: rest.filter((x) => typeof x.section === "string") as unknown as ItemSnapshot[] };
}

/** Rebuilds the equipment list and values a submitted record was filled with, from its own snapshot. */
export function viewOfSnapshot(snapshots: ItemSnapshot[]): { equipment: Equipment[]; values: Record<string, ItemValues> } {
  const equipment = snapshots.map((s): Equipment => ({ id: s.equipmentId, section: s.section, name: s.name, location: s.location, inUse: s.inUse, sortOrder: s.position * 10,
    ...(s.weightUnit != null ? { weightUnit: s.weightUnit } : {}), ...(s.testWeight != null ? { testWeight: s.testWeight } : {}), ...(s.tolerance != null ? { tolerance: s.tolerance } : {}),
  }));
  return { equipment, values: Object.fromEntries(snapshots.map((s) => [s.equipmentId, s])) };
}
