import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetailRow {
  fsmsPresentationId: string;
  year: bigint;
  month: bigint;
  storeName: string;
  units: bigint;
}

interface DistVelocityItem {
  fsms_presentation_id: string;
  fsms_presentation_name: string;
  completed_pos: Array<{
    po_number: string;
    customer_name: string;
    ship_date: string;
    units: number;
    monthly_tab_source: string;
  }>;
}

interface DistApiResponse {
  demand_velocity?: DistVelocityItem[];
}

interface MonthAccum {
  year: number;
  month: number;
  retailAmazon: number;
  retailShopify: number;
  retailWalmart: number;
  retailManual: number;
  distByCustomer: Map<string, number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(y: number, m: number) {
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function nowPacific() {
  const d = new Date();
  const s = d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const p = new Date(s);
  return { year: p.getFullYear(), month: p.getMonth() + 1, day: p.getDate() };
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

function parseDisplayDate(s: string): { year: number; month: number } | null {
  if (!s) return null;
  // MM/DD/YYYY
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      const m = parseInt(parts[0], 10);
      const y = parseInt(parts[2], 10);
      if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) return { year: y, month: m };
    }
  }
  // YYYY-MM-DD
  if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.length >= 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) return { year: y, month: m };
    }
  }
  return null;
}

function linearSlope(vals: number[]): number {
  const n = vals.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = vals.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (vals[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = nowPacific();
  const curKey = monthKey(now.year, now.month);

  // ── 1. Retail data (ShipStation) ─────────────────────────────────────────

  const retailRows = await prisma.$queryRaw<RetailRow[]>`
    SELECT
      ssi."fsmsPresentationId",
      EXTRACT(YEAR  FROM ss."shipDate" AT TIME ZONE 'America/Los_Angeles')::bigint AS year,
      EXTRACT(MONTH FROM ss."shipDate" AT TIME ZONE 'America/Los_Angeles')::bigint AS month,
      ss."storeName",
      SUM(ssi."quantityShipped")::bigint AS units
    FROM shipstation_shipment_items ssi
    JOIN shipstation_shipments ss ON ss.id = ssi."shipmentId"
    WHERE ss.voided = false
      AND ssi."fsmsPresentationId" IS NOT NULL
    GROUP BY ssi."fsmsPresentationId", year, month, ss."storeName"
    ORDER BY year, month
  `;

  // ── 2. Distribution data ─────────────────────────────────────────────────

  let distVelocity: DistVelocityItem[] = [];
  try {
    const base =
      process.env.NEXTAUTH_URL ??
      (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
    const r = await fetch(`${base}/api/distribution/data`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (r.ok) {
      const d = (await r.json()) as DistApiResponse;
      distVelocity = d.demand_velocity ?? [];
    }
  } catch { /* distribution unavailable */ }

  // ── 3. Presentation metadata ─────────────────────────────────────────────

  const fsmsProducts = await prisma.product.findMany({
    select: { id: true, name: true, presentations: true },
  });
  const presMap = new Map<
    string,
    { productName: string; presentationName: string; upc: string }
  >();
  for (const p of fsmsProducts) {
    for (const pr of (p.presentations as Array<{ id: string; name: string; upc?: string }>) ?? []) {
      presMap.set(pr.id, {
        productName: p.name,
        presentationName: pr.name,
        upc: pr.upc ?? "",
      });
    }
  }

  // ── 4. Accumulate monthly data per presentation ───────────────────────────

  const monthMap = new Map<string, Map<string, MonthAccum>>();

  function getOrCreate(presId: string, key: string, y: number, m: number): MonthAccum {
    if (!monthMap.has(presId)) monthMap.set(presId, new Map());
    const presMonths = monthMap.get(presId)!;
    if (!presMonths.has(key)) {
      presMonths.set(key, {
        year: y,
        month: m,
        retailAmazon: 0,
        retailShopify: 0,
        retailWalmart: 0,
        retailManual: 0,
        distByCustomer: new Map(),
      });
    }
    return presMonths.get(key)!;
  }

  // Retail
  for (const row of retailRows) {
    const y = Number(row.year);
    const m = Number(row.month);
    const key = monthKey(y, m);
    const acc = getOrCreate(row.fsmsPresentationId, key, y, m);
    const units = Number(row.units);
    const name = row.storeName.toLowerCase();
    if (name.includes("amazon")) acc.retailAmazon += units;
    else if (name.includes("shopify")) acc.retailShopify += units;
    else if (name.includes("walmart")) acc.retailWalmart += units;
    else acc.retailManual += units;
  }

  // Distribution
  for (const dv of distVelocity) {
    for (const po of dv.completed_pos) {
      const parsed = parseDisplayDate(po.ship_date);
      if (!parsed) continue;
      const { year: y, month: m } = parsed;
      const key = monthKey(y, m);
      const acc = getOrCreate(dv.fsms_presentation_id, key, y, m);
      const cust = po.customer_name || "Unknown";
      acc.distByCustomer.set(cust, (acc.distByCustomer.get(cust) ?? 0) + po.units);
    }
  }

  // ── 5. Build structured presentation results ──────────────────────────────

  let earliestKey: string | null = null;
  let latestKey: string | null = null;

  const presentations = [];

  for (const [presId, presMonths] of Array.from(monthMap.entries())) {
    const info = presMap.get(presId);
    if (!info) continue;

    const sortedKeys = Array.from(presMonths.keys()).sort();
    if (!earliestKey || sortedKeys[0] < earliestKey) earliestKey = sortedKeys[0];
    if (!latestKey || sortedKeys[sortedKeys.length - 1] > latestKey)
      latestKey = sortedKeys[sortedKeys.length - 1];

    const monthlyData = sortedKeys.map((key) => {
      const acc = presMonths.get(key)!;
      const retail_units =
        acc.retailAmazon + acc.retailShopify + acc.retailWalmart + acc.retailManual;
      const dist_units = Array.from(acc.distByCustomer.values()).reduce(
        (a, b) => a + b,
        0
      );
      const total_units = retail_units + dist_units;
      const isCurrent = key === curKey;
      const confidence: "full" | "partial" | "low" = isCurrent
        ? "partial"
        : retail_units > 0 && dist_units > 0
        ? "full"
        : retail_units > 0 || dist_units > 0
        ? "partial"
        : "low";
      return {
        year: acc.year,
        month: acc.month,
        month_label: monthLabel(acc.year, acc.month),
        is_current_month: isCurrent,
        retail_units,
        distribution_units: dist_units,
        total_units,
        retail_by_channel: {
          amazon: acc.retailAmazon,
          shopify: acc.retailShopify,
          walmart: acc.retailWalmart,
          manual: acc.retailManual,
        },
        distribution_by_customer: Array.from(acc.distByCustomer.entries())
          .map(([customer_name, units]) => ({ customer_name, units }))
          .sort((a, b) => b.units - a.units),
        data_confidence: confidence,
      };
    });

    // Complete months = all months that are NOT the current calendar month
    const complete = monthlyData.filter((m) => !m.is_current_month);
    const currentMo = monthlyData.find((m) => m.is_current_month) ?? null;

    // ── Overall trend (first→last complete month) ──────────────────────────
    let overall_change_pct: number | null = null;
    let overall_date_range: { from: string; to: string } | null = null;
    let overall_trend: "growing" | "declining" | "stable" | "insufficient_data" =
      "insufficient_data";

    if (complete.length >= 2) {
      const first = complete[0];
      const last = complete[complete.length - 1];
      overall_date_range = {
        from: first.month_label,
        to: last.month_label,
      };
      overall_change_pct =
        first.total_units === 0
          ? null
          : Math.round(
              ((last.total_units - first.total_units) / first.total_units) * 1000
            ) / 10;

      // Classify using linear regression slope + overall_change_pct
      const vals = complete.map((m) => m.total_units);
      const slope = linearSlope(vals);
      if (
        slope > 0 &&
        overall_change_pct !== null &&
        overall_change_pct > 5
      ) {
        overall_trend = "growing";
      } else if (
        slope < 0 &&
        overall_change_pct !== null &&
        overall_change_pct < -5
      ) {
        overall_trend = "declining";
      } else {
        overall_trend = "stable";
      }
    }

    // ── Month-over-month (last 2 complete months) ──────────────────────────
    let mom_change_units = 0;
    let mom_change_pct: number | null = null;
    let mom_compared: { last_month: string; prior_month: string } | null = null;

    if (complete.length >= 2) {
      const last = complete[complete.length - 1];
      const prev = complete[complete.length - 2];
      mom_change_units = last.total_units - prev.total_units;
      mom_change_pct =
        prev.total_units === 0
          ? null
          : Math.round((mom_change_units / prev.total_units) * 1000) / 10;
      mom_compared = {
        last_month: last.month_label,
        prior_month: prev.month_label,
      };
    }

    // ── 3-month average (last 3 complete months) ───────────────────────────
    const last3 = complete.slice(-3);
    const three_month_avg =
      last3.length > 0
        ? Math.round(last3.reduce((s, m) => s + m.total_units, 0) / last3.length)
        : 0;
    const three_month_period =
      last3.length >= 2
        ? { from: last3[0].month_label, to: last3[last3.length - 1].month_label }
        : last3.length === 1
        ? { from: last3[0].month_label, to: last3[0].month_label }
        : null;

    // ── Best / worst complete months ───────────────────────────────────────
    const byTotal = [...complete].sort((a, b) => b.total_units - a.total_units);
    const best_month = byTotal[0]
      ? { month_label: byTotal[0].month_label, total_units: byTotal[0].total_units }
      : null;
    const worst_month = byTotal[byTotal.length - 1]
      ? {
          month_label: byTotal[byTotal.length - 1].month_label,
          total_units: byTotal[byTotal.length - 1].total_units,
        }
      : null;

    // ── Channel split (all months including current) ───────────────────────
    const allRetail = monthlyData.reduce((s, m) => s + m.retail_units, 0);
    const allDist = monthlyData.reduce((s, m) => s + m.distribution_units, 0);
    const allTotal = allRetail + allDist || 1;
    const retail_share_pct = Math.round((allRetail / allTotal) * 100);
    const distribution_share_pct = 100 - retail_share_pct;

    // ── Current month to date ──────────────────────────────────────────────
    let current_month_to_date = null;
    if (currentMo) {
      const daysElapsed = Math.min(now.day, daysInMonth(now.year, now.month));
      const days_in_month = daysInMonth(now.year, now.month);
      current_month_to_date = {
        month_label: currentMo.month_label,
        retail_units: currentMo.retail_units,
        distribution_units: currentMo.distribution_units,
        total_units: currentMo.total_units,
        days_elapsed: daysElapsed,
        days_in_month,
        // null when fewer than 7 days elapsed — not enough data for a meaningful projection
        projected_month_total:
          daysElapsed >= 7
            ? Math.round((currentMo.total_units / daysElapsed) * days_in_month)
            : null,
      };
    }

    // total_units_all_time from complete months only (current month excluded)
    const total_units_all_time = complete.reduce((s, m) => s + m.total_units, 0);

    presentations.push({
      presentation_id: presId,
      presentation_name: info.presentationName,
      product_name: info.productName,
      upc: info.upc,
      monthly_data: monthlyData,
      total_units_all_time,
      trends: {
        overall_trend,
        overall_change_pct,
        overall_date_range,
        mom_change_units,
        mom_change_pct,
        mom_compared,
        three_month_avg,
        three_month_period,
        best_month,
        worst_month,
        retail_share_pct,
        distribution_share_pct,
        current_month_to_date,
      },
    });
  }

  presentations.sort((a, b) => b.total_units_all_time - a.total_units_all_time);

  // ── 6. Portfolio summary ──────────────────────────────────────────────────

  const growingSkus = presentations.filter(
    (p) => p.trends.overall_trend === "growing"
  ).length;
  const decliningSkus = presentations.filter(
    (p) => p.trends.overall_trend === "declining"
  ).length;
  const stableSkus = presentations.filter(
    (p) => p.trends.overall_trend === "stable"
  ).length;
  const insufSkus = presentations.filter(
    (p) => p.trends.overall_trend === "insufficient_data"
  ).length;

  // Fastest growing: highest overall_change_pct (positive)
  const fastestGrowing = [...presentations]
    .filter(
      (p) => p.trends.overall_change_pct !== null && p.trends.overall_change_pct > 0
    )
    .sort(
      (a, b) => (b.trends.overall_change_pct ?? 0) - (a.trends.overall_change_pct ?? 0)
    )
    .slice(0, 3)
    .map((p) => ({
      presentation_name: p.presentation_name,
      overall_change_pct: p.trends.overall_change_pct,
      overall_date_range: p.trends.overall_date_range,
    }));

  // Declining: overall_change_pct < -10%
  const decliningList = [...presentations]
    .filter(
      (p) => p.trends.overall_change_pct !== null && p.trends.overall_change_pct < -10
    )
    .sort(
      (a, b) => (a.trends.overall_change_pct ?? 0) - (b.trends.overall_change_pct ?? 0)
    )
    .map((p) => ({
      presentation_name: p.presentation_name,
      overall_change_pct: p.trends.overall_change_pct,
      overall_date_range: p.trends.overall_date_range,
    }));

  // Date range labels
  function parseKey(k: string) {
    const [y, m] = k.split("-").map(Number);
    return { year: y, month: m };
  }
  const dataRange =
    earliestKey && latestKey
      ? (() => {
          const e = parseKey(earliestKey);
          const l = parseKey(latestKey);
          const totalMonths = (l.year - e.year) * 12 + (l.month - e.month) + 1;
          const retailMonths = new Set(
            retailRows.map((r) => monthKey(Number(r.year), Number(r.month)))
          ).size;
          const distMonths = new Set(
            distVelocity.flatMap((dv) =>
              dv.completed_pos
                .map((p) => parseDisplayDate(p.ship_date))
                .filter((x): x is { year: number; month: number } => x !== null)
                .map((x) => monthKey(x.year, x.month))
            )
          ).size;
          return {
            earliest_month: monthLabel(e.year, e.month),
            latest_month: monthLabel(l.year, l.month),
            total_months: totalMonths,
            current_month_complete: false,
            note: `Based on ${retailMonths} month${retailMonths !== 1 ? "s" : ""} of retail data and ${distMonths} month${distMonths !== 1 ? "s" : ""} of distribution data. Coverage grows automatically as more history accumulates.`,
          };
        })()
      : null;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    dataRange,
    presentations,
    portfolio_summary: {
      total_skus_with_data: presentations.length,
      growing_skus: growingSkus,
      declining_skus: decliningSkus,
      stable_skus: stableSkus,
      insufficient_data_skus: insufSkus,
      top_products_by_volume: presentations.slice(0, 5).map((p) => ({
        presentation_name: p.presentation_name,
        total_units_all_time: p.total_units_all_time,
        overall_change_pct: p.trends.overall_change_pct,
      })),
      fastest_growing: fastestGrowing,
      declining: decliningList,
    },
  });
}
