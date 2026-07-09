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

  // Raw shipment response (1 shipment)
  const shipRes = await fetch("https://ssapi.shipstation.com/shipments?pageSize=1&page=1", { headers });
  const shipRaw = await shipRes.json();

  // Raw products response (5 products, with bundle components)
  const prodRes = await fetch("https://ssapi.shipstation.com/products?pageSize=5&page=1&showBundleComponents=true", { headers });
  const prodRaw = await prodRes.json();

  // Log to server console so it's captured in Vercel function logs
  console.log("=== SHIPSTATION RAW SHIPMENT RESPONSE ===");
  console.log(JSON.stringify(shipRaw, null, 2));
  console.log("=== SHIPSTATION RAW PRODUCTS RESPONSE ===");
  console.log(JSON.stringify(prodRaw, null, 2));

  // Field analysis: extract just the keys from the first shipment and first item
  const firstShipment = shipRaw?.shipments?.[0] ?? null;
  const firstItem = firstShipment ? Object.values(firstShipment).find(v => Array.isArray(v) && (v as unknown[]).length > 0) : null;
  const firstProduct = prodRaw?.products?.[0] ?? null;

  return NextResponse.json({
    shipments: {
      total: shipRaw?.total,
      pages: shipRaw?.pages,
      firstShipmentKeys: firstShipment ? Object.keys(firstShipment) : null,
      firstShipment: firstShipment,
    },
    products: {
      total: prodRaw?.total,
      firstProductKeys: firstProduct ? Object.keys(firstProduct) : null,
      firstProduct: firstProduct,
    },
    analysis: {
      // What our sync code currently expects vs what the API actually returns
      syncCodeExpects: {
        shipmentItemsField: "ss.items",
        itemQuantityField: "item.quantity",
        itemUpcField: "item.upc",
        itemProductIdField: "item.productId",
        itemAdjustmentField: "item.adjustment",
        itemNameField: "item.name",
        productBundleField: "sp.bundleItems (Array.isArray check)",
        productBundleItemQty: "comp.quantity",
        productBundleItemId: "comp.productId",
      },
    },
  });
}
