import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
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
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const in30 = new Date(today); in30.setDate(today.getDate() + 30);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const userId = user.id;

  const [
    // active draft
    activeDraft,
    // inventory alerts
    lowStock,
    expiringSoon,
    expiredLots,
    // recent productions
    recentProductions,
    // quick stats
    productionsThisWeek,
    activeInventoryLots,
    approvedSuppliers,
    totalSuppliers,
    // supplier alerts
    expiredDocs,
    expiringSoonDocs,
    pendingSuppliers,
    // quarantine
    openQuarantineRecords,
    // today's activity
    allPreOpToday,
    allBatchSheetsToday,
    allReceivingToday,
    allCleaningToday,
  ] = await Promise.all([
    prisma.batchSheetSubmission.findFirst({
      where: { submittedById: userId, status: "DRAFT" },
      orderBy: { lastSavedAt: "desc" },
      select: { id: true, templateName: true, productionLot: true, submittedAt: true, lastSavedAt: true },
    }),
    // inventory alerts
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
    // recent productions
    prisma.batchSheetSubmission.findMany({
      where: { status: { in: ["COMPLETE", "PASS", "FAIL", "PASS_WITH_ISSUES"] } },
      orderBy: { submittedAt: "desc" },
      take: 5,
      select: { id: true, productionLot: true, templateName: true, productionDate: true, status: true },
    }),
    // quick stats
    prisma.batchSheetSubmission.count({
      where: { submittedAt: { gte: weekAgo }, status: { in: ["COMPLETE", "PASS", "FAIL", "PASS_WITH_ISSUES"] } },
    }),
    prisma.inventoryLot.count({ where: { status: { in: ["active", "low_stock", "conditional"] } } }),
    prisma.supplier.count({ where: { isActive: true, status: "APPROVED" } }),
    prisma.supplier.count({ where: { isActive: true } }),
    // supplier alerts — expired docs
    prisma.supplierDocument.findMany({
      where: { expiresAt: { lt: now }, supplier: { isActive: true } },
      orderBy: { expiresAt: "asc" },
      take: 10,
      select: {
        expiresAt: true,
        supplier: { select: { id: true, name: true } },
        requirement: { select: { name: true } },
      },
    }),
    // supplier alerts — expiring soon docs
    prisma.supplierDocument.findMany({
      where: { expiresAt: { gte: now, lte: in30 }, supplier: { isActive: true } },
      orderBy: { expiresAt: "asc" },
      take: 10,
      select: {
        expiresAt: true,
        supplier: { select: { id: true, name: true } },
        requirement: { select: { name: true } },
      },
    }),
    // supplier alerts — pending (missing docs)
    prisma.supplier.findMany({
      where: { isActive: true, status: "PENDING" },
      take: 10,
      select: { id: true, name: true },
    }),
    // quarantine
    prisma.quarantineRecord.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, recordNumber: true, materialName: true, supplierName: true, createdAt: true, actionTaken: true },
    }),
    // today's activity — all pre-op
    prisma.preOpInspection.findMany({
      where: { date: { gte: today, lt: tomorrow } },
      orderBy: { submittedAt: "desc" },
      select: { submittedBy: { select: { name: true } } },
    }),
    // today's activity — all batch sheets
    prisma.batchSheetSubmission.findMany({
      where: {
        productionDate: { gte: today, lt: tomorrow },
        status: { in: ["COMPLETE", "PASS", "FAIL", "PASS_WITH_ISSUES"] },
      },
      orderBy: { submittedAt: "desc" },
      select: {
        productionLot: true, templateName: true, submittedAt: true,
        submittedBy: { select: { name: true } },
      },
    }),
    // today's activity — receiving count
    prisma.receivingRecord.count({ where: { date: { gte: today, lt: tomorrow } } }),
    // today's activity — cleaning count
    prisma.dailyCleaningChecklist.count({ where: { date: { gte: today, lt: tomorrow } } }),
  ]);

  // compute open alerts count
  const invAlertCount = lowStock.length + expiringSoon.length + expiredLots.length;
  const supplierAlertCount = expiredDocs.length + expiringSoonDocs.length + pendingSuppliers.length;
  const openAlertsCount = invAlertCount + supplierAlertCount + openQuarantineRecords.length;

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
        id: l.id, material_name: l.materialName, lot_number: l.lotNumber,
        quantity_remaining: l.quantityRemaining, unit: l.unit,
        min_quantity: l.material.minimumStockQuantity ?? null,
        min_unit: l.material.minimumStockUnit ?? null,
      })),
      expiring_soon: expiringSoon.map((l) => ({
        id: l.id, material_name: l.materialName, lot_number: l.lotNumber,
        days_until_expiry: Math.ceil((new Date(l.expirationDate!).getTime() - today.getTime()) / 86400000),
        expiration_date: fmtDate(l.expirationDate!),
      })),
      expired: expiredLots.map((l) => ({
        id: l.id, material_name: l.materialName, lot_number: l.lotNumber,
        days_since_expiry: Math.ceil((today.getTime() - new Date(l.expirationDate!).getTime()) / 86400000),
        expiration_date: fmtDate(l.expirationDate!),
      })),
    },
    recent_productions: recentProductions.map((s) => ({
      id: s.id, production_lot: s.productionLot ?? null,
      product_name: s.templateName, production_date: fmtDate(s.productionDate),
      status: s.status,
    })),
    quick_stats: {
      productions_this_week: productionsThisWeek,
      active_inventory_lots: activeInventoryLots,
      approved_suppliers: approvedSuppliers,
      total_suppliers: totalSuppliers,
      open_alerts_count: openAlertsCount,
    },
    supplier_alerts: {
      expired: expiredDocs.map((d) => ({
        supplier_id: d.supplier.id, supplier_name: d.supplier.name,
        document_name: d.requirement.name,
        days_ago: Math.ceil((now.getTime() - new Date(d.expiresAt!).getTime()) / 86400000),
        expired_at: fmtDate(d.expiresAt!),
      })),
      expiring_soon: expiringSoonDocs.map((d) => ({
        supplier_id: d.supplier.id, supplier_name: d.supplier.name,
        document_name: d.requirement.name,
        days_until: Math.ceil((new Date(d.expiresAt!).getTime() - now.getTime()) / 86400000),
        expires_at: fmtDate(d.expiresAt!),
      })),
      missing: pendingSuppliers.map((s) => ({
        supplier_id: s.id, supplier_name: s.name,
      })),
    },
    open_quarantine_records: openQuarantineRecords.map((q) => ({
      id: q.id, record_number: q.recordNumber,
      material_name: q.materialName, supplier_name: q.supplierName,
      created_at: fmtDate(q.createdAt), action_taken: q.actionTaken,
    })),
    today_activity: {
      pre_op_count: allPreOpToday.length,
      pre_op_supervisors: Array.from(new Set(allPreOpToday.map((p) => p.submittedBy.name ?? "Unknown"))),
      batch_sheets_today: allBatchSheetsToday.map((s) => ({
        production_lot: s.productionLot ?? s.templateName,
        supervisor_name: s.submittedBy.name ?? "Unknown",
        submitted_at: fmtTime(s.submittedAt),
        template_name: s.templateName,
      })),
      receiving_count: allReceivingToday,
      cleaning_count: allCleaningToday,
    },
  });
}
