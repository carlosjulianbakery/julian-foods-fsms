import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertUnit } from "@/lib/unitConversion";

export const dynamic = "force-dynamic";

const FINISHED_STATUSES = ["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"];
const TOLERANCE = 0.01;

// ─── Section3 types (mirrors batch-sheet/route.ts) ───────────────────────────

interface IngLotEntry {
  lot_id?: string | null;
  inventory_lot_id?: string | null;
  qty_used?: number;
  qty_used_from_this_lot?: number;
  unit?: string;
}

interface IngEntry {
  use_inventory?: boolean;
  unit?: string;
  name?: string;
  lots?: IngLotEntry[];
  inventory_lots?: IngLotEntry[];
}

interface PkgLotEntry {
  inventory_lot_id?: string | null;
  qty_used?: number | null;
  unit?: string | null;
}

interface PkgMatEntry {
  id?: string | null;
  name?: string;
  food_contact?: boolean;
  total_qty_used?: number | null;
  lots?: PkgLotEntry[];
}

interface PkgPresEntry {
  selected?: boolean;
  materials?: PkgMatEntry[];
}

interface Section3 {
  ingredients?: IngEntry[];
  presentations?: PkgPresEntry[];
}

// ─── Lot status helper (mirrors batch-sheet/route.ts) ─────────────────────────

function computeLotStatus(
  lot: { expirationDate: Date | null; isConditional: boolean },
  newQty: number
): string {
  if (newQty <= 0) return "depleted";
  if (lot.expirationDate && lot.expirationDate < new Date()) return "expired";
  if (lot.isConditional) return "conditional";
  return "active";
}

// ─── Audit data types ─────────────────────────────────────────────────────────

interface LotRecord {
  id: string;
  materialId: string;
  materialName: string;
  lotNumber: string;
  unit: string;
  quantityReceived: number;
  quantityRemaining: number;
  status: string;
  expirationDate: Date | null;
  isConditional: boolean;
}

interface DiscrepancyEntry {
  inventoryLotId: string;
  materialName: string;
  lotNumber: string;
  unit: string;
  expectedTotalDeduction: number;
  actualBatchSheetDeduction: number;
  discrepancy: number;
  currentQtyRemaining: number;
  projectedQtyRemaining: number;
  submissionsAffected: number;
  direction: "over_deducted" | "under_deducted";
}

interface CorrectedLotEntry {
  inventoryLotId: string;
  materialName: string;
  lotNumber: string;
  unit: string;
  originalWrongDeduction: number;
  correctDeduction: number;
  totalCorrectionsApplied: number;
  currentQtyRemaining: number;
  status: "corrected";
}

interface NfcGapEntry {
  submissionId: string;
  productionLot: string | null;
  templateName: string | null;
  materialId: string;
  materialName: string;
  expectedQty: number;
  actualQty: number;
  gap: number;
}

interface NfcExcludedEntry {
  exclusionId: string;
  submissionId: string;
  productionLot: string | null;
  templateName: string | null;
  materialId: string;
  materialName: string;
  expectedQty: number;
  actualQty: number;
  gap: number;
  exclusionReason: string;
  excludedBy: string | null;
  excludedAt: string;
}

interface NfcNoStockEntry {
  submissionId: string;
  productionLot: string | null;
  templateName: string | null;
  materialId: string;
  materialName: string;
  expectedQty: number;
  note: string;
}

interface OrphanedMovement {
  id: string;
  materialName: string;
  lotNumber: string;
  quantity: number;
  unit: string;
  referenceId: string;
  referenceNumber: string;
  submissionStatus: string | null;
  reason: "no_submission" | "draft_submission";
}

// ─── Core audit builder ───────────────────────────────────────────────────────

