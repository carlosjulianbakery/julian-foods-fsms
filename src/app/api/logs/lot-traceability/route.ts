import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EopField   { label: string; field_type: string; value: string }
interface EopOld     { total_boxes?: string; extra_bags?: string }
interface Section3   {
  bowls_produced?: number; bowls_planned?: number;
  presentations?: Array<{ presentation_name: string; selected: boolean }>;
  packaging?:     unknown[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractBowls(s3: unknown): number | null {
  if (!s3 || typeof s3 !== "object") return null;
  const v = s3 as Section3;
  return v.bowls_produced ?? v.bowls_planned ?? null;
}

function extractPresentations(s3: unknown): string {
  if (!s3 || typeof s3 !== "object") return "—";
  const v = s3 as Section3;
  if (!Array.isArray(v.presentations) || v.presentations.length === 0) return "—";
  const names = v.presentations.filter((p) => p.selected).map((p) => p.presentation_name);
  return names.length > 0 ? names.join(", ") : "—";
}

function extractItems(s5: unknown): number | null {
  if (!s5) return null;
  if (Array.isArray(s5)) {
    // New EopField[] format — find numeric fields whose label contains "box" or "total"
    const fields = s5 as EopField[];
    const matching = fields.filter(
      (f) =>
        f.field_type === "number" &&
        (f.label.toLowerCase().includes("box") || f.label.toLowerCase().includes("total"))
    );
    if (matching.length === 0) return null;
    const sum = matching.reduce((acc, f) => acc + (parseFloat(f.value) || 0), 0);
    return sum > 0 ? sum : null;
  }
  // Old named-object format
  const old = s5 as EopOld;
  if (old.total_boxes) return parseFloat(old.total_boxes) || null;
  return null;
}

function extractIngredients(s3: unknown): Array<{ name: string; quantity_per_bowl: number; unit: string; supplier: string; lot_number: string }> {
  if (!s3 || typeof s3 !== "object") return [];
  const v = s3 as { ingredients?: Array<{ name: string; quantity_per_bowl: number; unit: string; supplier: string; lot_number: string }> };
  return v.ingredients ?? [];
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const productFilter  = searchParams.get("product")   ?? "";
    const dateFrom       = searchParams.get("date_from") ?? "";
    const dateTo         = searchParams.get("date_to")   ?? "";
    const lotFilter      = searchParams.get("lot")       ?? "";

    // Build Prisma where clause for date range (server-side)
    const where: Prisma.BatchSheetSubmissionWhereInput = {
      status: { notIn: ["IN_PROGRESS", "DRAFT"] },
      ...(dateFrom && { productionDate: { gte: new Date(dateFrom) } }),
      ...(dateTo   && { productionDate: { lte: new Date(dateTo + "T23:59:59") } }),
    };

    const submissions = await prisma.batchSheetSubmission.findMany({
      where,
      orderBy: { productionDate: "desc" },
      select: {
        id:             true,
        templateName:   true,
        productionDate: true,
        productionLot:  true,
        expirationDate: true,
        shift:          true,
        supervisorName: true,
        status:         true,
        section3:       true,
        section5:       true,
      },
    });

    // JS-side filters (product, lot text search)
    const filtered = submissions.filter((sub) => {
      if (productFilter && sub.templateName !== productFilter) return false;
      if (lotFilter && !((sub.productionLot ?? "").toLowerCase().includes(lotFilter.toLowerCase()))) return false;
      return true;
    });

    const rows = filtered.map((sub) => ({
      id:              sub.id,
      production_date: sub.productionDate.toISOString().split("T")[0],
      lot:             sub.productionLot ?? null,
      product:         sub.templateName,
      bowls_produced:  extractBowls(sub.section3),
      items_produced:  extractItems(sub.section5),
      presentations:   extractPresentations(sub.section3),
      expiration_date: sub.expirationDate ? sub.expirationDate.toISOString().split("T")[0] : null,
      supervisor_name: sub.supervisorName,
      shift:           sub.shift,
      status:          sub.status,
      ingredients:     extractIngredients(sub.section3),
    }));

    // Unique product names for filter dropdown
    const allProducts = await prisma.batchSheetSubmission.findMany({
      where: { status: { notIn: ["IN_PROGRESS", "DRAFT"] } },
      select: { templateName: true },
      distinct: ["templateName"],
      orderBy: { templateName: "asc" },
    });

    return NextResponse.json({
      rows,
      total_count:  rows.length,
      product_list: allProducts.map((p) => p.templateName),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/logs/lot-traceability]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
