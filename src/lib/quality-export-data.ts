/**
 * Quality — what the CSV exports and the record PDFs are made from. Read-only: nothing here writes.
 * The exports run the list's own filter functions on the server, over the list's own rows, so a file holds
 * exactly the records the filtered list shows; the browser never says which records to export.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { filterCapas, filterIncidents, filterReviews, isOverdue, type Change } from "@/lib/quality";
import {
  CAPA_COLUMNS, INCIDENT_COLUMNS, REVIEW_COLUMNS, csvOf, exportFileName, parseExportFilters, type CapaExportRow, type ExportFilters, type ExportKind, type IncidentExportRow,
} from "@/lib/quality-export";
import { buildQualityPdfHtml } from "@/lib/quality-pdf";
import { listReviews } from "@/lib/quality-reviews";
import { day, getCapa, getIncident, listCapas, listIncidents, userNames, type Actor } from "@/lib/quality-server";

/** How many attachments each record has. Removed ones are not counted. */
async function attachmentCounts(type: "incident" | "capa", ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const rows = await prisma.qualityAttachment.findMany({ where: { recordType: type, recordId: { in: ids }, removedAt: null }, select: { recordId: true } });
  return rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.recordId]: (m[r.recordId] ?? 0) + 1 }), {});
}

export async function incidentExportRows(filters: ExportFilters): Promise<IncidentExportRow[]> {
  const shown = filterIncidents(await listIncidents(), filters);
  const ids = shown.map((r) => r.id);
  const full = ids.length ? await prisma.qualityIncident.findMany({ where: { id: { in: ids } } }) : [];
  const [names, counts] = await Promise.all([userNames(prisma, full.flatMap((r) => [r.closedById, r.createdById, r.updatedById])), attachmentCounts("incident", ids)]);
  return shown.flatMap((row) => {
    const r = full.find((x) => x.id === row.id);
    if (!r) return [];
    return [{
      reference: r.reference, dateReceived: day(r.dateReceived)!, channel: r.channel, customer: r.customer, productName: r.productName, lotCode: r.lotCode, bestByDate: day(r.bestByDate),
      description: r.description, category: r.category, foodSafetyConcern: r.foodSafetyConcern, immediateAction: r.immediateAction, responseDate: day(r.responseDate),
      responseChannel: r.responseChannel, responseSummary: r.responseSummary, capaRequired: r.capaRequired, noCapaReason: r.noCapaReason, capaReference: row.capaReference,
      status: r.status, closedDate: day(r.closedDate), closedByName: names[r.closedById ?? ""] ?? "", voidReason: r.voidReason, facility: r.facility,
      createdByName: names[r.createdById ?? ""] ?? "", createdAt: r.createdAt.toISOString(), updatedByName: names[r.updatedById ?? ""] ?? "", updatedAt: r.updatedAt.toISOString(),
      attachmentCount: counts[r.id] ?? 0,
    }];
  });
}

export async function capaExportRows(filters: ExportFilters): Promise<CapaExportRow[]> {
  const shown = filterCapas(await listCapas(), filters);
  const ids = shown.map((r) => r.id);
  const full = ids.length ? await prisma.qualityCapa.findMany({ where: { id: { in: ids } } }) : [];
  const [names, counts] = await Promise.all([userNames(prisma, full.flatMap((r) => [r.closedById, r.createdById, r.updatedById])), attachmentCounts("capa", ids)]);
  const today = getPacificToday();
  return shown.flatMap((row) => {
    const r = full.find((x) => x.id === row.id);
    if (!r) return [];
    return [{
      reference: r.reference, source: r.source, problem: r.problem, rootCause: r.rootCause, correctiveAction: r.correctiveAction, preventiveAction: r.preventiveAction,
      ownerName: row.ownerName, dueDate: day(r.dueDate), overdue: isOverdue({ dueDate: day(r.dueDate), status: r.status }, today), effectivenessDate: day(r.effectivenessDate),
      effectivenessResult: r.effectivenessResult, status: r.status, closedDate: day(r.closedDate), closedByName: r.closedByName || names[r.closedById ?? ""] || "",
      voidReason: r.voidReason, incidentReferences: row.incidentReferences, facility: r.facility, createdByName: names[r.createdById ?? ""] ?? "", createdAt: r.createdAt.toISOString(),
      updatedByName: names[r.updatedById ?? ""] ?? "", updatedAt: r.updatedAt.toISOString(), attachmentCount: counts[r.id] ?? 0,
    }];
  });
}

const BUILDERS: Record<ExportKind, (f: ExportFilters) => Promise<string>> = {
  incidents: async (f) => csvOf(INCIDENT_COLUMNS, await incidentExportRows(f)),
  capas: async (f) => csvOf(CAPA_COLUMNS, await capaExportRows(f)),
  reviews: async (f) => csvOf(REVIEW_COLUMNS, filterReviews((await listReviews()).reviews, f.year)),
};

/** The file an export route answers with, once the route has checked the session and canUseQuality. */
export async function exportFile(kind: ExportKind, url: URL): Promise<Response> {
  try {
    const csv = await BUILDERS[kind](parseExportFilters(url.searchParams));
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(kind, getPacificToday())}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("[quality] export failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not prepare the export." }, { status: 500 });
  }
}

// ── The record PDF ──────────────────────────────────────────────────────────────

/** Names for the ids that appear in the history (owners and products), so a change reads "Owner: (empty) → Chris Pence". */
async function namesInHistory(events: { changes: Change[] }[]): Promise<Record<string, string>> {
  const ids = (field: string) => events.flatMap((e) => e.changes.filter((c) => c.field === field).flatMap((c) => [c.from, c.to])).filter((v): v is string => typeof v === "string");
  const [users, productIds] = [await userNames(prisma, ids("ownerId")), Array.from(new Set(ids("productId")))];
  const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [];
  return { ...users, ...Object.fromEntries(products.map((p) => [p.id, p.name])) };
}

/** The page layout of one record's PDF and its file name. The browser turns the layout into the PDF file. */
export async function recordPdf(type: "incident" | "capa", id: string, actor: Actor): Promise<{ html: string; filename: string }> {
  const data = type === "incident" ? await getIncident(id) : await getCapa(id);
  const linked = "capa" in data ? (data.capa ? [{ reference: data.capa.reference, status: data.capa.status }] : []) : data.incidents.map((i) => ({ reference: i.reference, status: i.status }));
  const names = { ...(await namesInHistory(data.events)), ...data.names };
  const html = buildQualityPdfHtml({ type, record: data.record, names, linked, attachments: data.attachments, events: data.events, generatedAt: new Date().toISOString(), generatedBy: actor.name });
  return { html, filename: `${String(data.record.reference)}.pdf` };
}
