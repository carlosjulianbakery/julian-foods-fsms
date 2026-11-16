export type BannerState =
  | { kind: "success" }
  | { kind: "staleSync" }
  | { kind: "overdue"; count: number }
  | { kind: "inProgress"; done: number; total: number; remaining: number }
  | { kind: "noTasks"; nextTask?: { dueDate: string; ruleTitle: string } }
  | { kind: "closed"; done: number; missed: number; skipped: number };

export interface BannerInput {
  today: string; // YYYY-MM-DD
  /** All in-scope instances (excludes SKIPPED — use skippedInstances for those) */
  instances: { status: string; dueDate: string }[];
  /** In-scope SKIPPED instances */
  skippedInstances: { dueDate: string }[];
  nextUpcoming: { dueDate: string; ruleTitle: string } | null;
  syncStale: boolean;
}

const OPEN_STATUSES = ["DUE_TODAY", "IN_PROGRESS", "UPCOMING"];

export function computeBannerState(input: BannerInput): BannerState {
  const { today, instances, skippedInstances, nextUpcoming, syncStale } = input;

  const todayDone    = instances.filter(i => i.dueDate === today && i.status === "DONE");
  const todayMissed  = instances.filter(i => i.dueDate === today && i.status === "MISSED");
  // UPCOMING with today's dueDate counts as open — cron may not have promoted it yet
  const todayActive  = instances.filter(i => i.dueDate === today && OPEN_STATUSES.includes(i.status));
  const todaySkipped = skippedInstances.filter(i => i.dueDate === today);

  // Overdue: OVERDUE status, MISSED on past date, or any open instance with a past date
  const overdueCount = instances.filter(
    i => i.status === "OVERDUE" ||
         (i.status === "MISSED" && i.dueDate < today) ||
         (OPEN_STATUSES.includes(i.status) && i.dueDate < today)
  ).length;

  // Priority 1 — overdue
  if (overdueCount > 0) return { kind: "overdue", count: overdueCount };

  // Priority 2 — still open today
  if (todayActive.length > 0) {
    const total = todayDone.length + todayActive.length + todayMissed.length + todaySkipped.length;
    return { kind: "inProgress", done: todayDone.length, total, remaining: todayActive.length };
  }

  // Priority 3 — nothing due today at all
  if (todayDone.length === 0 && todayMissed.length === 0 && todaySkipped.length === 0) {
    return { kind: "noTasks", nextTask: nextUpcoming ?? undefined };
  }

  // All today's tasks handled but some not done
  if (todayMissed.length > 0 || todaySkipped.length > 0) {
    return { kind: "closed", done: todayDone.length, missed: todayMissed.length, skipped: todaySkipped.length };
  }

  // All today's tasks done, no overdue — success (or stale sync)
  if (syncStale) return { kind: "staleSync" };
  return { kind: "success" };
}
