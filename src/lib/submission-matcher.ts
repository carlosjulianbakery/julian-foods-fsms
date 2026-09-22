import { toIsoDate } from "@/lib/sheet-parser";

export const FINISHED_STATUSES = new Set([
  "complete",
  "pass",
  "pass_with_issues",
  "fail",
]);

function weekMondayFromIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * Consume-based submission matching.
 *
 * Assigns each submission to exactly ONE scheduled production. Scope is
 * per-product per Mon–Sun week. For each scheduled production (processed in
 * date-ascending order within the week):
 *   1. Claim an exact-date submission if one is available in the pool.
 *   2. Otherwise claim the nearest same-week submission within ≤ 6 days.
 *   3. Each claimed submission is removed from the pool — it cannot match
 *      any other scheduled production.
 *
 * This fixes the "two productions same week, one submission" bug where the
 * old nearest-match algorithm would assign the same submission to both.
 *
 * @param scheduled        Flat list of all scheduled productions (productId + ISO date).
 * @param submissions      All batch-sheet submissions to draw from.
 * @param getProductId     Resolves the product ID a submission belongs to.
 *                         Return null to exclude the submission from all pools.
 * @param finishedStatuses Only submissions whose status (lowercased) is in this
 *                         set are eligible. Pass undefined to allow all statuses
 *                         (used by the production-schedule route for badge display).
 * @returns Map from `${productId}:${isoDate}` to the submission that was consumed.
 */
export function matchSubmissionsConsume<S extends { productionDate: Date; status: string }>(
  scheduled: Array<{ productId: string; isoDate: string }>,
  submissions: S[],
  getProductId: (s: S) => string | null,
  finishedStatuses?: Set<string>
): Map<string, S> {
  const result = new Map<string, S>();

  // Apply optional status filter
  const eligible = finishedStatuses
    ? submissions.filter((s) => finishedStatuses.has(s.status.toLowerCase()))
    : submissions;

  // Group scheduled productions by `${productId}:${weekMonday}`
  const scheduledByGroup = new Map<string, Array<{ productId: string; isoDate: string }>>();
  for (const prod of scheduled) {
    const gk = `${prod.productId}:${weekMondayFromIso(prod.isoDate)}`;
    const arr = scheduledByGroup.get(gk) ?? [];
    arr.push(prod);
    scheduledByGroup.set(gk, arr);
  }

  // For each group run the consume algorithm
  for (const prods of Array.from(scheduledByGroup.values())) {
    const productId = prods[0].productId;
    const week = weekMondayFromIso(prods[0].isoDate);

    // Build mutable pool: eligible submissions for this product in this week
    const pool: S[] = eligible
      .filter((s) => {
        if (getProductId(s) !== productId) return false;
        return weekMondayFromIso(toIsoDate(s.productionDate)) === week;
      })
      .sort((a, b) =>
        toIsoDate(a.productionDate).localeCompare(toIsoDate(b.productionDate))
      );

    // Process scheduled productions in date-ascending order
    const sortedProds = [...prods].sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    for (const prod of sortedProds) {
      if (pool.length === 0) break;

      const scheduledTs = new Date(prod.isoDate).getTime();

      // 1. Exact date match — preferred
      const exactIdx = pool.findIndex((s) => toIsoDate(s.productionDate) === prod.isoDate);
      if (exactIdx !== -1) {
        result.set(`${prod.productId}:${prod.isoDate}`, pool[exactIdx]);
        pool.splice(exactIdx, 1);
        continue;
      }

      // 2. Nearest submission within 6 days (day-late / day-early scenario)
      let nearestIdx = 0;
      let nearestDiff = Math.abs(
        new Date(toIsoDate(pool[0].productionDate)).getTime() - scheduledTs
      );
      for (let i = 1; i < pool.length; i++) {
        const diff = Math.abs(
          new Date(toIsoDate(pool[i].productionDate)).getTime() - scheduledTs
        );
        if (diff < nearestDiff) {
          nearestDiff = diff;
          nearestIdx = i;
        }
      }

      if (nearestDiff <= SIX_DAYS_MS) {
        result.set(`${prod.productId}:${prod.isoDate}`, pool[nearestIdx]);
        pool.splice(nearestIdx, 1);
      }
    }
  }

  return result;
}
