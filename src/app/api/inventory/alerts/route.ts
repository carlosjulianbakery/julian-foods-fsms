import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertUnit, aggregateInStandardUnit } from "@/lib/unitConversion";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlertLotDetail {
  id: string;
  lotNumber: string;
  quantityRemaining: number;
  unit: string;
  receivedDate: string;
  expirationDate: string | null;
  status: string;
}

export interface AlertCard {
  materialId: string;
  materialName: string;
  category: "INGREDIENT" | "PACKAGING" | "OTHER";
  supplierName: string | null;
  alertTypes: string[];
  severity: "critical" | "warning" | "upcoming";

  currentStock: number;
  currentStockUnit: string;
  minimumStockQuantity: number | null;
  minimumStockUnit: string | null;
  surplusOrShortfall: number | null;

  daysUntilStockout: number | null;
  dailyUsageRate: number | null;
  usageHistoryDays: number;

  lots: AlertLotDetail[];

  acknowledgment: {
    id: string;
    note: string | null;
    acknowledgedByName: string;
    acknowledgedAt: string;
    expiresAt: string | null;
  } | null;
}

export interface NoMinimumMaterial {
  materialId: string;
  name: string;
  category: "INGREDIENT" | "PACKAGING" | "OTHER";
  currentStock: number | null;
  unit: string | null;
}

