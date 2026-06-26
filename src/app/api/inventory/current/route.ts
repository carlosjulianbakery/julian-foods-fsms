import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Auto-expire lots whose expiration date has passed
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.inventoryLot.updateMany({
    where: {
      expirationDate: { lt: today },
      status: { notIn: ["expired", "recalled"] },
    },
    data: { status: "expired" },
  });

  const lots = await prisma.inventoryLot.findMany({
    include: {
      material: {
        select: {
          minimumStockQuantity: true,
          minimumStockUnit: true,
          unit: true,
          category: true,
        },
      },
      initialStockEntry: {
        select: {
          enteredAt: true,
          enteredBy: { select: { name: true } },
        },
      },
    },
    orderBy: [{ materialName: "asc" }, { receivedDate: "desc" }],
  });

  return NextResponse.json(lots);
}
