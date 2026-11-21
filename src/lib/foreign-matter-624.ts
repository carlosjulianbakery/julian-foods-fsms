/**
 * Foreign Matter Inspection — 624 (twice a month). Pure rules shared by the form, the API routes and the PDF.
 * Built on the pattern of the Facilities Checklist and the Scales & Thermometer Verification forms, in its
 * own files on purpose.
 *
 * Two fixed sections. Inside a section, items are grouped by area; an area exists through its items.
 * Every item has an expected quantity; the inspector answers OK or Not OK. A Not OK needs a comment
 * and may carry the quantity actually found.
 */

export const FOREIGN_MATTER_FORM_KEY = "foreign_matter_624";
export const FOREIGN_MATTER_FACILITY = "624";

export type Section = "glass_brittle" | "knives_blades";
export const SECTIONS: Section[] = ["glass_brittle", "knives_blades"];
export const SECTION_TITLES: Record<Section, string> = { glass_brittle: "Glass and Brittle", knives_blades: "Knives and Blades" };
export const isSection = (s: unknown): s is Section => (SECTIONS as unknown[]).includes(s);

export type Result = "OK" | "NOT_OK";

/** One item on the live list. */
export interface FmItem {
  id: string;
  section: Section;
  areaName: string;
  name: string;
  expectedQuantity: number;
  sortOrder: number;
}

/** What the inspector enters for one item. Stored keyed by item id. */
export interface ItemValues {
  itemId: string;
  result?: Result | null;
  comment?: string;
  /** Only meaningful on a Not OK: how many were actually found. */
  foundQuantity?: number | null;
  /** Set automatically the first time the item gets a result. */
  checkedAt?: string | null;
  /** Draft only: the expected quantity the item had when it was answered, to notice a later change. Not part of the record. */
  expectedAtCheck?: number | null;
}

/** One item as stored in a submitted record: the values plus everything needed to read it later. */
export interface ItemSnapshot extends ItemValues {
  section: Section;
  areaName: string;
  name: string;
  /** The expected quantity in force when the record was submitted. */
  expectedQuantity: number;
  position: number;
  result: Result | null;
}

const isResult = (r: unknown): r is Result => r === "OK" || r === "NOT_OK";
export const resultOf = (v: ItemValues | undefined): Result | null => (isResult(v?.result) ? v!.result! : null);
const isWholeNumber = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

// ── The list ────────────────────────────────────────────────────────────────────

type Sortable = Pick<FmItem, "section" | "areaName" | "sortOrder" | "name">;
const areaKey = (i: Pick<FmItem, "section" | "areaName">) => `${i.section}|${i.areaName}`;

/**
 * Form order: the two sections in their fixed order; inside a section the areas in the order of their
 * first item; inside an area the items by sortOrder. An area does not need consecutive sortOrders.
 */
export function sortItems<T extends Sortable>(items: T[]): T[] {
  const first = new Map<string, number>();
  for (const i of items) first.set(areaKey(i), Math.min(first.get(areaKey(i)) ?? Infinity, i.sortOrder));
  return [...items].sort(
    (a, b) =>
      SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) ||
      first.get(areaKey(a))! - first.get(areaKey(b))! || a.areaName.localeCompare(b.areaName) ||
      a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export interface Area<T> { section: Section; name: string; items: T[] }

/** The areas in form order, each with its items. */
export function areasOf<T extends Sortable>(items: T[]): Area<T>[] {
  const out: Area<T>[] = [];
  for (const i of sortItems(items)) {
    const last = out[out.length - 1];
    if (last && last.section === i.section && last.name === i.areaName) last.items.push(i);
    else out.push({ section: i.section, name: i.areaName, items: [i] });
  }
  return out;
}

/** Position shown in the form: automatic numbering, 1-based, across the whole form. */
export function positionOf(items: FmItem[], id: string): number {
  return sortItems(items).findIndex((i) => i.id === id) + 1;
}

export const MAX_NAME = 120;
export const MAX_AREA = 80;
export const MAX_QUANTITY = 100000;

/** Why an item cannot be saved, in plain words; null when it is fine. Only the fields given are checked. */
export function itemProblem(input: { name?: unknown; areaName?: unknown; section?: unknown; expectedQuantity?: unknown }): string | null {
  if (input.section !== undefined && !isSection(input.section)) return "Choose a section.";
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim()) return "Enter a name for the item.";
    if (input.name.trim().length > MAX_NAME) return `The name is too long (${MAX_NAME} characters at most).`;
  }
  if (input.areaName !== undefined) {
    if (typeof input.areaName !== "string" || !input.areaName.trim()) return "Choose an area or type a new area name.";
    if (input.areaName.trim().length > MAX_AREA) return `The area name is too long (${MAX_AREA} characters at most).`;
  }
  if (input.expectedQuantity !== undefined) {
    if (!isWholeNumber(input.expectedQuantity)) return "The expected quantity must be a whole number, 0 or more.";
    if (input.expectedQuantity > MAX_QUANTITY) return `The expected quantity cannot be more than ${MAX_QUANTITY}.`;
  }
  return null;
}

