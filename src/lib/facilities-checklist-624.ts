/**
 * Facilities Checklist — 624 (weekly). Pure rules shared by the form, the API routes and the PDF.
 * Same shape as the Scales & Thermometer Verification form, kept in its own files on purpose.
 */
import { isoWeekOf, parseIsoWeekKey } from "@/lib/pacific-time";

export const FACILITIES_FORM_KEY = "facilities_checklist_624";
export const FACILITIES_FACILITY = "624";

export type Result = "OK" | "NOT_OK";

/** One check on the live list. */
export interface ChecklistItem {
  id: string;
  groupName: string;
  name: string;
  description: string;
  sortOrder: number;
}

/** What the supervisor enters for one check. Stored keyed by item id. */
export interface ItemValues {
  itemId: string;
  result?: Result | null;
  correctiveAction?: string;
  note?: string;
  /** Set automatically the first time the check gets a result. */
  checkedAt?: string | null;
  reInspected?: boolean;
  reInspectedAt?: string | null;
}

/** One check as stored in a submitted record: the values plus everything needed to read it later. */
export interface ItemSnapshot extends ItemValues {
  groupName: string;
  name: string;
  description: string;
  position: number;
  result: Result | null;
}

const isResult = (r: unknown): r is Result => r === "OK" || r === "NOT_OK";
export const resultOf = (v: ItemValues | undefined): Result | null => (isResult(v?.result) ? v!.result! : null);

// ── The list ────────────────────────────────────────────────────────────────────

/**
 * Form order: groups in the order of their first item, items by sortOrder inside their group.
 * A group does not need consecutive sortOrders — an item added later to "Doors" still shows under Doors.
 */
export function sortItems<T extends Pick<ChecklistItem, "groupName" | "sortOrder" | "name">>(items: T[]): T[] {
  const first = new Map<string, number>();
  for (const i of items) first.set(i.groupName, Math.min(first.get(i.groupName) ?? Infinity, i.sortOrder));
  return [...items].sort(
    (a, b) => first.get(a.groupName)! - first.get(b.groupName)! || a.groupName.localeCompare(b.groupName) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export function groupsOf<T extends Pick<ChecklistItem, "groupName" | "sortOrder" | "name">>(items: T[]): { name: string; items: T[] }[] {
  const out: { name: string; items: T[] }[] = [];
  for (const i of sortItems(items)) {
    const last = out[out.length - 1];
    if (last && last.name === i.groupName) last.items.push(i);
    else out.push({ name: i.groupName, items: [i] });
  }
  return out;
}

export const MAX_NAME = 120;
export const MAX_GROUP = 60;
export const MAX_DESCRIPTION = 400;

/** Why an item cannot be saved, in plain words; null when it is fine. Only the fields given are checked. */
export function itemProblem(input: { name?: unknown; description?: unknown; groupName?: unknown }): string | null {
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim()) return "Enter a name for the check.";
    if (input.name.trim().length > MAX_NAME) return `The name is too long (${MAX_NAME} characters at most).`;
  }
  if (input.groupName !== undefined) {
    if (typeof input.groupName !== "string" || !input.groupName.trim()) return "Choose a group or type a new group name.";
    if (input.groupName.trim().length > MAX_GROUP) return `The group name is too long (${MAX_GROUP} characters at most).`;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") return "The description must be text.";
    if (input.description.trim().length > MAX_DESCRIPTION) return `The description is too long (${MAX_DESCRIPTION} characters at most).`;
  }
  return null;
}

/** An existing group typed with other capitals or spaces is that group, not a new one. */
export function matchGroupName(items: Pick<ChecklistItem, "groupName">[], typed: string): string {
  const t = typed.trim();
  return items.find((i) => i.groupName.toLowerCase() === t.toLowerCase())?.groupName ?? t;
}

const nextSortOrder = (items: Pick<ChecklistItem, "sortOrder">[]) => items.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 10;
/** A new item goes to the end of its group; a new group goes last. */
export const sortOrderForNew = nextSortOrder;

/**
 * The sortOrder changes one edit needs: moving up or down swaps places with the neighbour in the SAME
 * group; changing the group puts the item at the end of that group (a new group goes last).
 * Returns only the rows that change; empty when there is nothing to do (e.g. first item moved up).
 */
export function planReorder(
  items: ChecklistItem[],
  op: { id: string; move: "up" | "down" } | { id: string; groupName: string },
): { id: string; sortOrder: number; groupName: string }[] {
  const item = items.find((i) => i.id === op.id);
  if (!item) return [];
  if ("move" in op) {
    const siblings = sortItems(items).filter((i) => i.groupName === item.groupName);
    const from = siblings.findIndex((i) => i.id === item.id);
    const other = siblings[from + (op.move === "up" ? -1 : 1)];
    if (!other) return [];
    if (other.sortOrder === item.sortOrder) {
      // Equal ranks cannot be swapped: renumber the group in its new order, inside the span it already occupies
      const order = [...siblings];
      [order[from], order[siblings.indexOf(other)]] = [other, item];
      const base = Math.min(...siblings.map((s) => s.sortOrder));
      return order.map((s, k) => ({ id: s.id, sortOrder: base + k, groupName: s.groupName })).filter((r) => r.sortOrder !== items.find((i) => i.id === r.id)!.sortOrder);
    }
    return [
      { id: item.id, sortOrder: other.sortOrder, groupName: item.groupName },
      { id: other.id, sortOrder: item.sortOrder, groupName: other.groupName },
    ];
  }
  const groupName = matchGroupName(items, op.groupName);
  if (groupName === item.groupName) return [];
  return [{ id: item.id, sortOrder: nextSortOrder(items), groupName }];
}

