import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/purchasing/purchase-orders/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPERVISOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: {
      items: { include: { material: { select: { id: true, name: true, unit: true } } } },
      receivingRecords: {
        select: { id: true, submittedAt: true, notes: true, receivedBy: { select: { name: true } } },
        orderBy: { submittedAt: "desc" },
        take: 20,
      },
    },
  });

  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ purchaseOrder: po });
}

// PUT /api/purchasing/purchase-orders/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    poNumber,
    status,
    sentDate,
    estimatedDeliveryDate,
    actualDeliveryDate,
    notes,
    forecastPeriodFrom,
    forecastPeriodTo,
    items,
  } = body;

  // Validate and check uniqueness of poNumber if being changed
  if (poNumber !== undefined) {
    if (!poNumber.trim()) {
      return NextResponse.json({ error: "PO number cannot be empty" }, { status: 400 });
    }
    const conflict = await prisma.purchaseOrder.findFirst({
      where: { poNumber: poNumber.trim(), id: { not: params.id } },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { error: `PO #${poNumber.trim()} already exists. Please check QuickBooks and enter the correct number.` },
        { status: 409 }
      );
    }
  }

  const po = await prisma.purchaseOrder.update({
    where: { id: params.id },
    data: {
      ...(poNumber !== undefined ? { poNumber: poNumber.trim() } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(sentDate !== undefined ? { sentDate: new Date(sentDate) } : {}),
      ...(estimatedDeliveryDate !== undefined
        ? { estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null }
        : {}),
      ...(actualDeliveryDate !== undefined
        ? { actualDeliveryDate: actualDeliveryDate ? new Date(actualDeliveryDate) : null }
        : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(forecastPeriodFrom !== undefined
        ? { forecastPeriodFrom: forecastPeriodFrom ? new Date(forecastPeriodFrom) : null }
        : {}),
      ...(forecastPeriodTo !== undefined
        ? { forecastPeriodTo: forecastPeriodTo ? new Date(forecastPeriodTo) : null }
        : {}),
      updatedAt: new Date(),
      ...(items !== undefined
        ? {
            items: {
              deleteMany: {},
              create: items.map((item: {
                materialId: string;
                materialName: string;
                qtyOrdered: number;
                unit: string;
                qtyReceived?: number;
                qtyRemaining?: number;
                isFullyReceived?: boolean;
                source?: string;
                wipMaterialName?: string;
                notes?: string;
              }) => ({
                materialId: item.materialId,
                materialName: item.materialName,
                qtyOrdered: item.qtyOrdered,
                unit: item.unit,
                qtyReceived: item.qtyReceived ?? 0,
                qtyRemaining: item.qtyRemaining ?? item.qtyOrdered,
                isFullyReceived: item.isFullyReceived ?? false,
                source: item.source ?? "direct",
                wipMaterialName: item.wipMaterialName ?? null,
                notes: item.notes ?? null,
              })),
            },
          }
        : {}),
    },
    include: { items: true },
  });

  return NextResponse.json({ purchaseOrder: po });
}