/** An existing area of that section typed with other capitals or spaces is that area, not a new one. */
export function matchAreaName(items: Pick<FmItem, "section" | "areaName">[], section: Section, typed: string): string {
  const t = typed.trim();
  return items.find((i) => i.section === section && i.areaName.toLowerCase() === t.toLowerCase())?.areaName ?? t;
}

/** Names are unique within an area (case-insensitive); the same name in another area is fine. */
export function nameTaken(items: Pick<FmItem, "id" | "section" | "areaName" | "name">[], section: Section, areaName: string, name: string, exceptId?: string): boolean {
  const [a, n] = [areaName.trim().toLowerCase(), name.trim().toLowerCase()];
  return items.some((i) => i.id !== exceptId && i.section === section && i.areaName.toLowerCase() === a && i.name.toLowerCase() === n);
}
export const nameTakenMessage = (areaName: string, name: string) => `There is already an item called "${name.trim()}" in ${areaName.trim()}.`;

/** An area as named in messages: its name, with the section in front when both sections have an area of that name. */
export function areaLabel(items: Pick<FmItem, "section" | "areaName">[], section: Section, areaName: string): string {
  const shared = items.some((i) => i.section !== section && i.areaName === areaName);
  return shared ? `${SECTION_TITLES[section]}, ${areaName}` : areaName;
}

/** A new item goes to the end of its area; a new area goes last in its section. */
export const sortOrderForNew = (items: Pick<FmItem, "sortOrder">[]) => items.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 10;

/**
 * The changes one edit needs. Moving up or down swaps places with the neighbour in the SAME area.
 * Changing the area (and, optionally, the section) puts the item at the end of that area; a new
 * area name starts a new area, placed last in its section. Returns only the rows that change.
 */
export function planReorder(
  items: FmItem[],
  op: { id: string; move: "up" | "down" } | { id: string; areaName?: string; section?: Section },
): { id: string; sortOrder: number; areaName: string; section: Section }[] {
  const item = items.find((i) => i.id === op.id);
  if (!item) return [];
  if ("move" in op) {
    const siblings = sortItems(items).filter((i) => i.section === item.section && i.areaName === item.areaName);
    const from = siblings.findIndex((i) => i.id === item.id);
    const other = siblings[from + (op.move === "up" ? -1 : 1)];
    if (!other) return [];
    if (other.sortOrder === item.sortOrder) {
      // Equal ranks cannot be swapped: renumber the area in its new order, inside the span it already occupies
      const order = [...siblings];
      [order[from], order[siblings.indexOf(other)]] = [other, item];
      const base = Math.min(...siblings.map((s) => s.sortOrder));
      return order
        .map((s, k) => ({ id: s.id, sortOrder: base + k, areaName: s.areaName, section: s.section }))
        .filter((r) => r.sortOrder !== items.find((i) => i.id === r.id)!.sortOrder);
    }
    return [
      { id: item.id, sortOrder: other.sortOrder, areaName: item.areaName, section: item.section },
      { id: other.id, sortOrder: item.sortOrder, areaName: other.areaName, section: other.section },
    ];
  }
  const section = op.section ?? item.section;
  const areaName = matchAreaName(items, section, op.areaName ?? item.areaName);
  if (section === item.section && areaName === item.areaName) return [];
  return [{ id: item.id, sortOrder: sortOrderForNew(items), areaName, section }];
}

// ── Values ──────────────────────────────────────────────────────────────────────

/** True when the inspector already entered something for this item in the draft. */
export function hasEnteredValues(v: ItemValues | undefined): boolean {
  return !!v && (isResult(v.result) || !!v.comment?.trim() || isWholeNumber(v.foundQuantity));
}

/** What to ask before retiring an item. */
export function retireQuestion(item: Pick<FmItem, "name">, v: ItemValues | undefined): string {
  return hasEnteredValues(v)
    ? `Retire "${item.name}"? What was already entered for it in this form will be removed.`
    : `Retire "${item.name}"? It will no longer appear in future forms.`;
}

