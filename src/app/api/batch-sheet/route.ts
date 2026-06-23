import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET — all submissions excluding drafts (for records pages)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isAdmin = (session.user as { role?: string })?.role === "ADMIN";

    const submissions = await prisma.batchSheetSubmission.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { submittedAt: "desc" },
      include: {
        submittedBy: { select: { name: true, email: true } },
        template:    { select: { name: true, hasExpirationDate: true } },
      },
    });

    // Strip admin-only fields from non-admin responses
    const result = isAdmin
      ? submissions
      : submissions.map(({ adminNotes: _an, adminNotesUpdatedByName: _nb, adminNotesUpdatedAt: _nat, ...rest }) => rest);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// POST — create a new complete submission, or promote an existing draft to complete.
// If body contains `id`, the draft with that id is updated (must belong to the caller and be DRAFT status).
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as { id: string; role: string };

    const body = await req.json();
    const {
      id,
      templateId, templateName,
      productionDate, productionLot, expirationDate, shift,
      supervisorName, numEmployees,
      section1, section2_allergen, section3, section4, section5, section6,
      notes, status,
      productId, recipeSnapshot,
      expirationDateAuto, shelfLifeMonthsUsed, packagingSnapshot,
      baseUnitName, baseUnitIsFinished,
    } = body;

    if (!templateId || !templateName || !productionDate || !shift || !supervisorName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Merge shelf-life / auto-expiration metadata into section1 JSONB
    const enrichedSection1 = section1
      ? {
          ...section1,
          ...(expirationDateAuto !== undefined && { expiration_date_auto: expirationDateAuto }),
          ...(shelfLifeMonthsUsed != null && { shelf_life_months_used: shelfLifeMonthsUsed }),
        }
      : null;

    const data = {
      templateId,
      templateName,
      productionDate:    new Date(productionDate),
      productionLot:     productionLot || null,
      expirationDate:    expirationDate ? new Date(expirationDate) : null,
      shift,
      supervisorName,
      numEmployees:      numEmployees ? parseInt(numEmployees) : null,
      section1:          enrichedSection1 ?? null,
      section2_allergen: section2_allergen ?? null,
      section3:          section3 ? { ...section3, packaging_snapshot: packagingSnapshot ?? null } : null,
      section4:          section4 ?? null,
      section5:          section5 ?? null,
      section6:          section6 ?? null,
      notes:             notes || null,
      status:            status ?? "COMPLETE",
      lastSavedAt:       new Date(),
      productId:         productId ?? null,
      recipeSnapshot:    recipeSnapshot ?? null,
      baseUnitName:           baseUnitName || "Bowl",
      baseUnitIsFinished:     baseUnitIsFinished ?? false,
    };

    let submission;
    if (id) {
      // Promote existing draft → completed
      const existing = await prisma.batchSheetSubmission.findFirst({
        where: { id, submittedById: user.id, status: "DRAFT" },
        select: { id: true, recipeSnapshot: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
      // Immutability: once a recipeSnapshot is locked in, it cannot be overwritten
      if (existing.recipeSnapshot !== null && recipeSnapshot !== undefined && recipeSnapshot !== null) {
        const sameRef = JSON.stringify(existing.recipeSnapshot) === JSON.stringify(recipeSnapshot);
        if (!sameRef) {
          return NextResponse.json(
            { error: "recipeSnapshot is immutable once set on a submission" },
            { status: 400 }
          );
        }
      }
      // If already set on the draft, preserve the original snapshot
      const finalData = existing.recipeSnapshot !== null
        ? { ...data, recipeSnapshot: existing.recipeSnapshot, submittedAt: new Date() }
        : { ...data, submittedAt: new Date() };
      submission = await prisma.batchSheetSubmission.update({
        where: { id },
        data: finalData,
      });
    } else {
      submission = await prisma.batchSheetSubmission.create({
        data: { ...data, submittedById: user.id },
      });
    }

    // Create OUT inventory movements for ingredients that used inventory lots
    if (data.status === "COMPLETE" || status === "COMPLETE") {
      type LotEntry = { lot_id?: string | null; inventory_lot_id?: string | null; qty_used?: number; qty_used_from_this_lot?: number; unit?: string };
      const ingredients = (section3 as { ingredients?: Array<{ use_inventory?: boolean; lots?: LotEntry[]; inventory_lots?: LotEntry[] }> })?.ingredients ?? [];
      for (const ing of ingredients) {
        // Support both new lots[] format (canonical) and legacy inventory_lots[] format
        const rawEntries = ing.lots?.length
          ? ing.lots
          : (ing.use_inventory ? (ing.inventory_lots ?? []) : []);
        if (!rawEntries.length) continue;
        for (const lotEntry of rawEntries) {
          const lotId = lotEntry.inventory_lot_id ?? lotEntry.lot_id ?? null;
          const qtyUsed = lotEntry.qty_used_from_this_lot ?? lotEntry.qty_used ?? 0;
          if (!lotId || !qtyUsed) continue;
          try {
            const lot = await prisma.inventoryLot.findUnique({ where: { id: lotId } });
            if (!lot) continue;
            const newQty = Math.max(0, lot.quantityRemaining - qtyUsed);
            const newStatus = newQty <= 0 ? "depleted"
              : (lot.expirationDate && lot.expirationDate < new Date()) ? "expired"
              : lot.isConditional ? "conditional"
              : "active";
            await prisma.inventoryMovement.create({
              data: {
                inventoryLotId: lot.id,
                materialId:     lot.materialId,
                materialName:   lot.materialName,
                lotNumber:      lot.lotNumber,
                movementType:   "out_batch_sheet",
                quantity:       -Math.abs(qtyUsed),
                unit:           lotEntry.unit || lot.unit,
                referenceType:  "batch_sheet",
                referenceId:    submission.id,
                referenceNumber: submission.productionLot ?? submission.id.slice(0, 8).toUpperCase(),
                quantityBefore: lot.quantityRemaining,
                quantityAfter:  newQty,
                performedById:  user.id,
              },
            });
            await prisma.inventoryLot.update({
              where: { id: lot.id },
              data: { quantityRemaining: newQty, status: newStatus },
            });
          } catch (movErr) {
            console.error("[batch-sheet] inventory movement error for lot", lotId, movErr);
          }
        }
      }
    }

    // Create OUT inventory movements for packaging lots that used inventory lots
    if (data.status === "COMPLETE" || status === "COMPLETE") {
      type PkgLotEntry = { inventory_lot_id?: string | null; qty_used?: number | null; unit?: string | null };
      type PkgMatEntry = { lots?: PkgLotEntry[] };
      type PkgPresEntry = { selected?: boolean; materials?: PkgMatEntry[] };
      const presentations = (section3 as { presentations?: PkgPresEntry[] })?.presentations ?? [];
      for (const pres of presentations) {
        if (!pres.selected) continue;
        for (const mat of (pres.materials ?? [])) {
          for (const lotEntry of (mat.lots ?? [])) {
            const lotId = lotEntry.inventory_lot_id ?? null;
            const qtyUsed = lotEntry.qty_used ?? 0;
            if (!lotId || !qtyUsed) continue;
            try {
              const lot = await prisma.inventoryLot.findUnique({ where: { id: lotId } });
              if (!lot) continue;
              const newQty = Math.max(0, lot.quantityRemaining - qtyUsed);
              const newStatus = newQty <= 0 ? "depleted"
                : (lot.expirationDate && lot.expirationDate < new Date()) ? "expired"
                : lot.isConditional ? "conditional"
                : "active";
              await prisma.inventoryMovement.create({
                data: {
                  inventoryLotId: lot.id,
                  materialId:     lot.materialId,
                  materialName:   lot.materialName,
                  lotNumber:      lot.lotNumber,
                  movementType:   "out_batch_sheet",
                  quantity:       -Math.abs(qtyUsed),
                  unit:           lotEntry.unit || lot.unit,
                  referenceType:  "batch_sheet",
                  referenceId:    submission.id,
                  referenceNumber: submission.productionLot ?? submission.id.slice(0, 8).toUpperCase(),
                  quantityBefore: lot.quantityRemaining,
                  quantityAfter:  newQty,
                  performedById:  user.id,
                },
              });
              await prisma.inventoryLot.update({
                where: { id: lot.id },
                data: { quantityRemaining: newQty, status: newStatus },
              });
            } catch (movErr) {
              console.error("[batch-sheet] packaging inventory movement error for lot", lotId, movErr);
            }
          }
        }
      }
    }

    return NextResponse.json(submission, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
