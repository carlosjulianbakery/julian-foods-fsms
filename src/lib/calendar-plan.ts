import { normalizeProductName } from "@/lib/product-name";

/**
 * Decides what the calendar sync must do, without touching the database.
 *
 * A production task is identified by rule + date + product + which run of that product it is that day.
 * Its line position in the sheet cell is NOT part of its identity (that lives in sortKey), so inserting,
 * removing or reordering other lines never deletes or recreates a task.
 */

export interface PlanRule { id: string; triggerType: string; productName: string | null }
export interface PlanItem { item_type: string; product_name: string; base_unit_count?: number | null; base_unit_label?: string | null }
export interface PlanDay { iso_date: string; items: PlanItem[] }
export interface PlanExisting {
  id: string;
  ruleId: string;
  calendarKey: string | null;
  status: string;
  completedBySubmissionId: string | null;
  sortKey?: number | null;
  label?: string | null;
  createdAt?: Date | null;
}
export interface PlannedCreate { ruleId: string; dueDate: string; label: string; calendarKey: string; sortKey: number | null }
export interface CalendarPlan {
  toCreate: PlannedCreate[];
  toDelete: string[];
  toFlag: string[];
  /** In an order that is safe to apply one by one under the unique (rule, date, label) index. */
  labelUpdates: { id: string; label: string }[];
  sortKeyUpdates: { id: string; sortKey: number | null }[];
}

const UNTOUCHED = ["UPCOMING", "DUE_TODAY", "OVERDUE"];
const LABEL_EDITABLE = ["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"];
const PROD_KEY = /^(prod:\d{4}-\d{2}-\d{2}:.*):(\d+)$/;

