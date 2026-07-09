import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient, BatchSheetStatus } from "@/generated/prisma";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FINISHED_STATUSES: BatchSheetStatus[] = ["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"];

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 1. Build FSMS presentation map ───────────────────────────────────────
  const fsmsProducts = await prisma.product.findMany({ select: { id: true, name: true, presentations: true } });
  const presentationMap = new Map<string, { productId: string; productName: string; presentationName: string; upc: string; unit: string }>();
  for (const p of fsmsProducts) {
    for (const pr of (p.presentations as Array<{ id: string; name: string; upc?: string; primary_unit_name?: string }>) ?? []) {
      if (!pr.upc) continue;
      presentationMap.set(pr.id, {
        productId: p.id,
        productName: p.name,
        presentationName: pr.name,
        upc: pr.upc,
        unit: pr.primary_unit_name ?? "unit",
      });
    }
  }

  // ── 2. Sum total produced from completed batch sheets ─────────────────────
  const submissions = await prisma.batchSheetSubmission.findMany({
    where: { status: { in: FINISHED_STATUSES } },
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

  // ── 3. Compute shipped quantities from existing shipment items + bundle configs ──
  // For non-voided shipments, look at raw items and apply current product config
  const allShipments = await prisma.shipstationShipment.findMany({
    where: { voided: false },
    include: { items: true },
  });

  // Load all products with their current configs
  const allProducts = await prisma.shipstationProduct.findMany({
    select: { id: true, configStatus: true, fsmsPresentationId: true, fsmsProductId: true, upc: true },
  });
  const productConfigMap = new Map(allProducts.map((p) => [p.id, p]));

  // Load all bundle configs
  const bundleConfigs = await prisma.shipstationBundleConfig.findMany();
  const bundleConfigsByProduct = new Map<string, typeof bundleConfigs>();
  for (const bc of bundleConfigs) {
    const arr = bundleConfigsByProduct.get(bc.bundleProductId) ?? [];
    arr.push(bc);
    bundleConfigsByProduct.set(bc.bundleProductId, arr);
  }

  const shippedByPres = new Map<string, { total: number; lastDate: Date }>();

  function addShipped(presId: string, qty: number, shipDate: Date) {
    const cur = shippedByPres.get(presId) ?? { total: 0, lastDate: new Date(0) };
    cur.total += qty;
    if (shipDate > cur.lastDate) cur.lastDate = shipDate;
    shippedByPres.set(presId, cur);
  }

  for (const shipment of allShipments) {
    const shipDate = shipment.shipDate;
    for (const item of shipment.items) {
      if (!item.shipstationProductId) continue;
      const product = productConfigMap.get(item.shipstationProductId);
      if (!product) continue;

      if (product.configStatus === "ignored") continue;

      if (product.configStatus === "bundle") {
        const configs = bundleConfigsByProduct.get(item.shipstationProductId) ?? [];
        for (const bc of configs) {
          addShipped(bc.fsmsPresentationId, item.quantityShipped * bc.quantityPerBundle, shipDate);
        }
      } else if (product.configStatus === "single_matched" && product.fsmsPresentationId) {
        addShipped(product.fsmsPresentationId, item.quantityShipped, shipDate);
      }
      // unmatched → skip
    }
  }

  // ── 4. Upsert FinishedGoodsInventory ─────────────────────────────────────
  const allPresIds = Array.from(new Set([...Array.from(producedByPres.keys()), ...Array.from(shippedByPres.keys())]));
  let presentationsUpdated = 0;
  let totalOnHand = 0;

  for (const presId of allPresIds) {
    const info = presentationMap.get(presId);
    if (!info) continue;
    const produced = producedByPres.get(presId) ?? { total: 0, lastDate: new Date(0) };
    const shipped = shippedByPres.get(presId) ?? { total: 0, lastDate: new Date(0) };
    const onHand = Math.max(0, produced.total - shipped.total);
    totalOnHand += onHand;

    await prisma.finishedGoodsInventory.upsert({
      where: { fsmsPresentationId: presId },
      create: {
        fsmsPresentationId: presId,
        fsmsProductId: info.productId,
        presentationName: info.presentationName,
        productName: info.productName,
        upc: info.upc,
        unit: info.unit,
        totalProduced: produced.total,
        totalShipped: shipped.total,
        onHand,
        lastBatchSheetDate: produced.lastDate.getTime() > 0 ? produced.lastDate : null,
        lastShipmentDate: shipped.lastDate.getTime() > 0 ? shipped.lastDate : null,
        lastUpdated: new Date(),
      },
      update: {
        totalProduced: produced.total,
        totalShipped: shipped.total,
        onHand,
        lastBatchSheetDate: produced.lastDate.getTime() > 0 ? produced.lastDate : null,
        lastShipmentDate: shipped.lastDate.getTime() > 0 ? shipped.lastDate : null,
        lastUpdated: new Date(),
      },
    });
    presentationsUpdated++;
  }

  return NextResponse.json({ presentationsUpdated, totalOnHand });
}