/** What to ask before retiring a whole area. */
export function retireAreaQuestion(area: { name: string; items: Pick<FmItem, "id">[] }, values: Record<string, ItemValues>): string {
  const n = area.items.length;
  const entered = area.items.filter((i) => hasEnteredValues(values[i.id])).length;
  const what = `Retire the area ${area.name} and its ${n} ${n === 1 ? "item" : "items"}?`;
  return entered > 0 ? `${what} What was already entered for ${entered === 1 ? "1 of them" : `${entered} of them`} in this form will be removed.` : `${what} They will no longer appear in future forms.`;
}

/** A found quantity only belongs to a Not OK. */
function tidy(v: ItemValues): ItemValues {
  const out = { ...v };
  if (resultOf(out) !== "NOT_OK" || !isWholeNumber(out.foundQuantity)) out.foundQuantity = null;
  return out;
}

/** The draft follows the live list: values for items that are no longer on the list are dropped. */
export function valuesForLiveList(items: FmItem[], values: Record<string, ItemValues> | ItemValues[] | null | undefined): Record<string, ItemValues> {
  const input: ItemValues[] = Array.isArray(values) ? values : Object.values(values ?? {});
  const live = new Set(items.map((i) => i.id));
  const out: Record<string, ItemValues> = {};
  for (const v of input) if (v && typeof v.itemId === "string" && live.has(v.itemId)) out[v.itemId] = tidy(v);
  return out;
}

export interface Progress { checked: number; total: number; ok: number; notOk: number }

export function progressOf(items: Pick<FmItem, "id">[], values: Record<string, ItemValues>): Progress {
  const results = items.map((i) => resultOf(values[i.id]));
  return {
    checked: results.filter((r) => r !== null).length,
    total: items.length,
    ok: results.filter((r) => r === "OK").length,
    notOk: results.filter((r) => r === "NOT_OK").length,
  };
}

/** Plain-language list of what still blocks submission. Empty = ready. A Not OK never blocks by itself. */
export function submitProblems(items: FmItem[], values: Record<string, ItemValues>, initials: string): string[] {
  const problems: string[] = [];
  if (!initials.trim()) problems.push("Enter your initials at the top.");
  if (items.length === 0) problems.push("The list has no items. Add at least one in Edit list.");
  for (const i of sortItems(items)) {
    const v = values[i.id];
    const result = resultOf(v);
    const area = areaLabel(items, i.section, i.areaName);
    if (result === null) problems.push(`${area}: ${i.name} needs OK or Not OK.`);
    else if (result === "NOT_OK" && !v?.comment?.trim()) problems.push(`${area}: ${i.name} is Not OK and needs a comment.`);
  }
  return problems;
}

/**
 * Stamps checkedAt the first time an item gets a result, keeps it afterwards, clears it if the result
 * goes away. Alongside it records the expected quantity the item had when it was answered.
 */
export function withCheckedAt(before: ItemValues | undefined, after: ItemValues, nowIso: string, expectedQuantity?: number): ItemValues {
  if (resultOf(after) === null) return { ...after, checkedAt: null, expectedAtCheck: null };
  return {
    ...after,
    checkedAt: after.checkedAt ?? before?.checkedAt ?? nowIso,
    expectedAtCheck: after.expectedAtCheck ?? before?.expectedAtCheck ?? expectedQuantity ?? null,
  };
}

/** What answering an item changes: the result, and the expected quantity it was answered against (which clears the hint). */
export function answerPatch(item: Pick<FmItem, "expectedQuantity">, result: Result): Partial<ItemValues> {
  return { result, expectedAtCheck: item.expectedQuantity, ...(result === "OK" ? { foundQuantity: null } : {}) };
}

export const QUANTITY_CHANGED_HINT = "Expected quantity changed since this was checked";

/** True when the item was answered against another expected quantity than it has now. The result is kept. */
export function quantityChangedSinceCheck(item: Pick<FmItem, "expectedQuantity">, v: ItemValues | undefined): boolean {
  return resultOf(v) !== null && typeof v?.expectedAtCheck === "number" && v.expectedAtCheck !== item.expectedQuantity;
}

/**
 * "Mark all OK" for one area: the items of the area that have NO result yet become OK. An item already
 * answered — OK or Not OK — is never touched. Returns the new values of the items that change.
 */
export function markAllOk(areaItems: Pick<FmItem, "id" | "expectedQuantity">[], values: Record<string, ItemValues>, nowIso: string): ItemValues[] {
  return areaItems
    .filter((i) => resultOf(values[i.id]) === null)
    .map((i) => ({ ...(values[i.id] ?? { itemId: i.id }), itemId: i.id, result: "OK" as const, foundQuantity: null, checkedAt: nowIso, expectedAtCheck: i.expectedQuantity }));
}