/** Product part of a key: the schedule's name normalisation, then a URL-safe slug. */
export function productSlug(name: string): string {
  return normalizeProductName(name).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** Identity of a stored key: everything except the trailing run number of a production key. */
export function keyIdentity(calendarKey: string): string {
  return PROD_KEY.exec(calendarKey)?.[1] ?? calendarKey;
}

function matchesRuleProduct(calendarProductName: string, ruleProductName: string): boolean {
  const cal = calendarProductName.toLowerCase().trim();
  const rule = ruleProductName.toLowerCase().trim();
  return cal === rule || cal.includes(rule) || rule.includes(cal);
}

const isTouched = (e: PlanExisting) => !UNTOUCHED.includes(e.status) || e.completedBySubmissionId != null;
const trailing = (key: string | null) => (key ? parseInt(PROD_KEY.exec(key)?.[2] ?? "0", 10) : 0);

interface Expected {
  ruleId: string;
  dueDate: string;
  identity: string;
  run: number;
  sortKey: number | null;
  name: string;
  /** Text between the name and the end of the label, e.g. " (2 Bowls)". */
  suffix: string;
  baseLabel: string;
  isProduction: boolean;
}

export function planCalendarTasks(input: { rules: PlanRule[]; days: PlanDay[]; existing: PlanExisting[] }): CalendarPlan {
  const { rules, days, existing } = input;
  const plan: CalendarPlan = { toCreate: [], toDelete: [], toFlag: [], labelUpdates: [], sortKeyUpdates: [] };

  // ── What the calendar says should exist ────────────────────────────────────
  const expected: Expected[] = [];
  for (const rule of rules) {
    for (const day of days) {
      const productions = day.items.filter((i) => i.item_type === "production");
      if (rule.triggerType === "PRODUCTION_DAY") {
        if (productions.length === 0) continue;
        const identity = `day:${day.iso_date}`;
        expected.push({ ruleId: rule.id, dueDate: day.iso_date, identity, run: 0, sortKey: null, name: "", suffix: "", baseLabel: "", isProduction: false });
        continue;
      }
      const wanted =
        rule.triggerType === "PRODUCTION_ANY"
          ? productions
          : rule.triggerType === "PRODUCTION_PRODUCT" && rule.productName
            ? productions.filter((i) => matchesRuleProduct(i.product_name, rule.productName!))
            : [];
      const runsSoFar = new Map<string, number>();
      wanted.forEach((item, idx) => {
        const slug = productSlug(item.product_name);
        const run = runsSoFar.get(slug) ?? 0;
        runsSoFar.set(slug, run + 1);
        const qty =
          rule.triggerType === "PRODUCTION_ANY" && item.base_unit_count != null
            ? ` (${item.base_unit_count}${item.base_unit_label ? " " + item.base_unit_label : ""})`
            : "";
        // Product-specific rules number every match when there are several (unchanged behaviour)
        const name = rule.triggerType === "PRODUCTION_PRODUCT" && wanted.length > 1 ? `${item.product_name} #${idx + 1}` : item.product_name;
        expected.push({
          ruleId: rule.id,
          dueDate: day.iso_date,
          identity: `prod:${day.iso_date}:${slug}`,
          run,
          sortKey: productions.indexOf(item),
          name,
          suffix: qty,
          baseLabel: `${name}${qty}`,
          isProduction: true,
        });
      });
    }
  }

  // ── Pair expected tasks with stored ones by identity, never by position ───────
  const pools = new Map<string, PlanExisting[]>();
  for (const e of existing) {
    if (!e.calendarKey) continue;
    const k = `${e.ruleId}|${keyIdentity(e.calendarKey)}`;
    pools.set(k, [...(pools.get(k) ?? []), e]);
  }
  const claimed = new Set<string>();
  const match = new Map<Expected, PlanExisting>();
  const groups = new Map<string, Expected[]>();
  for (const x of expected) {
    const k = `${x.ruleId}|${x.identity}`;
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  for (const [k, runs] of Array.from(groups.entries())) {
    const pool = pools.get(k) ?? [];
    // 1. a stored task whose label already reads exactly like this run
    for (const x of runs) {
      const hit = pool.find((e) => !claimed.has(e.id) && e.label === x.baseLabel);
      if (hit) { claimed.add(hit.id); match.set(x, hit); }
    }
    // 2. the rest: tasks with work on them first, then by stored position — so a dropped run loses an untouched task
    const rest = pool
      .filter((e) => !claimed.has(e.id))
      .sort((a, b) =>
        Number(isTouched(b)) - Number(isTouched(a)) ||
        (a.sortKey ?? Number.MAX_SAFE_INTEGER) - (b.sortKey ?? Number.MAX_SAFE_INTEGER) ||
        trailing(a.calendarKey) - trailing(b.calendarKey) ||
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
        (a.id < b.id ? -1 : 1));
    for (const x of runs) {
      if (match.has(x)) continue;
      const hit = rest.shift();
      if (!hit) break;
      claimed.add(hit.id);
      match.set(x, hit);
    }
  }

  // ── Labels: unique per rule + date, updated in place on open tasks only ───────
  const ruleDay = (ruleId: string, date: string) => `${ruleId}|${date}`;
  const dateOfKey = (key: string | null) => /^(?:prod|day):(\d{4}-\d{2}-\d{2})/.exec(key ?? "")?.[1] ?? null;
  const willRelabel = (e: PlanExisting) => claimed.has(e.id) && LABEL_EDITABLE.includes(e.status) && typeof e.label === "string";
  const taken = new Map<string, Set<string>>();
  for (const e of existing) {
    const date = dateOfKey(e.calendarKey);
    if (!date || typeof e.label !== "string" || willRelabel(e)) continue;
    const k = ruleDay(e.ruleId, date);
    taken.set(k, (taken.get(k) ?? new Set()).add(e.label));
  }
  const usedKeys = new Set(existing.map((e) => `${e.ruleId}|${e.calendarKey}`));

  for (const x of expected) {
    const hit = match.get(x);
    const labels = taken.get(ruleDay(x.ruleId, x.dueDate)) ?? new Set<string>();
    taken.set(ruleDay(x.ruleId, x.dueDate), labels);

    if (hit && (!x.isProduction || !willRelabel(hit))) {
      // once-a-day task, or a completed / skipped / missed task: keeps the label it was recorded with
    } else {
      let label = x.baseLabel;
      // a second identical run (or any clash with a label already in use that day) gets " #n" before the quantity
      for (let n = Math.max(2, x.run + 1); labels.has(label); n++) label = `${x.name} #${n}${x.suffix}`;
      labels.add(label);
      if (hit) {
        if (hit.label !== label) plan.labelUpdates.push({ id: hit.id, label });
      } else {
        let run = x.run;
        while (x.isProduction && usedKeys.has(`${x.ruleId}|${x.identity}:${run}`)) run++;
        const calendarKey = x.isProduction ? `${x.identity}:${run}` : x.identity;
        usedKeys.add(`${x.ruleId}|${calendarKey}`);
        plan.toCreate.push({ ruleId: x.ruleId, dueDate: x.dueDate, label, calendarKey, sortKey: x.sortKey });
      }
    }
    if (hit && (hit.sortKey ?? null) !== x.sortKey) plan.sortKeyUpdates.push({ id: hit.id, sortKey: x.sortKey });
  }

  // A rename to a label another pending rename is about to give up must wait for that one
  const current = new Map(existing.map((e) => [e.id, e.label ?? null]));
  const pending = [...plan.labelUpdates];
  const ordered: typeof pending = [];
  while (pending.length > 0) {
    const i = pending.findIndex((u) => !pending.some((o) => o !== u && current.get(o.id) === u.label));
    ordered.push(...pending.splice(i === -1 ? 0 : i, 1));
  }
  plan.labelUpdates = ordered;

  // ── Stored tasks the calendar no longer has: same rules as before ────────────
  for (const e of existing) {
    if (claimed.has(e.id)) continue;
    const linked = e.completedBySubmissionId != null;
    if (UNTOUCHED.includes(e.status) && !linked) plan.toDelete.push(e.id);
    else if (e.status === "IN_PROGRESS" || e.status === "DONE" || linked) plan.toFlag.push(e.id);
    // SKIPPED / MISSED — left alone
  }

  return plan;
}
