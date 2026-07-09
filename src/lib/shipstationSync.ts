import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

function parseSafeDate(value: string | null | undefined, fallback?: Date): Date | null {
  if (!value) return fallback ?? null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return fallback ?? null;
  return d;
}

const SS_BASE = "https://ssapi.shipstation.com";
const RATE_LIMIT_MS = 1500;

const FINISHED_STATUSES = ["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"] as const;

const STORE_NAMES: Record<number, string> = {
  826519: "Amazon",
  490544: "Manual Orders",
  826624: "Shopify",
  825549: "Walmart",
};

interface SSProduct {
  productId: number;
  sku: string | null;
  name: string;
  upc: string | null;
  active: boolean;
  // ShipStation uses "aliases" for bundle/kit components, not "bundleItems"
  aliases?: Array<{ productId: number; quantity: number; sku: string | null }> | null;
}

interface SSShipmentItem {
  productId: number | null;
  sku: string | null;
  name: string;
  upc: string | null;
  quantity: number;
  adjustment: boolean;
}

interface SSShipment {
  shipmentId: number;
  orderId: number;
  orderNumber: string;
  orderDate: string;
  shipDate: string;
  voided: boolean;
  voidDate: string | null;
  shipTo: { name: string | null; company: string | null; email: string | null };
  advancedOptions: { storeId: number | null };
  // ShipStation API field is "shipmentItems", not "items"
  shipmentItems: SSShipmentItem[] | null;
}

interface PresentationInfo {
  productId: string;
  productName: string;
  presentationName: string;
  upc: string;
  primaryUnitName: string;
}

export interface SyncResult {
  syncLogId: string;
  shipmentsFetched: number;
  shipmentsNew: number;
  shipmentsVoided: number;
  itemsProcessed: number;
  itemsMatched: number;
  itemsUnmatched: number;
  status: "success" | "error";
  errorMessage?: string;
  durationMs: number;
}

function ssHeaders(): Record<string, string> {
  const key = process.env.SHIPSTATION_API_KEY;
  const secret = process.env.SHIPSTATION_API_SECRET;
  if (!key || !secret) throw new Error("ShipStation credentials not configured");
  const creds = Buffer.from(`${key}:${secret}`).toString("base64");
  return { Authorization: `Basic ${creds}`, "Content-Type": "application/json" };
}

