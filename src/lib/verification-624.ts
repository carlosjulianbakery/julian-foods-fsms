/**
 * Scales & Thermometer Verification — 624. Pure rules shared by the form, the API routes and the PDF.
 * All range checks compare integers (tenths of a degree, hundredths of a pound) so 33.0 or 1.20 never
 * fail because of floating point.
 */

export const VERIFICATION_FORM_KEY = "verification_624";
export const VERIFICATION_FACILITY = "624";
export const INSTRUCTIONS_VER_VERIFICATION = "v1.0";

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

export const INSTRUCTIONS = {
  scale:
    "Place the scale on a flat surface, away from any air flow or vibration for best results. Place the 500 gram weight over the points seen in the image in each corner and center. The margin is 1.10 lb ± 0.1 lb. Report any irregularity, e.g.: broken parts, sanitation, low battery, unusual noises, among others.",
  portable_thermometer:
    "Place a container with water and ice in equal parts, place the thermometer 1 cm deep in the ice water, for 2 minutes until reaching 32°F (0°C), Report any irregularities, e.g. parts broken or missing, sanitation, low battery.",
  fixed_thermometer:
    "Use a portable thermometer that has been recently verified for accuracy, and use its reading as the target value. Compare the reading of the non-movable thermometer to the target reading. Report any irregularities.",
} as const;

/** The five weight positions, in the order the readings are stored. */
export const SCALE_POINTS = ["Center", "Front left", "Front right", "Back left", "Back right"] as const;

// Limits, as integers
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
}

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
  referenceName?: string | null;
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export const toTenths = (n: number) => Math.round(n * 10);
export const toHundredths = (n: number) => Math.round(n * 100);

export function iceWaterResult(reading: number | null | undefined): Result | null {
  if (!isNum(reading)) return null;
  const t = toTenths(reading);
  return t >= ICE_MIN_TENTHS && t <= ICE_MAX_TENTHS ? "OK" : "NOT_OK";
}

export function fixedResult(target: number | null | undefined, reading: number | null | undefined): Result | null {
  if (!isNum(target) || !isNum(reading)) return null;
  return Math.abs(toTenths(target) - toTenths(reading)) <= FIXED_MAX_DIFF_TENTHS ? "OK" : "NOT_OK";
}

export function scalePointResult(value: number | null | undefined): Result | null {
  if (!isNum(value)) return null;
  const h = toHundredths(value);
  return h >= SCALE_MIN_HUNDREDTHS && h <= SCALE_MAX_HUNDREDTHS ? "OK" : "NOT_OK";
}

export function scaleResult(points: (number | null | undefined)[] | undefined): { overall: Result | null; perPoint: (Result | null)[] } {
  const perPoint = SCALE_POINTS.map((_, i) => scalePointResult(points?.[i]));
  if (perPoint.some((r) => r === null)) return { overall: null, perPoint };
  return { overall: perPoint.every((r) => r === "OK") ? "OK" : "NOT_OK", perPoint };
}

/** The computed result of an item; null while readings are missing. Never chosen by hand. */
export function itemResult(section: Section, v: ItemValues | undefined): Result | null {
  if (!v) return null;
  if (section === "portable_thermometer") return iceWaterResult(v.reading);
  if (section === "fixed_thermometer") return v.referenceId ? fixedResult(v.target, v.fixedReading) : null;
  return scaleResult(v.points).overall;
}

/** A portable thermometer may serve as reference if its reading — or its re-check — is in range. */
export function portablePassed(v: ItemValues | undefined): boolean {
  return iceWaterResult(v?.reading) === "OK" || iceWaterResult(v?.recheck) === "OK";
}

