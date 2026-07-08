import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT ssi."shipstationProductId")::bigint AS count
    FROM shipstation_shipment_items ssi
    JOIN shipstation_shipments ss ON ss.id = ssi."shipmentId"
    WHERE ss.voided = false
      AND ssi."fsmsPresentationId" IS NULL
      AND ssi."shipstationProductId" IS NOT NULL
  `;

  return NextResponse.json({ count: Number(result[0]?.count ?? 0) });
}
