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

const STATUS_DISPLAY: Record<string, string> = {
  APPROVED: "Approved",
  EXPIRING_SOON: "Expiring Soon",
  EXPIRED: "Expired",
  PENDING: "Pending",
  INACTIVE: "Inactive",
};

interface ActivityEntry {
  timestamp: string;
  person_name: string | null;
  action_type: string;
  description: string;
  link_url: string;
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

  // Pacific-time day bounds for activity feed
  const ptNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const ptStart = new Date(ptNow); ptStart.setHours(0, 0, 0, 0);
  const ptEnd = new Date(ptStart); ptEnd.setDate(ptStart.getDate() + 1);
  const utcOffset = now.getTime() - ptNow.getTime();
  const actStart = new Date(ptStart.getTime() + utcOffset);
  const actEnd = new Date(ptEnd.getTime() + utcOffset);

  const [
    activeDraft,
    lowStock, expiringSoon, expiredLots,
    recentProductions,
    productionsThisWeek, activeInventoryLots, approvedSuppliers, totalSuppliers,
    expiredDocs, expiringSoonDocs, pendingSuppliers,
    openQuarantineRecords,
    // activity feed queries
    preOpsToday, dailyCleaningToday, monthlyCleaningToday,
    batchSheetsToday, receivingToday,
    productsCreatedToday, productsUpdatedToday,
    templatesCreatedToday, templatesUpdatedToday,
    docsUploadedToday, suppliersCreatedToday, statusChangesToday,
    materialsCreatedToday, cycleCountsToday, quarantineResolvedToday,
    usersCreatedToday,
  ] = await Promise.all([
    prisma.batchSheetSubmission.findFirst({
      where: { submittedById: userId, status: "DRAFT" },
      orderBy: { lastSavedAt: "desc" },
      select: { id: true, templateName: true, productionLot: true, submittedAt: true, lastSavedAt: true },
    }),
    // inventory alerts
    prisma.inventoryLot.findMany({
      where: { status: "low_stock" },
      take: 4, orderBy: { quantityRemaining: "asc" },
      select: {
        id: true, materialName: true, lotNumber: true,
        quantityRemaining: true, unit: true,
        material: { select: { minimumStockQuantity: true, minimumStockUnit: true } },
      },
    }),
    prisma.inventoryLot.findMany({
      where: { expirationDate: { gte: today, lte: in30 }, status: { in: ["active", "low_stock", "conditional"] } },
      take: 4, orderBy: { expirationDate: "asc" },
      select: { id: true, materialName: true, lotNumber: true, expirationDate: true },
    }),
    prisma.inventoryLot.findMany({
      where: { status: "expired" },
      take: 4, orderBy: { expirationDate: "desc" },
      select: { id: true, materialName: true, lotNumber: true, expirationDate: true },
    }),
    prisma.batchSheetSubmission.findMany({
      where: { status: { in: ["COMPLETE", "PASS", "FAIL", "PASS_WITH_ISSUES"] } },
      orderBy: { submittedAt: "desc" }, take: 5,
      select: { id: true, productionLot: true, templateName: true, productionDate: true, status: true },
    }),
    // quick stats
    prisma.batchSheetSubmission.count({
      where: { submittedAt: { gte: weekAgo }, status: { in: ["COMPLETE", "PASS", "FAIL", "PASS_WITH_ISSUES"] } },
    }),
    prisma.inventoryLot.count({ where: { status: { in: ["active", "low_stock", "conditional"] } } }),
    prisma.supplier.count({ where: { isActive: true, status: "APPROVED" } }),
    prisma.supplier.count({ where: { isActive: true } }),
    // supplier alerts
    prisma.supplierDocument.findMany({
      where: { expiresAt: { lt: now }, supplier: { isActive: true } },
      orderBy: { expiresAt: "asc" }, take: 10,
      select: { expiresAt: true, supplier: { select: { id: true, name: true } }, requirement: { select: { name: true } } },
    }),
    prisma.supplierDocument.findMany({
      where: { expiresAt: { gte: now, lte: in30 }, supplier: { isActive: true } },
      orderBy: { expiresAt: "asc" }, take: 10,
      select: { expiresAt: true, supplier: { select: { id: true, name: true } }, requirement: { select: { name: true } } },
    }),
    prisma.supplier.findMany({
      where: { isActive: true, status: "PENDING" }, take: 10,
      select: { id: true, name: true },
    }),
    prisma.quarantineRecord.findMany({
      where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, recordNumber: true, materialName: true, supplierName: true, createdAt: true, actionTaken: true },
    }),
    // ── activity feed (each guarded so one failure won't break the dashboard) ──
    prisma.preOpInspection.findMany({
      where: { submittedAt: { gte: actStart, lt: actEnd } },
      select: { submittedAt: true, submittedBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:preOp]", e.message); return []; }),
    prisma.dailyCleaningChecklist.findMany({
      where: { submittedAt: { gte: actStart, lt: actEnd } },
      select: { id: true, submittedAt: true, submittedBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:dailyCleaning]", e.message); return []; }),
    prisma.monthlyCleaningChecklist.findMany({
      where: { submittedAt: { gte: actStart, lt: actEnd } },
      select: { id: true, submittedAt: true, submittedBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:monthlyCleaning]", e.message); return []; }),
    prisma.batchSheetSubmission.findMany({
      where: { submittedAt: { gte: actStart, lt: actEnd }, status: { notIn: ["DRAFT", "IN_PROGRESS"] } },
      select: {
        id: true, submittedAt: true, templateName: true, productionLot: true,
        section2_allergen: true, submittedBy: { select: { name: true } },
      },
    }).catch((e) => { console.error("[activity:batchSheets]", e.message); return []; }),
    prisma.receivingRecord.findMany({
      where: { submittedAt: { gte: actStart, lt: actEnd } },
      select: { id: true, submittedAt: true, materialName: true, supplierName: true, brandName: true, receivedBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:receiving]", e.message); return []; }),
    prisma.product.findMany({
      where: { createdAt: { gte: actStart, lt: actEnd } },
      select: { id: true, createdAt: true, name: true, createdBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:productsCreated]", e.message); return []; }),
    prisma.product.findMany({
      where: { updatedAt: { gte: actStart, lt: actEnd } },
      select: { id: true, updatedAt: true, createdAt: true, name: true, createdBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:productsUpdated]", e.message); return []; }),
    prisma.batchSheetTemplate.findMany({
      where: { createdAt: { gte: actStart, lt: actEnd }, isActive: true },
      select: { id: true, createdAt: true, name: true, createdBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:templatesCreated]", e.message); return []; }),
    prisma.batchSheetTemplate.findMany({
      where: { updatedAt: { gte: actStart, lt: actEnd }, isActive: true },
      select: { id: true, updatedAt: true, createdAt: true, name: true, createdBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:templatesUpdated]", e.message); return []; }),
    prisma.supplierDocument.findMany({
      where: { uploadedAt: { gte: actStart, lt: actEnd } },
      select: { uploadedAt: true, supplier: { select: { id: true, name: true } }, requirement: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:docsUploaded]", e.message); return []; }),
    prisma.supplier.findMany({
      where: { createdAt: { gte: actStart, lt: actEnd }, isActive: true },
      select: { id: true, createdAt: true, name: true },
    }).catch((e) => { console.error("[activity:suppliersCreated]", e.message); return []; }),
    prisma.supplierStatusLog.findMany({
      where: { createdAt: { gte: actStart, lt: actEnd } },
      select: { createdAt: true, status: true, supplier: { select: { id: true, name: true } } },
    }).catch((e) => { console.error("[activity:statusChanges]", e.message); return []; }),
    prisma.material.findMany({
      where: { createdAt: { gte: actStart, lt: actEnd }, isActive: true },
      select: { id: true, createdAt: true, name: true },
    }).catch((e) => { console.error("[activity:materialsCreated]", e.message); return []; }),
    prisma.cycleCount.findMany({
      where: { performedAt: { gte: actStart, lt: actEnd } },
      select: { performedAt: true, materialName: true, lotNumber: true, performedBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:cycleCounts]", e.message); return []; }),
    prisma.quarantineRecord.findMany({
      where: { resolvedAt: { gte: actStart, lt: actEnd } },
      select: { resolvedAt: true, recordNumber: true, resolvedBy: { select: { name: true } } },
    }).catch((e) => { console.error("[activity:quarantineResolved]", e.message); return []; }),
    prisma.user.findMany({
      where: { createdAt: { gte: actStart, lt: actEnd } },
      select: { id: true, createdAt: true, name: true },
    }).catch((e) => { console.error("[activity:usersCreated]", e.message); return []; }),
  ]);

  // ── Build activity entries ──────────────────────────────────────────────────
  const entries: ActivityEntry[] = [];

  for (const p of preOpsToday) {
    const name = p.submittedBy.name ?? "Unknown";
    entries.push({ timestamp: p.submittedAt.toISOString(), person_name: name, action_type: "pre_op_completed", description: `${name} completed Pre-Op Inspection`, link_url: "/dashboard/logs/pre-op" });
  }

  for (const c of dailyCleaningToday) {
    const name = c.submittedBy.name ?? "Unknown";
    entries.push({ timestamp: c.submittedAt.toISOString(), person_name: name, action_type: "daily_cleaning_completed", description: `${name} completed Daily Cleaning Checklist`, link_url: "/dashboard/supervisor/cleaning/daily/records" });
  }

  for (const c of monthlyCleaningToday) {
    const name = c.submittedBy.name ?? "Unknown";
    entries.push({ timestamp: c.submittedAt.toISOString(), person_name: name, action_type: "monthly_cleaning_completed", description: `${name} completed Monthly Cleaning Checklist`, link_url: "/dashboard/supervisor/cleaning/monthly/records" });
  }

  for (const b of batchSheetsToday) {
    const name = b.submittedBy.name ?? "Unknown";
    const productDesc = b.productionLot ? `${b.templateName} (${b.productionLot})` : b.templateName;
    entries.push({ timestamp: b.submittedAt.toISOString(), person_name: name, action_type: "batch_sheet_completed", description: `${name} completed Batch Sheet — ${productDesc}`, link_url: "/dashboard/supervisor/batch-sheet/records" });

    if (b.section2_allergen) {
      const a = b.section2_allergen as Record<string, unknown>;
      if (a.changeover_required === true) {
        const verb = a.final_result === "pass" ? "passed" : "flagged";
        entries.push({ timestamp: b.submittedAt.toISOString(), person_name: name, action_type: "allergen_swab", description: `${name} ${verb} allergen swab — ${b.templateName}`, link_url: "/dashboard/logs/allergen-changeover" });
      }
    }
  }

  for (const r of receivingToday) {
    const name = r.receivedBy.name ?? "Unknown";
    const supplierLabel = r.brandName ?? r.supplierName ?? "Unknown supplier";
    entries.push({ timestamp: r.submittedAt.toISOString(), person_name: name, action_type: "receiving_submitted", description: `${name} received delivery — ${r.materialName} (${supplierLabel})`, link_url: "/dashboard/supervisor/receiving/records" });
  }

  const createdProductIds = new Set(productsCreatedToday.map((p) => p.id));
  for (const p of productsCreatedToday) {
    const name = p.createdBy.name ?? "Unknown";
    entries.push({ timestamp: p.createdAt.toISOString(), person_name: name, action_type: "product_created", description: `${name} created new product — ${p.name}`, link_url: `/supplier-management/products/${p.id}` });
  }
  for (const p of productsUpdatedToday) {
    if (createdProductIds.has(p.id)) continue;
    if (p.updatedAt.getTime() - p.createdAt.getTime() < 5 * 60 * 1000) continue;
    const name = p.createdBy.name ?? "Unknown";
    entries.push({ timestamp: p.updatedAt.toISOString(), person_name: name, action_type: "product_updated", description: `${name} updated recipe — ${p.name}`, link_url: `/supplier-management/products/${p.id}` });
  }

  const createdTemplateIds = new Set(templatesCreatedToday.map((t) => t.id));
  for (const t of templatesCreatedToday) {
    const name = t.createdBy.name ?? "Unknown";
    entries.push({ timestamp: t.createdAt.toISOString(), person_name: name, action_type: "template_created", description: `${name} created new batch sheet template — ${t.name}`, link_url: `/dashboard/admin/batch-sheet-templates/${t.id}/edit` });
  }
  for (const t of templatesUpdatedToday) {
    if (createdTemplateIds.has(t.id)) continue;
    if (t.updatedAt.getTime() - t.createdAt.getTime() < 5 * 60 * 1000) continue;
    const name = t.createdBy.name ?? "Unknown";
    entries.push({ timestamp: t.updatedAt.toISOString(), person_name: name, action_type: "template_updated", description: `${name} updated batch sheet template — ${t.name}`, link_url: `/dashboard/admin/batch-sheet-templates/${t.id}/edit` });
  }

  for (const d of docsUploadedToday) {
    const docType = d.requirement?.name ?? "Document";
    entries.push({ timestamp: d.uploadedAt.toISOString(), person_name: null, action_type: "document_uploaded", description: `${docType} uploaded for ${d.supplier.name}`, link_url: `/supplier-management/suppliers/${d.supplier.id}` });
  }

  for (const s of suppliersCreatedToday) {
    entries.push({ timestamp: s.createdAt.toISOString(), person_name: null, action_type: "supplier_created", description: `New supplier added — ${s.name}`, link_url: `/supplier-management/suppliers/${s.id}` });
  }

  for (const sl of statusChangesToday) {
    const displayStatus = STATUS_DISPLAY[sl.status as string] ?? sl.status;
    entries.push({ timestamp: sl.createdAt.toISOString(), person_name: null, action_type: "supplier_status_changed", description: `${sl.supplier.name} status changed to ${displayStatus}`, link_url: `/supplier-management/suppliers/${sl.supplier.id}` });
  }

  for (const m of materialsCreatedToday) {
    entries.push({ timestamp: m.createdAt.toISOString(), person_name: null, action_type: "material_created", description: `New material added — ${m.name}`, link_url: `/supplier-management/materials/${m.id}/edit` });
  }

  for (const c of cycleCountsToday) {
    const name = c.performedBy.name ?? "Unknown";
    entries.push({ timestamp: c.performedAt.toISOString(), person_name: name, action_type: "cycle_count", description: `${name} performed cycle count — ${c.materialName} (${c.lotNumber})`, link_url: "/dashboard/inventory/cycle-count" });
  }

  for (const q of quarantineResolvedToday) {
    const name = q.resolvedBy?.name ?? "Unknown";
    entries.push({ timestamp: q.resolvedAt!.toISOString(), person_name: name, action_type: "quarantine_resolved", description: `${name} resolved quarantine record — ${q.recordNumber}`, link_url: "/dashboard/admin/quarantine" });
  }

  for (const u of usersCreatedToday) {
    entries.push({ timestamp: u.createdAt.toISOString(), person_name: null, action_type: "user_created", description: `New user account created — ${u.name ?? "Unknown"}`, link_url: "/dashboard/admin/users" });
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // ── Compute alert counts ───────────────────────────────────────────────────
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
        document_name: d.requirement?.name ?? "Legacy document",
        days_ago: Math.ceil((now.getTime() - new Date(d.expiresAt!).getTime()) / 86400000),
        expired_at: fmtDate(d.expiresAt!),
      })),
      expiring_soon: expiringSoonDocs.map((d) => ({
        supplier_id: d.supplier.id, supplier_name: d.supplier.name,
        document_name: d.requirement?.name ?? "Legacy document",
        days_until: Math.ceil((new Date(d.expiresAt!).getTime() - now.getTime()) / 86400000),
        expires_at: fmtDate(d.expiresAt!),
      })),
      missing: pendingSuppliers.map((s) => ({ supplier_id: s.id, supplier_name: s.name })),
    },
    open_quarantine_records: openQuarantineRecords.map((q) => ({
      id: q.id, record_number: q.recordNumber,
      material_name: q.materialName, supplier_name: q.supplierName,
      created_at: fmtDate(q.createdAt), action_taken: q.actionTaken,
    })),
    today_activity: {
      entries,
      total_count: entries.length,
    },
  });
}
