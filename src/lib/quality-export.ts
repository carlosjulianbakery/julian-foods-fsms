/**
 * Quality — CSV exports. Pure: the cell and file format, the columns of each export, and the filters as
 * they travel in the export link. The routes apply the filters again on the server with the same functions
 * the lists use, so an export is exactly what the list shows.
 */
import {
  CAPA_SOURCES, CAPA_STATUSES, CATEGORIES, CHANNELS, INCIDENT_STATUSES, RESPONSE_CHANNELS, REVIEW_COUNT_LABELS, facilityLabel, formatDay, formatMomentDay, periodLabel,
  type ListFilters, type ReviewRow,
} from "@/lib/quality";

// ── The file format ─────────────────────────────────────────────────────────────

/** The byte order mark Excel needs to read the file as UTF-8 (so accents open correctly). */
export const CSV_BOM = String.fromCharCode(0xfeff);
export type CsvValue = string | number | boolean | null | undefined;

/**
 * One cell. Yes / No for booleans, empty for nothing. Text that a spreadsheet would run as a formula
 * (it starts with =, +, - or @, or with a tab or carriage return) gets a leading apostrophe. A cell with
 * a comma, a quote or a line break is quoted, with its quotes doubled.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file: BOM, heading row, one line per record, CRLF line ends (what Excel expects). */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return CSV_BOM + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type ExportKind = "incidents" | "capas" | "reviews";
/** quality-incidents-2026-11-22.csv — the date is today in Pacific time. */
export const exportFileName = (kind: ExportKind, pacificToday: string) => `quality-${kind}-${pacificToday}.csv`;

// ── The filters in the export link ──────────────────────────────────────────────

const TEXT_FILTERS = ["status", "category", "source", "product", "facility", "from", "to", "search"] as const;
export interface ExportFilters extends ListFilters { /** Reviews only: the year shown. */ year?: string }

/** The export address for a list as it is filtered right now. Only the filters that are set are sent. */
export function exportHref(kind: ExportKind, f: ExportFilters = {}): string {
  const q = new URLSearchParams();
  for (const key of TEXT_FILTERS) { const v = f[key]?.trim(); if (v) q.set(key, v); }
  if (f.showVoid) q.set("showVoid", "1");
  if (f.year) q.set("year", f.year);
  const query = q.toString();
  return `/api/quality/${kind}/export${query ? `?${query}` : ""}`;
}

/** Reads the filters back on the server. Anything that is not a known filter is ignored. */
export function parseExportFilters(q: URLSearchParams): ExportFilters {
  const f: ExportFilters = {};
  for (const key of TEXT_FILTERS) { const v = q.get(key)?.trim(); if (v) f[key] = v.slice(0, 200); }
  if (["1", "true"].includes(q.get("showVoid") ?? "")) f.showVoid = true;
  const year = q.get("year") ?? "";
  if (/^\d{4}$/.test(year)) f.year = year;
  return f;
}

// ── The columns ─────────────────────────────────────────────────────────────────

/** A stored day (YYYY-MM-DD) as MM/DD/YYYY; empty when there is none. */
const dayCell = (iso: string | null | undefined) => (iso ? formatDay(iso) : "");
/** A moment as its Pacific date, MM/DD/YYYY; empty when there is none. */
const momentCell = (iso: string | null | undefined) => (iso ? formatMomentDay(iso) : "");
const label = (map: Record<string, string>, v: string | null | undefined) => (v ? map[v] ?? v : "");

export interface Column<T> { label: string; value: (row: T) => CsvValue }

export interface IncidentExportRow {
  reference: string; dateReceived: string; channel: string; customer: string; productName: string; lotCode: string; bestByDate: string | null; description: string;
  category: string | null; foodSafetyConcern: boolean; immediateAction: string; responseDate: string | null; responseChannel: string | null; responseSummary: string;
  capaRequired: boolean | null; noCapaReason: string; capaReference: string | null; status: string; closedDate: string | null; closedByName: string; voidReason: string | null;
  facility: string | null; createdByName: string; createdAt: string; updatedByName: string; updatedAt: string; attachmentCount: number;
}
/** The CAPA decision in words: a CAPA is linked, none is needed, or it has not been decided. */
export const capaDecisionLabel = (r: Pick<IncidentExportRow, "capaReference" | "capaRequired">) =>
  r.capaReference ? "CAPA linked" : r.capaRequired === false ? "No CAPA needed" : "Not decided";