/** Position shown in the form: the check's place in the whole list, 1-based. */
export function positionOf(items: ChecklistItem[], id: string): number {
  return sortItems(items).findIndex((i) => i.id === id) + 1;
}

// ── Values ──────────────────────────────────────────────────────────────────────

/** True when the supervisor already entered something for this check in the draft. */
export function hasEnteredValues(v: ItemValues | undefined): boolean {
  return !!v && (isResult(v.result) || !!v.correctiveAction?.trim() || !!v.note?.trim());
}

/** What to ask before retiring a check. */
export function retireQuestion(item: Pick<ChecklistItem, "name">, v: ItemValues | undefined): string {
  return hasEnteredValues(v)
    ? `Retire "${item.name}"? What was already entered for it in this form will be removed.`
    : `Retire "${item.name}"? It will no longer appear in future forms.`;
}

/** The draft follows the live list: values for checks that are no longer on the list are dropped. */
export function valuesForLiveList(items: ChecklistItem[], values: Record<string, ItemValues> | ItemValues[] | null | undefined): Record<string, ItemValues> {
  const input: ItemValues[] = Array.isArray(values) ? values : Object.values(values ?? {});
  const live = new Set(items.map((i) => i.id));
  const out: Record<string, ItemValues> = {};
  for (const v of input) if (v && typeof v.itemId === "string" && live.has(v.itemId)) out[v.itemId] = { ...v };
  return out;
}

export interface Progress { checked: number; total: number; ok: number; notOk: number }

export function progressOf(items: ChecklistItem[], values: Record<string, ItemValues>): Progress {
  const results = items.map((i) => resultOf(values[i.id]));
  return {
    checked: results.filter((r) => r !== null).length,
    total: items.length,
    ok: results.filter((r) => r === "OK").length,
    notOk: results.filter((r) => r === "NOT_OK").length,
  };
}

/** Plain-language list of what still blocks submission. Empty = ready. A Not OK never blocks by itself. */
export function submitProblems(items: ChecklistItem[], values: Record<string, ItemValues>, initials: string): string[] {
  const problems: string[] = [];
  if (!initials.trim()) problems.push("Enter your initials at the top.");
  if (items.length === 0) problems.push("The checklist has no items. Add at least one in Edit checklist.");
  for (const i of sortItems(items)) {
    const v = values[i.id];
    const result = resultOf(v);
    if (result === null) problems.push(`${i.name} needs OK or Not OK.`);
    else if (result === "NOT_OK" && !v?.correctiveAction?.trim()) problems.push(`${i.name} is Not OK and needs a corrective action.`);
  }
  return problems;
}

/** Stamps checkedAt the first time a check gets a result, keeps it afterwards, clears it if the result goes away. */
export function withCheckedAt(before: ItemValues | undefined, after: ItemValues, nowIso: string): ItemValues {
  if (resultOf(after) === null) return { ...after, checkedAt: null };
  return { ...after, checkedAt: after.checkedAt ?? before?.checkedAt ?? nowIso };
}

/** Full copy stored at submit, so later edits to the checklist never change this record. */
export function buildSnapshot(items: ChecklistItem[], values: Record<string, ItemValues>): { items: ItemSnapshot[]; okCount: number; failCount: number } {
  const sorted = sortItems(items);
  const snapshots = sorted.map((i, k): ItemSnapshot => {
    const v = values[i.id] ?? { itemId: i.id };
    const result = resultOf(v);
    return {
      itemId: i.id, groupName: i.groupName, name: i.name, description: i.description, position: k + 1,
      result,
      // A corrective action only belongs to a Not OK
      correctiveAction: result === "NOT_OK" ? v.correctiveAction?.trim() ?? "" : "",
      note: v.note?.trim() ?? "",
      checkedAt: v.checkedAt ?? null,
      reInspected: result === "NOT_OK" ? v.reInspected === true : false,
      reInspectedAt: result === "NOT_OK" && v.reInspected === true ? v.reInspectedAt ?? null : null,
    };
  });
  const p = progressOf(items, values);
  return { items: snapshots, okCount: p.ok, failCount: p.notOk };
}

// ── Periods: one ISO week, Monday to Sunday, Pacific time ───────────────────────

export interface Period { key: string; start: string; end: string }

/** The week a Pacific date (YYYY-MM-DD) falls in. */
export function periodForDate(dateStr: string): Period {
  const w = isoWeekOf(dateStr);
  return { key: w.key, start: w.start, end: w.end };
}

