import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { autoCompleteFormLinkedTasks } from "@/lib/tasks";
import { checkMaterialStockLevel } from "@/lib/inventoryUtils";

export const dynamic = "force-dynamic";

// ── helpers ─────────────────────────────────────────────────────────────────

async function nextRecordNumber(): Promise<string> {
  const count = await prisma.receivingRecord.count();
  return `RCV-${String(count + 1).padStart(4, "0")}`;
}

async function nextQuarantineNumber(): Promise<string> {
  const count = await prisma.quarantineRecord.count();
  return `QR-${String(count + 1).padStart(4, "0")}`;
}

async function updateLotStatus(lotId: string) {
  const lot = await prisma.inventoryLot.findUnique({
    where: { id: lotId },
    select: { materialId: true, expirationDate: true, quantityRemaining: true, isConditional: true, status: true },
  });
  if (!lot) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let status: string;
  if (lot.expirationDate && lot.expirationDate < today) status = "expired";
  else if (lot.quantityRemaining <= 0) status = "depleted";
  else if (lot.isConditional) status = "conditional";
  else status = "active";

  if (status !== lot.status) {
    await prisma.inventoryLot.update({ where: { id: lotId }, data: { status } });
  }
  await checkMaterialStockLevel(lot.materialId);
}

// ── types ────────────────────────────────────────────────────────────────────

interface BatchItem {
  poItemId?: string;
  materialId?: string;
  materialName: string;
  isUnregistered?: boolean;
  lotNumber: string;
  quantityReceived: number;
  unit: string;
  expirationDate?: string;
  temperatureOnArrival?: string;
  coaRequired: boolean;
  coaReceived?: boolean;
  notes?: string;
}

interface ChecklistResults {
  version: number;
  checks: {
    id: string;
    label: string;
    type: string;
    status: string;
    autoSatisfiedFrom?: string | null;
    failedNote?: string | null;
    isQuarantineTrigger: boolean;
  }[];
  allPassed: boolean;
  anyFailed: boolean;
  quarantineTriggered: boolean;
  completedAt: string;
}

interface ChecklistQuarantine {
  reason: string;
  notes?: string;
  isRequired: boolean;
}

