export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RecipeItem } from "@/lib/product-compute";
import { convertUnit } from "@/lib/unitConversion";
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
  total: number;
  unit: string;
}

export interface ForecastIngredient {
  material_id: string;
  material_name: string;
  recipe_unit: string;
  total_needed: number;
  inventory_unit: string | null;
  in_stock_raw: number | null;
  in_stock_converted: number | null;
  unit_status: "same" | "converted" | "mismatch" | "no_stock";
  conversion_note: string | null;
  surplus_or_shortfall: number | null;
  forecast_status: "sufficient" | "shortage" | "no_stock_data" | "unit_mismatch";
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
    mismatch_count: number;
  };
  last_fetched: string;
}

// ─── Sheet row cache (5 min) ──────────────────────────────────────────────────

let sheetCache: { rows: string[][]; expiresAt: number } | null = null;
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

const FINISHED_STATUSES = new Set(["complete", "pass", "pass_with_issues", "issues"]);

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get("date_from");
  const toParam = searchParams.get("date_to");

  // Default: this week Mon → this week Thu
  const pt = getPacificNow();
  const thisMonday = getThisMonday(pt);
  const defaultFrom = new Date(Date.UTC(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate()));
  const defaultTo = new Date(defaultFrom);
  defaultTo.setUTCDate(defaultFrom.getUTCDate() + 3);

  const startDate = (fromParam && parseDateParam(fromParam)) || defaultFrom;
  const endDate = (toParam && parseDateParam(toParam)) || defaultTo;

  if (startDate > endDate) {
    return NextResponse.json({ error: "date_from must be ≤ date_to" }, { status: 400 });
  }

  // ── 1. Fetch sheet rows ──────────────────────────────────────────────────────
  const now = Date.now();
  let rows: string[][];
  if (sheetCache && sheetCache.expiresAt > now) {
    rows = sheetCache.rows;
  } else {
    try {
      rows = await fetchViaApiV4();
    } catch {
      rows = await fetchViaGviz();
    }
    sheetCache = { rows, expiresAt: now + SHEET_CACHE_DURATION };
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

  // ── 4. Fetch submissions in range to determine "already submitted" ───────────
  const submissions = await prisma.batchSheetSubmission.findMany({
    where: {
      productionDate: { gte: startDate, lte: endDate },
    },
    select: { id: true, productId: true, productionDate: true, status: true },
  });
  // Map: "productId:isoDate" → status
  const submissionMap = new Map<string, string>();
  for (const s of submissions) {
    if (s.productId) {
      submissionMap.set(`${s.productId}:${toIsoDate(s.productionDate)}`, String(s.status));
    }
  }

  // ── 5. Classify each production day item ────────────────────────────────────
  const included: ForecastProduction[] = [];
  const excluded: ForecastExcluded[] = [];

  for (const day of days) {
    for (const item of day.items) {
      // Notes and unmatched_production items are silently excluded
      if (item.item_type !== "production") continue;

      const dayLabel = fmtDayLabel(day.iso_date);

      const product = productByName.get(item.product_name.toLowerCase());
      if (!product) continue;
      if (item.base_unit_count === null) continue;

      // Check submission status
      const subStatus = submissionMap.get(`${product.id}:${day.iso_date}`);
      const alreadySubmitted =
        subStatus !== undefined && FINISHED_STATUSES.has(subStatus.toLowerCase());

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

      if (alreadySubmitted) {
        excluded.push({
          iso_date: day.iso_date,
          day_label: dayLabel,
          product_name: item.product_name,
          product_id: product.id,
          reason: "already submitted",
        });
      } else {
        included.push(entry);
      }
    }
  }

  // ── 6. Compute ingredient needs ──────────────────────────────────────────────
  // For each included production, expand recipe × base_unit_count
  type NeedEntry = {
    materialId: string;
    materialName: string;
    recipeUnit: string;
    qty: number;
    breakdown: ForecastBreakdownEntry;
  };

  const needsList: NeedEntry[] = [];

  for (const prod of included) {
    const product = allProducts.find((p) => p.id === prod.product_id);
    if (!product) continue;
    const recipe = (product.recipe ?? []) as RecipeItem[];

    for (const ri of recipe) {
      if (!ri.materialId) continue;
      const needed = ri.quantity * prod.base_unit_count;
      needsList.push({
        materialId: ri.materialId,
        materialName: ri.materialName,
        recipeUnit: ri.unit,
        qty: needed,
        breakdown: {
          iso_date: prod.iso_date,
          day_label: prod.day_label,
          product_name: prod.product_name,
          base_unit_count: prod.base_unit_count,
          qty_per_base_unit: ri.quantity,
          total: needed,
          unit: ri.unit,
        },
      });
    }
  }

  // Aggregate by materialId
  const materialIds = Array.from(new Set(needsList.map((n) => n.materialId)));

  // ── 7. Fetch inventory totals (no cache — always fresh) ─────────────────────
  const lots = await prisma.inventoryLot.findMany({
    where: {
      materialId: { in: materialIds },
      status: { in: ["active", "low_stock", "conditional"] },
    },
    select: { materialId: true, quantityRemaining: true, unit: true },
  });

  const stockTotals = new Map<string, { qty: number; unit: string }>();
  for (const lot of lots) {
    const existing = stockTotals.get(lot.materialId);
    if (existing) {
      existing.qty += lot.quantityRemaining;
    } else {
      stockTotals.set(lot.materialId, { qty: lot.quantityRemaining, unit: lot.unit });
    }
  }

  // ── 8. Build per-material ingredient rows ────────────────────────────────────
  const ingredientMap = new Map<
    string,
    { materialName: string; recipeUnit: string; totalNeeded: number; breakdown: ForecastBreakdownEntry[] }
  >();

  for (const n of needsList) {
    const existing = ingredientMap.get(n.materialId);
    if (existing) {
      existing.totalNeeded += n.qty;
      existing.breakdown.push(n.breakdown);
    } else {
      ingredientMap.set(n.materialId, {
        materialName: n.materialName,
        recipeUnit: n.recipeUnit,
        totalNeeded: n.qty,
        breakdown: [n.breakdown],
      });
    }
  }

  const ingredients: ForecastIngredient[] = [];

  ingredientMap.forEach((data, materialId) => {
    const stock = stockTotals.get(materialId);
    const recipeUnit = data.recipeUnit;

    let forecastStatus: ForecastIngredient["forecast_status"];
    let unitStatus: ForecastIngredient["unit_status"];
    let inStockRaw: number | null = null;
    let inStockConverted: number | null = null;
    let inventoryUnit: string | null = null;
    let surplus: number | null = null;
    let conversionNote: string | null = null;

    if (!stock) {
      forecastStatus = "no_stock_data";
      unitStatus = "no_stock";
    } else {
      inStockRaw = stock.qty;
      inventoryUnit = stock.unit;

      if (stock.unit.trim().toLowerCase() === recipeUnit.trim().toLowerCase()) {
        inStockConverted = stock.qty;
        unitStatus = "same";
        surplus = inStockConverted - data.totalNeeded;
        forecastStatus = surplus >= 0 ? "sufficient" : "shortage";
      } else {
        const conv = convertUnit(stock.qty, stock.unit, recipeUnit);
        if (conv.possible) {
          inStockConverted = conv.result;
          unitStatus = "converted";
          surplus = inStockConverted - data.totalNeeded;
          forecastStatus = surplus >= 0 ? "sufficient" : "shortage";
          conversionNote = `${stock.qty.toFixed(3)} ${stock.unit} converted to ${conv.result.toFixed(3)} ${recipeUnit}`;
        } else {
          unitStatus = "mismatch";
          forecastStatus = "unit_mismatch";
        }
      }
    }

    ingredients.push({
      material_id: materialId,
      material_name: data.materialName,
      recipe_unit: recipeUnit,
      total_needed: data.totalNeeded,
      inventory_unit: inventoryUnit,
      in_stock_raw: inStockRaw,
      in_stock_converted: inStockConverted,
      unit_status: unitStatus,
      conversion_note: conversionNote,
      surplus_or_shortfall: surplus,
      forecast_status: forecastStatus,
      breakdown: data.breakdown,
    });
  });

  // Sort: shortages first, then unit_mismatch, then no_stock_data, then sufficient
  const statusOrder: Record<ForecastIngredient["forecast_status"], number> = {
    shortage: 0,
    unit_mismatch: 1,
    no_stock_data: 2,
    sufficient: 3,
  };
  ingredients.sort((a, b) => statusOrder[a.forecast_status] - statusOrder[b.forecast_status]);

  // ── 9. Assemble response ─────────────────────────────────────────────────────
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
      mismatch_count: ingredients.filter((i) => i.forecast_status === "unit_mismatch").length,
    },
    last_fetched: new Date().toISOString(),
  };

  return NextResponse.json(result);
}
