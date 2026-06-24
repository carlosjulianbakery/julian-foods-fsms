export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  type ScheduleItem,
  type ScheduleItemStatus,
  type WeekSchedule,
  buildWeekSchedule,
  fetchViaApiV4,
  fetchViaGviz,
  getThisMonday,
  getPacificNow,
  isDateHeaderRow,
  isThisMonday,
  toIsoDate,
  shortDate,
} from "@/lib/sheet-parser";

// Re-export for debug sub-route
export { fetchViaApiV4, parseCsv } from "@/lib/sheet-parser";

// ─── Additional types (internal to this route) ────────────────────────────────

interface ScheduleResult {
  this_week: WeekSchedule | null;
  next_week: WeekSchedule | null;
  last_fetched: string;
  is_stale?: boolean;
}

interface SubmissionRecord {
  id: string;
  productionDate: Date;
  status: string;
  templateId: string;
  templateName: string;
  productId: string | null;
}

// ─── Two-tier module-level cache ──────────────────────────────────────────────

let sheetCache: { rows: string[][]; expiresAt: number } | null = null;
const SHEET_CACHE_DURATION = 5 * 60 * 1000;

let resultCache: { data: ScheduleResult; expiresAt: number } | null = null;
const RESULT_CACHE_DURATION = 60 * 1000;

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapSubmissionStatus(status: string): ScheduleItemStatus {
  switch (status) {
    case "COMPLETE":
    case "PASS":
      return "complete";
    case "DRAFT":
    case "IN_PROGRESS":
      return "in_progress";
    case "PASS_WITH_ISSUES":
    case "FAIL":
      return "issues";
    default:
      return "not_started";
  }
}

// ─── Status data fetch ────────────────────────────────────────────────────────

async function fetchStatusData(
  startDate: Date,
  endDate: Date
): Promise<{
  submissions: SubmissionRecord[];
  products: { id: string; name: string }[];
}> {
  const [rawSubmissions, products] = await Promise.all([
    prisma.batchSheetSubmission.findMany({
      where: { productionDate: { gte: startDate, lte: endDate } },
      select: {
        id: true,
        productionDate: true,
        status: true,
        templateId: true,
        templateName: true,
        productId: true,
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  return {
    submissions: rawSubmissions.map((s) => ({
      id: s.id,
      productionDate: s.productionDate,
      status: String(s.status),
      templateId: s.templateId,
      templateName: s.templateName,
      productId: s.productId,
    })),
    products,
  };
}

// ─── Attach statuses (exact product name match) ───────────────────────────────

function attachStatuses(
  weeks: (WeekSchedule | null)[],
  submissions: SubmissionRecord[],
  products: { id: string; name: string }[]
): void {
  for (const week of weeks) {
    if (!week) continue;
    for (const day of week.days) {
      const daySubmissions = submissions.filter(
        (s) => toIsoDate(s.productionDate) === day.iso_date
      );
      for (const item of day.items) {
        const product = products.find(
          (p) => p.name.toLowerCase() === item.product_name.toLowerCase()
        );
        if (product) {
          item.product_id = product.id;
          const sub = daySubmissions.find((s) => s.productId === product.id);
          if (sub) {
            item.status = mapSubmissionStatus(sub.status);
            item.submission_id = sub.id;
            item.template_id = sub.templateId;
          } else {
            item.status = "not_started";
          }
        } else {
          item.product_id = null;
          item.status = "unmatched";
        }
      }
    }
  }
}

// ─── Parse sheet rows → this/next week schedules ─────────────────────────────

function parseSchedule(
  rows: string[][],
  thisMonday: Date,
  nextMonday: Date
): ScheduleResult {
  let thisWeekSchedule: WeekSchedule | null = null;
  let nextWeekSchedule: WeekSchedule | null = null;

  for (let i = 0; i < rows.length; i++) {
    const colA = (rows[i][0] ?? "").trim();
    if (!colA) continue;

    if (!thisWeekSchedule && isThisMonday(colA, thisMonday)) {
      const nextRow = rows[i + 1] ?? [];
      const contentRow = !isDateHeaderRow(nextRow) ? nextRow : [];
      console.log(`[production-schedule] Found this week at row ${i}: "${colA}"`);
      console.log(`[production-schedule] Content row (${i + 1}): cols = [${contentRow.map((c) => JSON.stringify(c.slice(0, 30))).join(", ")}]`);
      thisWeekSchedule = buildWeekSchedule(thisMonday, rows[i], contentRow);
    }

    if (!nextWeekSchedule && isThisMonday(colA, nextMonday)) {
      const nextRow = rows[i + 1] ?? [];
      const contentRow = !isDateHeaderRow(nextRow) ? nextRow : [];
      console.log(`[production-schedule] Found next week at row ${i}: "${colA}"`);
      nextWeekSchedule = buildWeekSchedule(nextMonday, rows[i], contentRow);
    }

    if (thisWeekSchedule && nextWeekSchedule) break;
  }

  if (!thisWeekSchedule) {
    const thisMon = `${thisMonday.getMonth() + 1}/${thisMonday.getDate()}`;
    console.warn(
      `[production-schedule] This week not found. Total rows: ${rows.length}. Looking for Monday: ${thisMon}`
    );
  }

  return {
    this_week: thisWeekSchedule,
    next_week: nextWeekSchedule,
    last_fetched: new Date().toISOString(),
  };
}

// ─── Full fetch (sheet + statuses) ───────────────────────────────────────────

async function fetchSchedule(): Promise<ScheduleResult> {
  const pt = getPacificNow();
  const thisMonday = getThisMonday(pt);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  const nextThursday = new Date(nextMonday);
  nextThursday.setDate(nextMonday.getDate() + 3);

  const now = Date.now();

  let rows: string[][];
  if (sheetCache && sheetCache.expiresAt > now) {
    rows = sheetCache.rows;
  } else {
    try {
      rows = await fetchViaApiV4();
    } catch (e1) {
      const msg = e1 instanceof Error ? e1.message : String(e1);
      console.warn(`[production-schedule] API v4 failed (${msg}), falling back to gviz`);
      rows = await fetchViaGviz();
    }
    sheetCache = { rows, expiresAt: now + SHEET_CACHE_DURATION };
  }

  const result = parseSchedule(rows, thisMonday, nextMonday);

  try {
    const startUtc = new Date(
      Date.UTC(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate())
    );
    const endUtc = new Date(
      Date.UTC(nextThursday.getFullYear(), nextThursday.getMonth(), nextThursday.getDate())
    );
    const statusData = await fetchStatusData(startUtc, endUtc);
    attachStatuses(
      [result.this_week, result.next_week],
      statusData.submissions,
      statusData.products
    );
  } catch (err) {
    console.error("[production-schedule] Failed to fetch submission statuses:", err);
  }

  return result;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  const now = Date.now();

  if (!refresh && resultCache && resultCache.expiresAt > now) {
    return NextResponse.json(resultCache.data);
  }

  if (refresh) sheetCache = null;

  try {
    const data = await fetchSchedule();
    resultCache = { data, expiresAt: now + RESULT_CACHE_DURATION };
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/dashboard/production-schedule]", msg);

    if (resultCache) {
      return NextResponse.json({ ...resultCache.data, is_stale: true });
    }

    return NextResponse.json(
      { error: "Failed to load production schedule", detail: msg },
      { status: 500 }
    );
  }
}
