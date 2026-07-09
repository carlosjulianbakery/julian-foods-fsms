import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ssHeaders(): Record<string, string> {
  const key = process.env.SHIPSTATION_API_KEY;
  const secret = process.env.SHIPSTATION_API_SECRET;
  if (!key || !secret) throw new Error("ShipStation credentials not configured");
  const creds = Buffer.from(`${key}:${secret}`).toString("base64");
  return { Authorization: `Basic ${creds}`, "Content-Type": "application/json" };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers = ssHeaders();

  // ── 1. SHIPMENTS: find first non-voided shipment with real items ──────────
  // Try with includeShipmentItems=true in case that's required
  const shipRes = await fetch(
    "https://ssapi.shipstation.com/shipments?pageSize=50&page=1&includeShipmentItems=true",
    { headers }
  );
  const shipRaw = await shipRes.json() as { shipments?: Record<string, unknown>[] };
  const allShipments: Record<string, unknown>[] = shipRaw.shipments ?? [];

  // Find first non-voided shipment that has a non-null, non-empty items array
  // ShipStation uses "shipmentItems" as the field name
  let targetShipment: Record<string, unknown> | null = null;
  let itemsFieldName: string | null = null;
  let firstItem: Record<string, unknown> | null = null;

  for (const s of allShipments) {
    if (s.voided === true) continue;

    // Probe every field that is an array with at least 1 entry
    for (const [key, val] of Object.entries(s)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null) {
        targetShipment = s;
        itemsFieldName = key;
        firstItem = val[0] as Record<string, unknown>;
        break;
      }
    }
    if (targetShipment) break;
  }

  // Fallback: return the first non-voided shipment even if items are empty/null
  const firstNonVoided = allShipments.find((s) => !s.voided) ?? null;

  // ── 2. PRODUCTS: find a bundle ─────────────────────────────────────────────
  // Fetch with showBundleComponents=true, scan multiple pages if needed
  let bundleProduct: Record<string, unknown> | null = null;
  const bundleKeywords = ["bundle", "pack", "kit", "set", "3-pack", "2-pack", "variety", "combo"];
  const first5Products: Record<string, unknown>[] = [];

  for (let page = 1; page <= 3 && !bundleProduct; page++) {
    const prodRes = await fetch(
      `https://ssapi.shipstation.com/products?pageSize=100&page=${page}&showBundleComponents=true`,
      { headers }
    );
    const prodRaw = await prodRes.json() as { products?: Record<string, unknown>[]; pages?: number };
    const products: Record<string, unknown>[] = prodRaw.products ?? [];

    if (page === 1) first5Products.push(...products.slice(0, 5));

    for (const p of products) {
      const aliases = p.aliases;
      const productType = (p.productType as string | null | undefined);
      const name = ((p.name as string) ?? "").toLowerCase();

      const isBundle =
        (Array.isArray(aliases) && aliases.length > 0) ||
        (typeof productType === "string" && productType.toLowerCase().includes("bundle")) ||
        bundleKeywords.some((kw) => name.includes(kw));

      if (isBundle) {
        bundleProduct = p;
        break;
      }
    }

    if (page >= (prodRaw.pages ?? 1)) break;
    await new Promise<void>((r) => setTimeout(r, 500));
  }

  // ── 3. Build analysis ──────────────────────────────────────────────────────
  const lotFieldCandidates = firstItem
    ? Object.entries(firstItem)
        .filter(([k]) => /lot|batch|serial|inventory/i.test(k))
        .map(([k, v]) => ({ field: k, value: v }))
    : [];

  const analysis = {
    syncCodeCurrentlyExpects: {
      shipmentItemsField: "ss.shipmentItems",
      itemQtyField: "item.quantity",
      itemUpcField: "item.upc",
      itemProductIdField: "item.productId",
      itemNameField: "item.name",
      itemAdjustmentField: "item.adjustment",
      bundleDetectionField: "Array.isArray(sp.aliases) && sp.aliases.length > 0",
      bundleComponentsField: "sp.aliases[i].{ productId, quantity, sku }",
    },
    whatWeFoundInAPI: {
      shipmentItemsField: itemsFieldName ?? "NOT FOUND — all items null/empty in first 50",
      itemUpcField: firstItem ? (Object.keys(firstItem).find((k) => /upc/i.test(k)) ?? "NOT FOUND") : "no item to inspect",
      itemQtyField: firstItem ? (Object.keys(firstItem).find((k) => /^quantity/i.test(k)) ?? "NOT FOUND") : "no item to inspect",
      itemLotIdField: lotFieldCandidates.length > 0 ? lotFieldCandidates : "NOT FOUND — no lot/batch/serial field on item",
      bundleDetectionField: bundleProduct
        ? `aliases=${JSON.stringify(bundleProduct.aliases)} | productType=${bundleProduct.productType}`
        : "NO BUNDLE FOUND IN FIRST 300 PRODUCTS",
      bundleComponentsField: bundleProduct?.aliases
        ? `sp.aliases — structure: ${JSON.stringify((bundleProduct.aliases as unknown[])[0])}`
        : "unknown — no bundle found",
    },
  };

  console.log("=== SS DEBUG: targetShipment ===", JSON.stringify(targetShipment, null, 2));
  console.log("=== SS DEBUG: bundleProduct ===", JSON.stringify(bundleProduct, null, 2));

  return NextResponse.json({
    shipments: {
      totalInPage: allShipments.length,
      targetShipment: {
        allShipmentKeys: targetShipment ? Object.keys(targetShipment) : (firstNonVoided ? Object.keys(firstNonVoided) : null),
        rawShipment: targetShipment ?? firstNonVoided,
        itemsField: itemsFieldName,
        firstItem,
        firstItemKeys: firstItem ? Object.keys(firstItem) : null,
      },
      firstNonVoidedFallback: !targetShipment ? firstNonVoided : null,
    },
    products: {
      bundleProduct: bundleProduct
        ? {
            bundleProductKeys: Object.keys(bundleProduct),
            rawProduct: bundleProduct,
            aliasesValue: bundleProduct.aliases,
            productTypeValue: bundleProduct.productType,
          }
        : null,
      first5Products,
      noBundleFound: !bundleProduct,
    },
    analysis,
  });
}
