import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Los_Angeles" });
}
function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC",
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; name?: string; role: string };
  if (user.role !== "SUPERVISOR" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const in30 = new Date(today); in30.setDate(today.getDate() + 30);
  const userId = user.id;

  const [
    activeDraft,
    lowStock,
    expiringSoon,
    expiredLots,
    recentProductions,
  ] = await Promise.all([
    prisma.batchSheetSubmission.findFirst({
      where: { submittedById: userId, status: "DRAFT" },
      orderBy: { lastSavedAt: "desc" },
      select: { id: true, templateName: true, productionLot: true, submittedAt: true, lastSavedAt: true },
    }),
    prisma.inventoryLot.findMany({
      where: { status: "low_stock" },
      take: 4,
      orderBy: { quantityRemaining: "asc" },
      select: {
        id: true, materialName: true, lotNumber: true,
        quantityRemaining: true, unit: true,
        material: { select: { minimumStockQuantity: true, minimumStockUnit: true } },
      },
    }),
    prisma.inventoryLot.findMany({
      where: {
        expirationDate: { gte: today, lte: in30 },
        status: { in: ["active", "low_stock", "conditional"] },
      },
      take: 4,
      orderBy: { expirationDate: "asc" },
      select: { id: true, materialName: true, lotNumber: true, expirationDate: true },
    }),
    prisma.inventoryLot.findMany({
      where: { status: "expired" },
      take: 4,
      orderBy: { expirationDate: "desc" },
      select: { id: true, materialName: true, lotNumber: true, expirationDate: true },
    }),
    prisma.batchSheetSubmission.findMany({
      where: { status: { in: ["COMPLETE", "PASS", "FAIL", "PASS_WITH_ISSUES"] } },
      orderBy: { submittedAt: "desc" },
      take: 5,
      select: { id: true, productionLot: true, templateName: true, productionDate: true, status: true },
    }),
  ]);

  return NextResponse.json({
    greeting_name: user.name?.split(" ")[0] ?? "there",
    active_draft: activeDraft ? {
      id: activeDraft.id,
      product_name: activeDraft.templateName,
      lot_number: activeDraft.productionLot ?? null,
      started_at: fmtTime(activeDraft.submittedAt),
      last_saved_at: activeDraft.lastSavedAt ? fmtTime(activeDraft.lastSavedAt) : null,
    } : null,
    inventory_alerts: {
      low_stock: lowStock.map((l) => ({
        id: l.id,
        material_name: l.materialName,
        lot_number: l.lotNumber,
        quantity_remaining: l.quantityRemaining,
        unit: l.unit,
        min_quantity: l.material.minimumStockQuantity ?? null,
        min_unit: l.material.minimumStockUnit ?? null,
      })),
      expiring_soon: expiringSoon.map((l) => ({
        id: l.id,
        material_name: l.materialName,
        lot_number: l.lotNumber,
        days_until_expiry: Math.ceil((new Date(l.expirationDate!).getTime() - today.getTime()) / 86400000),
        expiration_date: fmtDate(l.expirationDate!),
      })),
      expired: expiredLots.map((l) => ({
        id: l.id,
        material_name: l.materialName,
        lot_number: l.lotNumber,
        days_since_expiry: Math.ceil((today.getTime() - new Date(l.expirationDate!).getTime()) / 86400000),
        expiration_date: fmtDate(l.expirationDate!),
      })),
    },
    recent_productions: recentProductions.map((s) => ({
      id: s.id,
      production_lot: s.productionLot ?? null,
      product_name: s.templateName,
      production_date: fmtDate(s.productionDate),
      status: s.status,
    })),
  });
}
