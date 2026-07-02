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
// New EopNew presentation unit record (field names as stored in JSONB)
interface EopPresentationUnit {
  // New field names (presentation_units[])
  presentation_name?: string | null;
  was_produced?: boolean;
  total_produced?: number | null;
  yield_per_bowl?: number | null;
  primary_unit_name?: string | null;
  // Finished Unit mode field
  finished_unit_count?: number | null;
  // Alternate field names that may appear in older new-format records
  produced?: boolean;
  total_units?: number | null;
}
interface EopNew {
  // Per-presentation format
  presentation_units?: EopPresentationUnit[];
  presentations?:      EopPresentationUnit[];   // alternate field name
  // Legacy single-block
  total_units_produced?: number | null;
  yield_per_bowl?: number | null;
  primary_unit_name?: string | null;
  // Finished Unit mode
  base_unit_is_finished?: boolean;
  base_unit_name?: string | null;
  // Required marker — must have a "fields" key to be EopNew
  fields?: unknown[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize a presentation name for deduplication.
 * "9 oz", "9.0 oz", "9.00 oz" all collapse to "9 oz" so minor formatting
 * differences between template entries and product entries don't create false duplicates.
 */
function normPresName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Strip trailing zeros in decimal numbers: "9.0" → "9", "18.50" → "18.5"
    .replace(/(\d+)\.0+(?=\s|$)/g, "$1")
    .replace(/(\d+\.\d*?)0+(?=\s|$)/g, "$1")
    .trim();
}

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

function extractItems(s5: unknown): string | null {
  if (!s5) return null;
  if (Array.isArray(s5)) {
    // Legacy EopField[] array format — find numeric fields labelled "box" or "total"
    const fields = s5 as EopField[];
    const matching = fields.filter(
      (f) =>
        f.field_type === "number" &&
        (f.label.toLowerCase().includes("box") || f.label.toLowerCase().includes("total"))
    );
    if (matching.length === 0) return null;
    const sum = matching.reduce((acc, f) => acc + (parseFloat(f.value) || 0), 0);
    return sum > 0 ? String(sum) : null;
  }
  if (typeof s5 !== "object" || s5 === null) return null;
  const obj = s5 as EopNew;

  // New structured EopNew format: look at presentation_units or presentations array
  const units = obj.presentation_units ?? obj.presentations;
  if (Array.isArray(units) && units.length > 0) {
    const produced = units.filter((u) => u.was_produced === true || u.produced === true);
    if (produced.length > 0) {
      // Deduplicate by presentation_name
      const seenNames = new Set<string>();
      const deduped = produced.filter((u) => {
        const key = normPresName(u.presentation_name ?? "") || "__unnamed__";
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      });

      // Finished Unit mode: use finished_unit_count instead of total_produced
      if (obj.base_unit_is_finished === true) {
        const total = deduped.reduce((sum, u) => sum + (u.finished_unit_count ?? 0), 0);
        return total > 0 ? String(total) : null;
      }

      // Standard mode: use total_produced / total_units
      const totals: string[] = deduped
        .map((u) => {
          const v = u.total_produced ?? u.total_units;
          return v != null ? String(v) : null;
        })
        .filter((v): v is string => v !== null);
      if (totals.length > 0) return totals.join(" / ");
    }
  }

  // Legacy single-block EopNew format
  if (obj.total_units_produced != null) return String(obj.total_units_produced);

  // Oldest named-object format
  const old = s5 as EopOld;
  if (old.total_boxes) return String(parseFloat(old.total_boxes) || 0) !== "0" ? String(parseFloat(old.total_boxes)) : null;

  return null;
}

function extractYield(s5: unknown): string | null {
  if (!s5 || Array.isArray(s5)) return null;
  if (typeof s5 !== "object") return null;
  const obj = s5 as EopNew;

  // New per-presentation format
  const units = obj.presentation_units ?? obj.presentations;
  if (Array.isArray(units) && units.length > 0) {
    const produced = units.filter((u) => u.was_produced === true || u.produced === true);
    if (produced.length !== 1) return "N/A"; // 0 or multiple → N/A
    const pu = produced[0];
    const yieldVal = pu.yield_per_bowl;
    if (!yieldVal) return "N/A";
    const unitName = pu.primary_unit_name ?? null;
    const formatted = yieldVal % 1 === 0 ? String(yieldVal) : yieldVal.toFixed(3);
    return unitName ? `${formatted} ${unitName} / Bowl` : `${formatted} / Bowl`;
  }

  // Legacy single-block EopNew
  if (obj.yield_per_bowl != null && obj.yield_per_bowl !== 0) {
    const yieldVal = obj.yield_per_bowl;
    const unitName = obj.primary_unit_name ?? null;
    const formatted = yieldVal % 1 === 0 ? String(yieldVal) : yieldVal.toFixed(3);
    return unitName ? `${formatted} ${unitName} / Bowl` : `${formatted} / Bowl`;
  }

  return null;
}

function extractIngredients(s3: unknown): Array<{
  name: string;
  quantity_per_bowl: number;
  total_qty_used: number | null;
  unit: string;
  supplier: string;
  supplier_source: string | null;
  lot_number: string;
  is_wip?: boolean;
  wip_lot_verified?: boolean | null;
  wip_source_submission_id?: string | null;
  inventory_lots?: Array<{ lot_id: string | null; lot_number: string; qty_used: number; unit: string }>;
}> {
  if (!s3 || typeof s3 !== "object") return [];
  const v = s3 as { ingredients?: Array<Record<string, unknown>> };
  if (!v.ingredients) return [];
  return v.ingredients.map((ing) => {
    // New format (product-linked batch sheets) uses qty_per_bowl_used / total_qty_used.
    // Legacy format uses quantity_per_bowl directly. Normalize to a single field.
    const qtyPerBowl =
      (ing.qty_per_bowl_used as number | null | undefined) ??
      (ing.quantity_per_bowl as number | null | undefined) ??
      0;
    const totalQtyUsed =
      (ing.total_qty_used as number | null | undefined) ?? null;
    // supplier_source from single-lot field; for multi-lot take the first non-null source
    const lots = ing.lots as Array<{ supplier_source?: string | null }> | undefined;
    const supplierSource =
      (ing.supplier_source as string | null | undefined) ??
      lots?.find((l) => l.supplier_source)?.supplier_source ??
      null;
    // inventory_lots — WIP ingredients store their lot number here (lot_number flat field is empty)
    const rawInvLots = ing.inventory_lots as Array<Record<string, unknown>> | undefined;
    const inventoryLots = rawInvLots?.length
      ? rawInvLots.map((l) => ({
          lot_id:   (l.lot_id as string | null | undefined) ?? null,
          lot_number: String(l.lot_number ?? ""),
          qty_used: Number(l.qty_used ?? 0),
          unit:     String(l.unit ?? ""),
        }))
      : undefined;
    return {
      name:              String(ing.name ?? ""),
      quantity_per_bowl: Number(qtyPerBowl) || 0,
      total_qty_used:    totalQtyUsed != null ? Number(totalQtyUsed) : null,
      unit:              String(ing.unit ?? ""),
      supplier:          String(ing.supplier ?? ""),
      supplier_source:   supplierSource ?? null,
      lot_number:        String(ing.lot_number ?? ""),
      is_wip:            Boolean(ing.is_wip ?? false),
      wip_lot_verified:        (ing.wip_lot_verified as boolean | null | undefined) ?? null,
      wip_source_submission_id: (ing.wip_source_submission_id as string | null | undefined) ?? null,
      inventory_lots:    inventoryLots,
    };
  });
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
        productId:      true,
        baseUnitName:   true,
        template:       { select: { hasExpirationDate: true } },
      },
    });

    // JS-side filters (product, lot text search)
    const filtered = submissions.filter((sub) => {
      if (productFilter && sub.templateName !== productFilter) return false;
      if (lotFilter && !((sub.productionLot ?? "").toLowerCase().includes(lotFilter.toLowerCase()))) return false;
      return true;
    });

    const rows = filtered.map((sub) => ({
      id:                  sub.id,
      production_date:     sub.productionDate.toISOString().split("T")[0],
      lot:                 sub.productionLot ?? null,
      product:             sub.templateName,
      product_id:          sub.productId ?? null,
      bowls_produced:      extractBowls(sub.section3),
      base_unit_name:      sub.baseUnitName || "Bowl",
      items_produced:      extractItems(sub.section5),
      presentations:       extractPresentations(sub.section3),
      yield:               extractYield(sub.section5),
      expiration_date:     sub.expirationDate ? sub.expirationDate.toISOString().split("T")[0] : null,
      has_expiration_date: sub.template?.hasExpirationDate ?? true,
      supervisor_name:     sub.supervisorName,
      shift:               sub.shift,
      status:              sub.status,
      ingredients:         extractIngredients(sub.section3),
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
