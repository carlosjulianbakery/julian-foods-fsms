import { prisma } from "@/lib/prisma";
import { fetchSheetRows, invalidateSheetCache } from "@/lib/google-sheets-fetcher";
import { parseDaysInRange } from "@/lib/sheet-parser";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";

const GENERATE_DAYS_AHEAD = 7;

export interface FacilitySyncResult {
  facilityId: string;
  facilityName: string;
  error?: string;
  daysFound: number;
  productionDaysFound: number;
  created: number;
  skipped: number;
  flagged: number;
}

export interface CalendarGeneratorOpts {
  dryRun?: boolean;
  facilityId?: string;
  invalidateCache?: boolean;
}

export async function generateCalendarInstances(opts: CalendarGeneratorOpts = {}): Promise<{
  results: FacilitySyncResult[];
  totalCreated: number;
  totalSkipped: number;
  totalFlagged: number;
}> {
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
        triggerType: { in: ["PRODUCTION_DAY", "PRODUCTION_PRODUCT"] },
        ...(opts.facilityId ? { facilityId: opts.facilityId } : {}),
      },
    }),
  ]);

  if (facilities.length === 0) {
    return { results: [], totalCreated: 0, totalSkipped: 0, totalFlagged: 0 };
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
  let totalSkipped = 0;
  let totalFlagged = 0;

  for (const facility of facilities) {
    const facRules = rulesByFacility.get(facility.id) ?? [];
    const r = await processOneFacility(facility, facRules, opts.dryRun ?? false, opts.invalidateCache ?? false);
    results.push(r);
    totalCreated += r.created;
    totalSkipped += r.skipped;
    totalFlagged += r.flagged;
  }

  return { results, totalCreated, totalSkipped, totalFlagged };
}

async function processOneFacility(
  facility: { id: string; name: string; calendarTabName: string },
  rules: Array<{ id: string; triggerType: string; productName: string | null }>,
  dryRun: boolean,
  invalidateCache: boolean
): Promise<FacilitySyncResult> {
  const result: FacilitySyncResult = {
    facilityId: facility.id,
    facilityName: facility.name,
    daysFound: 0,
    productionDaysFound: 0,
    created: 0,
    skipped: 0,
    flagged: 0,
  };

  const today = getPacificToday();
  const horizonStr = addDaysToDateStr(today, GENERATE_DAYS_AHEAD);
  const startDate = new Date(`${today}T12:00:00Z`);
  const endDate = new Date(`${horizonStr}T12:00:00Z`);

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
  // Abort reconciliation to avoid false-skipping legitimate instances.
  if (result.productionDaysFound === 0 && !dryRun) {
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
      const errMsg = `Zero production days parsed but ${activeCount} active SCHEDULE instance(s) exist — aborting reconciliation to avoid false skips`;
      console.warn(`[calendar-generator] ${errMsg}`);
      result.error = errMsg;
      await prisma.facility.update({
        where: { id: facility.id },
        data: { lastCalendarSyncError: errMsg },
      });
      return result;
    }
  }

  interface ExpectedInst {
    ruleId: string;
    dueDate: string;
    label: string;
    calendarKey: string;
  }

  const allExpected: ExpectedInst[] = [];

  for (const rule of rules) {
    if (rule.triggerType === "PRODUCTION_DAY") {
      for (const day of days) {
        const hasProduction = day.items.some((i) => i.item_type === "production");
        if (!hasProduction) continue;
        allExpected.push({
          ruleId: rule.id,
          dueDate: day.iso_date,
          label: "",
          calendarKey: `day:${day.iso_date}`,
        });
      }
    } else if (rule.triggerType === "PRODUCTION_PRODUCT" && rule.productName) {
      for (const day of days) {
        const matches = day.items.filter(
          (i) => i.item_type === "production" && matchesProduct(i.product_name, rule.productName!)
        );
        const needsSuffix = matches.length > 1;
        matches.forEach((item, idx) => {
          const label = needsSuffix ? `${item.product_name} #${idx + 1}` : item.product_name;
          allExpected.push({
            ruleId: rule.id,
            dueDate: day.iso_date,
            label,
            calendarKey: `prod:${day.iso_date}:${normalizeProductName(item.product_name)}:${idx}`,
          });
        });
      }
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
    },
  });

  // Map: `${ruleId}:${calendarKey}` → instance
  const existingByKey = new Map<string, typeof existingInstances[number]>();
  for (const inst of existingInstances) {
    if (inst.calendarKey) {
      existingByKey.set(`${inst.ruleId}:${inst.calendarKey}`, inst);
    }
  }

  // New instances to create
  const toCreate = allExpected
    .filter((exp) => !existingByKey.has(`${exp.ruleId}:${exp.calendarKey}`))
    .map((exp) => ({
      ruleId: exp.ruleId,
      dueDate: new Date(`${exp.dueDate}T12:00:00Z`),
      label: exp.label,
      calendarKey: exp.calendarKey,
      source: "SCHEDULE",
      status: exp.dueDate === today ? "DUE_TODAY" : "UPCOMING",
    }));

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

  // Reconciliation: instances whose calendarKey is no longer in the expected set
  const allExpectedKeys = new Set(allExpected.map((e) => `${e.ruleId}:${e.calendarKey}`));

  for (const inst of existingInstances) {
    const lookupKey = `${inst.ruleId}:${inst.calendarKey}`;
    if (!allExpectedKeys.has(lookupKey)) {
      if (inst.status === "UPCOMING" || inst.status === "DUE_TODAY") {
        result.skipped++;
        if (!dryRun) {
          const skipReason = "Removed from calendar";
          await prisma.ruleInstance.update({
            where: { id: inst.id },
            data: {
              status: "SKIPPED",
              skippedAt: new Date(),
              skipReason,
              updatedAt: new Date(),
            },
          });
          await prisma.taskInstanceAudit.create({
            data: {
              instanceId: inst.id,
              action: "auto_skipped",
              note: skipReason,
            },
          });
        }
      } else if (inst.status === "IN_PROGRESS" || inst.status === "DONE") {
        result.flagged++;
        if (!dryRun) {
          await prisma.ruleInstance.update({
            where: { id: inst.id },
            data: {
              needsAdminReview: true,
              reviewReason: "Production removed from calendar after work started",
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  }

  return result;
}

function matchesProduct(calendarProductName: string, ruleProductName: string): boolean {
  const cal = calendarProductName.toLowerCase().trim();
  const rule = ruleProductName.toLowerCase().trim();
  return cal === rule || cal.includes(rule) || rule.includes(cal);
}

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
