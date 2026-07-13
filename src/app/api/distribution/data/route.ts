import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DIST_SHEET_ID = "1NHQkncP_vd4sZpjv3qZAf0He2FSkkuJWcU-rF_jb9ZM";
const MONTH_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DistributionItem {
  upc: string;
  product_type: string;
  product_name: string;
  units: number;
  fsms_presentation_id: string | null;
  fsms_product_id: string | null;
  fsms_presentation_name: string | null;
  fsms_product_name: string | null;
  match_status: "matched" | "unmatched_upc";
}

export interface DistributionPO {
  po_number: string;
  customer_name: string;
  status: "pending" | "shipped";
  target_date: string | null;
  shipping_date: string | null;
  po_value: number | null;
  fill_rate_skus: number | null;
  fill_rate_dollars: number | null;
  invoice_number: string | null;
  sales_order: string | null;
  items: DistributionItem[];
}

export interface ProductSummary {
  upc: string;
  product_type: string;
  product_name: string;
  sum_units: number;
  in_stock_np: number | null;
  needed: number;
  fsms_presentation_id: string | null;
  fsms_product_id: string | null;
  fsms_presentation_name: string | null;
  fsms_product_name: string | null;
  match_status: "matched" | "unmatched_upc";
  pending_pos: Array<{
    po_number: string;
    customer_name: string;
    units: number;
    target_date: string | null;
    days_until_target: number | null;
  }>;
}

export interface DemandVelocity {
  upc: string;
  fsms_presentation_id: string;
  fsms_presentation_name: string;
  units_last_30_days: number;
  units_last_90_days: number;
  weekly_avg: number;
  completed_pos_count: number;
  calculation_detail: {
    date_range_from: string | null;
    date_range_to: string;
    weeks_divisor: number;
    low_data_warning: boolean;
  };
  completed_pos: Array<{
    po_number: string;
    customer_name: string;
    ship_date: string;
    units: number;
    monthly_tab_source: string;
  }>;
  by_customer: Array<{
    customer_name: string;
    units_90_days: number;
    weekly_avg: number;
    percentage_of_total: number;
  }>;
}

interface DebugPOCol {
  col_letter: string;
  col_index: number;
  po_number: string;
  in_sum_range: boolean;
  has_shipping_date: boolean;
  status: string;
}

export interface DataHealthMatchedPO {
  po_number: string;
  col_letter: string;
  monthly_tab_source: string;
  customer_name: string;
  status: "pending" | "shipped";
  has_shipping_date: boolean;
  target_date: string | null;
}

export interface DataHealthProductsOnly {
  po_number: string;
  col_letter: string;
  col_index: number;
  customer_name_row1: string;
  in_sum_formula: boolean;
  possible_issue: string;
}

export interface DataHealthMonthlyOnly {
  po_number: string;
  monthly_tab_source: string;
  customer_name: string;
  target_date: string | null;
  shipping_date: string | null;
  po_value: number | null;
  possible_issue: string;
}

export interface DataHealthFormatMismatch {
  products_tab_po: string;
  monthly_tab_po: string;
  col_letter: string;
  monthly_tab_source: string;
  suggestion: string;
}

export interface DataHealth {
  summary: {
    total_pos_in_products_tab: number;
    total_pos_in_monthly_tabs: number;
    exactly_matched: number;
    in_products_only: number;          // total (active + historical)
    in_products_only_active: number;   // in SUM formula, no monthly match — high priority
    in_products_only_historical: number; // outside SUM, no monthly match — lower priority
    in_monthly_only: number;
    format_mismatches: number;
    health_score: number;
  };
  matched_pos: DataHealthMatchedPO[];
  in_products_only: DataHealthProductsOnly[];
  in_monthly_only: DataHealthMonthlyOnly[];
  format_mismatches: DataHealthFormatMismatch[];
}