export function parsePeriod(key: string): Period | null {
  const w = parseIsoWeekKey(key);
  return w ? { key: w.key, start: w.start, end: w.end } : null;
}

export function nextPeriod(key: string): Period | null {
  const p = parsePeriod(key);
  if (!p) return null;
  const d = new Date(`${p.end}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return periodForDate(d.toISOString().slice(0, 10));
}

const noon = (dateStr: string) => new Date(`${dateStr}T12:00:00Z`);
const fmt = (dateStr: string, opts: Intl.DateTimeFormatOptions) => noon(dateStr).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/** A week's dates: "Nov 23–29, 2026"; across months "Nov 30 – Dec 6, 2026"; across years "Dec 28, 2026 – Jan 3, 2027". */
export function periodDates(key: string): string {
  const p = parsePeriod(key);
  if (!p) return key;
  const [ys, ye] = [p.start.slice(0, 4), p.end.slice(0, 4)];
  if (ys !== ye) return `${fmt(p.start, { month: "short", day: "numeric" })}, ${ys} – ${fmt(p.end, { month: "short", day: "numeric" })}, ${ye}`;
  if (p.start.slice(5, 7) !== p.end.slice(5, 7)) return `${fmt(p.start, { month: "short", day: "numeric" })} – ${fmt(p.end, { month: "short", day: "numeric" })}, ${ye}`;
  return `${fmt(p.start, { month: "short", day: "numeric" })}–${Number(p.end.slice(8))}, ${ye}`;
}

/** "Week 48 · Nov 23–29, 2026" */
export function periodLabel(key: string): string {
  const w = parseIsoWeekKey(key);
  return w ? `Week ${w.week} · ${periodDates(key)}` : key;
}

export interface SubmittedPeriodInfo { period: string; submittedAt: string | Date | null; submittedBy: string | null }

/** What to say when a week's checklist is already submitted, and when the next week's form opens (its Monday, Pacific time). */
export function submittedPeriodMessage(info: SubmittedPeriodInfo): { submitted: string; next: string; nextOpens: string | null } {
  const on = info.submittedAt
    ? new Date(info.submittedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric" })
    : null;
  const submitted = `The ${periodDates(info.period)} checklist was submitted${on ? ` on ${on}` : ""}${info.submittedBy?.trim() ? ` by ${info.submittedBy.trim()}` : ""}.`;
  const following = nextPeriod(info.period);
  if (!following) return { submitted, next: "", nextOpens: null };
  const opens = fmt(following.start, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return { submitted, next: `The next form, for ${periodDates(following.key)}, opens on ${opens} (Pacific time).`, nextOpens: following.start };
}

/** The submitted record of the week a Pacific date falls in, if there is one. */
export function submittedForDate<T extends { period: string; status: string }>(rows: T[], pacificDate: string): T | null {
  const key = periodForDate(pacificDate).key;
  return rows.find((r) => r.period === key && r.status === "submitted") ?? null;
}

/**
 * The task of a week: the rule's instance whose due date falls inside Monday..Sunday.
 * The task is due on a weekday of the week (Thursday), never on the period's last day, so dates are
 * matched by range. An open task wins over a closed one if a week ever has two.
 */
export function taskInPeriod<T extends { dueDate: Date | string; status: string }>(instances: T[], period: Pick<Period, "start" | "end">): T | null {
  const day = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));
  const inWeek = instances.filter((i) => day(i.dueDate) >= period.start && day(i.dueDate) <= period.end);
  const closed = ["DONE", "SKIPPED", "MISSED"];
  return inWeek.find((i) => !closed.includes(i.status)) ?? inWeek[0] ?? null;
}

// ── Stored shape ────────────────────────────────────────────────────────────────

/** Date and time shown in the form header. Kept inside the record's items JSON (no column exists for them). */
export interface HeaderEntry { kind: "header"; date: string; time: string }

export function splitStored(items: unknown): { header: HeaderEntry | null; entries: ItemValues[]; snapshots: ItemSnapshot[] } {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  const header = (list.find((x) => x && x.kind === "header") as unknown as HeaderEntry | undefined) ?? null;
  const rest = list.filter((x) => x && x.kind !== "header" && typeof x.itemId === "string");
  return { header, entries: rest as unknown as ItemValues[], snapshots: rest.filter((x) => typeof x.groupName === "string") as unknown as ItemSnapshot[] };
}

/** Rebuilds the checklist and values a submitted record was filled with, from its own snapshot. */
export function viewOfSnapshot(snapshots: ItemSnapshot[]): { items: ChecklistItem[]; values: Record<string, ItemValues> } {
  const ordered = [...snapshots].sort((a, b) => a.position - b.position);
  return {
    items: ordered.map((s): ChecklistItem => ({ id: s.itemId, groupName: s.groupName, name: s.name, description: s.description, sortOrder: s.position * 10 })),
    values: Object.fromEntries(ordered.map((s) => [s.itemId, s])),
  };
}
