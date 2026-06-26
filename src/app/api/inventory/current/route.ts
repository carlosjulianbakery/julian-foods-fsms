import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateLotStatus, isMaterialBelowMinimum } from "@/lib/inventoryUtils";

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

  // Build per-material lot lists for below-min calculation
  const lotsByMaterial = new Map<string, typeof lots>();
  for (const lot of lots) {
    const arr = lotsByMaterial.get(lot.materialId) ?? [];
    arr.push(lot);
    lotsByMaterial.set(lot.materialId, arr);
  }

  // Compute isBelowMin per material (use material-level aggregation)
  const belowMinSet = new Set<string>();
  for (const [materialId, matLots] of Array.from(lotsByMaterial)) {
    const mat = matLots[0].material;
    if (isMaterialBelowMinimum(
      matLots.map((l: typeof lots[0]) => ({ quantityRemaining: l.quantityRemaining, unit: l.unit, status: l.status })),
      mat
    )) {
      belowMinSet.add(materialId);
    }
  }

  // Annotate each lot with dynamically computed status (overrides stored status)
  const enriched = lots.map((lot) => ({
    ...lot,
    status: calculateLotStatus({
      quantityRemaining: lot.quantityRemaining,
      storedStatus:      lot.status,
      expirationDate:    lot.expirationDate,
      isConditional:     lot.isConditional,
      isMaterialBelowMin: belowMinSet.has(lot.materialId),
    }),
  }));

  return NextResponse.json(enriched);
}
