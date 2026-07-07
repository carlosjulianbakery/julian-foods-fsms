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

interface BatchSheetContribution {
  submission_id: string;
  production_lot: string | null;
  production_date: string | null;
  template_name: string | null;
  batch_qty_used: number;
  batch_unit: string;
  converted_qty: number;
  lot_unit: string;
  movement_recorded: number | null;
  is_correct: boolean;
  difference: number;
}

interface CorrectionHistoryEntry {
  movement_id: string;
  movement_type: string;
  quantity: number;
  unit: string;
  reference_number: string;
  performed_at: string;
  performed_by_name: string | null;
}

interface DiscrepancyDetailSummary {
  total_expected: number;
  total_actually_deducted: number;
  total_corrections_applied: number;
  net_position_after_corrections: number;
  current_quantity_remaining: number;
  correct_quantity_remaining: number;
  would_go_negative: boolean;
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
  batch_sheet_contributions: BatchSheetContribution[];
  correction_history: CorrectionHistoryEntry[];
  summary: DiscrepancyDetailSummary;
  recommendation: string;
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

// ─── Recommendation generator ────────────────────────────────────────────────

function r4(n: number): string {
  return String(Math.round(n * 10000) / 10000);
}

function generateRecommendation(
  contributions: BatchSheetContribution[],
  correctionHistory: CorrectionHistoryEntry[],
  detailSummary: DiscrepancyDetailSummary,
  unit: string
): string {
  const abs = Math.abs(detailSummary.net_position_after_corrections);
  const parts: string[] = [];

  if (detailSummary.would_go_negative) {
    parts.push(
      `⚠ Applying this correction would result in negative stock (${r4(detailSummary.correct_quantity_remaining)} ${unit}). Manual review recommended before proceeding.`
    );
  }

  const wrongEntries = contributions.filter((c) => !c.is_correct && c.movement_recorded !== null);
  const missingEntries = contributions.filter((c) => c.movement_recorded === null);
  const unitMismatchEntries = contributions.filter(
    (c) => !c.is_correct && c.movement_recorded !== null && c.batch_unit !== c.lot_unit
  );

  if (contributions.length === 1 && unitMismatchEntries.length === 1) {
    const c = unitMismatchEntries[0];
    parts.push(
      `One batch sheet recorded the quantity in ${c.batch_unit} but deducted it as ${c.lot_unit}. ` +
      `Applying a correction of ${r4(abs)} ${unit} will bring this lot to its correct level.`
    );
  } else if (contributions.length > 1) {
    const correctCount = contributions.length - wrongEntries.length - missingEntries.length;
    const unitErrStr = unitMismatchEntries.length > 0
      ? `, ${unitMismatchEntries.length} unit conversion error${unitMismatchEntries.length !== 1 ? "s" : ""}`
      : "";
    const missingStr = missingEntries.length > 0
      ? `, ${missingEntries.length} missing movement${missingEntries.length !== 1 ? "s" : ""}`
      : "";
    parts.push(
      `${contributions.length} batch sheets used this lot. ` +
      `${correctCount} recorded correctly${unitErrStr}${missingStr}. ` +
      `Total correction needed: ${r4(abs)} ${unit}.`
    );
  } else if (contributions.length === 1) {
    parts.push(
      `A discrepancy of ${r4(abs)} ${unit} was found in one batch sheet. ` +
      `Applying a correction will bring this lot to its correct level.`
    );
  }

  if (correctionHistory.length > 0 && Math.abs(detailSummary.total_corrections_applied) > TOLERANCE) {
    const dates = Array.from(new Set(
      correctionHistory.map((c) =>
        new Date(c.performed_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles",
        })
      )
    )).join(", ");
    parts.push(
      `Previous corrections of ${r4(Math.abs(detailSummary.total_corrections_applied))} ${unit} were applied on ${dates}.`
    );
    if (abs > TOLERANCE) {
      parts.push(`A remaining gap of ${r4(abs)} ${unit} still exists.`);
    }
  }

