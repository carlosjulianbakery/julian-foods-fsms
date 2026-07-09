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

async function ssGet(path: string, headers: Record<string, string>) {
  const res = await fetch(`https://ssapi.shipstation.com${path}`, { headers });
  if (!res.ok) throw new Error(`SS API ${res.status}: ${await res.text()}`);
  return res.json();
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers = ssHeaders();
  type Product = Record<string, unknown>;

  // ── Approach A: search by name ─────────────────────────────────────────────
  const approachA = await ssGet("/products?pageSize=100&page=1&name=PureMonk&showBundleComponents=true", headers);
  await delay(1500);

  // ── Approach B: scan pages 1-3, filter client-side ────────────────────────
  const bundleKeywords = ["puremonk", "pure monk", "6 pack", "6-pack"];
  const allProducts: Product[] = [];

  for (let page = 1; page <= 3; page++) {
    const data = await ssGet(`/products?pageSize=100&page=${page}&showBundleComponents=true`, headers) as { products?: Product[]; pages?: number };
    allProducts.push(...(data.products ?? []));
    if (page >= (data.pages ?? 1)) break;
    await delay(1500);
  }

  const bundleMatches = allProducts.filter((p) => {
    const name = ((p.name as string) ?? "").toLowerCase();
    return bundleKeywords.some((kw) => name.includes(kw));
  });

  // ── Approach C: productType=bundle filter ─────────────────────────────────
  await delay(1500);
  const approachC = await ssGet("/products?pageSize=10&page=1&productType=bundle&showBundleComponents=true", headers);

  // ── Find the specific products ────────────────────────────────────────────
  const sixPackProduct = allProducts.find((p) =>
    ((p.name as string) ?? "").toLowerCase().includes("6 pack") ||
    ((p.name as string) ?? "").toLowerCase().includes("6-pack")
  ) ?? bundleMatches[0] ?? null;

  const singleProduct = allProducts.find((p) => {
    const name = ((p.name as string) ?? "").toLowerCase();
    return (name.includes("pure monk") || name.includes("puremonk")) && name.includes("single");
  }) ?? null;

  // ── Analysis: inspect bundle fields on sixPackProduct ─────────────────────
  let bundleAnalysis: Record<string, unknown> = {};
  if (sixPackProduct) {
    // Find any field that is an array with items (candidate for components)
    const arrayFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sixPackProduct)) {
      if (Array.isArray(v)) arrayFields[k] = v;
    }
    // Find any boolean or string field that looks like a bundle flag
    const boolFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sixPackProduct)) {
      if (typeof v === "boolean") boolFields[k] = v;
      if (typeof v === "string" && /bundle|kit|pack|alias/i.test(k)) boolFields[k] = v;
    }
    bundleAnalysis = {
      allFieldNames: Object.keys(sixPackProduct),
      arrayFields,
      booleanFields: boolFields,
      aliasesValue: sixPackProduct.aliases,
      productTypeValue: sixPackProduct.productType,
      bundleItemsValue: sixPackProduct.bundleItems,
      firstArrayFieldIfAny: Object.entries(arrayFields)[0] ?? null,
    };
  }

  // ── Log everything to server console ─────────────────────────────────────
  console.log("=== APPROACH A (name=PureMonk) ===", JSON.stringify(approachA, null, 2));
  console.log("=== 6-PACK PRODUCT ===", JSON.stringify(sixPackProduct, null, 2));
  console.log("=== SINGLE PRODUCT ===", JSON.stringify(singleProduct, null, 2));
  console.log("=== APPROACH C (productType=bundle) ===", JSON.stringify(approachC, null, 2));

  return NextResponse.json({
    approachA: {
      total: (approachA as { total?: number }).total,
      products: (approachA as { products?: Product[] }).products ?? [],
    },
    approachB: {
      totalScanned: allProducts.length,
      bundleKeywordMatches: bundleMatches,
      matchCount: bundleMatches.length,
    },
    approachC: {
      note: "productType=bundle filter result",
      total: (approachC as { total?: number }).total,
      products: (approachC as { products?: Product[] }).products ?? [],
    },
    targetProducts: {
      sixPackProduct: {
        found: !!sixPackProduct,
        rawProduct: sixPackProduct,
        allFieldNames: sixPackProduct ? Object.keys(sixPackProduct) : null,
      },
      singleProduct: {
        found: !!singleProduct,
        rawProduct: singleProduct,
        upcValue: singleProduct?.upc ?? null,
        allFieldNames: singleProduct ? Object.keys(singleProduct) : null,
      },
    },
    bundleAnalysis,
  });
}
