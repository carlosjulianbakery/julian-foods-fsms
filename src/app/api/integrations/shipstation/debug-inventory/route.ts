import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SS_BASE = "https://ssapi.shipstation.com";
const PRODUCT_ID = 52375205; // Pure Monk Sweetener Single
const DELAY_MS = 1500;

const MATCH_PATTERN = /adjust|remov|movement|transfer|lot|batch|distribution|manual/i;

interface ProbeResult {
  label: string;
  investigation: string;
  endpoint: string;
  httpStatus: number | null;
  durationMs: number;
  dataFound: boolean;
  matchedFields: string[];
  notes: string;
  raw: unknown;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scanForMatches(obj: unknown, path = ""): string[] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj === "string") {
    return MATCH_PATTERN.test(obj) ? [`${path}="${obj}"`] : [];
  }
  if (typeof obj === "number" || typeof obj === "boolean") return [];
  if (Array.isArray(obj)) {
    const hits: string[] = [];
    obj.slice(0, 5).forEach((item, i) => hits.push(...scanForMatches(item, `${path}[${i}]`)));
    return hits;
  }
  if (typeof obj === "object") {
    const hits: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (MATCH_PATTERN.test(k)) hits.push(`${path}.${k}`);
      hits.push(...scanForMatches(v, `${path}.${k}`));
    }
    return hits;
  }
  return [];
}

