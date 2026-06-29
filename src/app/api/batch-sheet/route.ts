import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { autoCompleteFormLinkedTasks } from "@/lib/tasks";
import { checkMaterialStockLevel } from "@/lib/inventoryUtils";
import { convertUnit } from "@/lib/unitConversion";

export const dynamic = "force-dynamic";

// Statuses that represent a final (non-draft) submission — all trigger inventory deduction.
// COMPLETE = no CCPs; PASS/PASS_WITH_ISSUES/FAIL = CCP-gated batch sheets.
const FINISHED_STATUSES = new Set(["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"]);

// ─── Shared inventory deduction types ────────────────────────────────────────

type IngLotEntry = {
  lot_id?: string | null;
  inventory_lot_id?: string | null;
  qty_used?: number;
  qty_used_from_this_lot?: number;
  unit?: string;
};

type IngEntry = {
  use_inventory?: boolean;
  unit?: string;       // recipe/batch unit (e.g. "g", "oz", "lbs")
  name?: string;
  lots?: IngLotEntry[];
  inventory_lots?: IngLotEntry[];
};

type PkgLotEntry = {
  inventory_lot_id?: string | null;
  qty_used?: number | null;
  unit?: string | null; // batch sheet unit for this packaging item
};

type PkgMatEntry = { lots?: PkgLotEntry[] };
type PkgPresEntry = { selected?: boolean; materials?: PkgMatEntry[] };

// Compute the lot status after a quantity change
function computeLotStatus(
  lot: { expirationDate: Date | null; isConditional: boolean },
  newQty: number
): string {
  if (newQty <= 0) return "depleted";
  if (lot.expirationDate && lot.expirationDate < new Date()) return "expired";
  if (lot.isConditional) return "conditional";
  return "active";
}

// ─── Core deduction logic (runs inside a Prisma transaction) ─────────────────

