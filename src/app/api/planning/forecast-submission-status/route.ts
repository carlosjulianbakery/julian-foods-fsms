/**
 * Lightweight endpoint — returns only batch sheet submission statuses for a
 * date range. Used by the Ingredient Forecast page to poll for status changes
 * every 60 seconds without re-fetching Google Sheets data.
 *
 * Always returns fresh DB data (no cache).
 *
 * GET /api/planning/forecast-submission-status?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toIsoDate } from "@/lib/sheet-parser";

function parseDateParam(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get("date_from");
  const toParam   = searchParams.get("date_to");

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: "date_from and date_to are required" }, { status: 400 });
  }

  const startDate = parseDateParam(fromParam);
  const endDate   = parseDateParam(toParam);
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Invalid date format (use YYYY-MM-DD)" }, { status: 400 });
  }

  // Extend back 7 days to catch submissions saved with off-by-a-few-days dates
  // (same pattern as the forecast route's same-week fallback matching).
  const extendedStartDate = new Date(startDate);
  extendedStartDate.setUTCDate(startDate.getUTCDate() - 7);

  const submissions = await prisma.batchSheetSubmission.findMany({
    where: {
      productionDate: { gte: extendedStartDate, lte: endDate },
      status: { not: "DRAFT" },
      productId: { not: null },
    },
    select: {
      productId:      true,
      productionDate: true,
      status:         true,
      submittedAt:    true,
    },
  });

  return NextResponse.json({
    submissions: submissions.map((s) => ({
      product_id:      s.productId,
      production_date: toIsoDate(s.productionDate),
      status:          String(s.status),
      submitted_at:    s.submittedAt?.toISOString() ?? null,
    })),
    fetched_at: new Date().toISOString(),
  });
}