  return parts.join(" ") || `A discrepancy of ${r4(abs)} ${unit} was detected.`;
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
      productionDate: true,
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
  // Per-submission-per-lot contribution tracking (for detail view)
  const batchContribByLot = new Map<string, Map<string, BatchSheetContribution>>();

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
        // Track per-submission contribution
        if (!batchContribByLot.has(lotId)) batchContribByLot.set(lotId, new Map());
        const prevIngContrib = batchContribByLot.get(lotId)!.get(sub.id);
        const subDate = (sub as unknown as { productionDate?: Date }).productionDate?.toISOString() ?? sub.submittedAt.toISOString();
        if (prevIngContrib) {
          prevIngContrib.batch_qty_used += rawQty;
          prevIngContrib.converted_qty += correctQty;
        } else {
          batchContribByLot.get(lotId)!.set(sub.id, {
            submission_id: sub.id,
            production_lot: sub.productionLot,
            production_date: subDate,
            template_name: sub.templateName,
            batch_qty_used: rawQty,
            batch_unit: batchUnit ?? lot.unit,
            converted_qty: correctQty,
            lot_unit: lot.unit,
            movement_recorded: null,
            is_correct: false,
            difference: 0,
          });
        }
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
          // Track per-submission contribution
          if (!batchContribByLot.has(lotId)) batchContribByLot.set(lotId, new Map());
          const prevPkgContrib = batchContribByLot.get(lotId)!.get(sub.id);
          const subDatePkg = (sub as unknown as { productionDate?: Date }).productionDate?.toISOString() ?? sub.submittedAt.toISOString();
          if (prevPkgContrib) {
            prevPkgContrib.batch_qty_used += rawQty as number;
            prevPkgContrib.converted_qty += correctQty;
          } else {
            batchContribByLot.get(lotId)!.set(sub.id, {
              submission_id: sub.id,
              production_lot: sub.productionLot,
              production_date: subDatePkg,
              template_name: sub.templateName,
              batch_qty_used: rawQty as number,
              batch_unit: e.unit ?? lot.unit,
              converted_qty: correctQty,
              lot_unit: lot.unit,
              movement_recorded: null,
              is_correct: false,
              difference: 0,
            });
          }
        }
      }
    }
  }

  // 5. Fetch actual movements for explicit lots
  const lotIdList = Array.from(explicitLotIds);

  const batchSheetMovements = await prisma.inventoryMovement.findMany({
    where: {
      movementType: "out_batch_sheet",
      inventoryLotId: { in: lotIdList },
    },
    select: { inventoryLotId: true, quantity: true, notes: true, referenceId: true },
  });

  // totalINByLot: sum of all incoming movements (initial stock + receiving + cycle count
  // corrections). Used with expectedByLot to compute the correct remaining balance,
  // independent of what correction movements have previously been applied.
  const inMovements = await prisma.inventoryMovement.findMany({
    where: {
      inventoryLotId: { in: lotIdList },
      movementType: { in: ["in_initial_stock", "in_receiving", "in_cycle_count_correction"] },
    },
    select: { inventoryLotId: true, quantity: true },
  });
  const totalINByLot = new Map<string, number>();
  for (const m of inMovements) {
    totalINByLot.set(m.inventoryLotId, (totalINByLot.get(m.inventoryLotId) ?? 0) + m.quantity);
  }

  // batchDeductionByLot: sum of |quantity| for non-FIFO out_batch_sheet movements
  const batchDeductionByLot = new Map<string, number>();
  for (const m of batchSheetMovements) {
    if (m.notes?.includes("FIFO")) continue; // NFC is audited separately
    batchDeductionByLot.set(
      m.inventoryLotId,
      (batchDeductionByLot.get(m.inventoryLotId) ?? 0) + Math.abs(m.quantity)
    );
  }

  // movementByLotBySub: lotId → submissionId → total movement qty (for per-contribution matching)
  const movementByLotBySub = new Map<string, Map<string, number>>();
  for (const m of batchSheetMovements) {
    if (m.notes?.includes("FIFO")) continue;
    if (!m.referenceId) continue;
    if (!movementByLotBySub.has(m.inventoryLotId)) movementByLotBySub.set(m.inventoryLotId, new Map());
    movementByLotBySub.get(m.inventoryLotId)!.set(
      m.referenceId,
      (movementByLotBySub.get(m.inventoryLotId)!.get(m.referenceId) ?? 0) + Math.abs(m.quantity)
    );
  }

  // Resolve movement_recorded, is_correct, difference for each contribution
  for (const [lotId, subMap] of Array.from(batchContribByLot.entries())) {
    for (const [subId, contrib] of Array.from(subMap.entries())) {
      const moved = movementByLotBySub.get(lotId)?.get(subId) ?? null;
      contrib.movement_recorded = moved !== null ? Math.round(moved * 10000) / 10000 : null;
      if (moved === null) {
        contrib.is_correct = false;
        contrib.difference = Math.round(-contrib.converted_qty * 10000) / 10000;
      } else {
        contrib.difference = Math.round((moved - contrib.converted_qty) * 10000) / 10000;
        contrib.is_correct = Math.abs(contrib.difference) <= TOLERANCE;
      }
      contrib.batch_qty_used = Math.round(contrib.batch_qty_used * 10000) / 10000;
      contrib.converted_qty = Math.round(contrib.converted_qty * 10000) / 10000;
    }
  }

  // Full correction history per lot (all *CORRECTION* movements, including non-audit ones)
  const correctionHistoryMovements = await prisma.inventoryMovement.findMany({
    where: {
      movementType: { in: ["in_correction", "out_correction"] },
      inventoryLotId: { in: lotIdList },
      referenceNumber: { contains: "CORRECTION" },
    },
    select: {
      id: true, inventoryLotId: true, movementType: true, quantity: true, unit: true,
      referenceNumber: true, performedAt: true,
      performedBy: { select: { name: true } },
    },
    orderBy: { performedAt: "asc" },
  });

  const correctionHistoryByLot = new Map<string, CorrectionHistoryEntry[]>();
  for (const m of correctionHistoryMovements) {
    if (!correctionHistoryByLot.has(m.inventoryLotId)) correctionHistoryByLot.set(m.inventoryLotId, []);
    correctionHistoryByLot.get(m.inventoryLotId)!.push({
      movement_id: m.id,
      movement_type: m.movementType,
      quantity: m.quantity,
      unit: m.unit,
      reference_number: m.referenceNumber ?? "",
      performed_at: m.performedAt.toISOString(),
      performed_by_name: (m.performedBy as { name?: string } | null)?.name ?? null,
    });
  }

  // 6. Classify each lot: clean | corrected | discrepancy
  //
  // Formula: compare the lot's current quantityRemaining to correctRemaining.
  //   totalIN          = sum of all IN movements (initial_stock + receiving + cycle_count_correction)
  //   correctRemaining = max(0, totalIN - expected)
  //   discrepancy      = correctRemaining - quantityRemaining
  //
  // A lot is "corrected" when rawDiscrepancy != 0 but |discrepancy| <= TOLERANCE,
  // meaning the current balance is already correct regardless of how it got there.
  // This avoids re-flagging lots fixed by UNIT-CORRECTION, FLOOR-CORRECTION, etc.
  const discrepancies: DiscrepancyEntry[] = [];
  const correctedLots: CorrectedLotEntry[] = [];

  for (const [lotId, expected] of Array.from(expectedByLot.entries())) {
    const lot = lotMap.get(lotId);
    if (!lot) continue;

    const actualBatchDeduction = batchDeductionByLot.get(lotId) ?? 0;
    const rawDiscrepancy = actualBatchDeduction - expected; // +ve = over-deducted, -ve = under

    // No batch-sheet discrepancy at all — clean
    if (Math.abs(rawDiscrepancy) <= TOLERANCE) continue;

    // Correct remaining = what the balance SHOULD be right now.
    // totalIN accounts for cycle count additions which can exceed quantityReceived.
    const totalIN = totalINByLot.get(lotId) ?? lot.quantityReceived;
    const correctRemaining = Math.max(0, totalIN - expected);

    // discrepancy = how much to add (>0) or remove (<0) to reach correctRemaining
    const discrepancy = correctRemaining - lot.quantityRemaining;

    if (Math.abs(discrepancy) <= TOLERANCE) {
      // Current balance already matches the correct remaining — lot is properly corrected
      const corrHistory = correctionHistoryByLot.get(lotId) ?? [];
      const netCorrectionSum = corrHistory.reduce(
        (s, m) => s + (m.movement_type === "in_correction" ? Math.abs(m.quantity) : -Math.abs(m.quantity)),
        0
      );
      correctedLots.push({
        inventoryLotId: lotId,
        materialName: lot.materialName,
        lotNumber: lot.lotNumber,
        unit: lot.unit,
        originalWrongDeduction: Math.round(actualBatchDeduction * 10000) / 10000,
        correctDeduction: Math.round(expected * 10000) / 10000,
        totalCorrectionsApplied: Math.round(Math.abs(netCorrectionSum) * 10000) / 10000,
        currentQtyRemaining: lot.quantityRemaining,
        status: "corrected",
      });
    } else {
      // Balance differs from what it should be
      // discrepancy > 0: lot has too little (add back) → "over_deducted"
      // discrepancy < 0: lot has too much (remove more) → "under_deducted"
      const contributions = Array.from(batchContribByLot.get(lotId)?.values() ?? []);
      const corrHistory = correctionHistoryByLot.get(lotId) ?? [];
      const netCorrectionSum = corrHistory.reduce(
        (s, m) => s + (m.movement_type === "in_correction" ? Math.abs(m.quantity) : -Math.abs(m.quantity)),
        0
      );

      const detailSummary: DiscrepancyDetailSummary = {
        total_expected: Math.round(expected * 10000) / 10000,
        total_actually_deducted: Math.round(actualBatchDeduction * 10000) / 10000,
        total_corrections_applied: Math.round(netCorrectionSum * 10000) / 10000,
        net_position_after_corrections: Math.round(discrepancy * 10000) / 10000,
        current_quantity_remaining: lot.quantityRemaining,
        correct_quantity_remaining: Math.round(correctRemaining * 10000) / 10000,
        would_go_negative: correctRemaining < -TOLERANCE,
      };

      discrepancies.push({
        inventoryLotId: lotId,
        materialName: lot.materialName,
        lotNumber: lot.lotNumber,
        unit: lot.unit,
        expectedTotalDeduction: Math.round(expected * 10000) / 10000,
        actualBatchSheetDeduction: Math.round(actualBatchDeduction * 10000) / 10000,
        discrepancy: Math.round(discrepancy * 10000) / 10000,
        currentQtyRemaining: lot.quantityRemaining,
        projectedQtyRemaining: Math.round(correctRemaining * 10000) / 10000,
        submissionsAffected: submissionsPerLot.get(lotId)?.size ?? 0,
        direction: discrepancy > 0 ? "over_deducted" : "under_deducted",
        batch_sheet_contributions: contributions,
        correction_history: corrHistory,
        summary: detailSummary,
        recommendation: generateRecommendation(contributions, corrHistory, detailSummary, lot.unit),
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

          // disc.projectedQtyRemaining = correctRemaining = max(0, totalIN - expected)
          // Re-reading qtyBefore here gives the definitive delta to apply.
          // This guarantees: quantityBefore + quantity == quantityAfter (no clamping mismatch).
          const targetQty = disc.projectedQtyRemaining;
          const qtyBefore = lot.quantityRemaining;
          const adj = targetQty - qtyBefore; // signed: positive = add, negative = remove
          if (Math.abs(adj) < TOLERANCE) continue; // already at correct balance
          const movementType = adj > 0 ? "in_correction" : "out_correction";
          const newQty = targetQty; // already floored at 0 by max(0,...) in buildAudit

          const notes =
            adj > 0
              ? `Audit correction: balance too low by ${Math.abs(adj).toFixed(4)} ${lot.unit} (target ${targetQty.toFixed(4)}). Ref: ${refNumber}`
              : `Audit correction: balance too high by ${Math.abs(adj).toFixed(4)} ${lot.unit} (target ${targetQty.toFixed(4)}). Ref: ${refNumber}`;

          await tx.inventoryMovement.create({
            data: {
              inventoryLotId: lot.id,
              materialId: lot.materialId,
              materialName: lot.materialName,
              lotNumber: lot.lotNumber,
              movementType,
              quantity: adj,          // signed delta; before + adj = after
              unit: lot.unit,
              referenceType: "audit",
              referenceId: `audit-${dateTag}`,
              referenceNumber: refNumber,
              quantityBefore: qtyBefore,
              quantityAfter: newQty,  // = qtyBefore + adj
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
            adjustmentQty: adj,
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