export interface DistributionData {
  generatedAt: string;
  pos: DistributionPO[];
  product_summary: ProductSummary[];
  demand_velocity: DemandVelocity[];
  summary: {
    total_pos: number;
    pending_pos: number;
    shipped_pos: number;
    total_pending_units: number;
    products_needing_production: number;
    overdue_pos: number;
    unmatched_upcs: string[];
  };
  debug: {
    sum_col_index: number | null;
    sum_col_letter: string | null;
    sum_formula_cell: string | null;
    sum_formula_value: string | null;
    sum_formula_type: "range" | "addition" | "mixed" | "unknown";
    sum_range_start: null;
    sum_range_end: null;
    active_col_letters: string[];
    total_columns_scanned: number;
    columns_in_sum_range: number;
    columns_outside_sum_range: number;
    pending_pos_before_ship_filter: number;
    pending_pos_after_ship_filter: number;
    sample_po_columns: DebugPOCol[];
    last_po_columns: DebugPOCol[];
  };
  data_health: DataHealth;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSheetKey(): string {
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  if (!key) throw new Error("GOOGLE_SHEETS_API_KEY not set");
  return key;
}

async function fetchSheetRange(range: string, key: string): Promise<string[][]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${DIST_SHEET_ID}/values/` +
    `${encodeURIComponent(range)}?key=${key}&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.values ?? []) as string[][];
}

