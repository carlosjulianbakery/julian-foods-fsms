export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RecipeItem } from "@/lib/product-compute";
import { convertUnit, convertToBase, getUnitFamily } from "@/lib/unitConversion";
import {
  fetchViaApiV4,
  fetchViaGviz,
  parseDaysInRange,
  toIsoDate,
  getPacificNow,
  getThisMonday,
} from "@/lib/sheet-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ForecastBreakdownEntry {
  iso_date: string;
  day_label: string;
  product_name: string;
  base_unit_count: number;
  qty_per_base_unit: number;
  /** Raw quantity in recipe_unit before any conversion */
  raw_total: number;
  /** The recipe's original unit for this contribution */
  recipe_unit: string;
  /** Quantity in standard_unit (same as raw_total when recipe_unit === standard_unit) */
  total: number;
  /** The material's standard unit from the registry */
  unit: string;
  /** true when recipe_unit !== standard_unit and conversion was applied */
  was_converted: boolean;
  /** Intermediate base-unit value (e.g., grams for weight conversions) */
  base_value: number | null;
  /** Label for the intermediate base unit (e.g., "g", "ml") */
  base_unit_label: string | null;
}

export interface ForecastExcludedContribution {
  product_name: string;
  day_label: string;
  quantity: number;
  recipe_unit: string;
  reason: string;
}

export interface ForecastIngredient {
  material_id: string;
  material_name: string;
  /** The material's standard unit from the registry; null when not set */
  standard_unit: string | null;
  total_needed: number;
  inventory_unit: string | null;
  in_stock_raw: number | null;
  in_stock_converted: number | null;
  unit_status: "same" | "converted" | "mismatch" | "no_stock";
  conversion_note: string | null;
  surplus_or_shortfall: number | null;
  forecast_status:
    | "sufficient"
    | "shortage"
    | "no_stock_data"
    | "unit_mismatch"
    | "no_unit_defined"
    | "partial_mismatch";
  excluded_contributions: ForecastExcludedContribution[];
  breakdown: ForecastBreakdownEntry[];
}

export interface ForecastProduction {
  iso_date: string;
  day_label: string;
  product_name: string;
  product_id: string;
  base_unit_count: number;
  base_unit_label: string | null;
  comments: string | null;
  already_submitted: boolean;
}

export interface ForecastExcluded {
  iso_date: string;
  day_label: string;
  product_name: string;
  product_id: string | null;
  reason: string;
  /** Non-null for manually excluded productions; null for "already submitted" */
  exclusion_id: string | null;
}

export interface ForecastData {
  date_from: string;
  date_to: string;
  productions_included: ForecastProduction[];
  productions_excluded: ForecastExcluded[];
  ingredients: ForecastIngredient[];
  summary: {
    productions_count: number;
    ingredients_count: number;
    shortage_count: number;
    sufficient_count: number;
    attention_count: number;
    manually_excluded_count: number;
  };
  /** When the Google Sheets data was actually fetched (vs served from cache) */
  sheet_fetched_at: string;
  last_fetched: string;
}

// ─── Sheet row cache (5 min) ──────────────────────────────────────────────────

