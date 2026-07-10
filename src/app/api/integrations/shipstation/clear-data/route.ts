import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

// DELETE all imported ShipStation data so a clean resync can be run.
// Keeps shipstation_sync_logs for audit history.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete child tables first to avoid FK violations
  const itemsResult = await prisma.shipstationShipmentItem.deleteMany();
  const componentsResult = await prisma.shipstationBundleComponent.deleteMany();

  // Then delete parent tables
  const shipmentsResult = await prisma.shipstationShipment.deleteMany();
  const productsResult = await prisma.shipstationProduct.deleteMany();

  return NextResponse.json({
    cleared: {
      shipmentItems: itemsResult.count,
      bundleComponents: componentsResult.count,
      shipments: shipmentsResult.count,
      products: productsResult.count,
    },
    message: "All ShipStation import data cleared. Run sync to reimport.",
  });
}