/** What to ask before "Mark all OK"; null when the area has nothing left to mark. */
export function markAllOkQuestion(area: { name: string; items: Pick<FmItem, "id">[] }, values: Record<string, ItemValues>): string | null {
  const open = area.items.filter((i) => resultOf(values[i.id]) === null).length;
  if (open === 0) return null;
  return `Mark the ${open} unchecked ${open === 1 ? "item" : "items"} in ${area.name} as OK?`;
}

/** Full copy stored at submit, so later edits to the list never change this record. */
export function buildSnapshot(items: FmItem[], values: Record<string, ItemValues>): { items: ItemSnapshot[]; okCount: number; failCount: number } {
  const snapshots = sortItems(items).map((i, k): ItemSnapshot => {
    const v = values[i.id] ?? { itemId: i.id };
    const result = resultOf(v);
    return {
      itemId: i.id, section: i.section, areaName: i.areaName, name: i.name, expectedQuantity: i.expectedQuantity, position: k + 1,
      result,
      comment: v.comment?.trim() ?? "",
      foundQuantity: result === "NOT_OK" && isWholeNumber(v.foundQuantity) ? v.foundQuantity : null,
      checkedAt: v.checkedAt ?? null,
    };
  });
  const p = progressOf(items, values);
  return { items: snapshots, okCount: p.ok, failCount: p.notOk };
}

// ── Periods: fixed halves of the month ──────────────────────────────────────────

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