async function ssGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SS_BASE}${path}`, { headers: ssHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ShipStation API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchAllProducts(): Promise<SSProduct[]> {
  const all: SSProduct[] = [];
  let page = 1;
  while (true) {
    const data = await ssGet<{ products: SSProduct[]; pages: number }>(`/products?page=${page}&pageSize=500&showBundleComponents=true`);
    all.push(...(data.products ?? []));
    if (page >= (data.pages ?? 1)) break;
    page++;
    await delay(RATE_LIMIT_MS);
  }
  return all;
}

async function fetchShipments(from: Date, to: Date): Promise<SSShipment[]> {
  const all: SSShipment[] = [];
  const fromStr = from.toISOString().split("T")[0];
  const toStr = to.toISOString().split("T")[0];
  let page = 1;
  while (true) {
    const data = await ssGet<{ shipments: SSShipment[]; pages: number }>(
      `/shipments?shipDateStart=${fromStr}&shipDateEnd=${toStr}&page=${page}&pageSize=500`
    );
    all.push(...(data.shipments ?? []));
    if (page >= (data.pages ?? 1)) break;
    page++;
    await delay(RATE_LIMIT_MS);
  }
  return all;
}

function buildPresentationMap(products: Array<{ id: string; name: string; presentations: unknown }>) {
  const presentationMap = new Map<string, PresentationInfo>();
  const upcToPresId = new Map<string, string>();
  for (const product of products) {
    const pres = (product.presentations as Array<{ id: string; name: string; upc?: string; primary_unit_name?: string }>) ?? [];
    for (const p of pres) {
      if (!p.upc) continue;
      presentationMap.set(p.id, {
        productId: product.id,
        productName: product.name,
        presentationName: p.name,
        upc: p.upc,
        primaryUnitName: p.primary_unit_name ?? "unit",
      });
      upcToPresId.set(p.upc, p.id);
    }
  }
  return { presentationMap, upcToPresId };
}

async function syncProducts(
  ssProducts: SSProduct[],
  upcToPresId: Map<string, string>,
  presentationMap: Map<string, PresentationInfo>
) {
  const ssProductIdToDb = new Map<number, string>();

  for (const sp of ssProducts) {
    const presId = sp.upc ? upcToPresId.get(sp.upc) : undefined;
    const presInfo = presId ? presentationMap.get(presId) : undefined;
    const isBundle = Array.isArray(sp.aliases) && sp.aliases.length > 0;

    const existing = await prisma.shipstationProduct.findUnique({
      where: { shipstationProductId: String(sp.productId) },
      select: { id: true },
    });

    let dbId: string;
    if (existing) {
      await prisma.shipstationProduct.update({
        where: { shipstationProductId: String(sp.productId) },
        data: {
          name: sp.name,
          sku: sp.sku ?? null,
          upc: sp.upc ?? null,
          isBundle,
          isActive: sp.active,
          fsmsPresentationId: presId ?? null,
          fsmsProductId: presInfo?.productId ?? null,
          lastSyncedAt: new Date(),
        },
      });
      dbId = existing.id;
    } else {
      const created = await prisma.shipstationProduct.create({
        data: {
          shipstationProductId: String(sp.productId),
          name: sp.name,
          sku: sp.sku ?? null,
          upc: sp.upc ?? null,
          isBundle,
          isActive: sp.active,
          fsmsPresentationId: presId ?? null,
          fsmsProductId: presInfo?.productId ?? null,
          lastSyncedAt: new Date(),
        },
      });
      dbId = created.id;
    }
    ssProductIdToDb.set(sp.productId, dbId);
  }

  // Sync bundle components
  for (const sp of ssProducts) {
    if (!Array.isArray(sp.aliases) || sp.aliases.length === 0) continue;
    const bundleDbId = ssProductIdToDb.get(sp.productId);
    if (!bundleDbId) continue;

    await prisma.shipstationBundleComponent.deleteMany({ where: { bundleProductId: bundleDbId } });

    for (const comp of sp.aliases) {
      const compDbId = ssProductIdToDb.get(comp.productId);
      if (!compDbId) continue;
      const compRecord = await prisma.shipstationProduct.findUnique({
        where: { id: compDbId },
        select: { fsmsPresentationId: true, fsmsProductId: true },
      });
      await prisma.shipstationBundleComponent.create({
        data: {
          bundleProductId: bundleDbId,
          componentProductId: compDbId,
          quantityPerBundle: comp.quantity,
          fsmsPresentationId: compRecord?.fsmsPresentationId ?? null,
          fsmsProductId: compRecord?.fsmsProductId ?? null,
        },
      });
    }
  }

  return ssProductIdToDb;
}

async function syncShipment(
  ss: SSShipment,
  ssProductIdToDb: Map<number, string>,
  upcToPresId: Map<string, string>,
  presentationMap: Map<string, PresentationInfo>,
  syncRunId: string
): Promise<{ isNew: boolean; itemsProcessed: number; itemsMatched: number }> {
  const shipmentIdStr = String(ss.shipmentId);

  // Check if already exists
  const existing = await prisma.shipstationShipment.findUnique({
    where: { shipstationShipmentId: shipmentIdStr },
    select: { id: true, voided: true },
  });

  if (existing) {
    // Handle newly voided shipments
    if (ss.voided && !existing.voided) {
      await prisma.shipstationShipment.update({
        where: { id: existing.id },
        data: { voided: true, voidDate: parseSafeDate(ss.voidDate) ?? new Date() },
      });
    }
    return { isNew: false, itemsProcessed: 0, itemsMatched: 0 };
  }

  // Determine store name
  const storeId = ss.advancedOptions?.storeId ?? 0;
  const storeName = STORE_NAMES[storeId] ?? `Store ${storeId}`;

  const shipment = await prisma.shipstationShipment.create({
    data: {
      shipstationShipmentId: shipmentIdStr,
      shipstationOrderId: String(ss.orderId),
      shipstationOrderNumber: ss.orderNumber,
      storeId,
      storeName,
      customerName: ss.shipTo?.name ?? ss.shipTo?.company ?? null,
      customerEmail: ss.shipTo?.email ?? null,
      orderDate: (() => {
        const safeShipDate = parseSafeDate(ss.shipDate, new Date());
        const d = parseSafeDate(ss.orderDate, safeShipDate ?? new Date());
        if (!d || isNaN(d.getTime())) {
          console.warn(`Shipment ${ss.shipmentId}: orderDate was invalid, used fallback. Original value: ${ss.orderDate}`);
          return safeShipDate ?? new Date();
        }
        return d;
      })(),
      shipDate: parseSafeDate(ss.shipDate, new Date()) ?? new Date(),
      voided: ss.voided,
      voidDate: parseSafeDate(ss.voidDate),
      syncRunId,
    },
  });

  // Expand and insert items
  const itemsToInsert: Array<{
    productName: string;
    shipstationProductId: string | null;
    upc: string | null;
    quantityShipped: number;
    isBundleComponent: boolean;
    bundleProductName: string | null;
    fsmsPresentationId: string | null;
    fsmsProductId: string | null;
    fsmsBatchSheetId: string | null;
    fsmsMatchStatus: string;
  }> = [];

  const items = Array.isArray(ss.shipmentItems) ? ss.shipmentItems : [];
  if (items.length === 0) {
    console.warn(`Shipment ${ss.shipmentId} has no items — shipment recorded but no inventory deduction applied`);
  }

  for (const item of items) {
    if (item.adjustment) continue; // skip adjustment lines

    const dbProductId = item.productId ? ssProductIdToDb.get(item.productId) : undefined;
    const dbProduct = dbProductId
      ? await prisma.shipstationProduct.findUnique({
          where: { id: dbProductId },
          select: { isBundle: true, fsmsPresentationId: true, fsmsProductId: true },
        })
      : null;

    if (dbProduct?.isBundle && dbProductId) {
      // Expand bundle into components
      const components = await prisma.shipstationBundleComponent.findMany({
        where: { bundleProductId: dbProductId },
      });

      if (components.length > 0) {
        for (const comp of components) {
          const presInfo = comp.fsmsPresentationId
            ? presentationMap.get(comp.fsmsPresentationId)
            : undefined;
          itemsToInsert.push({
            shipstationProductId: comp.componentProductId,
            productName: presInfo?.presentationName ?? `Component of ${item.name}`,
            upc: presInfo?.upc ?? null,
            quantityShipped: item.quantity * comp.quantityPerBundle,
            isBundleComponent: true,
            bundleProductName: item.name,
            fsmsPresentationId: comp.fsmsPresentationId ?? null,
            fsmsProductId: comp.fsmsProductId ?? null,
            fsmsBatchSheetId: null,
            fsmsMatchStatus: comp.fsmsPresentationId ? "MATCHED" : "UNMATCHED",
          });
        }
        continue;
      }
    }

    // Non-bundle or bundle without stored components — match by UPC
    const upc = item.upc ?? null;
    const presId = upc ? upcToPresId.get(upc) : undefined;
    const presInfo = presId ? presentationMap.get(presId) : undefined;

    itemsToInsert.push({
      shipstationProductId: dbProductId ?? null,
      productName: item.name,
      upc,
      quantityShipped: item.quantity,
      isBundleComponent: false,
      bundleProductName: null,
      fsmsPresentationId: presId ?? null,
      fsmsProductId: presInfo?.productId ?? null,
      fsmsBatchSheetId: null,
      fsmsMatchStatus: presId ? "MATCHED" : "UNMATCHED",
    });
  }

  let matched = 0;
  for (const item of itemsToInsert) {
    await prisma.shipstationShipmentItem.create({
      data: { shipmentId: shipment.id, ...item },
    });
    if (item.fsmsMatchStatus === "MATCHED") matched++;
  }

  return { isNew: true, itemsProcessed: itemsToInsert.length, itemsMatched: matched };
}

async function recalculateFinishedGoods(
  presentationMap: Map<string, PresentationInfo>
) {
  // 1. Sum total produced per presentation from all completed batch sheets
  const submissions = await prisma.batchSheetSubmission.findMany({
    where: { status: { in: [...FINISHED_STATUSES] } },
    select: { productionDate: true, section5: true },
  });

  const producedByPres = new Map<string, { total: number; lastDate: Date }>();
  for (const sub of submissions) {
    const s5 = sub.section5 as { presentation_units?: Array<{ was_produced?: boolean; total_produced?: number; presentation_id: string }> } | null;
    if (!s5?.presentation_units) continue;
    for (const pu of s5.presentation_units) {
      if (!pu.was_produced || !pu.total_produced) continue;
      const cur = producedByPres.get(pu.presentation_id) ?? { total: 0, lastDate: new Date(0) };
      cur.total += pu.total_produced;
      const d = new Date(sub.productionDate);
      if (d > cur.lastDate) cur.lastDate = d;
      producedByPres.set(pu.presentation_id, cur);
    }
  }

  // 2. Sum total shipped per presentation from non-voided shipments
  interface ShippedRow { fsmsPresentationId: string; totalShipped: bigint; lastShipDate: Date }
  const shippedRows = await prisma.$queryRaw<ShippedRow[]>`
    SELECT ssi."fsmsPresentationId", SUM(ssi."quantityShipped")::bigint AS "totalShipped",
           MAX(ss."shipDate") AS "lastShipDate"
    FROM shipstation_shipment_items ssi
    JOIN shipstation_shipments ss ON ss.id = ssi."shipmentId"
    WHERE ss.voided = false AND ssi."fsmsPresentationId" IS NOT NULL
    GROUP BY ssi."fsmsPresentationId"
  `;

  const shippedByPres = new Map<string, { total: number; lastDate: Date }>();
  for (const row of shippedRows) {
    shippedByPres.set(row.fsmsPresentationId, {
      total: Number(row.totalShipped),
      lastDate: row.lastShipDate,
    });
  }

  // 3. Upsert FinishedGoodsInventory for all known presentations
  const allPresIds = Array.from(new Set([...Array.from(producedByPres.keys()), ...Array.from(shippedByPres.keys())]));
  for (const presId of allPresIds) {
    const info = presentationMap.get(presId);
    if (!info) continue;

    const produced = producedByPres.get(presId) ?? { total: 0, lastDate: null as unknown as Date };
    const shipped = shippedByPres.get(presId) ?? { total: 0, lastDate: null as unknown as Date };
    const onHand = Math.max(0, produced.total - shipped.total);

    await prisma.finishedGoodsInventory.upsert({
      where: { fsmsPresentationId: presId },
      create: {
        fsmsPresentationId: presId,
        fsmsProductId: info.productId,
        presentationName: info.presentationName,
        productName: info.productName,
        upc: info.upc,
        unit: info.primaryUnitName,
        totalProduced: produced.total,
        totalShipped: shipped.total,
        onHand,
        lastBatchSheetDate: produced.lastDate instanceof Date && produced.lastDate.getTime() > 0 ? produced.lastDate : null,
        lastShipmentDate: shipped.lastDate instanceof Date && shipped.lastDate.getTime() > 0 ? shipped.lastDate : null,
        lastUpdated: new Date(),
      },
      update: {
        totalProduced: produced.total,
        totalShipped: shipped.total,
        onHand,
        lastBatchSheetDate: produced.lastDate instanceof Date && produced.lastDate.getTime() > 0 ? produced.lastDate : null,
        lastShipmentDate: shipped.lastDate instanceof Date && shipped.lastDate.getTime() > 0 ? shipped.lastDate : null,
        lastUpdated: new Date(),
      },
    });
  }
}

export async function runShipstationSync(options: { daysBack?: number } = {}): Promise<SyncResult> {
  const startedAt = new Date();
  const daysBack = options.daysBack ?? 90;
  const dateFrom = new Date(startedAt.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const dateTo = startedAt;

  const syncLog = await prisma.shipstationSyncLog.create({
    data: {
      startedAt,
      status: "running",
      dateRangeFrom: dateFrom,
      dateRangeTo: dateTo,
    },
  });

  const stats = {
    shipmentsFetched: 0,
    shipmentsNew: 0,
    shipmentsVoided: 0,
    itemsProcessed: 0,
    itemsMatched: 0,
    itemsUnmatched: 0,
  };

  try {
    // Build FSMS presentation map
    const fsmsProducts = await prisma.product.findMany({
      select: { id: true, name: true, presentations: true },
    });
    const { presentationMap, upcToPresId } = buildPresentationMap(fsmsProducts);

    // Sync products from ShipStation
    const ssProducts = await fetchAllProducts();
    const ssProductIdToDb = await syncProducts(ssProducts, upcToPresId, presentationMap);

    // Sync shipments
    const ssShipments = await fetchShipments(dateFrom, dateTo);
    stats.shipmentsFetched = ssShipments.length;

    for (const ss of ssShipments) {
      if (ss.voided) {
        const ex = await prisma.shipstationShipment.findUnique({
          where: { shipstationShipmentId: String(ss.shipmentId) },
          select: { id: true, voided: true },
        });
        if (ex && !ex.voided) {
          await prisma.shipstationShipment.update({
            where: { id: ex.id },
            data: { voided: true, voidDate: parseSafeDate(ss.voidDate) ?? new Date() },
          });
          stats.shipmentsVoided++;
          continue;
        }
        if (ex?.voided) continue; // already voided
      }

      const result = await syncShipment(
        ss,
        ssProductIdToDb,
        upcToPresId,
        presentationMap,
        syncLog.id
      );

      if (result.isNew) {
        stats.shipmentsNew++;
        stats.itemsProcessed += result.itemsProcessed;
        stats.itemsMatched += result.itemsMatched;
        stats.itemsUnmatched += result.itemsProcessed - result.itemsMatched;
      }
    }

    // Recalculate finished goods inventory
    await recalculateFinishedGoods(presentationMap);

    const durationMs = Date.now() - startedAt.getTime();
    await prisma.shipstationSyncLog.update({
      where: { id: syncLog.id },
      data: {
        completedAt: new Date(),
        status: "success",
        ...stats,
        notes: `Sync completed in ${Math.round(durationMs / 1000)}s`,
      },
    });

    return { syncLogId: syncLog.id, ...stats, status: "success", durationMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.shipstationSyncLog.update({
      where: { id: syncLog.id },
      data: { completedAt: new Date(), status: "error", errorMessage: msg },
    });
    const durationMs = Date.now() - startedAt.getTime();
    return { syncLogId: syncLog.id, ...stats, status: "error", errorMessage: msg, durationMs };
  }
}