async function buildAudit() {
  // 1. All finished submissions
  const submissions = await prisma.batchSheetSubmission.findMany({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: { status: { in: FINISHED_STATUSES as any } },
    select: {
      id: true,
      productionLot: true,
      templateName: true,
      submittedAt: true,
      status: true,
      section3: true,
    },
    orderBy: { submittedAt: "asc" },
  });

  // 2. First pass: collect all explicitly referenced lot IDs and NFC material IDs
  const explicitLotIds = new Set<string>();
  const nfcMaterialSubmissions: Array<{
    submissionId: string;
    productionLot: string | null;
    templateName: string | null;
    materialId: string;
    materialName: string;
    expectedQty: number;
  }> = [];

  for (const sub of submissions) {
    const s3 = sub.section3 as Section3 | null;
    if (!s3) continue;

    // Ingredients
    for (const ing of s3.ingredients ?? []) {
      const entries = ing.lots?.length
        ? ing.lots
        : ing.use_inventory
        ? (ing.inventory_lots ?? [])
        : [];
      for (const e of entries) {
        const lotId = e.inventory_lot_id ?? e.lot_id ?? null;
        if (lotId) explicitLotIds.add(lotId);
      }
    }

    // Packaging
    for (const pres of s3.presentations ?? []) {
      if (!pres.selected) continue;
      for (const mat of pres.materials ?? []) {
        if (mat.food_contact === false) {
          // NFC — FIFO based, track separately
          const qty = mat.total_qty_used ?? mat.lots?.[0]?.qty_used ?? 0;
          if (mat.id && qty > 0) {
            nfcMaterialSubmissions.push({
              submissionId: sub.id,
              productionLot: sub.productionLot,
              templateName: sub.templateName,
              materialId: mat.id,
              materialName: mat.name ?? mat.id,
              expectedQty: qty,
            });
          }
        } else {
          // Food contact — explicit lot selection
          for (const e of mat.lots ?? []) {
            if (e.inventory_lot_id) explicitLotIds.add(e.inventory_lot_id);
          }
        }
      }
    }
  }

  // 3. Batch-fetch all referenced lots
  const lotRows = await prisma.inventoryLot.findMany({
    where: { id: { in: Array.from(explicitLotIds) } },
    select: {
      id: true, materialId: true, materialName: true, lotNumber: true,
      unit: true, quantityReceived: true, quantityRemaining: true,
      status: true, expirationDate: true, isConditional: true,
    },
  });
  const lotMap = new Map<string, LotRecord>(lotRows.map((l) => [l.id, l]));

  // 4. Build expected deduction totals per lot (explicit lots only)
  const expectedByLot = new Map<string, number>(); // lotId → total expected
  const submissionsPerLot = new Map<string, Set<string>>();
  const conversionErrors: string[] = [];

  for (const sub of submissions) {
    const s3 = sub.section3 as Section3 | null;
    if (!s3) continue;

    const label = sub.productionLot ?? sub.id.slice(0, 8).toUpperCase();

    // Ingredients
    for (const ing of s3.ingredients ?? []) {
      const entries = ing.lots?.length
        ? ing.lots
        : ing.use_inventory
        ? (ing.inventory_lots ?? [])
        : [];
      const batchUnit = ing.unit;

      for (const e of entries) {
        const lotId = e.inventory_lot_id ?? e.lot_id ?? null;
        const rawQty = e.qty_used_from_this_lot ?? e.qty_used ?? 0;
        if (!lotId || !rawQty) continue;

        const lot = lotMap.get(lotId);
        if (!lot) continue;

        let correctQty = rawQty;
        if (batchUnit && batchUnit !== lot.unit) {
          const conv = convertUnit(rawQty, batchUnit, lot.unit);
          if (!conv.possible) {
            conversionErrors.push(`[${label}] ${ing.name ?? lotId}: cannot convert ${batchUnit} → ${lot.unit}`);
            continue;
          }
          correctQty = conv.result;
        }

        expectedByLot.set(lotId, (expectedByLot.get(lotId) ?? 0) + correctQty);
        if (!submissionsPerLot.has(lotId)) submissionsPerLot.set(lotId, new Set());
        submissionsPerLot.get(lotId)!.add(sub.id);
      }
    }

    // Food contact packaging
    for (const pres of s3.presentations ?? []) {
      if (!pres.selected) continue;
      for (const mat of pres.materials ?? []) {
        if (mat.food_contact === false) continue;
        for (const e of mat.lots ?? []) {
          const lotId = e.inventory_lot_id ?? null;
          const rawQty = e.qty_used ?? 0;
          if (!lotId || !rawQty) continue;

          const lot = lotMap.get(lotId);
          if (!lot) continue;

          let correctQty = rawQty as number;
          const batchUnit = e.unit;
          if (batchUnit && batchUnit !== lot.unit) {
            const conv = convertUnit(rawQty, batchUnit, lot.unit);
            if (!conv.possible) {
              conversionErrors.push(`[${label}] ${mat.name ?? lotId}: cannot convert ${batchUnit} → ${lot.unit}`);
              continue;
            }
            correctQty = conv.result;
          }

          expectedByLot.set(lotId, (expectedByLot.get(lotId) ?? 0) + correctQty);
          if (!submissionsPerLot.has(lotId)) submissionsPerLot.set(lotId, new Set());
          submissionsPerLot.get(lotId)!.add(sub.id);
        }
      }
    }
  }

  // 5. Fetch actual movements for explicit lots
  // Only out_batch_sheet (non-FIFO) is used for the batch-deduction comparison.
  // AUDIT-CORRECTION movements are tracked separately to compute net discrepancy.
  const lotIdList = Array.from(explicitLotIds);

  const batchSheetMovements = await prisma.inventoryMovement.findMany({
    where: {
      movementType: "out_batch_sheet",
      inventoryLotId: { in: lotIdList },
    },
    select: { inventoryLotId: true, quantity: true, notes: true },
  });

  // Only AUDIT-CORRECTION movements count toward resolving batch-sheet discrepancies.
  // Other corrections (cycle counts, unit fixes, etc.) are not audit-generated and
  // must not be folded into the audit formula — doing so caused the feedback loop.
  const correctionMovements = await prisma.inventoryMovement.findMany({
    where: {
      movementType: { in: ["in_correction", "out_correction"] },
      inventoryLotId: { in: lotIdList },
      referenceNumber: { startsWith: "AUDIT-CORRECTION" },
    },
    select: { inventoryLotId: true, movementType: true, quantity: true },
  });

  // batchDeductionByLot: sum of |quantity| for non-FIFO out_batch_sheet movements
  const batchDeductionByLot = new Map<string, number>();
  for (const m of batchSheetMovements) {
    if (m.notes?.includes("FIFO")) continue; // NFC is audited separately
    batchDeductionByLot.set(
      m.inventoryLotId,
      (batchDeductionByLot.get(m.inventoryLotId) ?? 0) + Math.abs(m.quantity)
    );
  }

  // netAuditCorrectionByLot: signed sum of AUDIT-CORRECTION movements per lot
  // in_correction = +|qty| (stock added back), out_correction = -|qty| (stock removed)
  const netAuditCorrectionByLot = new Map<string, number>();
  for (const m of correctionMovements) {
    const signed = m.movementType === "in_correction" ? Math.abs(m.quantity) : -Math.abs(m.quantity);
    netAuditCorrectionByLot.set(
      m.inventoryLotId,
      (netAuditCorrectionByLot.get(m.inventoryLotId) ?? 0) + signed
    );
  }

  // 6. Classify each lot: clean | corrected | discrepancy
  // Formula: netDiscrepancy = rawDiscrepancy - totalAuditCorrections
  //   rawDiscrepancy  = actualBatchDeduction - expected   (+ve = over-deducted, -ve = under)
  //   totalAuditCorrections = net signed sum of AUDIT-CORRECTION movements
  //     (+ve = stock was added back, -ve = stock was further removed)
  // When netDiscrepancy ≈ 0, prior corrections fully resolved the batch-sheet mismatch.
  const discrepancies: DiscrepancyEntry[] = [];
  const correctedLots: CorrectedLotEntry[] = [];

  for (const [lotId, expected] of Array.from(expectedByLot.entries())) {
    const lot = lotMap.get(lotId);
    if (!lot) continue;

    const actualBatchDeduction = batchDeductionByLot.get(lotId) ?? 0;
    const rawDiscrepancy = actualBatchDeduction - expected; // +ve = over-deducted, -ve = under

    // No batch-sheet discrepancy at all — clean
    if (Math.abs(rawDiscrepancy) <= TOLERANCE) continue;

    // Subtract any AUDIT-CORRECTION movements that already addressed this discrepancy
    const totalAuditCorrections = netAuditCorrectionByLot.get(lotId) ?? 0;
    const netDiscrepancy = rawDiscrepancy - totalAuditCorrections;

    if (Math.abs(netDiscrepancy) <= TOLERANCE) {
      // Prior audit corrections fully resolved the discrepancy
      correctedLots.push({
        inventoryLotId: lotId,
        materialName: lot.materialName,
        lotNumber: lot.lotNumber,
        unit: lot.unit,
        originalWrongDeduction: Math.round(actualBatchDeduction * 10000) / 10000,
        correctDeduction: Math.round(expected * 10000) / 10000,
        totalCorrectionsApplied: Math.round(Math.abs(totalAuditCorrections) * 10000) / 10000,
        currentQtyRemaining: lot.quantityRemaining,
        status: "corrected",
      });
    } else {
      // Real discrepancy remains — compute projected remaining after correction
      // netDiscrepancy > 0: over-deducted (need to add back) → remaining goes up
      // netDiscrepancy < 0: under-deducted (need to remove more) → remaining goes down
      const projectedQtyRemaining = Math.max(
        0,
        Math.min(lot.quantityReceived, lot.quantityRemaining + netDiscrepancy)
      );

      discrepancies.push({
        inventoryLotId: lotId,
        materialName: lot.materialName,
        lotNumber: lot.lotNumber,
        unit: lot.unit,
        expectedTotalDeduction: Math.round(expected * 10000) / 10000,
        actualBatchSheetDeduction: Math.round(actualBatchDeduction * 10000) / 10000,
        discrepancy: Math.round(netDiscrepancy * 10000) / 10000,
        currentQtyRemaining: lot.quantityRemaining,
        projectedQtyRemaining: Math.round(projectedQtyRemaining * 10000) / 10000,
        submissionsAffected: submissionsPerLot.get(lotId)?.size ?? 0,
        direction: netDiscrepancy > 0 ? "over_deducted" : "under_deducted",
      });
    }
  }

  // 7. NFC packaging gap analysis
  // Load exclusions so resolved gaps can be separated from open gaps
  const exclusionRows = await prisma.inventoryAuditExclusion.findMany({
    select: {
      id: true,
      submissionId: true,
      materialId: true,
      exclusionReason: true,
      excludedAt: true,
      excludedBy: { select: { name: true } },
    },
  });
  const exclusionMap = new Map(
    exclusionRows.map((e) => [`${e.submissionId}:${e.materialId}`, e])
  );

  // Fetch all FIFO movements grouped by (referenceId, materialId)
  const allFifoMovements = await prisma.inventoryMovement.findMany({
    where: {
      movementType: "out_batch_sheet",
      notes: { contains: "FIFO" },
    },
    select: { referenceId: true, materialId: true, quantity: true },
  });

  const fifoActual = new Map<string, number>(); // `${submissionId}:${materialId}` → total
  for (const m of allFifoMovements) {
    const key = `${m.referenceId}:${m.materialId}`;
    fifoActual.set(key, (fifoActual.get(key) ?? 0) + Math.abs(m.quantity));
  }

  // Batch-check which NFC materials with gaps have active inventory lots
  const gappedMaterialIds = new Set<string>();
  for (const entry of nfcMaterialSubmissions) {
    const key = `${entry.submissionId}:${entry.materialId}`;
    const actual = fifoActual.get(key) ?? 0;
    if (entry.expectedQty - actual > TOLERANCE) {
      gappedMaterialIds.add(entry.materialId);
    }
  }

  const materialsWithActiveLots = gappedMaterialIds.size
    ? await prisma.inventoryLot.findMany({
        where: {
          materialId: { in: Array.from(gappedMaterialIds) },
          status: { in: ["active", "low_stock", "conditional"] },
        },
        select: { materialId: true },
        distinct: ["materialId"],
      })
    : [];
  const hasActiveLots = new Set(materialsWithActiveLots.map((l) => l.materialId));

  const nfcGaps: NfcGapEntry[] = [];
  const nfcExcluded: NfcExcludedEntry[] = [];
  const nfcNoStock: NfcNoStockEntry[] = [];

  for (const entry of nfcMaterialSubmissions) {
    const key = `${entry.submissionId}:${entry.materialId}`;
    const actual = fifoActual.get(key) ?? 0;
    const gap = entry.expectedQty - actual;
    if (gap <= TOLERANCE) continue; // No gap — nothing to report

    // Check exclusion first
    const exclusion = exclusionMap.get(key);
    if (exclusion) {
      nfcExcluded.push({
        exclusionId: exclusion.id,
        submissionId: entry.submissionId,
        productionLot: entry.productionLot,
        templateName: entry.templateName,
        materialId: entry.materialId,
        materialName: entry.materialName,
        expectedQty: Math.round(entry.expectedQty * 10000) / 10000,
        actualQty: Math.round(actual * 10000) / 10000,
        gap: Math.round(gap * 10000) / 10000,
        exclusionReason: exclusion.exclusionReason,
        excludedBy: exclusion.excludedBy?.name ?? null,
        excludedAt: exclusion.excludedAt.toISOString(),
      });
      continue;
    }

    // No active lots → cannot be FIFO-deducted; inform admin but don't flag as error
    if (!hasActiveLots.has(entry.materialId)) {
      nfcNoStock.push({
        submissionId: entry.submissionId,
        productionLot: entry.productionLot,
        templateName: entry.templateName,
        materialId: entry.materialId,
        materialName: entry.materialName,
        expectedQty: Math.round(entry.expectedQty * 10000) / 10000,
        note:
          "No active inventory lots exist for this material. " +
          "Add initial stock or exclude this gap if the material is not tracked in inventory.",
      });
      continue;
    }

    // Active lots exist but FIFO deduction didn't run — real open gap
    nfcGaps.push({
      submissionId: entry.submissionId,
      productionLot: entry.productionLot,
      templateName: entry.templateName,
      materialId: entry.materialId,
      materialName: entry.materialName,
      expectedQty: Math.round(entry.expectedQty * 10000) / 10000,
      actualQty: Math.round(actual * 10000) / 10000,
      gap: Math.round(gap * 10000) / 10000,
    });
  }

  // 8. Orphaned movements: out_batch_sheet where the submission is missing or still DRAFT
  const orphanedRaw = await prisma.$queryRaw<
    Array<{
      id: string;
      materialName: string;
      lotNumber: string;
      quantity: number;
      unit: string;
      referenceId: string;
      referenceNumber: string;
      subStatus: string | null;
    }>
  >`
    SELECT
      im.id,
      im."materialName",
      im."lotNumber",
      im.quantity,
      im.unit,
      im."referenceId",
      im."referenceNumber",
      bs.status AS "subStatus"
    FROM inventory_movements im
    LEFT JOIN batch_sheet_submissions bs ON im."referenceId" = bs.id
    WHERE im."movementType" = 'out_batch_sheet'
      AND (bs.id IS NULL OR bs.status = 'DRAFT')
  `;

  const orphaned: OrphanedMovement[] = orphanedRaw.map((r) => ({
    id: r.id,
    materialName: r.materialName,
    lotNumber: r.lotNumber,
    quantity: r.quantity,
    unit: r.unit,
    referenceId: r.referenceId,
    referenceNumber: r.referenceNumber,
    submissionStatus: r.subStatus,
    reason: r.subStatus === null ? "no_submission" : "draft_submission",
  }));

  return {
    submissions,
    lotMap,
    discrepancies,
    correctedLots,
    nfcGaps,
    nfcExcluded,
    nfcNoStock,
    orphaned,
    conversionErrors,
    lotsChecked: explicitLotIds.size,
    nfcSubmissionPairs: nfcMaterialSubmissions.length,
  };
}