export function referenceOptions(equipment: Equipment[], values: Record<string, ItemValues>): Equipment[] {
  return equipment.filter((e) => e.section === "portable_thermometer" && e.inUse && portablePassed(values[e.id]));
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
 * a reference to a portable that no longer qualifies is cleared.
 */
export function valuesForLiveList(equipment: Equipment[], values: Record<string, ItemValues> | ItemValues[] | null | undefined): Record<string, ItemValues> {
  const input: ItemValues[] = Array.isArray(values) ? values : Object.values(values ?? {});
  const live = new Set(equipment.map((e) => e.id));
  const out: Record<string, ItemValues> = {};
  for (const v of input) if (v && live.has(v.equipmentId)) out[v.equipmentId] = { ...v };
  const refs = new Set(referenceOptions(equipment, out).map((e) => e.id));
  for (const v of Object.values(out)) if (v.referenceId && !refs.has(v.referenceId)) v.referenceId = null;
  return out;
}

export interface Progress { verified: number; total: number; ok: number; notOk: number; notInUse: number }

export function progressOf(equipment: Equipment[], values: Record<string, ItemValues>): Progress {
  const inUse = equipment.filter((e) => e.inUse);
  const results = inUse.map((e) => itemResult(e.section, values[e.id]));
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
    const result = itemResult(e.section, v);
    if (result === null) {
      const what =
        e.section === "portable_thermometer" ? "needs its ice water reading"
        : e.section === "fixed_thermometer"
          ? !v?.referenceId ? "needs a reference thermometer" : "needs the target value and its own reading"
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
    const base = { equipmentId: e.id, section: e.section, name: e.name, location: e.location, inUse: e.inUse, position: positionOf(sorted, e.id) };
    if (!e.inUse) return { ...base, result: null, correctiveAction: "", notes: v.notes ?? "", checkedAt: null };
    const result = itemResult(e.section, v);
    const common = { ...base, result, correctiveAction: v.correctiveAction ?? "", notes: v.notes ?? "", checkedAt: v.checkedAt ?? null };
    if (e.section === "portable_thermometer") return { ...common, reading: v.reading ?? null, recheck: v.recheck ?? null };
    if (e.section === "fixed_thermometer")
      return { ...common, referenceId: v.referenceId ?? null, referenceName: sorted.find((x) => x.id === v.referenceId)?.name ?? null, target: v.target ?? null, fixedReading: v.fixedReading ?? null };
    return { ...common, points: SCALE_POINTS.map((_, i) => v.points?.[i] ?? null), pointResults: scaleResult(v.points).perPoint };
  });
  const p = progressOf(equipment, values);
  return { items, okCount: p.ok, failCount: p.notOk, notInUseCount: p.notInUse };
}

/** Stamps checkedAt the first time an item gets a result, and clears it if the result goes away. */
export function withCheckedAt(section: Section, before: ItemValues | undefined, after: ItemValues, nowIso: string): ItemValues {
  const had = itemResult(section, before) !== null;
  const has = itemResult(section, after) !== null;
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

// ── Stored shape ────────────────────────────────────────────────────────────────

/** Date and time shown in the form header. Kept inside the record's items JSON (no column exists for them). */
export interface HeaderEntry { kind: "header"; date: string; time: string }

export function splitStored(items: unknown): { header: HeaderEntry | null; entries: ItemValues[]; snapshots: ItemSnapshot[] } {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  const header = (list.find((x) => x && x.kind === "header") as unknown as HeaderEntry | undefined) ?? null;
  const rest = list.filter((x) => x && x.kind !== "header" && typeof x.equipmentId === "string");
  return { header, entries: rest as unknown as ItemValues[], snapshots: rest.filter((x) => typeof x.section === "string") as unknown as ItemSnapshot[] };
}

/** Rebuilds the equipment list and values a submitted record was filled with, from its own snapshot. */
export function viewOfSnapshot(snapshots: ItemSnapshot[]): { equipment: Equipment[]; values: Record<string, ItemValues> } {
  const equipment = snapshots.map((s): Equipment => ({ id: s.equipmentId, section: s.section, name: s.name, location: s.location, inUse: s.inUse, sortOrder: s.position * 10 }));
  return { equipment, values: Object.fromEntries(snapshots.map((s) => [s.equipmentId, s])) };
}
