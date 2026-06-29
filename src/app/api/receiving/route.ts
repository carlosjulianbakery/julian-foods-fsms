import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { autoCompleteFormLinkedTasks } from "@/lib/tasks";
import { checkMaterialStockLevel } from "@/lib/inventoryUtils";

export const dynamic = "force-dynamic";

async function nextRecordNumber(): Promise<string> {
  const count = await prisma.receivingRecord.count();
  return `RCV-${String(count + 1).padStart(4, "0")}`;
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
  if (lot.expirationDate && lot.expirationDate < today) {
    status = "expired";
  } else if (lot.quantityRemaining <= 0) {
    status = "depleted";
  } else if (lot.isConditional) {
    status = "conditional";
  } else {
    status = "active";
  }

  if (status !== lot.status) {
    await prisma.inventoryLot.update({ where: { id: lotId }, data: { status } });
  }

  // Check total stock across all lots for this material
  await checkMaterialStockLevel(lot.materialId);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo   = searchParams.get("date_to")   ?? "";
  const material = searchParams.get("material")  ?? "";
  const decision = searchParams.get("decision")  ?? "";

  const records = await prisma.receivingRecord.findMany({
    where: {
      ...(dateFrom ? { date: { gte: new Date(dateFrom) } } : {}),
      ...(dateTo   ? { date: { lte: new Date(dateTo + "T23:59:59") } } : {}),
      ...(material ? { materialName: { contains: material, mode: "insensitive" } } : {}),
      ...(decision ? { decision } : {}),
    },
    include: {
      receivedBy: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  let coaFile: File | null = null;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const rawJson = formData.get("data") as string;
    body = JSON.parse(rawJson);
    coaFile = formData.get("coa") as File | null;
  } else {
    body = await req.json();
  }

  const {
    date, timeReceived, purchaseOrderNumber, poId, poNumber, noPOReason,
    materialId, supplierId,
    brandId, brandName,
    lotNumber, quantityReceived, unit, expirationDate, conditionCheck,
    coaRequired, coaReceived, decision, notes, quarantine,
    isUnregisteredMaterial, unregisteredMaterialName, materialCategoryFreetext,
    supplierNameOverride,
  } = body as {
    date: string;
    timeReceived: string;
    purchaseOrderNumber?: string;
    poId?: string;
    poNumber?: string;
    noPOReason?: string;
    materialId?: string;
    supplierId?: string;
    brandId?: string;
    brandName?: string;
    lotNumber: string;
    quantityReceived: number;
    unit: string;
    expirationDate?: string;
    conditionCheck: Record<string, unknown>;
    coaRequired: boolean;
    coaReceived?: boolean;
    decision: string;
    notes?: string;
    quarantine?: {
      quarantineReason: string;
      actionTaken: string;
      quarantineLocation?: string;
      adminNotified: boolean;
    };
    isUnregisteredMaterial?: boolean;
    unregisteredMaterialName?: string;
    materialCategoryFreetext?: string;
    supplierNameOverride?: string;
  };

  // Fetch material snapshot (skip for unregistered items)
  let materialName = unregisteredMaterialName ?? "";
  if (!isUnregisteredMaterial) {
    if (!materialId) return NextResponse.json({ error: "materialId is required" }, { status: 400 });
    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (!material) return NextResponse.json({ error: "Material not found" }, { status: 400 });
    materialName = material.name;
  }

  let supplierName = supplierNameOverride ?? "";
  if (!supplierName && supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    supplierName = supplier?.name ?? "";
  }

  // Upload COA if provided
  let coaDocumentUrl: string | null = null;
  if (coaFile && coaFile.size > 0) {
    const blobPath = `receiving-coas/${materialId ?? "unregistered"}/${lotNumber}/${Date.now()}-${coaFile.name}`;
    const blob = await put(blobPath, coaFile, { access: "private" });
    coaDocumentUrl = blob.url;
  }

  const recordNumber = await nextRecordNumber();
  const userId = (session.user as { id: string }).id;

  const record = await prisma.receivingRecord.create({
    data: {
      recordNumber,
      date: new Date(date),
      timeReceived,
      receivedById: userId,
      purchaseOrderNumber: purchaseOrderNumber ?? poNumber ?? null,
      poId: poId ?? null,
      poNumber: poNumber ?? null,
      noPOReason: noPOReason ?? null,
      materialId: materialId ?? null,
      materialName,
      isUnregisteredMaterial: isUnregisteredMaterial ?? false,
      materialCategoryFreetext: materialCategoryFreetext ?? null,
      supplierId: supplierId ?? null,
      supplierName,
      brandId: brandId ?? null,
      brandName: brandName ?? null,
      lotNumber,
      quantityReceived,
      unit,
      expirationDate: expirationDate ? new Date(expirationDate) : null,
      conditionCheck: conditionCheck as never,
      coaRequired,
      coaReceived: coaReceived ?? null,
      coaDocumentUrl,
      decision,
      notes: notes ?? null,
    },
  });

  // Update PO item progress if linked to a PO
  let poFullyReceived = false;
  let poOutstandingItems: { materialName: string; qtyRemaining: number; unit: string }[] = [];
  let poSupplierName = "";
  if (poId && materialId) {
    const poItem = await prisma.purchaseOrderItem.findFirst({
      where: { poId, materialId },
    });
    if (poItem && !poItem.isFullyReceived) {
      const newQtyReceived = poItem.qtyReceived + quantityReceived;
      const newQtyRemaining = Math.max(0, poItem.qtyOrdered - newQtyReceived);
      const newIsFullyReceived = newQtyRemaining <= 0.001;
      await prisma.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: {
          qtyReceived: newQtyReceived,
          qtyRemaining: newQtyRemaining,
          isFullyReceived: newIsFullyReceived,
        },
      });
    }
    // Check if all items are now fully received
    const allItems = await prisma.purchaseOrderItem.findMany({ where: { poId } });
    const allReceived = allItems.every((it) => it.isFullyReceived);
    const po = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: allReceived ? "received" : "partial", updatedAt: new Date() },
    });
    poSupplierName = po.supplierName ?? "";
    poFullyReceived = allReceived;
    poOutstandingItems = allItems
      .filter((it) => !it.isFullyReceived)
      .map((it) => ({ materialName: it.materialName, qtyRemaining: it.qtyRemaining, unit: it.unit }));
  }

  // Create per-delivery obligations for COA/special-risk registered materials
  if (!isUnregisteredMaterial && materialId && supplierId) {
    const mat = await prisma.material.findUnique({
      where: { id: materialId },
      select: { coaRequired: true, hasSpecialRisk: true },
    });
    if (mat && (mat.coaRequired || mat.hasSpecialRisk)) {
      const perDeliveryReqs = await prisma.documentRequirement.findMany({
        where: {
          isActive: true,
          requirementType: "PER_DELIVERY",
          triggerType: "material_level",
        },
      });
      for (const req of perDeliveryReqs) {
        const cond = req.triggerCondition;
        const applies =
          (cond === "coa_required" && mat.coaRequired) ||
          (cond === "has_special_risk" && mat.hasSpecialRisk);
        if (applies) {
          await prisma.perDeliveryObligation.upsert({
            where: {
              receivingRecordId_requirementId: {
                receivingRecordId: record.id,
                requirementId: req.id,
              },
            },
            create: {
              supplierId,
              materialId,
              receivingRecordId: record.id,
              lotNumber,
              requirementId: req.id,
              status: "pending",
            },
            update: {},
          });
        }
      }
    }
  }

  // Create inventory lot for accepted decisions — skip for unregistered materials
  let inventoryLot = null;
  if (!isUnregisteredMaterial && materialId && (decision === "accepted" || decision === "accepted_with_conditions")) {
    const isConditional = decision === "accepted_with_conditions";
    inventoryLot = await prisma.inventoryLot.create({
      data: {
        materialId,
        materialName,
        supplierId: supplierId ?? null,
        supplierName,
        brandId: brandId ?? null,
        brandName: brandName ?? null,
        lotNumber,
        receivingRecordId: record.id,
        quantityReceived,
        quantityRemaining: quantityReceived,
        unit,
        receivedDate: new Date(date),
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        status: isConditional ? "conditional" : "active",
        isConditional,
        conditionalNotes: isConditional && quarantine?.quarantineReason
          ? quarantine.quarantineReason
          : null,
      },
    });

    // Create IN movement
    await prisma.inventoryMovement.create({
      data: {
        inventoryLotId: inventoryLot.id,
        materialId,
        materialName,
        lotNumber,
        movementType: "in_receiving",
        quantity: quantityReceived,
        unit,
        referenceType: "receiving_record",
        referenceId: record.id,
        referenceNumber: recordNumber,
        quantityBefore: 0,
        quantityAfter: quantityReceived,
        performedById: userId,
      },
    });

    // Check minimum stock status
    await updateLotStatus(inventoryLot.id);
  }

  // Create quarantine record for conditional/rejected
  let quarantineRecord = null;
  if ((decision === "accepted_with_conditions" || decision === "rejected") && quarantine) {
    const qrNumber = `QR-${String((await prisma.quarantineRecord.count()) + 1).padStart(4, "0")}`;
    quarantineRecord = await prisma.quarantineRecord.create({
      data: {
        recordNumber: qrNumber,
        receivingRecordId: record.id,
        materialName,
        supplierName,
        lotNumber,
        quantity: quantityReceived,
        unit,
        quarantineReason: quarantine.quarantineReason,
        actionTaken: quarantine.actionTaken,
        quarantineLocation: quarantine.quarantineLocation ?? null,
        adminNotified: quarantine.adminNotified,
        status: "open",
      },
    });
  }

  autoCompleteFormLinkedTasks({ formType: "receiving", submittingUserId: userId, submittedAt: new Date(), submissionId: record.id, prismaClient: prisma }).catch((e) => console.error("[task auto-complete] receiving:", e));

  return NextResponse.json({
    record,
    inventoryLot,
    quarantineRecord,
    poId: poId ?? null,
    poNumber: poNumber ?? null,
    poSupplierName,
    poFullyReceived,
    poOutstandingItems,
  }, { status: 201 });
}
