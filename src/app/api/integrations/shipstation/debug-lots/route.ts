import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const prisma = new PrismaClient();

function ssHeaders(): Record<string, string> {
  const key = process.env.SHIPSTATION_API_KEY;
  const secret = process.env.SHIPSTATION_API_SECRET;
  if (!key || !secret) throw new Error("ShipStation credentials not configured");
  const creds = Buffer.from(`${key}:${secret}`).toString("base64");
  return { Authorization: `Basic ${creds}`, "Content-Type": "application/json" };
}

async function ssProbe(
  path: string,
  headers: Record<string, string>
): Promise<{ status: number; ok: boolean; body: unknown }> {
  try {
    const res = await fetch(`https://ssapi.shipstation.com${path}`, { headers });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    return { status: 0, ok: false, body: String(err) };
  }
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Pull every unique key path from an object (for mapping fields without truncation)
function allKeys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [];
    return allKeys(obj[0], prefix + "[0]");
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${k}` : k;
    keys.push(full);
    if (v && typeof v === "object") keys.push(...allKeys(v, full));
  }
  return keys;
}

// Scan an object tree for any key matching a lot/batch pattern
function scanForLotFields(obj: unknown, path = ""): Array<{ path: string; value: unknown }> {
  if (!obj || typeof obj !== "object") return [];
  const results: Array<{ path: string; value: unknown }> = [];
  const LOT_PATTERN = /lot|batch|serial|inventory.*id|warehouse.*lot|lottable|expir/i;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => results.push(...scanForLotFields(item, `${path}[${i}]`)));
    return results;
  }

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${k}` : k;
    if (LOT_PATTERN.test(k)) {
      results.push({ path: fullPath, value: v });
    }
    if (v && typeof v === "object") {
      results.push(...scanForLotFields(v, fullPath));
    }
  }
  return results;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers = ssHeaders();
  const findings: Record<string, unknown> = {};

  // ── Look up a real SS productId from our cache ────────────────────────────
  let cachedProductSsId: string | null = null;
  try {
    const p = await prisma.shipstationProduct.findFirst({
      where: { isBundle: false, isActive: true },
      select: { shipstationProductId: true, name: true },
    });
    if (p) {
      cachedProductSsId = p.shipstationProductId;
      findings["_cachedProductUsedForInventoryProbe"] = { name: p.name, shipstationProductId: p.shipstationProductId };
    }
  } catch (e) {
    findings["_cachedProductLookupError"] = String(e);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INVESTIGATION 1 — /fulfillments
  // ══════════════════════════════════════════════════════════════════════════
  await delay(1500);
  const fulfillments = await ssProbe("/fulfillments?pageSize=5&page=1", headers);
  findings["inv1_fulfillments"] = {
    status: fulfillments.status,
    ok: fulfillments.ok,
    rawResponse: fulfillments.body,
    fieldPaths: fulfillments.ok ? allKeys(fulfillments.body) : [],
    lotFieldsFound: fulfillments.ok ? scanForLotFields(fulfillments.body) : [],
    itemFieldPaths: (() => {
      if (!fulfillments.ok) return [];
      const body = fulfillments.body as Record<string, unknown>;
      const items = (body?.fulfillments as Array<Record<string, unknown>>)?.[0]?.fulfillmentItems;
      return items ? allKeys(items) : ["no fulfillmentItems found on first record"];
    })(),
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INVESTIGATION 2 — /orders (shipped)
  // ══════════════════════════════════════════════════════════════════════════
  await delay(1500);
  const orders = await ssProbe("/orders?pageSize=5&page=1&orderStatus=shipped", headers);
  const firstOrder = (orders.body as Record<string, unknown> | null)?.orders
    ? ((orders.body as Record<string, unknown>).orders as unknown[])[0]
    : null;
  const firstOrderItems = (firstOrder as Record<string, unknown> | null)?.items ?? null;
  findings["inv2_orders"] = {
    status: orders.status,
    ok: orders.ok,
    firstOrderComplete: firstOrder,
    lineItemFieldPaths: firstOrderItems ? allKeys(firstOrderItems) : [],
    lineItemOptionsAllValues: (() => {
      if (!Array.isArray(firstOrderItems)) return [];
      return (firstOrderItems as Array<Record<string, unknown>>).flatMap((item) =>
        (item.options as Array<Record<string, unknown>> ?? []).map((o) => ({ itemName: item.name, option: o }))
      );
    })(),
    lotFieldsOnItems: firstOrderItems ? scanForLotFields(firstOrderItems) : [],
    lotFieldsOnOrder: firstOrder ? scanForLotFields(firstOrder) : [],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INVESTIGATION 3A — /warehouses
  // ══════════════════════════════════════════════════════════════════════════
  await delay(1500);
  const warehouses = await ssProbe("/warehouses", headers);
  findings["inv3a_warehouses"] = {
    status: warehouses.status,
    ok: warehouses.ok,
    rawResponse: warehouses.body,
    lotFieldsFound: warehouses.ok ? scanForLotFields(warehouses.body) : [],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INVESTIGATION 3B — /products/{id}/inventory  (if endpoint exists)
  // ══════════════════════════════════════════════════════════════════════════
  if (cachedProductSsId) {
    await delay(1500);
    const prodInventory = await ssProbe(`/products/${cachedProductSsId}/inventory`, headers);
    findings["inv3b_product_inventory"] = {
      endpoint: `/products/${cachedProductSsId}/inventory`,
      status: prodInventory.status,
      ok: prodInventory.ok,
      rawResponse: prodInventory.body,
      lotFieldsFound: prodInventory.ok ? scanForLotFields(prodInventory.body) : [],
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INVESTIGATION 3C — /inventory (direct)
  // ══════════════════════════════════════════════════════════════════════════
  await delay(1500);
  const inventory = await ssProbe("/inventory", headers);
  findings["inv3c_inventory"] = {
    status: inventory.status,
    ok: inventory.ok,
    rawResponse: inventory.body,
    lotFieldsFound: inventory.ok ? scanForLotFields(inventory.body) : [],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INVESTIGATION 4 — recent shipment items, full options arrays
  // ══════════════════════════════════════════════════════════════════════════
  await delay(1500);
  const recentShipments = await ssProbe(
    "/shipments?shipDateStart=2026-06-01&shipDateEnd=2026-07-09&pageSize=20&page=1&includeShipmentItems=true",
    headers
  );
  const shipmentsList = (recentShipments.body as Record<string, unknown>)?.shipments;
  findings["inv4_shipment_item_options"] = {
    status: recentShipments.status,
    ok: recentShipments.ok,
    allOptionsAcrossAllItems: (() => {
      if (!Array.isArray(shipmentsList)) return [];
      return (shipmentsList as Array<Record<string, unknown>>).flatMap((ship) => {
        const items = (ship.shipmentItems ?? []) as Array<Record<string, unknown>>;
        return items.flatMap((item) =>
          (item.options as Array<Record<string, unknown>> ?? []).map((opt) => ({
            shipmentId: ship.shipmentId,
            orderNumber: ship.orderNumber,
            itemName: item.name,
            option: opt,
          }))
        );
      });
    })(),
    allItemFieldPaths: (() => {
      if (!Array.isArray(shipmentsList)) return [];
      const firstShip = (shipmentsList as Array<Record<string, unknown>>)[0];
      const items = (firstShip?.shipmentItems ?? []) as Array<Record<string, unknown>>;
      return items.length ? allKeys(items) : [];
    })(),
    lotFieldsOnItems: Array.isArray(shipmentsList)
      ? scanForLotFields((shipmentsList as Array<Record<string, unknown>>).flatMap(
          (s) => (s.shipmentItems ?? []) as unknown[]
        ))
      : [],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INVESTIGATION 5 — v2/inventory, /inventory/list, /stock
  // ══════════════════════════════════════════════════════════════════════════
  await delay(1500);
  const v2inventory = await ssProbe("/v2/inventory", headers);
  findings["inv5a_v2_inventory"] = {
    status: v2inventory.status,
    ok: v2inventory.ok,
    rawResponse: v2inventory.body,
    lotFieldsFound: v2inventory.ok ? scanForLotFields(v2inventory.body) : [],
  };

  await delay(1500);
  const inventoryList = await ssProbe("/inventory/list", headers);
  findings["inv5b_inventory_list"] = {
    status: inventoryList.status,
    ok: inventoryList.ok,
    rawResponse: inventoryList.body,
    lotFieldsFound: inventoryList.ok ? scanForLotFields(inventoryList.body) : [],
  };

  await delay(1500);
  const stock = await ssProbe("/stock", headers);
  findings["inv5c_stock"] = {
    status: stock.status,
    ok: stock.ok,
    rawResponse: stock.body,
    lotFieldsFound: stock.ok ? scanForLotFields(stock.body) : [],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // COMPILE SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const summaryRows = [
    {
      endpoint: "/fulfillments",
      httpStatus: (findings["inv1_fulfillments"] as Record<string, unknown>).status,
      lotDataFound: ((findings["inv1_fulfillments"] as Record<string, unknown>).lotFieldsFound as unknown[]).length > 0,
      lotFields: (findings["inv1_fulfillments"] as Record<string, unknown>).lotFieldsFound,
    },
    {
      endpoint: "/orders items",
      httpStatus: (findings["inv2_orders"] as Record<string, unknown>).status,
      lotDataFound: ((findings["inv2_orders"] as Record<string, unknown>).lotFieldsOnItems as unknown[]).length > 0
        || ((findings["inv2_orders"] as Record<string, unknown>).lotFieldsOnOrder as unknown[]).length > 0,
      lotFields: [
        ...((findings["inv2_orders"] as Record<string, unknown>).lotFieldsOnItems as unknown[] ?? []),
        ...((findings["inv2_orders"] as Record<string, unknown>).lotFieldsOnOrder as unknown[] ?? []),
      ],
    },
    {
      endpoint: "/warehouses",
      httpStatus: (findings["inv3a_warehouses"] as Record<string, unknown>).status,
      lotDataFound: ((findings["inv3a_warehouses"] as Record<string, unknown>).lotFieldsFound as unknown[]).length > 0,
      lotFields: (findings["inv3a_warehouses"] as Record<string, unknown>).lotFieldsFound,
    },
    {
      endpoint: `/products/${cachedProductSsId}/inventory`,
      httpStatus: findings["inv3b_product_inventory"]
        ? (findings["inv3b_product_inventory"] as Record<string, unknown>).status
        : "skipped",
      lotDataFound: findings["inv3b_product_inventory"]
        ? ((findings["inv3b_product_inventory"] as Record<string, unknown>).lotFieldsFound as unknown[]).length > 0
        : false,
      lotFields: findings["inv3b_product_inventory"]
        ? (findings["inv3b_product_inventory"] as Record<string, unknown>).lotFieldsFound
        : [],
    },
    {
      endpoint: "/inventory",
      httpStatus: (findings["inv3c_inventory"] as Record<string, unknown>).status,
      lotDataFound: ((findings["inv3c_inventory"] as Record<string, unknown>).lotFieldsFound as unknown[]).length > 0,
      lotFields: (findings["inv3c_inventory"] as Record<string, unknown>).lotFieldsFound,
    },
    {
      endpoint: "shipment item.options",
      httpStatus: (findings["inv4_shipment_item_options"] as Record<string, unknown>).status,
      lotDataFound:
        ((findings["inv4_shipment_item_options"] as Record<string, unknown>).lotFieldsOnItems as unknown[]).length > 0,
      lotFields: (findings["inv4_shipment_item_options"] as Record<string, unknown>).lotFieldsOnItems,
    },
    {
      endpoint: "/v2/inventory",
      httpStatus: (findings["inv5a_v2_inventory"] as Record<string, unknown>).status,
      lotDataFound: ((findings["inv5a_v2_inventory"] as Record<string, unknown>).lotFieldsFound as unknown[]).length > 0,
      lotFields: (findings["inv5a_v2_inventory"] as Record<string, unknown>).lotFieldsFound,
    },
    {
      endpoint: "/inventory/list",
      httpStatus: (findings["inv5b_inventory_list"] as Record<string, unknown>).status,
      lotDataFound: ((findings["inv5b_inventory_list"] as Record<string, unknown>).lotFieldsFound as unknown[]).length > 0,
      lotFields: (findings["inv5b_inventory_list"] as Record<string, unknown>).lotFieldsFound,
    },
    {
      endpoint: "/stock",
      httpStatus: (findings["inv5c_stock"] as Record<string, unknown>).status,
      lotDataFound: ((findings["inv5c_stock"] as Record<string, unknown>).lotFieldsFound as unknown[]).length > 0,
      lotFields: (findings["inv5c_stock"] as Record<string, unknown>).lotFieldsFound,
    },
  ];

  const anyLotDataFound = summaryRows.some((r) => r.lotDataFound);
  const lotSources = summaryRows.filter((r) => r.lotDataFound);

  return NextResponse.json({
    title: "LOT ID INVESTIGATION RESULTS",
    summary: {
      conclusion: anyLotDataFound
        ? "Lot data WAS found — see lotSources for details"
        : "Lot IDs ARE NOT accessible via ShipStation API. ShipStation does not expose lot/batch numbers via their REST API. Lot tracking appears to be UI-only or requires a different integration method (webhook, FTP export, etc.)",
      lotDataFoundAnywhere: anyLotDataFound,
      lotSources,
      table: summaryRows.map((r) => ({
        endpoint: r.endpoint,
        httpStatus: r.httpStatus,
        lotDataFound: r.lotDataFound ? "YES" : "no",
        lotFieldsCount: (r.lotFields as unknown[]).length,
      })),
    },
    rawFindings: findings,
  });
}
