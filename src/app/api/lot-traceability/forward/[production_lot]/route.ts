import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { production_lot: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productionLot = decodeURIComponent(params.production_lot);

  const submission = await prisma.batchSheetSubmission.findFirst({
    where: { productionLot },
    select: {
      id: true,
      productionLot: true,
      productionDate: true,
      templateName: true,
      status: true,
      section5: true,
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Production lot not found" }, { status: 404 });
  }

  // Extract presentation units from section5
  const s5 = submission.section5 as {
    presentation_units?: Array<{
      was_produced?: boolean;
      total_produced?: number;
      presentation_id: string;
      presentation_name?: string;
      primary_unit_name?: string;
    }>;
  } | null;

  const presentationUnits = (s5?.presentation_units ?? []).filter(
    (pu) => pu.was_produced && (pu.total_produced ?? 0) > 0
  );

  // Get FSMS presentation info from products
  const fsmsProducts = await prisma.product.findMany({
    select: { id: true, name: true, presentations: true },
  });
  const presInfoMap = new Map<
    string,
    { productName: string; presentationName: string; upc: string; primaryUnitName: string }
  >();
  for (const product of fsmsProducts) {
    const pres = (product.presentations as Array<{ id: string; name: string; upc?: string; primary_unit_name?: string }>) ?? [];
    for (const p of pres) {
      presInfoMap.set(p.id, {
        productName: product.name,
        presentationName: p.name,
        upc: p.upc ?? "",
        primaryUnitName: p.primary_unit_name ?? "unit",
      });
    }
  }

  // Find shipments that included these presentations (by UPC or fsmsPresentationId)
  const presIds = presentationUnits.map((pu) => pu.presentation_id);

  interface ShipmentRow {
    orderId: string;
    orderNumber: string;
    storeName: string;
    shipDate: Date;
    customerName: string | null;
    presId: string | null;
    productName: string;
    quantityShipped: number;
    voided: boolean;
  }

  const shipmentRows = await prisma.$queryRaw<ShipmentRow[]>`
    SELECT ss."shipstationOrderId" AS "orderId",
           ss."shipstationOrderNumber" AS "orderNumber",
           ss."storeName",
           ss."shipDate",
           ss."customerName",
           ssi."fsmsPresentationId" AS "presId",
           ssi."productName",
           ssi."quantityShipped",
           ss.voided
    FROM shipstation_shipment_items ssi
    JOIN shipstation_shipments ss ON ss.id = ssi."shipmentId"
    WHERE ssi."fsmsPresentationId" = ANY(${presIds})
    ORDER BY ss."shipDate" DESC
  `;

  // Group by presentation
  const byPresentation = new Map<
    string,
    {
      presentationName: string;
      productName: string;
      upc: string;
      unit: string;
      totalProduced: number;
      shipments: Array<{
        orderNumber: string;
        storeName: string;
        shipDate: string;
        customerName: string | null;
        quantityShipped: number;
        voided: boolean;
      }>;
    }
  >();

  for (const pu of presentationUnits) {
    const info = presInfoMap.get(pu.presentation_id);
    byPresentation.set(pu.presentation_id, {
      presentationName: info?.presentationName ?? pu.presentation_name ?? pu.presentation_id,
      productName: info?.productName ?? submission.templateName,
      upc: info?.upc ?? "",
      unit: info?.primaryUnitName ?? pu.primary_unit_name ?? "unit",
      totalProduced: pu.total_produced ?? 0,
      shipments: [],
    });
  }

  for (const row of shipmentRows) {
    if (!row.presId) continue;
    const entry = byPresentation.get(row.presId);
    if (!entry) continue;
    entry.shipments.push({
      orderNumber: row.orderNumber,
      storeName: row.storeName,
      shipDate: row.shipDate instanceof Date ? row.shipDate.toISOString() : String(row.shipDate),
      customerName: row.customerName,
      quantityShipped: row.quantityShipped,
      voided: row.voided,
    });
  }

  const presentations = Array.from(byPresentation.entries()).map(([presId, data]) => ({
    presentationId: presId,
    ...data,
    totalShipped: data.shipments.filter((s) => !s.voided).reduce((acc, s) => acc + s.quantityShipped, 0),
  }));

  return NextResponse.json({
    productionLot: submission.productionLot,
    submissionId: submission.id,
    productionDate: submission.productionDate,
    templateName: submission.templateName,
    status: submission.status,
    presentations,
    hasShipstationData: shipmentRows.length > 0,
  });
}