let sheetCache: { rows: string[][]; fetchedAt: number; expiresAt: number } | null = null;
const SHEET_CACHE_DURATION = 5 * 60 * 1000;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDateParam(s: string): Date | null {
  // Accepts "MM/DD/YYYY" or "YYYY-MM-DD"
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(Date.UTC(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
  }
  return null;
}

function fmtDayLabel(isoDate: string): string {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function familyBaseUnit(unit: string): string {
  const family = getUnitFamily(unit);
  if (family === "weight") return "g";
  if (family === "volume") return "ml";
  return unit;
}

// Raw DB statuses that represent a completed/finished batch sheet.
// "fail" is included — even failed batches consumed materials.
const FINISHED_STATUSES = new Set(["complete", "pass", "pass_with_issues", "fail"]);

// ─── Same-week Monday helper (mirrors production-schedule route) ──────────────

function weekMonday(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return toIsoDate(dt);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get("date_from");
  const toParam   = searchParams.get("date_to");
  const refresh   = searchParams.get("refresh") === "true";

  // Default: this week Mon → this week Thu
  const pt = getPacificNow();
  const thisMonday = getThisMonday(pt);
  const defaultFrom = new Date(Date.UTC(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate()));
  const defaultTo = new Date(defaultFrom);
  defaultTo.setUTCDate(defaultFrom.getUTCDate() + 3);

  const startDate = (fromParam && parseDateParam(fromParam)) || defaultFrom;
  const endDate   = (toParam   && parseDateParam(toParam))   || defaultTo;

  if (startDate > endDate) {
    return NextResponse.json({ error: "date_from must be ≤ date_to" }, { status: 400 });
  }

  // ── 1. Fetch sheet rows (5-min cache; bypass with ?refresh=true) ─────────────
  const now = Date.now();
  let sheetFetchedAt: string;
  let rows: string[][];

  if (!refresh && sheetCache && sheetCache.expiresAt > now) {
    rows = sheetCache.rows;
    sheetFetchedAt = new Date(sheetCache.fetchedAt).toISOString();
  } else {
    if (refresh) sheetCache = null;
    try {
      rows = await fetchViaApiV4();
    } catch {
      rows = await fetchViaGviz();
    }
    sheetCache = { rows, fetchedAt: now, expiresAt: now + SHEET_CACHE_DURATION };
    sheetFetchedAt = new Date(now).toISOString();
  }

  // ── 2. Parse all days in range ───────────────────────────────────────────────
  const days = parseDaysInRange(rows, startDate, endDate);

  // ── 3. Match products by exact name ─────────────────────────────────────────
  const allProducts = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, recipe: true },
  });
  const productByName = new Map(
    allProducts.map((p) => [p.name.toLowerCase(), p])
  );

  // ── 4. Fetch submissions + active manual exclusions (always fresh — no cache) ─
  // Extend startDate back 7 days to catch submissions saved with off-by-a-few-days
  // productionDate (same issue fixed in the production-schedule route).
  const extendedStartDate = new Date(startDate);
  extendedStartDate.setUTCDate(startDate.getUTCDate() - 7);

  const [submissions, activeExclusions] = await Promise.all([
    prisma.batchSheetSubmission.findMany({
      where: { productionDate: { gte: extendedStartDate, lte: endDate } },
      select: { id: true, productId: true, productionDate: true, status: true },
    }),
    prisma.forecastExclusion.findMany({
      where: { isActive: true, productionDate: { gte: startDate, lte: endDate } },
      select: { id: true, productionDate: true, productName: true, productId: true, reason: true },
    }),
  ]);

  // Group submissions by productId for same-week fallback matching.
  // Mirrors the logic in production-schedule/route.ts: exact date first,
  // then nearest submission within the same Mon–Sun calendar week.
  const submissionsByProduct = new Map<
    string,
    Array<{ productionDate: Date; status: string }>
  >();
  for (const s of submissions) {
    if (!s.productId) continue;
    const list = submissionsByProduct.get(s.productId) ?? [];
    list.push({ productionDate: s.productionDate, status: String(s.status) });
    submissionsByProduct.set(s.productId, list);
  }

  function findSubmissionStatus(productId: string, isoDate: string): string | undefined {
    const subs = submissionsByProduct.get(productId);
    if (!subs?.length) return undefined;

    // 1. Exact date
    const exact = subs.find((s) => toIsoDate(s.productionDate) === isoDate);
    if (exact) return exact.status;

    // 2. Nearest submission in the same calendar week (Mon–Sun)
    const scheduledWeekMonday = weekMonday(isoDate);
    const scheduledTs = new Date(isoDate).getTime();
    const weekMatches = subs.filter(
      (s) => weekMonday(toIsoDate(s.productionDate)) === scheduledWeekMonday
    );
    if (weekMatches.length > 0) {
      return weekMatches.reduce((best, s) => {
        const bd = Math.abs(new Date(toIsoDate(best.productionDate)).getTime() - scheduledTs);
        const sd = Math.abs(new Date(toIsoDate(s.productionDate)).getTime() - scheduledTs);
        return sd < bd ? s : best;
      }).status;
    }

    return undefined;
  }

  // Helper to find a manual exclusion for a given product on a given date
  function normalizeName(s: string): string {
    return s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function findExclusion(productId: string, productName: string, isoDate: string) {
    return activeExclusions.find(
      (e) =>
        toIsoDate(e.productionDate) === isoDate &&
        (e.productId === productId ||
          normalizeName(e.productName) === normalizeName(productName))
    );
  }

  // ── 5. Classify each production day item ────────────────────────────────────
  const included: ForecastProduction[] = [];
  const excluded: ForecastExcluded[] = [];

  for (const day of days) {
    for (const item of day.items) {
      if (item.item_type !== "production") continue;

      const dayLabel = fmtDayLabel(day.iso_date);

      const product = productByName.get(item.product_name.toLowerCase());
      if (!product) continue;
      if (item.base_unit_count === null) continue;

      const subStatus = findSubmissionStatus(product.id, day.iso_date);
      const alreadySubmitted =
        subStatus !== undefined && FINISHED_STATUSES.has(subStatus.toLowerCase());

      const manualExclusion = findExclusion(product.id, item.product_name, day.iso_date);

      const entry: ForecastProduction = {
        iso_date: day.iso_date,
        day_label: dayLabel,
        product_name: item.product_name,
        product_id: product.id,
        base_unit_count: item.base_unit_count,
        base_unit_label: item.base_unit_label,
        comments: item.comments,
        already_submitted: alreadySubmitted,
      };

      if (manualExclusion) {
        excluded.push({
          iso_date: day.iso_date,
          day_label: dayLabel,
          product_name: item.product_name,
          product_id: product.id,
          reason: manualExclusion.reason ?? "Manually excluded",
          exclusion_id: manualExclusion.id,
        });
      } else if (alreadySubmitted) {
        excluded.push({
          iso_date: day.iso_date,
          day_label: dayLabel,
          product_name: item.product_name,
          product_id: product.id,
          reason: "already submitted",
          exclusion_id: null,
        });
      } else {
        included.push(entry);
      }
    }
  }

  // ── 6. Compute per-contribution ingredient needs (raw, unmerged) ─────────────
  type RawContribution = {
    materialId: string;
    materialName: string;
    recipeUnit: string;
    rawQty: number;
    prod: { iso_date: string; day_label: string; product_name: string; base_unit_count: number; qty_per_base_unit: number };
  };

  const rawContributions: RawContribution[] = [];

  for (const prod of included) {
    const product = allProducts.find((p) => p.id === prod.product_id);
    if (!product) continue;
    const recipe = (product.recipe ?? []) as RecipeItem[];

    for (const ri of recipe) {
      if (!ri.materialId) continue;
      rawContributions.push({
        materialId: ri.materialId,
        materialName: ri.materialName,
        recipeUnit: ri.unit,
        rawQty: ri.quantity * prod.base_unit_count,
        prod: {
          iso_date: prod.iso_date,
          day_label: prod.day_label,
          product_name: prod.product_name,
          base_unit_count: prod.base_unit_count,
          qty_per_base_unit: ri.quantity,
        },
      });
    }
  }

  const materialIds = Array.from(new Set(rawContributions.map((c) => c.materialId)));

  // ── 7. Fetch material standard units and inventory lots ──────────────────────
  const [materialRecords, lots] = await Promise.all([
    prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, unit: true },
    }),
    prisma.inventoryLot.findMany({
      where: {
        materialId: { in: materialIds },
        status: { in: ["active", "low_stock", "conditional"] },
      },
      select: { materialId: true, quantityRemaining: true, unit: true },
    }),
  ]);

  const materialStandardUnit = new Map(
    materialRecords.map((m) => [m.id, m.unit && m.unit.trim() !== "" ? m.unit.trim() : null])
  );

  const stockTotals = new Map<string, { qty: number; unit: string }>();
  for (const lot of lots) {
    const existing = stockTotals.get(lot.materialId);
    if (existing) {
      existing.qty += lot.quantityRemaining;
    } else {
      stockTotals.set(lot.materialId, { qty: lot.quantityRemaining, unit: lot.unit });
    }
  }

  // ── 8. Aggregate contributions in standard unit per material ─────────────────
  type MaterialAccum = {
    materialName: string;
    standardUnit: string | null;
    totalNeeded: number;
    breakdown: ForecastBreakdownEntry[];
    excludedContributions: ForecastExcludedContribution[];
  };

  const ingredientMap = new Map<string, MaterialAccum>();

  // Ensure every material that has contributions has an entry
  for (const c of rawContributions) {
    if (!ingredientMap.has(c.materialId)) {
      ingredientMap.set(c.materialId, {
        materialName: c.materialName,
        standardUnit: materialStandardUnit.get(c.materialId) ?? null,
        totalNeeded: 0,
        breakdown: [],
        excludedContributions: [],
      });
    }

    const accum = ingredientMap.get(c.materialId)!;
    const standardUnit = accum.standardUnit;

    if (standardUnit === null) {
      // No standard unit defined — contribution cannot be aggregated
      accum.excludedContributions.push({
        product_name: c.prod.product_name,
        day_label: c.prod.day_label,
        quantity: c.rawQty,
        recipe_unit: c.recipeUnit,
        reason: "No standard unit defined for this material",
      });
      continue;
    }

    const conv = convertUnit(c.rawQty, c.recipeUnit, standardUnit);

    if (!conv.possible) {
      accum.excludedContributions.push({
        product_name: c.prod.product_name,
        day_label: c.prod.day_label,
        quantity: c.rawQty,
        recipe_unit: c.recipeUnit,
        reason: conv.reason ?? `Cannot convert ${c.recipeUnit} → ${standardUnit}`,
      });
      continue;
    }

    const wasConverted = c.recipeUnit.trim().toLowerCase() !== standardUnit.trim().toLowerCase();
    let baseValue: number | null = null;
    let baseUnitLabel: string | null = null;

    if (wasConverted) {
      const family = getUnitFamily(c.recipeUnit);
      if (family !== "count") {
        baseValue = convertToBase(c.rawQty, c.recipeUnit);
        baseUnitLabel = familyBaseUnit(c.recipeUnit);
      }
    }

    accum.totalNeeded += conv.result;
    accum.breakdown.push({
      iso_date: c.prod.iso_date,
      day_label: c.prod.day_label,
      product_name: c.prod.product_name,
      base_unit_count: c.prod.base_unit_count,
      qty_per_base_unit: c.prod.qty_per_base_unit,
      raw_total: c.rawQty,
      recipe_unit: c.recipeUnit,
      total: conv.result,
      unit: standardUnit,
      was_converted: wasConverted,
      base_value: baseValue,
      base_unit_label: baseUnitLabel,
    });
  }

  // ── 9. Build ForecastIngredient rows ─────────────────────────────────────────
  const ingredients: ForecastIngredient[] = [];

  ingredientMap.forEach((data, materialId) => {
    const { materialName, standardUnit, totalNeeded, breakdown, excludedContributions } = data;
    const stock = stockTotals.get(materialId);

    let forecastStatus: ForecastIngredient["forecast_status"];
    let unitStatus: ForecastIngredient["unit_status"];
    let inStockRaw: number | null = null;
    let inStockConverted: number | null = null;
    let inventoryUnit: string | null = null;
    let surplus: number | null = null;
    let conversionNote: string | null = null;

    if (standardUnit === null) {
      // Material has no standard unit in the registry
      forecastStatus = "no_unit_defined";
      unitStatus = "no_stock";
    } else if (excludedContributions.length > 0 && totalNeeded === 0) {
      // All contributions failed to convert → treat as full unit_mismatch
      forecastStatus = "unit_mismatch";
      unitStatus = "no_stock";
    } else if (excludedContributions.length > 0 && totalNeeded > 0) {
      // Some converted, some did not
      forecastStatus = "partial_mismatch";
      unitStatus = "no_stock";
    } else if (!stock) {
      forecastStatus = "no_stock_data";
      unitStatus = "no_stock";
    } else {
      inStockRaw = stock.qty;
      inventoryUnit = stock.unit;

      if (stock.unit.trim().toLowerCase() === standardUnit.trim().toLowerCase()) {
        inStockConverted = stock.qty;
        unitStatus = "same";
        surplus = inStockConverted - totalNeeded;
        forecastStatus = surplus >= 0 ? "sufficient" : "shortage";
      } else {
        const conv = convertUnit(stock.qty, stock.unit, standardUnit);
        if (conv.possible) {
          inStockConverted = conv.result;
          unitStatus = "converted";
          surplus = inStockConverted - totalNeeded;
          forecastStatus = surplus >= 0 ? "sufficient" : "shortage";
          conversionNote = `${stock.qty.toFixed(3)} ${stock.unit} → ${conv.result.toFixed(3)} ${standardUnit}`;
        } else {
          unitStatus = "mismatch";
          forecastStatus = "unit_mismatch";
        }
      }
    }

    ingredients.push({
      material_id: materialId,
      material_name: materialName,
      standard_unit: standardUnit,
      total_needed: totalNeeded,
      inventory_unit: inventoryUnit,
      in_stock_raw: inStockRaw,
      in_stock_converted: inStockConverted,
      unit_status: unitStatus,
      conversion_note: conversionNote,
      surplus_or_shortfall: surplus,
      forecast_status: forecastStatus,
      excluded_contributions: excludedContributions,
      breakdown,
    });
  });

  // Sort: shortage → no_unit_defined → unit_mismatch → partial_mismatch → no_stock_data → sufficient
  const statusOrder: Record<ForecastIngredient["forecast_status"], number> = {
    shortage: 0,
    no_unit_defined: 1,
    unit_mismatch: 2,
    partial_mismatch: 3,
    no_stock_data: 4,
    sufficient: 5,
  };
  ingredients.sort((a, b) => statusOrder[a.forecast_status] - statusOrder[b.forecast_status]);

  // ── 10. Assemble response ────────────────────────────────────────────────────
  const attentionStatuses = new Set<ForecastIngredient["forecast_status"]>([
    "unit_mismatch",
    "no_unit_defined",
    "partial_mismatch",
  ]);

  const result: ForecastData = {
    date_from: toIsoDate(startDate),
    date_to: toIsoDate(endDate),
    productions_included: included,
    productions_excluded: excluded,
    ingredients,
    summary: {
      productions_count: included.length,
      ingredients_count: ingredients.length,
      shortage_count: ingredients.filter((i) => i.forecast_status === "shortage").length,
      sufficient_count: ingredients.filter((i) => i.forecast_status === "sufficient").length,
      attention_count: ingredients.filter((i) => attentionStatuses.has(i.forecast_status)).length,
      manually_excluded_count: excluded.filter((e) => e.exclusion_id !== null).length,
    },
    sheet_fetched_at: sheetFetchedAt,
    last_fetched: new Date().toISOString(),
  };

  return NextResponse.json(result);
}
