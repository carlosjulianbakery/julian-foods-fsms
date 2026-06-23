import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMaterialStockLevel } from "@/lib/inventoryUtils";

export const dynamic = "force-dynamic";

// Daily cron: scan all materials with minimumStockQuantity set and update lot statuses
export async function GET() {
  try {
    // Mark newly-expired lots
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.inventoryLot.updateMany({
      where: {
        expirationDate: { lt: today },
        status: { notIn: ["expired", "recalled"] },
      },
      data: { status: "expired" },
    });

    // Find all materials that have a minimum stock quantity configured
    const materials = await prisma.material.findMany({
      where: { minimumStockQuantity: { not: null } },
      select: { id: true },
    });

    await Promise.all(materials.map((m) => checkMaterialStockLevel(m.id)));

    return NextResponse.json({ checked: materials.length, ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/inventory/check-stock-levels]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
