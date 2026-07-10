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

function parseSumFormula(formula: string): { startIdx: number; endIdx: number } | null {
  // Matches =SUM(D4:IX4) or =SUM('Products'!D4:IX4)
  const m = formula.match(/SUM\([^:!]*!?([A-Z]+)\d+:([A-Z]+)\d+/i);
  if (!m) return null;
  return {
    startIdx: colLetterToIndex(m[1]),
    endIdx: colLetterToIndex(m[2]),
  };
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

  // ── 2. Fetch Products tab + formulas + monthly tabs in parallel ──────────────
  const [productsRows, productsFormulas, ...monthlyRowsArr] = await Promise.all([
    fetchSheetRange("'Products'!A1:ZZ1000", key),
    fetchSheetFormulas("'Products'!A1:ZZ4", key),
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

  // Parse SUM formula from the first product row (row 4, index 3) to determine active range
  // PO columns inside the formula range → open/pending; outside → shipped/closed
  let sumRange: { startIdx: number; endIdx: number } | null = null;
  if (sumColIdx >= 0) {
    const formulaRow = productsFormulas[3] ?? [];
    const formulaCell = String(formulaRow[sumColIdx] ?? "");
    sumRange = parseSumFormula(formulaCell);
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
    // If formula couldn't be parsed, default to treating all columns as active
    const inSumRange = sumRange ? (i >= sumRange.startIdx && i <= sumRange.endIdx) : true;
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

  const pos: DistributionPO[] = [];

  for (const poc of poColumns) {
    const detail = poDetailMap.get(poc.poNumber);
    const targetDate = detail?.targetDate ?? poc.targetDate ?? null;
    const shippingDate = detail?.shippingDate ?? null;
    // A PO is open only if it's within the SUM formula range AND has no shipping date
    const status: DistributionPO["status"] = (!poc.inSumRange || shippingDate) ? "shipped" : "pending";

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

  const velocityByUpc = new Map<string, { units90: number; units30: number; poCount: number }>();
  for (const po of pos) {
    if (po.status !== "shipped" || !po.shipping_date) continue;
    const is90 = po.shipping_date >= iso90;
    const is30 = po.shipping_date >= iso30;
    for (const item of po.items) {
      const v = velocityByUpc.get(item.upc) ?? { units90: 0, units30: 0, poCount: 0 };
      if (is90) {
        v.units90 += item.units;
        v.poCount += 1;
      }
      if (is30) v.units30 += item.units;
      velocityByUpc.set(item.upc, v);
    }
  }

  const demandVelocity: DemandVelocity[] = [];
  for (const [upc, v] of Array.from(velocityByUpc.entries())) {
    const match = matchUpc(upc);
    if (!match) continue;
    demandVelocity.push({
      upc,
      fsms_presentation_id: match.fsms_presentation_id,
      fsms_presentation_name: match.fsms_presentation_name,
      units_last_30_days: v.units30,
      units_last_90_days: v.units90,
      weekly_avg: Math.round((v.units90 / 13) * 10) / 10,
      completed_pos_count: v.poCount,
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
  };

  return NextResponse.json(result);
}