// ─── GET — dry-run audit report ───────────────────────────────────────────────

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role } = session.user as { role: string };
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const audit = await buildAudit();

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      submissionsAnalyzed: audit.submissions.length,
      lotsChecked: audit.lotsChecked,
      nfcSubmissionPairsChecked: audit.nfcSubmissionPairs,
      discrepancies: audit.discrepancies,
      correctedLots: audit.correctedLots,
      nfcGaps: audit.nfcGaps,
      nfcExcluded: audit.nfcExcluded,
      nfcNoStock: audit.nfcNoStock,
      orphanedMovements: audit.orphaned,
      conversionErrors: audit.conversionErrors,
      summary: {
        discrepanciesFound: audit.discrepancies.length,
        overDeducted: audit.discrepancies.filter((d) => d.direction === "over_deducted").length,
        underDeducted: audit.discrepancies.filter((d) => d.direction === "under_deducted").length,
        correctedLotsCount: audit.correctedLots.length,
        nfcGapsFound: audit.nfcGaps.length,
        nfcNoStockCount: audit.nfcNoStock.length,
        nfcExcludedCount: audit.nfcExcluded.length,
        orphanedMovementsFound: audit.orphaned.length,
        correctionErrors: audit.conversionErrors.length,
        clean:
          audit.discrepancies.length === 0 &&
          audit.nfcGaps.length === 0 &&
          audit.orphaned.length === 0,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/inventory-audit]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// ─── POST — apply corrections ─────────────────────────────────────────────────

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role, id: adminId } = session.user as { role: string; id: string };
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const audit = await buildAudit();

    if (audit.discrepancies.length === 0 && audit.nfcGaps.length === 0) {
      return NextResponse.json({
        message: "No corrections needed — audit is clean.",
        correctionsApplied: 0,
        nfcDeductionsApplied: 0,
        nfcNoStockSkipped: audit.nfcNoStock.length,
        corrections: [],
      });
    }

    const dateTag = new Date().toISOString().slice(0, 10);
    const refNumber = `AUDIT-CORRECTION-${dateTag}`;

    type CorrectionResult = {
      lotId: string;
      materialName: string;
      lotNumber: string;
      unit: string;
      movementType: string;
      adjustmentQty: number;
      previousQtyRemaining: number;
      newQtyRemaining: number;
    };

    const corrections: CorrectionResult[] = [];

    // Apply explicit-lot corrections in a single transaction
    if (audit.discrepancies.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const disc of audit.discrepancies) {
          // Re-fetch lot inside transaction for consistent state
          const lot = await tx.inventoryLot.findUnique({
            where: { id: disc.inventoryLotId },
            select: {
              id: true, materialId: true, materialName: true, lotNumber: true,
              unit: true, quantityRemaining: true, quantityReceived: true,
              expirationDate: true, isConditional: true,
            },
          });
          if (!lot) continue;

          const adj = disc.discrepancy; // positive = over-deducted → add back; negative = under-deducted → remove more
          if (Math.abs(adj) < TOLERANCE) continue; // idempotency guard
          const movementType = adj > 0 ? "in_correction" : "out_correction";
          const adjustmentAbs = Math.abs(adj);
          const qtyBefore = lot.quantityRemaining;

          // Compute corrected qty and clamp
          let newQty: number;
          if (adj > 0) {
            // Over-deducted: add back (cap at quantityReceived)
            newQty = Math.min(lot.quantityReceived, lot.quantityRemaining + adjustmentAbs);
          } else {
            // Under-deducted: deduct more (floor at 0)
            newQty = Math.max(0, lot.quantityRemaining - adjustmentAbs);
          }

          const notes =
            adj > 0
              ? `Audit correction: over-deducted by ${adjustmentAbs.toFixed(4)} ${lot.unit} across ${disc.submissionsAffected} batch sheet(s). Ref: ${refNumber}`
              : `Audit correction: under-deducted by ${adjustmentAbs.toFixed(4)} ${lot.unit} across ${disc.submissionsAffected} batch sheet(s). Ref: ${refNumber}`;

          await tx.inventoryMovement.create({
            data: {
              inventoryLotId: lot.id,
              materialId: lot.materialId,
              materialName: lot.materialName,
              lotNumber: lot.lotNumber,
              movementType,
              quantity: adj > 0 ? adjustmentAbs : -adjustmentAbs,
              unit: lot.unit,
              referenceType: "audit",
              referenceId: `audit-${dateTag}`,
              referenceNumber: refNumber,
              quantityBefore: qtyBefore,
              quantityAfter: newQty,
              performedById: adminId,
              notes,
            },
          });

          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: {
              quantityRemaining: newQty,
              status: computeLotStatus(lot, newQty),
            },
          });

          corrections.push({
            lotId: lot.id,
            materialName: lot.materialName,
            lotNumber: lot.lotNumber,
            unit: lot.unit,
            movementType,
            adjustmentQty: adj > 0 ? adjustmentAbs : -adjustmentAbs,
            previousQtyRemaining: qtyBefore,
            newQtyRemaining: newQty,
          });
        }
      });
    }

    // Apply NFC gaps via individual FIFO deductions (each is its own transaction)
    // This mirrors the processNfcPackagingFIFO pattern but inlined here so we avoid
    // a circular import from batch-sheet/route.ts at this call site.
    let nfcDeductionsApplied = 0;

    for (const gap of audit.nfcGaps) {
      const deducted = await applyNfcFifoCorrection(
        gap.materialId,
        gap.materialName,
        gap.gap,
        gap.submissionId,
        gap.productionLot ?? gap.submissionId.slice(0, 8).toUpperCase(),
        adminId,
        refNumber
      );
      if (deducted > 0) nfcDeductionsApplied++;
    }

    // Post-correction verification: re-run audit to detect any residual discrepancies
    const postAudit = await buildAudit();
    const residualWarnings = postAudit.discrepancies.map((d) => ({
      lotNumber: d.lotNumber,
      materialName: d.materialName,
      remainingDiscrepancy: d.discrepancy,
      direction: d.direction,
    }));

    return NextResponse.json({
      message: `Applied ${corrections.length} lot correction(s) and ${nfcDeductionsApplied} NFC gap correction(s). Reference: ${refNumber}`,
      correctionsApplied: corrections.length,
      nfcDeductionsApplied,
      corrections,
      nfcGapsAddressed: nfcDeductionsApplied,
      ...(residualWarnings.length > 0 && {
        warnings: `${residualWarnings.length} lot(s) still show discrepancies after correction — manual review may be needed.`,
        residualDiscrepancies: residualWarnings,
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/inventory-audit]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// Applies a FIFO deduction for the missing NFC quantity on a given submission+material.
// Idempotency: skips if a FIFO movement already covers the remaining gap.
async function applyNfcFifoCorrection(
  materialId: string,
  materialName: string,
  gapQty: number,
  submissionId: string,
  refNumber: string,
  performedById: string,
  auditRefNumber: string
): Promise<number> {
  try {
    let deducted = 0;
    await prisma.$transaction(async (tx) => {
      // Idempotency: check remaining gap after any existing FIFO movements
      const existing = await tx.inventoryMovement.findMany({
        where: {
          referenceId: submissionId,
          materialId,
          movementType: "out_batch_sheet",
          notes: { contains: "FIFO" },
        },
        select: { quantity: true },
      });
      const alreadyDeducted = existing.reduce(
        (sum, m) => sum + Math.abs(m.quantity),
        0
      );
      const remaining = gapQty - alreadyDeducted;
      if (remaining <= TOLERANCE) return; // Already covered

      const lots = await tx.inventoryLot.findMany({
        where: { materialId, status: { in: ["active", "low_stock", "conditional"] } },
        orderBy: [{ receivedDate: "asc" }, { createdAt: "asc" }],
      });

      let toDeduct = remaining;
      for (const lot of lots) {
        if (toDeduct <= 0) break;
        if (lot.quantityRemaining <= 0) continue;

        const take = Math.min(lot.quantityRemaining, toDeduct);
        const newQty = Math.max(0, lot.quantityRemaining - take);

        await tx.inventoryMovement.create({
          data: {
            inventoryLotId: lot.id,
            materialId: lot.materialId,
            materialName: lot.materialName,
            lotNumber: lot.lotNumber,
            movementType: "out_batch_sheet",
            quantity: -Math.abs(take),
            unit: lot.unit,
            referenceType: "batch_sheet",
            referenceId: submissionId,
            referenceNumber: refNumber,
            quantityBefore: lot.quantityRemaining,
            quantityAfter: newQty,
            performedById,
            notes: `Auto-deducted via FIFO (non-food contact packaging) — audit correction ${auditRefNumber}`,
          },
        });

        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: {
            quantityRemaining: newQty,
            status: computeLotStatus(lot, newQty),
          },
        });

        deducted += take;
        toDeduct -= take;
      }
    });
    return deducted;
  } catch (err) {
    console.error(
      `[applyNfcFifoCorrection] Failed for material ${materialId} submission ${submissionId}:`,
      err
    );
    return 0;
  }
}
