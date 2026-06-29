import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/purchasing/purchase-orders — list all POs
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPERVISOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplierId");
  const poNumberFilter = searchParams.get("poNumber");
  const excludeId = searchParams.get("excludeId");

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(poNumberFilter ? { poNumber: poNumberFilter } : {}),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: {
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ purchaseOrders: pos });
}

// POST /api/purchasing/purchase-orders — create a new PO
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPERVISOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    poNumber,
    supplierId,
    supplierName,
    sentDate,
    estimatedDeliveryDate,
    notes,
    forecastPeriodFrom,
    forecastPeriodTo,
    items, // array of { materialId, materialName, qtyOrdered, unit, source, wipMaterialName }
  } = body;

  if (!poNumber?.trim()) {
    return NextResponse.json({ error: "PO number is required" }, { status: 400 });
  }
  if (!supplierId || !items || items.length === 0) {
    return NextResponse.json({ error: "supplierId and items are required" }, { status: 400 });
  }

  // Check PO number uniqueness
  const existingPo = await prisma.purchaseOrder.findUnique({
    where: { poNumber: poNumber.trim() },
    select: { id: true },
  });
  if (existingPo) {
    return NextResponse.json(
      { error: `PO #${poNumber.trim()} already exists. Please check QuickBooks and enter the correct number.` },
      { status: 409 }
    );
  }

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: poNumber.trim(),
      supplierId,
      supplierName: supplierName ?? "",
      status: "sent",
      sentDate: sentDate ? new Date(sentDate) : new Date(),
      estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null,
      notes: notes ?? null,
      forecastPeriodFrom: forecastPeriodFrom ? new Date(forecastPeriodFrom) : null,
      forecastPeriodTo: forecastPeriodTo ? new Date(forecastPeriodTo) : null,
      createdById: session.user.id,
      items: {
        create: items.map((item: {
          materialId: string;
          materialName: string;
          qtyOrdered: number;
          unit: string;
          source?: string;
          wipMaterialName?: string;
          notes?: string;
        }) => ({
          materialId: item.materialId,
          materialName: item.materialName,
          qtyOrdered: item.qtyOrdered,
          unit: item.unit,
          qtyReceived: 0,
          qtyRemaining: item.qtyOrdered,
          isFullyReceived: false,
          source: item.source ?? "direct",
          wipMaterialName: item.wipMaterialName ?? null,
          notes: item.notes ?? null,
        })),
      },
    },
    include: { items: true },
  });

  return NextResponse.json({ purchaseOrder: po }, { status: 201 });
}
