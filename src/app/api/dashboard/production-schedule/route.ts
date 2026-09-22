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
  SHEET_NAME,
  SPREADSHEET_ID,
} from "@/lib/sheet-parser";
import { matchSubmissionsConsume } from "@/lib/submission-matcher";

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

// ─── Two-tier per-tab caches ──────────────────────────────────────────────────

const sheetCaches = new Map<string, { rows: string[][]; expiresAt: number }>();
const SHEET_CACHE_DURATION = 5 * 60 * 1000;

const resultCaches = new Map<string, { data: ScheduleResult; expiresAt: number }>();
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

function normalizeName(s: string): string {
  return s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}

function matchesProduct(
  s: SubmissionRecord,
  productId: string,
  productName: string
): boolean {
  return (
    s.productId === productId ||
    (!s.productId && normalizeName(s.templateName) === normalizeName(productName))
  );
}

function attachStatuses(
  weeks: (WeekSchedule | null)[],
  submissions: SubmissionRecord[],
  products: { id: string; name: string }[]
): void {
  // Step 1: Resolve product IDs and build the flat scheduled list for matching.
  const scheduled: Array<{ productId: string; isoDate: string }> = [];
  for (const week of weeks) {
    if (!week) continue;
    for (const day of week.days) {
      for (const item of day.items) {
        if (item.item_type !== "production") continue;
        const product = products.find(
          (p) => normalizeName(p.name) === normalizeName(item.product_name)
        );
        if (product) {
          item.product_id = product.id;
          scheduled.push({ productId: product.id, isoDate: day.iso_date });
        }
        // item_type stays "production" for now; unmatched set in step 3
      }
    }
  }

  // Step 2: Run consume-based matching. The production schedule needs ALL
  // submission statuses (not just finished) so that in-progress badges display.
  // Build a name→id lookup so template-name submissions (no productId) can
  // resolve to a product.
  const productIdByName = new Map(
    products.map((p) => [normalizeName(p.name), p.id])
  );
  const matchMap = matchSubmissionsConsume(
    scheduled,
    submissions,
    (s) => {
      if (s.productId) return s.productId;
      return productIdByName.get(normalizeName(s.templateName)) ?? null;
    }
    // No finishedStatuses filter — match all statuses for badge display
  );

  // Step 3: Apply matched statuses back to items.
  for (const week of weeks) {
    if (!week) continue;
    for (const day of week.days) {
      for (const item of day.items) {
        if (item.item_type !== "production") continue;
        if (!item.product_id) {
          item.item_type = "unmatched_production";
          continue;
        }
        const sub = matchMap.get(`${item.product_id}:${day.iso_date}`);
        if (sub) {
          item.status = mapSubmissionStatus(sub.status);
          item.submission_id = sub.id;
          item.template_id = sub.templateId;
        } else {
          item.status = "not_started";
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
      thisWeekSchedule = buildWeekSchedule(thisMonday, rows[i], contentRow);
    }

    if (!nextWeekSchedule && isThisMonday(colA, nextMonday)) {
      const nextRow = rows[i + 1] ?? [];
      const contentRow = !isDateHeaderRow(nextRow) ? nextRow : [];
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

async function fetchSchedule(sheetName: string): Promise<ScheduleResult> {
  const pt = getPacificNow();
  const thisMonday = getThisMonday(pt);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  const nextThursday = new Date(nextMonday);
  nextThursday.setDate(nextMonday.getDate() + 3);

  const now = Date.now();
  const cacheKey = `${SPREADSHEET_ID}:${sheetName}`;

  let rows: string[][];
  const cached = sheetCaches.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    rows = cached.rows;
  } else {
    try {
      rows = await fetchViaApiV4(sheetName);
    } catch (e1) {
      const msg = e1 instanceof Error ? e1.message : String(e1);
      console.warn(`[production-schedule] API v4 failed for "${sheetName}" (${msg}), falling back to gviz`);
      rows = await fetchViaGviz(sheetName);
    }
    sheetCaches.set(cacheKey, { rows, expiresAt: now + SHEET_CACHE_DURATION });
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

  const { searchParams } = req.nextUrl;
  const refresh = searchParams.get("refresh") === "true";
  const sheetParam = searchParams.get("sheet");
  const sheetName = sheetParam === "624" ? "624" : (SHEET_NAME);
  const cacheKey = `${SPREADSHEET_ID}:${sheetName}`;

  const now = Date.now();

  if (!refresh) {
    const cached = resultCaches.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.data);
    }
  }

  if (refresh) sheetCaches.delete(cacheKey);

  try {
    const data = await fetchSchedule(sheetName);
    resultCaches.set(cacheKey, { data, expiresAt: now + RESULT_CACHE_DURATION });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/dashboard/production-schedule]", msg);

    const stale = resultCaches.get(cacheKey);
    if (stale) {
      return NextResponse.json({ ...stale.data, is_stale: true });
    }

    return NextResponse.json(
      { error: "Failed to load production schedule", detail: msg },
      { status: 500 }
    );
  }
}