async function fetchSheetFormulas(range: string, key: string): Promise<string[][]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${DIST_SHEET_ID}/values/` +
    `${encodeURIComponent(range)}?key=${key}&valueRenderOption=FORMULA`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.values ?? []) as string[][];
}

function colLetterToIndex(letters: string): number {
  let result = 0;
  for (const ch of letters.toUpperCase()) {
    result = result * 26 + (ch.charCodeAt(0) - 64);
  }
  return result - 1; // 0-indexed
}

function colIndexToLetters(idx: number): string {
  let result = "";
  let n = idx + 1;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function detectFormulaType(formula: string): "range" | "addition" | "mixed" | "unknown" {
  const hasRange = /[A-Z]+\d+:[A-Z]+\d+/i.test(formula);
  const hasAddition = /[A-Z]+\d+\+[A-Z]+\d+/i.test(formula);
  if (hasRange && hasAddition) return "mixed";
  if (hasRange) return "range";
  if (hasAddition) return "addition";
  // SUM with comma-separated cells: =SUM(A1,B1,C1)
  if (/SUM\([^)]+,[^)]+\)/i.test(formula)) return "addition";
  return "unknown";
}

function parseActiveCols(formula: string): Set<string> {
  const activeCols = new Set<string>();
  if (!formula) return activeCols;

  // First expand all range references (e.g. D4:JB4) into individual column letters
  const rangeRefs = formula.match(/([A-Z]+)\d+:([A-Z]+)\d+/gi) ?? [];
  for (const range of rangeRefs) {
    const parts = range.split(":").map((r) => r.match(/^([A-Z]+)/i)?.[1]?.toUpperCase());
    const [start, end] = parts;
    if (start && end) {
      const startIdx = colLetterToIndex(start);
      const endIdx = colLetterToIndex(end);
      for (let i = startIdx; i <= endIdx; i++) {
        activeCols.add(colIndexToLetters(i));
      }
    }
  }

  // Then add any individual cell references not already covered by a range
  // Remove range portions first so we don't double-count
  const formulaNoRanges = formula.replace(/[A-Z]+\d+:[A-Z]+\d+/gi, "");
  const cellRefs = formulaNoRanges.match(/([A-Z]+)\d+/gi) ?? [];
  for (const ref of cellRefs) {
    const col = ref.match(/^([A-Z]+)/i)?.[1]?.toUpperCase();
    if (col) activeCols.add(col);
  }

  return activeCols;
}

function normalizePO(po: string): string {
  const trimmed = po.trim().toLowerCase().replace(/^0+/, "");
  return trimmed || po.trim().toLowerCase();
}

async function fetchTabNames(key: string): Promise<string[]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${DIST_SHEET_ID}` +
    `?key=${key}&fields=sheets.properties`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet metadata error ${res.status}`);
  const json = await res.json();
  return ((json.sheets ?? []) as Array<{ properties: { title: string } }>)
    .map((s) => s.properties.title);
}

function parseDateStr(s: string | undefined): string | null {
  if (!s || s.trim() === "") return null;
  const str = s.trim();
  // MM/DD/YYYY
  const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const [, mo, d, y] = m1;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return str;
  return null;
}

function parseNum(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  const n = parseFloat(s.replace(/[$,%]/g, "").trim());
  return isNaN(n) ? null : n;
}

function getPacificToday(): string {
  const pt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return `${pt.getFullYear()}-${String(pt.getMonth() + 1).padStart(2, "0")}-${String(pt.getDate()).padStart(2, "0")}`;
}

function daysUntil(isoDate: string, todayIso: string): number | null {
  if (!isoDate) return null;
  const a = new Date(isoDate + "T00:00:00Z").getTime();
  const b = new Date(todayIso + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = getSheetKey();

  // ── 1. Fetch tab names ───────────────────────────────────────────────────────
  const tabNames = await fetchTabNames(key);
  const monthlyTabs = tabNames.filter((t) => MONTH_PATTERN.test(t));

  // ── 2. Fetch Products tab + monthly tabs in parallel ─────────────────────────
  const [productsRows, ...monthlyRowsArr] = await Promise.all([
    fetchSheetRange("'Products'!A1:ZZ1000", key),
    ...monthlyTabs.map((tab) => fetchSheetRange(`'${tab}'!A1:P500`, key)),
  ]);

  // ── 3. Parse Products tab ─────────────────────────────────────────────────────

  const row1 = productsRows[0] ?? []; // customer names
  const row2 = productsRows[1] ?? []; // PO numbers
  const row3 = productsRows[2] ?? []; // dates

  // Find SUM column index in row 2
  let sumColIdx = -1;
  for (let i = 3; i < row2.length; i++) {
    if ((row2[i] ?? "").trim() === "SUM (in Units)") {
      sumColIdx = i;
      break;
    }
  }

  // PO columns: 3 to sumColIdx-1 (inclusive)
  // If SUM not found, use all columns from 3 onward as PO columns
  const poEndIdx = sumColIdx > 0 ? sumColIdx - 1 : row2.length - 1;

  // Fetch the SUM formula from the exact cell (row 4) in the SUM column — sequential after sumColIdx is known
  // Active columns are those explicitly referenced in the formula → pending; all others → shipped
  let activeColsSet = new Set<string>();
  let dbgSumColLetter: string | null = null;
  let dbgFormulaCell: string | null = null;
  let dbgFormulaValue: string | null = null;
  let dbgFormulaType: "range" | "addition" | "mixed" | "unknown" = "unknown";
  if (sumColIdx >= 0) {
    dbgSumColLetter = colIndexToLetters(sumColIdx);
    dbgFormulaCell = `'Products'!${dbgSumColLetter}4:${dbgSumColLetter}4`;
    console.log(`[distribution] SUM column: ${dbgSumColLetter} (index ${sumColIdx})`);
    const formulaRows = await fetchSheetFormulas(dbgFormulaCell, key);
    dbgFormulaValue = String(formulaRows[0]?.[0] ?? "");
    console.log(`[distribution] SUM formula in row 4: "${dbgFormulaValue}"`);
    dbgFormulaType = detectFormulaType(dbgFormulaValue);
    activeColsSet = parseActiveCols(dbgFormulaValue);
    console.log(`[distribution] Formula type: ${dbgFormulaType}, active columns (${activeColsSet.size}): ${Array.from(activeColsSet).join(",")}`);
    if (activeColsSet.size === 0) {
      console.warn(`[distribution] WARNING: No active columns parsed from formula — all PO columns will default to pending`);
    }
  } else {
    console.warn(`[distribution] WARNING: SUM column not found in row 2 — all PO columns will default to pending`);
  }

  interface POCol {
    colIdx: number;
    poNumber: string;
    customerName: string;
    targetDate: string | null;
    inSumRange: boolean;
  }
  const poColumns: POCol[] = [];
  for (let i = 3; i <= poEndIdx; i++) {
    const poNumber = (row2[i] ?? "").trim();
    if (!poNumber) continue;
    const colLetter = colIndexToLetters(i);
    // If no active cols parsed, default to treating all columns as active (safe fallback)
    const inSumRange = activeColsSet.size > 0 ? activeColsSet.has(colLetter) : true;
    poColumns.push({
      colIdx: i,
      poNumber,
      customerName: (row1[i] ?? "").trim(),
      targetDate: parseDateStr(row3[i]),
      inSumRange,
    });
  }

  // Product rows: row index 3 onwards, must have UPC in col C (index 2)
  interface ProductRow {
    rowIdx: number;
    type: string;
    name: string;
    upc: string;
    unitsByPO: Map<string, number>; // poNumber → units
    sumUnits: number;
    inStockNP: number | null;
    needed: number;
  }
  const productRows: ProductRow[] = [];
  for (let r = 3; r < productsRows.length; r++) {
    const row = productsRows[r] ?? [];
    const upc = (row[2] ?? "").trim();
    if (!upc) continue;
    const type = (row[0] ?? "").trim();
    const name = (row[1] ?? "").trim();

    const unitsByPO = new Map<string, number>();
    for (const poc of poColumns) {
      const raw = (row[poc.colIdx] ?? "").trim();
      const n = parseNum(raw);
      if (n && n > 0) unitsByPO.set(poc.poNumber, n);
    }

    const sumUnits = parseNum(sumColIdx >= 0 ? row[sumColIdx] : undefined) ?? 0;
    const inStockNP = parseNum(sumColIdx >= 0 ? row[sumColIdx + 1] : undefined);
    const needed = parseNum(sumColIdx >= 0 ? row[sumColIdx + 2] : undefined) ?? 0;

    productRows.push({ rowIdx: r, type, name, upc, unitsByPO, sumUnits, inStockNP, needed });
  }

  // ── 4. Build PO detail map from monthly tabs ──────────────────────────────────

  interface PODetails {
    customer: string;
    targetDate: string | null;
    shippingDate: string | null;
    poValue: number | null;
    fillRateSkus: number | null;
    fillRateDollars: number | null;
    invoiceNumber: string | null;
    salesOrder: string | null;
    foundInTab: string;
  }
  const poDetailMap = new Map<string, PODetails>();

  for (let ti = 0; ti < monthlyTabs.length; ti++) {
    const tabName = monthlyTabs[ti];
    const rows = monthlyRowsArr[ti] ?? [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const poCellRaw = (row[2] ?? "").trim();
      if (!poCellRaw || poCellRaw.toLowerCase() === "customer po") continue;
      const poNumber = poCellRaw;
      if (!poDetailMap.has(poNumber)) {
        poDetailMap.set(poNumber, {
          customer: (row[0] ?? "").trim(),
          targetDate: parseDateStr(row[7]),    // col H
          shippingDate: parseDateStr(row[8]),  // col I
          poValue: parseNum(row[6]),           // col G = PO $ (col F = # SKUs)
          fillRateSkus: parseNum(row[14]),     // col O
          fillRateDollars: parseNum(row[15]),  // col P
          invoiceNumber: (row[4] ?? "").trim() || null,  // col E
          salesOrder: (row[3] ?? "").trim() || null,      // col D
          foundInTab: tabName,
        });
      }
    }
  }

  // ── 5. Match UPCs to FSMS presentations ──────────────────────────────────────

  const fsmsProducts = await prisma.product.findMany({
    select: { id: true, name: true, presentations: true },
  });

  interface PresMatch {
    fsms_presentation_id: string;
    fsms_product_id: string;
    fsms_presentation_name: string;
    fsms_product_name: string;
  }
  const upcToPresentation = new Map<string, PresMatch>();

  for (const p of fsmsProducts) {
    for (const pr of (p.presentations as Array<{ id: string; name: string; upc?: string }>) ?? []) {
      if (pr.upc && pr.upc.trim()) {
        upcToPresentation.set(pr.upc.trim(), {
          fsms_presentation_id: pr.id,
          fsms_product_id: p.id,
          fsms_presentation_name: pr.name,
          fsms_product_name: p.name,
        });
      }
    }
  }

  function matchUpc(upc: string): PresMatch | null {
    return upcToPresentation.get(upc) ?? null;
  }

  // ── 6. Build PO list ──────────────────────────────────────────────────────────

  const today = getPacificToday();

  // Historical cutoff: only include shipped POs from the past 12 months
  const historicalCutoffDate = new Date(today + "T00:00:00Z");
  historicalCutoffDate.setUTCMonth(historicalCutoffDate.getUTCMonth() - 12);
  const isoHistoricalCutoff = historicalCutoffDate.toISOString().slice(0, 10);

  let inSumRangeCount = 0;
  let outsideSumRangeCount = 0;
  let pendingBeforeItemsFilter = 0;

  const pos: DistributionPO[] = [];

  for (const poc of poColumns) {
    const detail = poDetailMap.get(poc.poNumber);
    const targetDate = detail?.targetDate ?? poc.targetDate ?? null;
    const shippingDate = detail?.shippingDate ?? null;
    // A PO is open only if it's within the SUM formula range AND has no shipping date
    const status: DistributionPO["status"] = (!poc.inSumRange || shippingDate) ? "shipped" : "pending";

    if (poc.inSumRange) {
      inSumRangeCount++;
      if (!shippingDate) pendingBeforeItemsFilter++;
    } else {
      outsideSumRangeCount++;
      // Skip historical POs that have no monthly tab match or shipped too long ago
      if (!detail || !detail.shippingDate || detail.shippingDate < isoHistoricalCutoff) continue;
    }

    const items: DistributionItem[] = [];
    for (const prow of productRows) {
      const units = prow.unitsByPO.get(poc.poNumber) ?? 0;
      if (units <= 0) continue;
      const match = matchUpc(prow.upc);
      items.push({
        upc: prow.upc,
        product_type: prow.type,
        product_name: prow.name,
        units,
        fsms_presentation_id: match?.fsms_presentation_id ?? null,
        fsms_product_id: match?.fsms_product_id ?? null,
        fsms_presentation_name: match?.fsms_presentation_name ?? null,
        fsms_product_name: match?.fsms_product_name ?? null,
        match_status: match ? "matched" : "unmatched_upc",
      });
    }

    if (items.length === 0) continue;

    pos.push({
      po_number: poc.poNumber,
      customer_name: detail?.customer || poc.customerName,
      status,
      target_date: targetDate,
      shipping_date: shippingDate,
      po_value: detail?.poValue ?? null,
      fill_rate_skus: detail?.fillRateSkus ?? null,
      fill_rate_dollars: detail?.fillRateDollars ?? null,
      invoice_number: detail?.invoiceNumber ?? null,
      sales_order: detail?.salesOrder ?? null,
      items,
    });
  }

  const pendingPOsDebug = pos.filter((p) => p.status === "pending");
  console.log(`[distribution] PO columns in SUM range: ${inSumRangeCount}, outside: ${outsideSumRangeCount}`);
  console.log(`[distribution] Pending POs: ${pendingPOsDebug.length}, Shipped POs: ${pos.filter((p) => p.status === "shipped").length}`);

  // ── 7. Build product summary ──────────────────────────────────────────────────

  const productSummary: ProductSummary[] = [];
  const unmatchedUpcs = new Set<string>();

  for (const prow of productRows) {
    const match = matchUpc(prow.upc);
    if (!match) unmatchedUpcs.add(prow.upc);

    const pendingPos = pos
      .filter((po) => po.status === "pending" && po.items.some((item) => item.upc === prow.upc))
      .map((po) => {
        const item = po.items.find((i) => i.upc === prow.upc)!;
        const dUntil = po.target_date ? daysUntil(po.target_date, today) : null;
        return {
          po_number: po.po_number,
          customer_name: po.customer_name,
          units: item.units,
          target_date: po.target_date,
          days_until_target: dUntil,
        };
      })
      .sort((a, b) => {
        if (!a.target_date) return 1;
        if (!b.target_date) return -1;
        return a.target_date.localeCompare(b.target_date);
      });

    productSummary.push({
      upc: prow.upc,
      product_type: prow.type,
      product_name: prow.name,
      sum_units: prow.sumUnits,
      in_stock_np: prow.inStockNP,
      needed: prow.needed,
      fsms_presentation_id: match?.fsms_presentation_id ?? null,
      fsms_product_id: match?.fsms_product_id ?? null,
      fsms_presentation_name: match?.fsms_presentation_name ?? null,
      fsms_product_name: match?.fsms_product_name ?? null,
      match_status: match ? "matched" : "unmatched_upc",
      pending_pos: pendingPos,
    });
  }

  // Sort: matched products needing production first (red), then matched surplus/zero (green),
  // then unmatched products at end; alphabetical within each group
  productSummary.sort((a, b) => {
    const aMatched = a.match_status === "matched";
    const bMatched = b.match_status === "matched";
    if (aMatched !== bMatched) return aMatched ? -1 : 1;
    if (aMatched && bMatched) {
      const aNeeds = a.needed > 0;
      const bNeeds = b.needed > 0;
      if (aNeeds !== bNeeds) return aNeeds ? -1 : 1;
    }
    return a.product_name.localeCompare(b.product_name);
  });

  // ── 8. Calculate demand velocity ──────────────────────────────────────────────

  const today90 = new Date(today + "T00:00:00Z");
  today90.setUTCDate(today90.getUTCDate() - 90);
  const iso90 = today90.toISOString().slice(0, 10);

  const today30 = new Date(today + "T00:00:00Z");
  today30.setUTCDate(today30.getUTCDate() - 30);
  const iso30 = today30.toISOString().slice(0, 10);

  interface VelocityAccum {
    units90: number;
    units30: number;
    completedPos: Array<{ po_number: string; customer_name: string; ship_date: string; units: number; monthly_tab_source: string }>;
    byCustomer: Map<string, number>;
    earliestShipDate: string | null;
  }

  const velocityByUpc = new Map<string, VelocityAccum>();
  for (const po of pos) {
    if (po.status !== "shipped" || !po.shipping_date) continue;
    const is90 = po.shipping_date >= iso90;
    const is30 = po.shipping_date >= iso30;
    const tabSource = poDetailMap.get(po.po_number)?.foundInTab ?? "";
    for (const item of po.items) {
      const v: VelocityAccum = velocityByUpc.get(item.upc) ?? { units90: 0, units30: 0, completedPos: [], byCustomer: new Map<string, number>(), earliestShipDate: null };
      if (is90) {
        v.units90 += item.units;
        v.completedPos.push({
          po_number: po.po_number,
          customer_name: po.customer_name,
          ship_date: po.shipping_date,
          units: item.units,
          monthly_tab_source: tabSource,
        });
        v.byCustomer.set(po.customer_name, (v.byCustomer.get(po.customer_name) ?? 0) + item.units);
        if (!v.earliestShipDate || po.shipping_date < v.earliestShipDate) {
          v.earliestShipDate = po.shipping_date;
        }
      }
      if (is30) v.units30 += item.units;
      velocityByUpc.set(item.upc, v);
    }
  }

  const demandVelocity: DemandVelocity[] = [];
  for (const [upc, v] of Array.from(velocityByUpc.entries())) {
    const match = matchUpc(upc);
    if (!match) continue;
    const lowDataWarning = v.completedPos.length < 3;
    const sortedPos = v.completedPos.slice().sort((a, b) => b.ship_date.localeCompare(a.ship_date));
    const byCustomerArr = Array.from(v.byCustomer.entries())
      .map(([customer_name, units_90_days]) => ({
        customer_name,
        units_90_days,
        weekly_avg: Math.round((units_90_days / 13) * 10) / 10,
        percentage_of_total: v.units90 > 0 ? Math.round((units_90_days / v.units90) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.units_90_days - a.units_90_days);

    // Convert ISO dates to MM/DD/YYYY Pacific for display
    const toDisplayDate = (iso: string) => {
      const d = new Date(iso + "T00:00:00Z");
      return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
    };

    demandVelocity.push({
      upc,
      fsms_presentation_id: match.fsms_presentation_id,
      fsms_presentation_name: match.fsms_presentation_name,
      units_last_30_days: v.units30,
      units_last_90_days: v.units90,
      weekly_avg: Math.round((v.units90 / 13) * 10) / 10,
      completed_pos_count: v.completedPos.length,
      calculation_detail: {
        date_range_from: v.earliestShipDate ? toDisplayDate(v.earliestShipDate) : null,
        date_range_to: toDisplayDate(today),
        weeks_divisor: 13,
        low_data_warning: lowDataWarning,
      },
      completed_pos: sortedPos,
      by_customer: byCustomerArr,
    });
  }
  demandVelocity.sort((a, b) => b.units_last_90_days - a.units_last_90_days);

  // ── 9. Summary stats ──────────────────────────────────────────────────────────

  const pendingPOs = pos.filter((p) => p.status === "pending");
  const shippedPOs = pos.filter((p) => p.status === "shipped");

  const overduePOs = pendingPOs.filter((po) => {
    if (!po.target_date) return false;
    return po.target_date < today;
  });

  const totalPendingUnits = pendingPOs.reduce(
    (sum, po) => sum + po.items.reduce((s, i) => s + i.units, 0),
    0
  );

  // ── 9b. Data health analysis ─────────────────────────────────────────────────

  const monthlyPONumbers = new Set(poDetailMap.keys());

  // Products-tab PO set — ALL columns, no scoping filter.
  // The old filter excluded unmatched columns, which is exactly the condition we want to detect.
  const productsPONumbers = new Set(poColumns.map((p) => p.poNumber));

  // Exact matches
  const exactlyMatchedCols = poColumns.filter((poc) => monthlyPONumbers.has(poc.poNumber));

  // Products tab only (not in any monthly tab) — raw, before fuzzy-match pass
  const productsOnlyRaw = poColumns.filter((poc) => !monthlyPONumbers.has(poc.poNumber));

  // Monthly only (not in Products tab at all)
  const monthlyOnlyEntries = Array.from(poDetailMap.entries()).filter(
    ([poNumber]) => !productsPONumbers.has(poNumber)
  );

  // Fuzzy match: try to pair productsOnly entries with monthly entries
  const normalizedMonthlyMap = new Map<string, string>(); // normalized → original monthly PO
  for (const poNumber of Array.from(monthlyPONumbers)) {
    normalizedMonthlyMap.set(normalizePO(poNumber), poNumber);
  }

  const formatMismatches: DataHealthFormatMismatch[] = [];
  // Active gaps: in SUM formula but no monthly match (pending POs with missing metadata)
  const trueProductsOnlyActive: typeof poColumns = [];
  // Historical gaps: outside SUM formula, no monthly match (shipped with no monthly record)
  const trueProductsOnlyHistorical: typeof poColumns = [];

  for (const poc of productsOnlyRaw) {
    const normalizedProd = normalizePO(poc.poNumber);
    const monthlyMatch = normalizedMonthlyMap.get(normalizedProd);
    if (monthlyMatch) {
      const detail = poDetailMap.get(monthlyMatch)!;
      let hint = "";
      if (poc.poNumber.trim() !== poc.poNumber || monthlyMatch.trim() !== monthlyMatch) {
        hint = "trailing/leading whitespace detected";
      } else if (poc.poNumber !== monthlyMatch && poc.poNumber.toLowerCase() === monthlyMatch.toLowerCase()) {
        hint = "case difference detected";
      } else {
        hint = "leading zeros or formatting difference";
      }
      formatMismatches.push({
        products_tab_po: poc.poNumber,
        monthly_tab_po: monthlyMatch,
        col_letter: colIndexToLetters(poc.colIdx),
        monthly_tab_source: detail.foundInTab,
        suggestion: `Likely the same PO — ${hint}. Consider fixing the PO number to be identical in both places.`,
      });
    } else if (poc.inSumRange) {
      trueProductsOnlyActive.push(poc);
    } else {
      trueProductsOnlyHistorical.push(poc);
    }
  }

  const trueProductsOnly = [...trueProductsOnlyActive, ...trueProductsOnlyHistorical];

  // Health score: denominator counts only identifiable active-operation POs (historical gaps excluded)
  const totalIdentifiable =
    exactlyMatchedCols.length + formatMismatches.length + trueProductsOnlyActive.length + monthlyOnlyEntries.length;
  const healthNumerator = exactlyMatchedCols.length + formatMismatches.length;
  const healthScore = totalIdentifiable > 0 ? Math.round((healthNumerator / totalIdentifiable) * 1000) / 10 : 100;

  const dataHealth: DataHealth = {
    summary: {
      total_pos_in_products_tab: poColumns.length,
      total_pos_in_monthly_tabs: monthlyPONumbers.size,
      exactly_matched: exactlyMatchedCols.length,
      in_products_only: trueProductsOnly.length,
      in_products_only_active: trueProductsOnlyActive.length,
      in_products_only_historical: trueProductsOnlyHistorical.length,
      in_monthly_only: monthlyOnlyEntries.length,
      format_mismatches: formatMismatches.length,
      health_score: healthScore,
    },
    matched_pos: exactlyMatchedCols.map((poc) => {
      const detail = poDetailMap.get(poc.poNumber)!;
      const poEntry = pos.find((p) => p.po_number === poc.poNumber);
      return {
        po_number: poc.poNumber,
        col_letter: colIndexToLetters(poc.colIdx),
        monthly_tab_source: detail.foundInTab,
        customer_name: detail.customer || poc.customerName,
        status: poEntry?.status ?? (poc.inSumRange && !detail.shippingDate ? "pending" : "shipped"),
        has_shipping_date: !!detail.shippingDate,
        target_date: detail.targetDate ?? poc.targetDate,
      };
    }),
    in_products_only: trueProductsOnly.map((poc) => ({
      po_number: poc.poNumber,
      col_letter: colIndexToLetters(poc.colIdx),
      col_index: poc.colIdx,
      customer_name_row1: poc.customerName,
      in_sum_formula: poc.inSumRange,
      possible_issue: poc.inSumRange
        ? "PO is in SUM formula (marked pending) but has no monthly tab entry — missing metadata"
        : "Historical PO with no monthly tab match",
    })),
    in_monthly_only: monthlyOnlyEntries.map(([poNumber, detail]) => ({
      po_number: poNumber,
      monthly_tab_source: detail.foundInTab,
      customer_name: detail.customer,
      target_date: detail.targetDate,
      shipping_date: detail.shippingDate,
      po_value: detail.poValue,
      possible_issue: "PO exists in monthly tab but has no column in Products tab — units per product unknown",
    })),
    format_mismatches: formatMismatches,
  };

  // Build debug PO column entries for sample (first 5) and last (last 5)
  const buildDebugPOCol = (poc: { colIdx: number; poNumber: string; inSumRange: boolean }): DebugPOCol => {
    const det = poDetailMap.get(poc.poNumber);
    const shipDate = det?.shippingDate ?? null;
    const st = (!poc.inSumRange || shipDate) ? "shipped" : "pending";
    return {
      col_letter: colIndexToLetters(poc.colIdx),
      col_index: poc.colIdx,
      po_number: poc.poNumber,
      in_sum_range: poc.inSumRange,
      has_shipping_date: !!shipDate,
      status: st,
    };
  };
  const samplePOCols = poColumns.slice(0, 5).map(buildDebugPOCol);
  const lastPOCols = poColumns.slice(-5).map(buildDebugPOCol);

  const result: DistributionData = {
    generatedAt: new Date().toISOString(),
    pos,
    product_summary: productSummary,
    demand_velocity: demandVelocity,
    summary: {
      total_pos: pos.length,
      pending_pos: pendingPOs.length,
      shipped_pos: shippedPOs.length,
      total_pending_units: totalPendingUnits,
      products_needing_production: productSummary.filter((p) => p.needed > 0).length,
      overdue_pos: overduePOs.length,
      unmatched_upcs: Array.from(unmatchedUpcs),
    },
    debug: {
      sum_col_index: sumColIdx >= 0 ? sumColIdx : null,
      sum_col_letter: dbgSumColLetter,
      sum_formula_cell: dbgFormulaCell,
      sum_formula_value: dbgFormulaValue,
      sum_formula_type: dbgFormulaType,
      sum_range_start: null,
      sum_range_end: null,
      active_col_letters: Array.from(activeColsSet).sort((a, b) => colLetterToIndex(a) - colLetterToIndex(b)),
      total_columns_scanned: poColumns.length,
      columns_in_sum_range: inSumRangeCount,
      columns_outside_sum_range: outsideSumRangeCount,
      pending_pos_before_ship_filter: pendingBeforeItemsFilter,
      pending_pos_after_ship_filter: pendingPOs.length,
      sample_po_columns: samplePOCols,
      last_po_columns: lastPOCols,
    },
    data_health: dataHealth,
  };

  return NextResponse.json(result);
}