export interface AcknowledgedCard {
  id: string;
  materialId: string;
  materialName: string;
  alertType: string;
  note: string | null;
  acknowledgedByName: string;
  acknowledgedAt: string;
  expiresAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtQty(n: number) {
  return n % 1 === 0 ? n : parseFloat(n.toFixed(3));
}

const ACTIVE_STATUSES = ["active", "low_stock", "conditional", "expiring_soon"];

// ─── GET /api/inventory/alerts ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bustCache = req.nextUrl.searchParams.get("bust") === "1";
  void bustCache; // currently not used server-side; client passes it for cache-busting

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);
  const in60 = new Date(today);
  in60.setDate(today.getDate() + 60);

  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(now.getDate() - 90);

  // 1. Mark newly-expired lots
  await prisma.inventoryLot.updateMany({
    where: { expirationDate: { lt: today }, status: { notIn: ["expired", "recalled"] } },
    data: { status: "expired" },
  });

  // 2. Fetch all active materials
  const allMaterials = await prisma.material.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, category: true, unit: true,
      minimumStockQuantity: true, minimumStockUnit: true,
      suppliers: { take: 1, select: { supplier: { select: { name: true } } } },
    },
  });

  // 3. Fetch all lots (any status except recalled/quarantined)
  const allLots = await prisma.inventoryLot.findMany({
    where: { status: { notIn: ["recalled", "quarantined"] } },
    select: {
      id: true, materialId: true, materialName: true,
      lotNumber: true, quantityRemaining: true, unit: true,
      receivedDate: true, expirationDate: true, status: true, isConditional: true,
    },
    orderBy: { expirationDate: "asc" },
  });

  // 4. Fetch recent movements for all materials (90 days) for stockout estimation
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      movementType: { in: ["out_batch_sheet", "out_manual_adjustment", "out_cycle_count_correction"] },
      performedAt: { gte: ninetyDaysAgo },
    },
    select: { materialId: true, quantity: true, performedAt: true },
  });

  // 5. Fetch active acknowledgments (non-expired, non-resolved)
  const acks = await prisma.stockAlertAcknowledgment.findMany({
    where: {
      isResolved: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { acknowledgedBy: { select: { name: true } } },
  });

  // 6. Group data by material
  const lotsByMaterial = new Map<string, typeof allLots>();
  for (const lot of allLots) {
    const arr = lotsByMaterial.get(lot.materialId) ?? [];
    arr.push(lot);
    lotsByMaterial.set(lot.materialId, arr);
  }

  const movementsByMaterial = new Map<string, Array<{ quantity: number; performedAt: Date }>>();
  for (const m of movements) {
    const arr = movementsByMaterial.get(m.materialId) ?? [];
    arr.push({ quantity: m.quantity, performedAt: m.performedAt });
    movementsByMaterial.set(m.materialId, arr);
  }

  // One active ack per material (highest priority / latest)
  const ackByMaterial = new Map<string, typeof acks[0]>();
  for (const ack of acks) {
    if (!ackByMaterial.has(ack.materialId)) ackByMaterial.set(ack.materialId, ack);
  }

  // 7. Build alert cards

  const criticalCards: AlertCard[] = [];
  const warningCards: AlertCard[] = [];
  const noMinimumMaterials: NoMinimumMaterial[] = [];
  const zeroMinimumMaterialIds: string[] = [];

  // Track which materialIds are already assigned to a severity bucket
  const assigned = new Set<string>();

  function computeStockout(materialId: string, currentStock: number): { daysUntilStockout: number | null; dailyUsageRate: number | null } {
    const mvs = movementsByMaterial.get(materialId);
    if (!mvs || mvs.length === 0) return { daysUntilStockout: null, dailyUsageRate: null };

    const totalUsed = mvs.reduce((sum, m) => sum + Math.abs(m.quantity), 0);
    if (totalUsed === 0) return { daysUntilStockout: null, dailyUsageRate: null };

    const dates = mvs.map((m) => m.performedAt.getTime());
    const firstDate = Math.min(...dates);
    const lastDate = Date.now();
    const daySpan = Math.max(1, (lastDate - firstDate) / 86400000);

    const dailyUsageRate = totalUsed / daySpan;
    const daysUntilStockout = currentStock <= 0 ? 0 : Math.round(currentStock / dailyUsageRate);

    return { daysUntilStockout, dailyUsageRate };
  }

  function buildCard(
    material: typeof allMaterials[0],
    alertTypes: string[],
    severity: AlertCard["severity"],
    currentStock: number,
    currentStockUnit: string,
    surplusOrShortfall: number | null,
    lots: typeof allLots,
    ack: typeof acks[0] | undefined
  ): AlertCard {
    const { daysUntilStockout, dailyUsageRate } = computeStockout(material.id, currentStock);
    return {
      materialId: material.id,
      materialName: material.name,
      category: material.category as AlertCard["category"],
      supplierName: material.suppliers[0]?.supplier?.name ?? null,
      alertTypes,
      severity,
      currentStock: fmtQty(currentStock),
      currentStockUnit,
      minimumStockQuantity: material.minimumStockQuantity,
      minimumStockUnit: material.minimumStockUnit,
      surplusOrShortfall: surplusOrShortfall !== null ? fmtQty(surplusOrShortfall) : null,
      daysUntilStockout,
      dailyUsageRate: dailyUsageRate ? parseFloat(dailyUsageRate.toFixed(4)) : null,
      usageHistoryDays: 90,
      lots: lots.map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        quantityRemaining: fmtQty(l.quantityRemaining),
        unit: l.unit,
        receivedDate: l.receivedDate instanceof Date ? l.receivedDate.toISOString().split("T")[0] : String(l.receivedDate),
        expirationDate: l.expirationDate
          ? (l.expirationDate instanceof Date ? l.expirationDate.toISOString().split("T")[0] : String(l.expirationDate))
          : null,
        status: l.status,
      })),
      acknowledgment: ack
        ? {
            id: ack.id,
            note: ack.note,
            acknowledgedByName: ack.acknowledgedBy.name,
            acknowledgedAt: ack.acknowledgedAt.toISOString(),
            expiresAt: ack.expiresAt ? ack.expiresAt.toISOString() : null,
          }
        : null,
    };
  }

  for (const material of allMaterials) {
    const matLots = lotsByMaterial.get(material.id) ?? [];
    const activeLots = matLots.filter((l) => ACTIVE_STATUSES.includes(l.status) && l.quantityRemaining > 0);
    const expiredWithStock = matLots.filter((l) => l.status === "expired" && l.quantityRemaining > 0);

    // Compute total active stock in standard unit
    const standardUnit = material.unit?.trim() || activeLots[0]?.unit || "";
    let currentStock = 0;
    let currentStockUnit = standardUnit || activeLots[0]?.unit || "";

    if (activeLots.length > 0 && standardUnit) {
      const agg = aggregateInStandardUnit(
        activeLots.map((l) => ({ quantity: l.quantityRemaining, unit: l.unit })),
        standardUnit
      );
      if (agg.possible) {
        currentStock = agg.total;
        currentStockUnit = standardUnit;
      } else {
        // Fall back to sum of raw quantities if units mismatch
        currentStock = activeLots.reduce((s, l) => s + l.quantityRemaining, 0);
        currentStockUnit = activeLots[0]?.unit ?? standardUnit;
      }
    }

    const ack = ackByMaterial.get(material.id);

    // ── No minimum set ──────────────────────────────────────────────────────
    if (material.minimumStockQuantity == null) {
      // Only show in "no minimum" list, not in alerts
      const totalRaw = activeLots.reduce((s, l) => s + l.quantityRemaining, 0);
      noMinimumMaterials.push({
        materialId: material.id,
        name: material.name,
        category: material.category as NoMinimumMaterial["category"],
        currentStock: totalRaw > 0 ? fmtQty(totalRaw) : null,
        unit: currentStockUnit || null,
      });

      // Expired lots with stock: critical even without minimum
      if (expiredWithStock.length > 0) {
        const allRelevantLots = [...activeLots, ...expiredWithStock];
        const card = buildCard(material, ["expired"], "critical", currentStock, currentStockUnit, null, allRelevantLots, ack);
        if (!ack) { criticalCards.push(card); assigned.add(material.id); }
      }
      // Fully depleted (all lots depleted, no active stock): critical even without minimum
      else if (matLots.length > 0 && activeLots.length === 0) {
        const card = buildCard(material, ["depleted"], "critical", 0, currentStockUnit, null, matLots, ack);
        if (!ack) { criticalCards.push(card); assigned.add(material.id); }
      }
      continue;
    }

    // ── Minimum set to 0: buyer opted out of alerting for this material ─────
    if (Number(material.minimumStockQuantity) === 0) {
      zeroMinimumMaterialIds.push(material.id);
      continue;
    }

    // ── Compute minimum in standard unit ────────────────────────────────────
    const minQty = Number(material.minimumStockQuantity);
    const minUnit = material.minimumStockUnit?.trim() || standardUnit;
    let minimumInStandard = minQty;
    if (minUnit && standardUnit && minUnit.toLowerCase() !== standardUnit.toLowerCase()) {
      const conv = convertUnit(minQty, minUnit, standardUnit);
      if (conv.possible) minimumInStandard = conv.result;
    }
    const surplusOrShortfall = currentStock - minimumInStandard;
    const isBelowMin = surplusOrShortfall < 0;

    // ── Classify alert types ────────────────────────────────────────────────

    const alertTypes: string[] = [];
    let severity: AlertCard["severity"] = "upcoming";
    let assigned_severity = false;

    // CRITICAL: expired lots with stock
    if (expiredWithStock.length > 0) {
      alertTypes.push("expired");
      severity = "critical";
      assigned_severity = true;
    }

    // CRITICAL: fully depleted — no active lots at all, no lots at all
    if (!assigned_severity && matLots.length > 0 && activeLots.length === 0 && expiredWithStock.length === 0) {
      alertTypes.push("depleted");
      severity = "critical";
      assigned_severity = true;
    }

    // WARNING: below minimum
    if (isBelowMin) {
      alertTypes.push("below_minimum");
      if (!assigned_severity) {
        severity = "warning";
        assigned_severity = true;
      }
    }

    // WARNING: zero inventory — never received (no lots at all, minimum is set)
    if (matLots.length === 0) {
      alertTypes.push("no_stock");
      if (!assigned_severity) {
        severity = "warning";
        assigned_severity = true;
      }
    }

    // WARNING: expiring ≤30 days
    const expiringWithin30 = activeLots.filter(
      (l) => l.expirationDate && l.expirationDate >= today && l.expirationDate <= in30
    );
    if (expiringWithin30.length > 0) {
      alertTypes.push("expiring_soon");
      if (!assigned_severity) {
        severity = "warning";
        assigned_severity = true;
      }
    }

    // WARNING: expiring 31–60 days (reclassified from upcoming)
    const expiringWithin60 = activeLots.filter(
      (l) => l.expirationDate && l.expirationDate > in30 && l.expirationDate <= in60
    );
    if (expiringWithin60.length > 0) {
      alertTypes.push("expiring_60d");
      if (!assigned_severity) {
        severity = "warning";
        assigned_severity = true;
      }
    }

    if (!assigned_severity) continue; // No alerts for this material

    const allRelevantLots = [...activeLots, ...expiredWithStock];

    const card = buildCard(
      material, alertTypes, severity, currentStock, currentStockUnit,
      matLots.length === 0 ? null : surplusOrShortfall,
      allRelevantLots, ack
    );

    if (ack) {
      assigned.add(material.id); // tracked in acknowledged section
    } else {
      assigned.add(material.id);
      if (severity === "critical") criticalCards.push(card);
      else warningCards.push(card);
    }
  }

  // 8. Build acknowledged section
  const acknowledgedCards: AcknowledgedCard[] = [];
  for (const ack of acks) {
    const mat = allMaterials.find((m) => m.id === ack.materialId);
    if (!mat) continue;
    acknowledgedCards.push({
      id: ack.id,
      materialId: ack.materialId,
      materialName: mat.name,
      alertType: ack.alertType,
      note: ack.note,
      acknowledgedByName: ack.acknowledgedBy.name,
      acknowledgedAt: ack.acknowledgedAt.toISOString(),
      expiresAt: ack.expiresAt ? ack.expiresAt.toISOString() : null,
    });
  }

  // 9. Sort within categories: fewest days-until-stockout first, then largest shortfall, then name
  function sortCards(cards: AlertCard[]) {
    cards.sort((a, b) => {
      const da = a.daysUntilStockout ?? 9999;
      const db = b.daysUntilStockout ?? 9999;
      if (da !== db) return da - db;
      const sa = a.surplusOrShortfall ?? 0;
      const sb = b.surplusOrShortfall ?? 0;
      if (sa !== sb) return sa - sb; // more negative = worse
      return a.materialName.localeCompare(b.materialName);
    });
  }
  sortCards(criticalCards);
  sortCards(warningCards);

  return NextResponse.json({
    summary: {
      criticalCount: criticalCards.length,
      warningCount: warningCards.length,
      acknowledgedCount: acknowledgedCards.length,
      noMinimumCount: noMinimumMaterials.length,
      lastChecked: now.toISOString(),
    },
    noMinimumMaterials,
    zeroMinimumMaterialIds,
    critical: criticalCards,
    warning: warningCards,
    acknowledged: acknowledgedCards,
  });
}