export async function processInventoryDeductions(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  section3: unknown,
  submissionId: string,
  productionLot: string | null,
  performedById: string
): Promise<Set<string>> {
  const affectedMaterialIds = new Set<string>();
  const refNumber = productionLot ?? submissionId.slice(0, 8).toUpperCase();

  // ── Ingredients ─────────────────────────────────────────────────────────────
  const ingredients = (section3 as { ingredients?: IngEntry[] })?.ingredients ?? [];

  for (const ing of ingredients) {
    // Support both new lots[] format (canonical) and legacy inventory_lots[] format
    const rawEntries = ing.lots?.length
      ? ing.lots
      : ing.use_inventory
      ? (ing.inventory_lots ?? [])
      : [];

    const batchUnit = ing.unit; // unit the recipe quantity is recorded in

    for (const lotEntry of rawEntries) {
      const lotId = lotEntry.inventory_lot_id ?? lotEntry.lot_id ?? null;
      const rawQty = lotEntry.qty_used_from_this_lot ?? lotEntry.qty_used ?? 0;
      if (!lotId || !rawQty) continue;

      const lot = await tx.inventoryLot.findUnique({ where: { id: lotId } });
      if (!lot) {
        console.warn(`[batch-sheet] ingredient lot ${lotId} not found in DB — skipping deduction`);
        continue;
      }

      // Convert batch recipe unit → inventory lot unit before deducting
      let deductQty = rawQty;
      const inventoryUnit = lot.unit;

      if (batchUnit && inventoryUnit) {
        const conv = convertUnit(rawQty, batchUnit, inventoryUnit);
        if (conv.possible) {
          deductQty = conv.result;
          if (conv.result !== rawQty) {
            console.log(
              `[DEDUCTION] Converted: ${rawQty} ${batchUnit} → ${deductQty.toFixed(4)} ${inventoryUnit}` +
              ` for ${ing.name ?? lotId}`
            );
          }
        } else {
          console.error(
            `[DEDUCTION ERROR] Cannot convert ${batchUnit} → ${inventoryUnit}` +
            ` for ${ing.name ?? lotId} (lot ${lot.lotNumber}). Skipping deduction — manual review needed.`
          );
          continue; // never deduct an unconvertible amount
        }
      }

      const newQty = Math.max(0, lot.quantityRemaining - deductQty);
      await tx.inventoryMovement.create({
        data: {
          inventoryLotId:  lot.id,
          materialId:      lot.materialId,
          materialName:    lot.materialName,
          lotNumber:       lot.lotNumber,
          movementType:    "out_batch_sheet",
          quantity:        -Math.abs(deductQty),
          unit:            inventoryUnit,
          referenceType:   "batch_sheet",
          referenceId:     submissionId,
          referenceNumber: refNumber,
          quantityBefore:  lot.quantityRemaining,
          quantityAfter:   newQty,
          performedById,
          ...(batchUnit && batchUnit !== inventoryUnit
            ? { notes: `Converted from ${rawQty} ${batchUnit}` }
            : {}),
        },
      });
      await tx.inventoryLot.update({
        where: { id: lot.id },
        data:  { quantityRemaining: newQty, status: computeLotStatus(lot, newQty) },
      });
      affectedMaterialIds.add(lot.materialId);
    }
  }

  // ── Packaging ────────────────────────────────────────────────────────────────
  const presentations = (section3 as { presentations?: PkgPresEntry[] })?.presentations ?? [];

  for (const pres of presentations) {
    if (!pres.selected) continue;
    for (const mat of pres.materials ?? []) {
      for (const lotEntry of mat.lots ?? []) {
        const lotId = lotEntry.inventory_lot_id ?? null;
        const rawQty = lotEntry.qty_used ?? 0;
        if (!lotId || !rawQty) continue;

        const lot = await tx.inventoryLot.findUnique({ where: { id: lotId } });
        if (!lot) {
          console.warn(`[batch-sheet] packaging lot ${lotId} not found in DB — skipping deduction`);
          continue;
        }

        // Convert packaging batch unit → inventory lot unit if they differ
        let deductQty = rawQty;
        const batchUnit = lotEntry.unit;
        const inventoryUnit = lot.unit;

        if (batchUnit && inventoryUnit) {
          const conv = convertUnit(rawQty, batchUnit, inventoryUnit);
          if (conv.possible) {
            deductQty = conv.result;
            if (conv.result !== rawQty) {
              console.log(
                `[PKG DEDUCTION] Converted: ${rawQty} ${batchUnit} → ${deductQty.toFixed(4)} ${inventoryUnit}` +
                ` for lot ${lot.lotNumber}`
              );
            }
          } else {
            console.error(
              `[PKG DEDUCTION ERROR] Cannot convert ${batchUnit} → ${inventoryUnit}` +
              ` for lot ${lot.lotNumber}. Skipping deduction — manual review needed.`
            );
            continue;
          }
        }

        const newQty = Math.max(0, lot.quantityRemaining - deductQty);
        await tx.inventoryMovement.create({
          data: {
            inventoryLotId:  lot.id,
            materialId:      lot.materialId,
            materialName:    lot.materialName,
            lotNumber:       lot.lotNumber,
            movementType:    "out_batch_sheet",
            quantity:        -Math.abs(deductQty),
            unit:            inventoryUnit,
            referenceType:   "batch_sheet",
            referenceId:     submissionId,
            referenceNumber: refNumber,
            quantityBefore:  lot.quantityRemaining,
            quantityAfter:   newQty,
            performedById,
            ...(batchUnit && batchUnit !== inventoryUnit
              ? { notes: `Converted from ${rawQty} ${batchUnit}` }
              : {}),
          },
        });
        await tx.inventoryLot.update({
          where: { id: lot.id },
          data:  { quantityRemaining: newQty, status: computeLotStatus(lot, newQty) },
        });
        affectedMaterialIds.add(lot.materialId);
      }
    }
  }

  return affectedMaterialIds;
}

// ─── WIP inventory lot creation ───────────────────────────────────────────────
// When a WIP (internal) product batch sheet is submitted, create an inventory
// lot for the produced material. Quantity = total input weight from section3
// ingredients (dry-blend yield ≈ 100%). Idempotent — skipped if a lot with the
// same lot number already exists for this material.