export const INCIDENT_COLUMNS: Column<IncidentExportRow>[] = [
  { label: "Reference", value: (r) => r.reference },
  { label: "Date received", value: (r) => dayCell(r.dateReceived) },
  { label: "Channel", value: (r) => label(CHANNELS, r.channel) },
  { label: "Customer", value: (r) => r.customer },
  { label: "Product", value: (r) => r.productName },
  { label: "Lot code", value: (r) => r.lotCode },
  { label: "Best-by date", value: (r) => dayCell(r.bestByDate) },
  { label: "What happened", value: (r) => r.description },
  { label: "Category", value: (r) => label(CATEGORIES, r.category) },
  { label: "Food safety concern", value: (r) => r.foodSafetyConcern },
  { label: "Immediate action", value: (r) => r.immediateAction },
  { label: "Response date", value: (r) => dayCell(r.responseDate) },
  { label: "Response channel", value: (r) => label(RESPONSE_CHANNELS, r.responseChannel) },
  { label: "Response summary", value: (r) => r.responseSummary },
  { label: "CAPA decision", value: capaDecisionLabel },
  { label: "Reason no CAPA is needed", value: (r) => r.noCapaReason },
  { label: "Linked CAPA", value: (r) => r.capaReference ?? "" },
  { label: "Status", value: (r) => label(INCIDENT_STATUSES, r.status) },
  { label: "Closed date", value: (r) => dayCell(r.closedDate) },
  { label: "Closed by", value: (r) => r.closedByName },
  { label: "Void reason", value: (r) => r.voidReason ?? "" },
  { label: "Facility", value: (r) => facilityLabel(r.facility) },
  { label: "Created by", value: (r) => r.createdByName },
  { label: "Created date", value: (r) => momentCell(r.createdAt) },
  { label: "Last changed by", value: (r) => r.updatedByName },
  { label: "Last changed date", value: (r) => momentCell(r.updatedAt) },
  { label: "Attachments", value: (r) => r.attachmentCount },
];

export interface CapaExportRow {
  reference: string; source: string; problem: string; rootCause: string; correctiveAction: string; preventiveAction: string; ownerName: string; dueDate: string | null;
  overdue: boolean; effectivenessDate: string | null; effectivenessResult: string; status: string; closedDate: string | null; closedByName: string; voidReason: string | null;
  incidentReferences: string[]; facility: string | null; createdByName: string; createdAt: string; updatedByName: string; updatedAt: string; attachmentCount: number;
}
export const CAPA_COLUMNS: Column<CapaExportRow>[] = [
  { label: "Reference", value: (r) => r.reference },
  { label: "Source", value: (r) => label(CAPA_SOURCES, r.source) },
  { label: "The problem", value: (r) => r.problem },
  { label: "Root cause", value: (r) => r.rootCause },
  { label: "Corrective action", value: (r) => r.correctiveAction },
  { label: "Preventive action", value: (r) => r.preventiveAction },
  { label: "Owner", value: (r) => r.ownerName },
  { label: "Due date", value: (r) => dayCell(r.dueDate) },
  { label: "Overdue", value: (r) => r.overdue },
  { label: "Effectiveness check date", value: (r) => dayCell(r.effectivenessDate) },
  { label: "Effectiveness check result", value: (r) => r.effectivenessResult },
  { label: "Status", value: (r) => label(CAPA_STATUSES, r.status) },
  { label: "Closed date", value: (r) => dayCell(r.closedDate) },
  { label: "Closed by", value: (r) => r.closedByName },
  { label: "Void reason", value: (r) => r.voidReason ?? "" },
  { label: "Linked incidents", value: (r) => r.incidentReferences.join("; ") },
  { label: "Facility", value: (r) => facilityLabel(r.facility) },
  { label: "Created by", value: (r) => r.createdByName },
  { label: "Created date", value: (r) => momentCell(r.createdAt) },
  { label: "Last changed by", value: (r) => r.updatedByName },
  { label: "Last changed date", value: (r) => momentCell(r.updatedAt) },
  { label: "Attachments", value: (r) => r.attachmentCount },
];

export const REVIEW_COLUMNS: Column<ReviewRow>[] = [
  { label: "Period", value: (r) => periodLabel(r.period) },
  { label: "Review date", value: (r) => dayCell(r.reviewDate) },
  { label: "Reviewer", value: (r) => r.reviewedByName },
  { label: "What was reviewed", value: (r) => r.whatWasReviewed },
  { label: "Notes", value: (r) => r.notes },
  { label: REVIEW_COUNT_LABELS.openIncidents, value: (r) => r.counts?.openIncidents ?? 0 },
  { label: REVIEW_COUNT_LABELS.openCapas, value: (r) => r.counts?.openCapas ?? 0 },
  { label: REVIEW_COUNT_LABELS.overdueCapas, value: (r) => r.counts?.overdueCapas ?? 0 },
  { label: REVIEW_COUNT_LABELS.incidentsReceived, value: (r) => r.counts?.incidentsReceived ?? 0 },
];

export const csvOf = <T,>(columns: Column<T>[], rows: T[]) => toCsv(columns.map((c) => c.label), rows.map((r) => columns.map((c) => c.value(r))));
