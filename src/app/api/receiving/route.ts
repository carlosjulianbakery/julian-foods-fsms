import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

export const dynamic = "force-dynamic";

async function nextRecordNumber(): Promise<string> {
  const count = await prisma.receivingRecord.count();
  return `RCV-${String(count + 1).padStart(4, "0")}`;
}

async function updateLotStatus(lotId: string) {
  const lot = await prisma.inventoryLot.findUnique({
    where: { id: lotId },
    include: { material: { select: { minimumStockQuantity: true } } },
  });
  if (!lot) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let status = lot.status;
  if (lot.expirationDate && lot.expirationDate < today) {
    status = "expired";
  } else if (lot.quantityRemaining <= 0) {
    status = "depleted";
  } else if (lot.isConditional) {
    status = "conditional";
  } else if (
    lot.material.minimumStockQuantity != null &&
    lot.quantityRemaining < lot.material.minimumStockQuantity
  ) {
    status = "low_stock";
  } else {
    status = "active";
  }

  if (status !== lot.status) {
    await prisma.inventoryLot.update({ where: { id: lotId }, data: { status } });
  }
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
    date, timeReceived, purchaseOrderNumber, materialId, supplierId,
    lotNumber, quantityReceived, unit, expirationDate, conditionCheck,
    coaRequired, coaReceived, decision, notes, quarantine,
  } = body as {
    date: string;
    timeReceived: string;
    purchaseOrderNumber?: string;
    materialId: string;
    supplierId?: string;
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
  };

  // Fetch snapshots
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) return NextResponse.json({ error: "Material not found" }, { status: 400 });

  let supplierName = "";
  if (supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    supplierName = supplier?.name ?? "";
  }

  // Upload COA if provided
  let coaDocumentUrl: string | null = null;
  if (coaFile && coaFile.size > 0) {
    const blobPath = `receiving-coas/${materialId}/${lotNumber}/${Date.now()}-${coaFile.name}`;
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
      purchaseOrderNumber: purchaseOrderNumber ?? null,
      materialId,
      materialName: material.name,
      supplierId: supplierId ?? null,
      supplierName,
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

  // Create inventory lot for accepted decisions
  let inventoryLot = null;
  if (decision === "accepted" || decision === "accepted_with_conditions") {
    const isConditional = decision === "accepted_with_conditions";
    inventoryLot = await prisma.inventoryLot.create({
      data: {
        materialId,
        materialName: material.name,
        supplierId: supplierId ?? null,
        supplierName,
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
        materialName: material.name,
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
        materialName: material.name,
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

  return NextResponse.json({
    record,
    inventoryLot,
    quarantineRecord,
  }, { status: 201 });
}