// ── POST /api/receiving/batch ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    date,
    timeReceived,
    poId,
    poNumber,
    noPOReason,
    supplierId,
    supplierName: supplierNameInput,
    checklistResults,
    checklistQuarantine,
    items,
  } = body as {
    date: string;
    timeReceived: string;
    poId?: string;
    poNumber?: string;
    noPOReason?: string;
    supplierId?: string;
    supplierName?: string;
    checklistResults?: ChecklistResults;
    checklistQuarantine?: ChecklistQuarantine;
    items: BatchItem[];
  };

  if (!date || !timeReceived) {
    return NextResponse.json({ error: "date and timeReceived are required" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;

  // Resolve supplier name snapshot
  let supplierName = supplierNameInput ?? "";
  if (!supplierName && supplierId) {
    const sup = await prisma.supplier.findUnique({ where: { id: supplierId } });
    supplierName = sup?.name ?? "";
  }

  const createdRecords: { id: string; recordNumber: string; hasQuarantine: boolean; materialName: string; lotNumber: string; quantityReceived: number; unit: string }[] = [];
  const lotIds: string[] = [];

  // Process each item
  for (const item of items) {
    const recordNumber = await nextRecordNumber();
    const isUnregistered = item.isUnregistered ?? !item.materialId;

    // Resolve materialName from DB snapshot if registered
    let materialName = item.materialName;
    if (!isUnregistered && item.materialId) {
      const mat = await prisma.material.findUnique({ where: { id: item.materialId }, select: { name: true } });
      if (mat) materialName = mat.name;
    }

    const record = await prisma.receivingRecord.create({
      data: {
        recordNumber,
        date: new Date(date),
        timeReceived,
        receivedById: userId,
        purchaseOrderNumber: poNumber ?? null,
        poId: poId ?? null,
        poNumber: poNumber ?? null,
        noPOReason: noPOReason ?? null,
        materialId: item.materialId ?? null,
        materialName,
        isUnregisteredMaterial: isUnregistered,
        supplierId: supplierId ?? null,
        supplierName,
        lotNumber: item.lotNumber,
        quantityReceived: item.quantityReceived,
        unit: item.unit,
        expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
        conditionCheck: (checklistResults ?? {}) as never,
        coaRequired: item.coaRequired,
        coaReceived: item.coaRequired ? (item.coaReceived ?? null) : null,
        notes: item.notes ?? null,
      },
    });

    createdRecords.push({ id: record.id, recordNumber: record.recordNumber, hasQuarantine: false, materialName, lotNumber: item.lotNumber, quantityReceived: item.quantityReceived, unit: item.unit });

    // Per-delivery obligations (COA / special risk) — registered materials only
    if (!isUnregistered && item.materialId && supplierId) {
      const mat = await prisma.material.findUnique({
        where: { id: item.materialId },
        select: { coaRequired: true, hasSpecialRisk: true },
      });
      if (mat && (mat.coaRequired || mat.hasSpecialRisk)) {
        const perDeliveryReqs = await prisma.documentRequirement.findMany({
          where: { isActive: true, requirementType: "PER_DELIVERY", triggerType: "material_level" },
        });
        for (const req of perDeliveryReqs) {
          const cond = req.triggerCondition;
          const applies =
            (cond === "coa_required" && mat.coaRequired) ||
            (cond === "has_special_risk" && mat.hasSpecialRisk);
          if (applies) {
            await prisma.perDeliveryObligation.upsert({
              where: { receivingRecordId_requirementId: { receivingRecordId: record.id, requirementId: req.id } },
              create: {
                supplierId,
                materialId: item.materialId!,
                receivingRecordId: record.id,
                lotNumber: item.lotNumber,
                requirementId: req.id,
                status: "pending",
              },
              update: {},
            });
          }
        }
      }
    }

    // Inventory lot — registered materials always create a lot on receipt
    if (!isUnregistered && item.materialId) {
      const lot = await prisma.inventoryLot.create({
        data: {
          materialId: item.materialId,
          materialName,
          supplierId: supplierId ?? null,
          supplierName,
          lotNumber: item.lotNumber,
          receivingRecordId: record.id,
          quantityReceived: item.quantityReceived,
          quantityRemaining: item.quantityReceived,
          unit: item.unit,
          receivedDate: new Date(date),
          expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
          status: "active",
          isConditional: false,
          conditionalNotes: null,
        },
      });

      await prisma.inventoryMovement.create({
        data: {
          inventoryLotId: lot.id,
          materialId: item.materialId,
          materialName,
          lotNumber: item.lotNumber,
          movementType: "in_receiving",
          quantity: item.quantityReceived,
          unit: item.unit,
          referenceType: "receiving_record",
          referenceId: record.id,
          referenceNumber: record.recordNumber,
          quantityBefore: 0,
          quantityAfter: item.quantityReceived,
          performedById: userId,
        },
      });

      lotIds.push(lot.id);
    }


    // Update PO item quantities if linked
    if (poId && item.poItemId && item.materialId) {
      const poItem = await prisma.purchaseOrderItem.findUnique({ where: { id: item.poItemId } });
      if (poItem && !poItem.isFullyReceived) {
        const newQtyReceived = poItem.qtyReceived + item.quantityReceived;
        const newQtyRemaining = Math.max(0, poItem.qtyOrdered - newQtyReceived);
        await prisma.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: {
            qtyReceived: newQtyReceived,
            qtyRemaining: newQtyRemaining,
            isFullyReceived: newQtyRemaining <= 0.001,
          },
        });
      }
    }
  }

  // Checklist-triggered quarantine — attach to first record without an existing quarantine
  if (checklistQuarantine && createdRecords.length > 0) {
    const target = createdRecords.find((r) => !r.hasQuarantine) ?? createdRecords[0];
    try {
      const qrNumber = await nextQuarantineNumber();
      await prisma.quarantineRecord.create({
        data: {
          recordNumber: qrNumber,
          receivingRecordId: target.id,
          materialName: target.materialName,
          supplierName,
          lotNumber: target.lotNumber,
          quantity: target.quantityReceived,
          unit: target.unit,
          quarantineReason: `Food Safety Checklist failure — ${checklistQuarantine.reason}`,
          actionTaken: checklistQuarantine.isRequired
            ? "Mandatory quarantine triggered by failed food safety check."
            : "Quarantine recommended due to food safety concern.",
          quarantineLocation: null,
          adminNotified: false,
          status: "open",
          resolutionNotes: checklistQuarantine.notes ?? null,
        },
      });
    } catch { /* if duplicate — per-item quarantine already covers this record */ }
  }

  // Update lot statuses
  for (const lotId of lotIds) {
    await updateLotStatus(lotId);
  }

  // Update PO status if linked
  let poFullyReceived = false;
  let poOutstandingItems: { materialName: string; qtyRemaining: number; unit: string }[] = [];
  if (poId) {
    const allItems = await prisma.purchaseOrderItem.findMany({ where: { poId } });
    poFullyReceived = allItems.every((it) => it.isFullyReceived);
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: poFullyReceived ? "received" : "partial", updatedAt: new Date() },
    });
    poOutstandingItems = allItems
      .filter((it) => !it.isFullyReceived)
      .map((it) => ({ materialName: it.materialName, qtyRemaining: it.qtyRemaining, unit: it.unit }));
  }

  // Auto-complete linked tasks (fire and forget)
  autoCompleteFormLinkedTasks({
    formType: "receiving",
    submittingUserId: userId,
    submittedAt: new Date(),
    submissionId: createdRecords[0]?.id ?? "",
    prismaClient: prisma,
  }).catch((e) => console.error("[task auto-complete] batch receiving:", e));

  return NextResponse.json({
    records: createdRecords.map(({ id, recordNumber }) => ({ id, recordNumber })),
    count: createdRecords.length,
    poId: poId ?? null,
    poNumber: poNumber ?? null,
    poFullyReceived,
    poOutstandingItems,
  }, { status: 201 });
}
