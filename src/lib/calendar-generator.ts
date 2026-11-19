import { prisma } from "@/lib/prisma";
import { fetchSheetRows, invalidateSheetCache } from "@/lib/google-sheets-fetcher";
import { parseDaysInRange } from "@/lib/sheet-parser";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import { planCalendarTasks } from "@/lib/calendar-plan";

const GENERATE_DAYS_AHEAD = 7;

export interface FacilitySyncResult {
  facilityId: string;
  facilityName: string;
  error?: string;
  daysFound: number;
  productionDaysFound: number;
  created: number;
  deleted: number;
  flagged: number;
  /** Open tasks whose label was brought in line with the sheet (quantity or wording changed). */
  labelsUpdated?: number;
  /** Tasks whose stored line position changed. */
  positionsUpdated?: number;
}

export interface CalendarGeneratorOpts {
  dryRun?: boolean;
  facilityId?: string;
  invalidateCache?: boolean;
}

export async function generateCalendarInstances(opts: CalendarGeneratorOpts = {}): Promise<{
  results: FacilitySyncResult[];
  totalCreated: number;
  totalDeleted: number;
  totalFlagged: number;
}> {
  // Fail fast when the API key is absent — prevents silent gviz fallback with stale data.
  if (!process.env.GOOGLE_SHEETS_API_KEY) {
    throw new Error(
      "GOOGLE_SHEETS_API_KEY is not set — aborting calendar generation to prevent gviz fallback with potentially stale data"
    );
  }

  // Always iterate every facility so lastCalendarSyncAt is recorded even when
  // a facility has no calendar-based rules yet.
  const [facilities, rules] = await Promise.all([
    prisma.facility.findMany({
      ...(opts.facilityId ? { where: { id: opts.facilityId } } : {}),
      orderBy: { name: "asc" },
    }),
    prisma.taskRule.findMany({
      where: {
        isActive: true,
        isArchived: false,
        triggerType: { in: ["PRODUCTION_DAY", "PRODUCTION_PRODUCT", "PRODUCTION_ANY"] },
        ...(opts.facilityId ? { facilityId: opts.facilityId } : {}),
      },
    }),
  ]);

  if (facilities.length === 0) {
    return { results: [], totalCreated: 0, totalDeleted: 0, totalFlagged: 0 };
  }

  // Group rules by facilityId
  const rulesByFacility = new Map<string, typeof rules>();
  for (const rule of rules) {
    const existing = rulesByFacility.get(rule.facilityId);
    if (existing) {
      existing.push(rule);
    } else {
      rulesByFacility.set(rule.facilityId, [rule]);
    }
  }

  const results: FacilitySyncResult[] = [];
  let totalCreated = 0;
  let totalDeleted = 0;
  let totalFlagged = 0;

  for (const facility of facilities) {
    const facRules = rulesByFacility.get(facility.id) ?? [];
    const r = await processOneFacility(facility, facRules, opts.dryRun ?? false, opts.invalidateCache ?? false);
    results.push(r);
    totalCreated += r.created;
    totalDeleted += r.deleted;
    totalFlagged += r.flagged;
  }

  return { results, totalCreated, totalDeleted, totalFlagged };
}