/** The period that follows: A → B of the same month, B → A of the next month (December B → January A). */
export function nextPeriod(key: string): Period | null {
  const p = parsePeriod(key);
  if (!p) return null;
  if (p.half === "A") return periodForDate(`${p.start.slice(0, 8)}16`);
  const [y, m] = p.start.split("-").map(Number);
  return periodForDate(m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`);
}

const noon = (dateStr: string) => new Date(`${dateStr}T12:00:00Z`);

/** A period's dates in words: "November 16–30, 2026". */
export function periodDates(key: string): string {
  const p = parsePeriod(key);
  if (!p) return key;
  const month = noon(p.start).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${Number(p.start.slice(8))}–${Number(p.end.slice(8))}, ${p.start.slice(0, 4)}`;
}

export interface SubmittedPeriodInfo { period: string; submittedAt: string | Date | null; submittedBy: string | null }

/** What to say when a period's inspection is already submitted, and when the next period's form opens (its first day, Pacific time). */
export function submittedPeriodMessage(info: SubmittedPeriodInfo): { submitted: string; next: string; nextOpens: string | null } {
  const on = info.submittedAt
    ? new Date(info.submittedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric" })
    : null;
  const submitted = `The ${periodDates(info.period)} inspection was submitted${on ? ` on ${on}` : ""}${info.submittedBy?.trim() ? ` by ${info.submittedBy.trim()}` : ""}.`;
  const following = nextPeriod(info.period);
  if (!following) return { submitted, next: "", nextOpens: null };
  const opens = noon(following.start).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return { submitted, next: `The next form, for ${periodDates(following.key)}, opens on ${opens} (Pacific time).`, nextOpens: following.start };
}

/** The submitted record of the period a Pacific date falls in, if there is one. */
export function submittedForDate<T extends { period: string; status: string }>(rows: T[], pacificDate: string): T | null {
  const key = periodForDate(pacificDate).key;
  return rows.find((r) => r.period === key && r.status === "submitted") ?? null;
}

// ── Stored shape ────────────────────────────────────────────────────────────────

/** Date and time shown in the form header. Kept inside the record's items JSON (no column exists for them). */
export interface HeaderEntry { kind: "header"; date: string; time: string }

export function splitStored(items: unknown): { header: HeaderEntry | null; entries: ItemValues[]; snapshots: ItemSnapshot[] } {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  const header = (list.find((x) => x && x.kind === "header") as unknown as HeaderEntry | undefined) ?? null;
  const rest = list.filter((x) => x && x.kind !== "header" && typeof x.itemId === "string");
  return { header, entries: rest as unknown as ItemValues[], snapshots: rest.filter((x) => typeof x.areaName === "string") as unknown as ItemSnapshot[] };
}

/** Rebuilds the list and values a submitted record was filled with, from its own snapshot. */
export function viewOfSnapshot(snapshots: ItemSnapshot[]): { items: FmItem[]; values: Record<string, ItemValues> } {
  const ordered = [...snapshots].sort((a, b) => a.position - b.position);
  return {
    items: ordered.map((s): FmItem => ({ id: s.itemId, section: isSection(s.section) ? s.section : "glass_brittle", areaName: s.areaName, name: s.name, expectedQuantity: s.expectedQuantity, sortOrder: s.position * 10 })),
    values: Object.fromEntries(ordered.map((s) => [s.itemId, s])),
  };
}

// ── Seed ────────────────────────────────────────────────────────────────────────

/** The starting list for facility 624, with the approved spelling. Order here is the order in the form. */
export const SEED_ITEMS: [Section, string, string, number][] = [
  ["glass_brittle", "Production and Storage Area", "Shatter Proof Lamps", 58],
  ["glass_brittle", "Production and Storage Area", "Door Window", 1],
  ["glass_brittle", "Production and Storage Area", "Glass Entrance", 11],
  ["glass_brittle", "Production and Storage Area", "Clock", 1],
  ["glass_brittle", "Production and Storage Area", "Trash Bins", 2],
  ["glass_brittle", "Production and Storage Area", "Trash Bin Lids", 2],
  ["glass_brittle", "Production and Storage Area", "Ingredient Bins", 26],
  ["glass_brittle", "Production and Storage Area", "Ingredient Bin Lids", 26],
  ["glass_brittle", "Production and Storage Area", "Buckets", 14],
  ["glass_brittle", "Production and Storage Area", "Bucket Lids", 6],
  ["glass_brittle", "Production and Storage Area", "Tape Dispenser", 3],
  ["glass_brittle", "Production and Storage Area", "Water Filter Case", 3],
  ["glass_brittle", "Production and Storage Area", "Light Switch Set", 6],
  ["glass_brittle", "Production and Storage Area", "Wall Plug", 8],
  ["glass_brittle", "Production and Storage Area", "Air Pressure Gauge", 6],
  ["glass_brittle", "Production and Storage Area", "Air Filter Case", 4],
  ["glass_brittle", "Production and Storage Area", "Blackboard", 3],
  ["glass_brittle", "Walk In Fridge", "Light Bulbs", 1],
  ["glass_brittle", "Walk In Fridge", "Thermometer", 1],
  ["glass_brittle", "Air Compressor", "Screen", 1],
  ["glass_brittle", "Air Compressor", "Pressure Gauge", 3],
  ["glass_brittle", "Ovens", "Screen", 3],
  ["glass_brittle", "Ovens", "Glass Doors", 2],
  ["glass_brittle", "Bread Freezer at 3021", "Light Bulbs", 1],
  ["glass_brittle", "Bread Freezer at 3021", "Thermometer", 1],
  ["glass_brittle", "Cameras", "Site Cameras", 1],
  ["glass_brittle", "Timers and Scales", "Digital Scale Screen", 1],
  ["glass_brittle", "Timers and Scales", "U-line Dial Scale", 1],
  ["glass_brittle", "Timers and Scales", "1byone Scale Screen", 5],
  ["glass_brittle", "Timers and Scales", "Digital Timers", 3],
  ["glass_brittle", "Restroom and Handwash Station", "Mirrors", 1],
  ["glass_brittle", "Restroom and Handwash Station", "Liquid Dispensers", 2],
  ["glass_brittle", "Restroom and Handwash Station", "Paper Dispenser", 2],
  ["glass_brittle", "Production Tools", "Measuring Cup", 5],
  ["glass_brittle", "Production Tools", "Blender", 1],
  ["glass_brittle", "Production Tools", "Stencil", 15],
  ["glass_brittle", "Production Tools", "Scoop & Scraper", 12],
  ["glass_brittle", "Production Tools", "Thermometer", 2],
  ["glass_brittle", "Machine Screens", "Mono Dispenser Screen", 1],
  ["glass_brittle", "Machine Screens", "Mono Dispenser Protection Panel", 1],
  ["glass_brittle", "Machine Screens", "Vmag Screen", 1],
  ["glass_brittle", "Machine Screens", "Bowl Elevator Buttons", 3],
  ["glass_brittle", "Machine Screens", "Water Cooler Gauge", 1],
  ["glass_brittle", "Machine Screens", "Bread Packaging Machine Screen", 1],
  ["glass_brittle", "Machine Screens", "Bread Packaging Round Panels", 2],
  ["glass_brittle", "Machine Screens", "Bread Packaging Protectors", 9],
  ["knives_blades", "Production and Storage Area", "Scissors", 1],
  ["knives_blades", "Production and Storage Area", "Blade", 1],
  ["knives_blades", "Production and Storage Area", "Knife", 1],
];