async function createWipInventoryLot(
  productId: string,
  submission: { id: string; productionLot: string | null; productionDate: Date },
  section3: unknown,
  performedById: string
) {
  const wipMaterial = await prisma.material.findFirst({
    where: { sourceProductId: productId, materialType: "wip" },
    select: { id: true, name: true, unit: true },
  });
  if (!wipMaterial || !submission.productionLot) return;

  // Idempotency: skip if a lot with this lot number already exists for this material
  const existing = await prisma.inventoryLot.findFirst({
    where: { materialId: wipMaterial.id, lotNumber: submission.productionLot },
    select: { id: true },
  });
  if (existing) return;

  // Total output quantity = sum of ingredient quantities converted to WIP material's unit
  const wipUnit = wipMaterial.unit ?? "lb";
  const ingredients =
    (section3 as { ingredients?: Array<{ unit?: string; lots?: Array<{ qty_used_from_this_lot?: number }> }> })
      ?.ingredients ?? [];
  let totalQty = 0;
  for (const ing of ingredients) {
    const ingUnit = ing.unit;
    for (const lot of ing.lots ?? []) {
      const qty = lot.qty_used_from_this_lot ?? 0;
      if (!qty) continue;
      if (!ingUnit) {
        totalQty += qty; // no unit info — assume same as WIP unit
      } else {
        const conv = convertUnit(qty, ingUnit, wipUnit);
        if (conv.possible) {
          totalQty += conv.result;
        } else {
          console.error(`[WIP qty] Cannot convert ${ingUnit} → ${wipUnit}; skipping contribution`);
        }
      }
    }
  }

  const lot = await prisma.inventoryLot.create({
    data: {
      materialId:        wipMaterial.id,
      materialName:      wipMaterial.name,
      supplierName:      "Julian Bakery",
      supplierId:        null,
      lotNumber:         submission.productionLot,
      quantityReceived:  totalQty,
      quantityRemaining: totalQty,
      unit:              wipMaterial.unit ?? "lb",
      receivedDate:      submission.productionDate,
      status:            totalQty > 0 ? "active" : "depleted",
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      inventoryLotId:  lot.id,
      materialId:      wipMaterial.id,
      materialName:    wipMaterial.name,
      lotNumber:       lot.lotNumber,
      movementType:    "in_receiving",
      quantity:        totalQty,
      unit:            lot.unit,
      referenceType:   "batch_sheet",
      referenceId:     submission.id,
      referenceNumber: submission.productionLot,
      quantityBefore:  0,
      quantityAfter:   totalQty,
      performedById,
    },
  });
}

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

    // Deduct inventory for all finished submissions (COMPLETE, PASS, PASS_WITH_ISSUES, FAIL).
    // The submission record is saved before this block so a failed deduction never blocks the supervisor.
    // All movements are wrapped in a single transaction — either all lots deduct or none do.
    let affectedMaterialIds = new Set<string>();
    if (FINISHED_STATUSES.has(String(data.status))) {
      try {
        affectedMaterialIds = await prisma.$transaction((tx) =>
          processInventoryDeductions(tx, section3, submission.id, submission.productionLot, user.id)
        );
      } catch (txErr) {
        console.error(
          `[batch-sheet] inventory deduction failed for submission ${submission.id} — ` +
          `manual reprocess may be needed. Error:`,
          txErr
        );
      }

      // Check minimum stock levels for all materials touched by this submission
      if (affectedMaterialIds.size > 0) {
        await Promise.all(
          Array.from(affectedMaterialIds).map((matId) => checkMaterialStockLevel(matId))
        );
      }

      autoCompleteFormLinkedTasks({
        formType: "batch_sheet",
        submittingUserId: user.id,
        submittedAt: new Date(),
        submissionId: submission.id,
        prismaClient: prisma,
      }).catch((e) => console.error("[task auto-complete] batch_sheet:", e));

      // Create inventory lot for WIP (internal) products when their batch sheet is submitted.
      // The lot quantity = total input weight in section3 (dry blend ≈ 100% yield).
      if (productId && submission.productionLot) {
        createWipInventoryLot(productId, submission, section3, user.id).catch((e) =>
          console.error("[batch-sheet] WIP lot creation failed:", e)
        );
      }
    }

    return NextResponse.json(submission, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