async function probe(
  label: string,
  investigation: string,
  url: string,
  headers: Record<string, string>
): Promise<ProbeResult> {
  const start = Date.now();
  let httpStatus: number | null = null;
  let raw: unknown = null;
  let notes = "";
  let dataFound = false;
  let matchedFields: string[] = [];

  try {
    const res = await fetch(url, { headers });
    httpStatus = res.status;
    const text = await res.text();

    if (res.status === 200) {
      try {
        raw = JSON.parse(text);
        matchedFields = Array.from(new Set(scanForMatches(raw)));
        dataFound = matchedFields.length > 0;
        if (!dataFound) {
          const parsed = raw as Record<string, unknown>;
          const keys = Object.keys(parsed);
          dataFound = keys.length > 0 && !(keys.length === 1 && keys[0] === "total" && parsed.total === 0);
          notes = dataFound ? `200 OK — ${keys.length} top-level keys` : "200 OK but empty/zero result";
        } else {
          notes = `200 OK — matched fields: ${matchedFields.slice(0, 5).join(", ")}`;
        }
      } catch {
        raw = text.slice(0, 2000);
        notes = "200 OK — non-JSON response";
      }
    } else if (res.status === 404) {
      raw = text.slice(0, 500);
      notes = "404 — endpoint does not exist";
    } else if (res.status === 401) {
      raw = text.slice(0, 500);
      notes = "401 — endpoint exists but auth required (possibly separate credential set)";
      dataFound = false;
    } else if (res.status === 400) {
      raw = text.slice(0, 500);
      notes = `400 — bad request: ${text.slice(0, 200)}`;
    } else if (res.status === 405) {
      raw = text.slice(0, 500);
      notes = "405 — method not allowed (endpoint exists, GET not supported)";
    } else {
      raw = text.slice(0, 500);
      notes = `HTTP ${res.status}`;
    }
  } catch (err: unknown) {
    notes = `Network error: ${err instanceof Error ? err.message : String(err)}`;
    raw = notes;
  }

  return {
    label,
    investigation,
    endpoint: url,
    httpStatus,
    durationMs: Date.now() - start,
    dataFound,
    matchedFields,
    notes,
    raw,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.SHIPSTATION_API_KEY;
  const apiSecret = process.env.SHIPSTATION_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "ShipStation credentials not configured" }, { status: 400 });
  }

  const creds = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const headers = {
    Authorization: `Basic ${creds}`,
    "Content-Type": "application/json",
  };

  const results: ProbeResult[] = [];

  // ── Step 0: fetch /warehouses to get warehouseId ──────────────────────────
  let warehouseId: number | null = null;
  {
    const r = await probe("warehouses-list", "0-setup", `${SS_BASE}/warehouses`, headers);
    results.push(r);
    if (r.httpStatus === 200 && Array.isArray((r.raw as { warehouses?: unknown[] })?.warehouses)) {
      const wList = (r.raw as { warehouses: Array<{ warehouseId: number }> }).warehouses;
      if (wList.length > 0) warehouseId = wList[0].warehouseId;
    }
    await sleep(DELAY_MS);
  }

  // ── Investigation 1 — Known endpoints ─────────────────────────────────────
  const inv1: Array<[string, string]> = [
    ["1A-product-stockhistory", `${SS_BASE}/products/${PRODUCT_ID}/stockhistory`],
    ["1B-product-movements",    `${SS_BASE}/products/${PRODUCT_ID}/movements`],
    ["1C-product-adjustments",  `${SS_BASE}/products/${PRODUCT_ID}/adjustments`],
    ["1D-inventory-adjustments", `${SS_BASE}/inventory/adjustments`],
    ["1E-inventory-movements",   `${SS_BASE}/inventory/movements`],
    ["1F-stock-adjustments",     `${SS_BASE}/stock/adjustments`],
  ];

  if (warehouseId !== null) {
    inv1.push(["1G-warehouse-inventory",     `${SS_BASE}/warehouses/${warehouseId}/inventory`]);
    inv1.push(["1H-warehouse-stockmovements",`${SS_BASE}/warehouses/${warehouseId}/stockmovements`]);
  } else {
    results.push({
      label: "1G-warehouse-inventory",
      investigation: "1",
      endpoint: `${SS_BASE}/warehouses/{warehouseId}/inventory`,
      httpStatus: null,
      durationMs: 0,
      dataFound: false,
      matchedFields: [],
      notes: "Skipped — could not determine warehouseId from /warehouses",
      raw: null,
    });
    results.push({
      label: "1H-warehouse-stockmovements",
      investigation: "1",
      endpoint: `${SS_BASE}/warehouses/{warehouseId}/stockmovements`,
      httpStatus: null,
      durationMs: 0,
      dataFound: false,
      matchedFields: [],
      notes: "Skipped — could not determine warehouseId from /warehouses",
      raw: null,
    });
  }

  for (const [label, url] of inv1) {
    results.push(await probe(label, "1", url, headers));
    await sleep(DELAY_MS);
  }

  // ── Investigation 2 — Warehouse sub-endpoints ──────────────────────────────
  const inv2Paths: Array<[string, string]> = warehouseId !== null
    ? [
        ["2A-warehouse-inventory", `${SS_BASE}/warehouses/${warehouseId}/inventory`],
        ["2B-warehouse-locations", `${SS_BASE}/warehouses/${warehouseId}/locations`],
        ["2C-warehouse-lots",      `${SS_BASE}/warehouses/${warehouseId}/lots`],
      ]
    : [];

  if (inv2Paths.length === 0) {
    results.push({
      label: "2-warehouse-sub-endpoints",
      investigation: "2",
      endpoint: "N/A",
      httpStatus: null,
      durationMs: 0,
      dataFound: false,
      matchedFields: [],
      notes: "Skipped — warehouseId not available",
      raw: null,
    });
  } else {
    for (const [label, url] of inv2Paths) {
      results.push(await probe(label, "2", url, headers));
      await sleep(DELAY_MS);
    }
  }

  // ── Investigation 3 — v2 API ───────────────────────────────────────────────
  const inv3: Array<[string, string]> = [
    ["3A-v2-product-inventory",       `${SS_BASE}/v2/products/${PRODUCT_ID}/inventory`],
    ["3B-v2-inventory-adjustments",   `${SS_BASE}/v2/inventory/adjustments`],
    ["3C-v2-inventory-history",       `${SS_BASE}/v2/inventory/history`],
  ];

  if (warehouseId !== null) {
    inv3.splice(2, 0, ["3C-v2-warehouse-inventory", `${SS_BASE}/v2/warehouses/${warehouseId}/inventory`]);
  }

  for (const [label, url] of inv3) {
    results.push(await probe(label, "3", url, headers));
    await sleep(DELAY_MS);
  }

  // ── Investigation 4 — Partner API ─────────────────────────────────────────
  const inv4: Array<[string, string]> = [
    ["4A-partner-inventory",    "https://partner.shipstation.com/inventory"],
    ["4B-partnerapi-inventory", "https://partnerapi.shipstation.com/v1/inventory"],
  ];

  for (const [label, url] of inv4) {
    results.push(await probe(label, "4", url, headers));
    await sleep(DELAY_MS);
  }

  // ── Investigation 5 — Orders with special types ────────────────────────────
  const orderStatuses = ["on_hold", "cancelled", "awaiting_shipment"];
  const orderResults: Record<string, unknown[]> = {};

  for (const status of orderStatuses) {
    const url = `${SS_BASE}/orders?pageSize=50&page=1&orderStatus=${status}`;
    const r = await probe(`5-orders-${status}`, "5", url, headers);
    results.push(r);

    if (r.httpStatus === 200) {
      const data = r.raw as { orders?: unknown[] };
      const orders = data?.orders ?? [];
      // Look for manual/adjustment/distribution signals
      const interesting = (orders as Array<Record<string, unknown>>).filter((o) => {
        const json = JSON.stringify(o).toLowerCase();
        return (
          MATCH_PATTERN.test(json) ||
          !o.shipTo ||
          (o.shipTo as Record<string, unknown>)?.name === null ||
          (o.orderTotal === 0 && (o.orderType as string | undefined) !== undefined)
        );
      });
      if (interesting.length > 0) orderResults[status] = interesting;
    }

    await sleep(DELAY_MS);
  }

  // ── Compile summary ────────────────────────────────────────────────────────
  const table = results.map((r) => ({
    label: r.label,
    investigation: r.investigation,
    endpoint: r.endpoint,
    httpStatus: r.httpStatus ?? "error",
    dataFound: r.dataFound ? "yes" : "no",
    matchedFields: r.matchedFields.slice(0, 8),
    notes: r.notes,
  }));

  const foundResults = results.filter((r) => r.dataFound);
  const adjustmentDataFound = foundResults.length > 0;

  let conclusion: string;
  if (!adjustmentDataFound) {
    conclusion =
      "No inventory adjustment or stock movement data found in any probed endpoint. " +
      "ShipStation's REST API does not appear to expose direct inventory adjustment/removal records.";
  } else {
    const found = foundResults.map((r) => `${r.label} (${r.endpoint})`).join("; ");
    conclusion = `Potential inventory adjustment data found in: ${found}. Review rawFindings for details.`;
  }

  const rawFindings: Record<string, unknown> = {};
  for (const r of results) {
    rawFindings[r.label] = {
      endpoint: r.endpoint,
      httpStatus: r.httpStatus,
      durationMs: r.durationMs,
      matchedFields: r.matchedFields,
      raw: r.raw,
    };
  }

  if (Object.keys(orderResults).length > 0) {
    rawFindings["5-interesting-orders"] = orderResults;
  }

  return NextResponse.json({
    title: "INVENTORY ADJUSTMENT INVESTIGATION",
    warehouseId,
    productIdTested: PRODUCT_ID,
    summary: {
      conclusion,
      adjustmentDataFound,
      table,
      dataSources: foundResults.map((r) => ({
        label: r.label,
        endpoint: r.endpoint,
        httpStatus: r.httpStatus,
        matchedFields: r.matchedFields,
        notes: r.notes,
      })),
    },
    rawFindings,
  });
}
