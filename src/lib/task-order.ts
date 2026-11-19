/**
 * The one work order for every task list:
 *   1. due date
 *   2. the rule's saved rank (rules without a rank last)
 *   3. position on the production calendar within the day (tasks without one last)
 *   4. label, creation time, id — so ties are always resolved the same way
 */
export interface OrderableTask {
  id: string;
  /** YYYY-MM-DD */
  dueDate: string;
  label?: string | null;
  ruleId?: string | null;
  ruleSortOrder?: number | null;
  ruleCreatedAt?: string | null;
  sortKey?: number | null;
  createdAt?: string | null;
}

function nullsLast(a: number | null | undefined, b: number | null | undefined): number {
  const an = a == null, bn = b == null;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return a! - b!;
}

const text = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0;

export function compareTasks(a: OrderableTask, b: OrderableTask): number {
  return (
    text(a.dueDate, b.dueDate) ||
    nullsLast(a.ruleSortOrder, b.ruleSortOrder) ||
    // Rules sharing a rank (or both unranked) stay together, oldest rule first
    (a.ruleId !== b.ruleId ? text(a.ruleCreatedAt, b.ruleCreatedAt) || text(a.ruleId, b.ruleId) : 0) ||
    nullsLast(a.sortKey, b.sortKey) ||
    text(a.label, b.label) ||
    text(a.createdAt, b.createdAt) ||
    text(a.id, b.id)
  );
}

export function sortTasks<T extends OrderableTask>(tasks: readonly T[]): T[] {
  return [...tasks].sort(compareTasks);
}

/**
 * Applies a drag in a view that shows only some rules: the slots those rules occupy in the full
 * order are refilled with the new sequence; every other rule keeps its place.
 */
export function applyRuleReorder(allRuleIds: readonly string[], movedSequence: readonly string[]): string[] {
  const moved = new Set(movedSequence);
  const queue = movedSequence.filter((id) => allRuleIds.includes(id));
  let next = 0;
  return allRuleIds.map((id) => (moved.has(id) ? queue[next++] : id));
}

export const RANK_STEP = 10;

/** Ranks 10, 20, 30… for an ordered list of rule ids. */
export function ranksFor(orderedRuleIds: readonly string[]): { id: string; sortOrder: number }[] {
  return orderedRuleIds.map((id, i) => ({ id, sortOrder: (i + 1) * RANK_STEP }));
}