async function processOneFacility(
  facility: { id: string; name: string; calendarTabName: string },
  rules: Array<{ id: string; triggerType: string; productName: string | null; ownerId: string }>,
  dryRun: boolean,
  invalidateCache: boolean
): Promise<FacilitySyncResult> {
  const result: FacilitySyncResult = {
    facilityId: facility.id,
    facilityName: facility.name,
    daysFound: 0,
    productionDaysFound: 0,
    created: 0,
    deleted: 0,
    flagged: 0,
  };

  const today = getPacificToday();
  const horizonStr = addDaysToDateStr(today, GENERATE_DAYS_AHEAD);
  const [sy, sm, sd] = today.split("-").map(Number);
  const [ey, em, ed] = horizonStr.split("-").map(Number);
  const startDate = new Date(Date.UTC(sy, sm - 1, sd));
  const endDate = new Date(Date.UTC(ey, em - 1, ed));

  if (invalidateCache) invalidateSheetCache(facility.calendarTabName);

  let rows: string[][];
  try {
    const fetched = await fetchSheetRows(facility.calendarTabName);
    rows = fetched.rows;
    if (!dryRun) {
      await prisma.facility.update({
        where: { id: facility.id },
        data: { lastCalendarSyncAt: new Date(), lastCalendarSyncError: null },
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.error = `Fetch failed for tab "${facility.calendarTabName}": ${errMsg}`;
    if (!dryRun) {
      await prisma.facility.update({
        where: { id: facility.id },
        data: { lastCalendarSyncError: errMsg },
      });
    }
    return result;
  }

  const days = parseDaysInRange(rows, startDate, endDate);
  result.daysFound = days.length;
  result.productionDaysFound = days.filter((d) =>
    d.items.some((i) => i.item_type === "production")
  ).length;

  // Safety guard: if the sheet returned zero production days but active SCHEDULE
  // instances already exist in the window, the parse result is probably wrong.
  // Abort (or report "would abort" in dryRun) to avoid false-skipping legitimate instances.
  if (result.productionDaysFound === 0) {
    const ruleIds = rules.map((r) => r.id);
    const activeCount = await prisma.ruleInstance.count({
      where: {
        ruleId: { in: ruleIds },
        source: "SCHEDULE",
        status: { in: ["UPCOMING", "DUE_TODAY", "IN_PROGRESS"] },
        dueDate: {
          gte: new Date(`${today}T00:00:00Z`),
          lte: new Date(`${horizonStr}T23:59:59Z`),
        },
      },
    });
    if (activeCount > 0) {
      const errMsg = dryRun
        ? `would abort: zero production days parsed but ${activeCount} active SCHEDULE instance(s) exist`
        : `Zero production days parsed but ${activeCount} active SCHEDULE instance(s) exist — aborting reconciliation to avoid false skips`;
      console.warn(`[calendar-generator] ${errMsg}`);
      result.error = errMsg;
      if (!dryRun) {
        await prisma.facility.update({
          where: { id: facility.id },
          data: { lastCalendarSyncError: errMsg },
        });
      }
      return result;
    }
  }

  // Load existing SCHEDULE instances for these rules in the window
  const ruleIds = rules.map((r) => r.id);
  const existingInstances = await prisma.ruleInstance.findMany({
    where: {
      ruleId: { in: ruleIds },
      source: "SCHEDULE",
      dueDate: {
        gte: new Date(`${today}T00:00:00Z`),
        lte: new Date(`${horizonStr}T23:59:59Z`),
      },
    },
    select: {
      id: true,
      ruleId: true,
      calendarKey: true,
      status: true,
      ownerUserId: true,
      completedBySubmissionId: true,
      sortKey: true,
      label: true,
      createdAt: true,
    },
  });

  // Tasks are matched by rule + date + product + run of that product — never by line position
  const { toCreate: plannedCreates, toDelete, toFlag, labelUpdates, sortKeyUpdates } = planCalendarTasks({
    rules,
    days,
    existing: existingInstances,
  });

  const toCreate = plannedCreates.map((c) => ({
    ruleId: c.ruleId,
    dueDate: new Date(`${c.dueDate}T12:00:00Z`),
    label: c.label,
    calendarKey: c.calendarKey,
    sortKey: c.sortKey,
    source: "SCHEDULE",
    status: c.dueDate === today ? "DUE_TODAY" : "UPCOMING",
  }));

  result.labelsUpdated = labelUpdates.length;
  result.positionsUpdated = sortKeyUpdates.length;

  if (!dryRun) {
    // Quantity or wording changed on the sheet: the open task's label follows, one at a time in a safe order
    for (const u of labelUpdates) {
      try {
        await prisma.ruleInstance.update({ where: { id: u.id }, data: { label: u.label } });
      } catch (e) {
        result.labelsUpdated--;
        console.warn(`[calendar-generator] label update skipped for ${u.id}:`, e instanceof Error ? e.message : e);
      }
    }
    // Keep the stored calendar position current on tasks that already exist
    if (sortKeyUpdates.length > 0) {
      await prisma.$transaction(
        sortKeyUpdates.map((u) => prisma.ruleInstance.update({ where: { id: u.id }, data: { sortKey: u.sortKey } })),
      );
    }
  }

  if (toCreate.length > 0) {
    if (!dryRun) {
      const r = await prisma.ruleInstance.createMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: toCreate as any,
        skipDuplicates: true,
      });
      result.created = r.count;
    } else {
      result.created = toCreate.length;
    }
  }

  result.deleted += toDelete.length;
  result.flagged += toFlag.length;

  if (!dryRun) {
    if (toDelete.length > 0) {
      // Delete Notification rows first (no cascade on instanceId)
      await prisma.notification.deleteMany({ where: { instanceId: { in: toDelete } } });
      // Delete instances — TaskInstanceAudit cascades automatically
      await prisma.ruleInstance.deleteMany({ where: { id: { in: toDelete } } });
    }
    if (toFlag.length > 0) {
      await prisma.ruleInstance.updateMany({
        where: { id: { in: toFlag } },
        data: {
          needsAdminReview: true,
          reviewReason: "Production removed from calendar after work started",
          updatedAt: new Date(),
        },
      });
    }
  }

  return result;
}
