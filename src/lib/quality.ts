/**
 * Quality area — Customer Incidents and CAPA. Pure rules shared by the routes and the pages:
 * who may use it, the fixed lists, validation, closing requirements, status moves, the history diff
 * and the list filters. Nothing here touches the database.
 */

/** The roles that may use the Quality area. The app has two roles, ADMIN and SUPERVISOR; Quality is for admins. */
export const QUALITY_ROLES: readonly string[] = ["ADMIN"];

/**
 * The one permission check for the whole Quality area — routes, pages and the navigation entry all
 * use this and nothing else.
 */
export const canUseQuality = (role: string | null | undefined): boolean => !!role && QUALITY_ROLES.includes(role);

// ── Fixed lists (stored value → label). Kept as dropdowns so trends can be worked out later. ──

export const FACILITIES = ["Julian Bakery", "624"] as const;
export const COMPANY_WIDE = "Company-wide";
export const facilityLabel = (f: string | null | undefined) => f || COMPANY_WIDE;

export const CHANNELS: Record<string, string> = { email: "Email", phone: "Phone", retailer: "Retailer", other: "Other" };
export const RESPONSE_CHANNELS: Record<string, string> = { email: "Email", phone: "Phone", other: "Other" };
export const CATEGORIES: Record<string, string> = {
  foreign_matter: "Foreign matter", quality_taste: "Quality or taste", allergen_labeling: "Allergen or labeling", packaging_damage: "Packaging or damage",
  illness_health: "Illness or health complaint", shipping_delivery: "Shipping or delivery", order_error: "Order error", other: "Other",
};
export const INCIDENT_STATUSES: Record<string, string> = { open: "Open", under_review: "Under review", closed: "Closed", void: "Void" };
export const CAPA_SOURCES: Record<string, string> = {
  customer_incident: "Customer incident", audit_finding: "Audit finding", supplier_issue: "Supplier issue", internal_inspection: "Internal inspection", other: "Other",
};
export const CAPA_STATUSES: Record<string, string> = { open: "Open", in_progress: "Action in progress", verifying: "Verifying effectiveness", closed: "Closed", void: "Void" };
/** The working order of a CAPA; closed comes after verifying. */
export const CAPA_ORDER = ["open", "in_progress", "verifying", "closed"] as const;

export type RecordType = "incident" | "capa";
export const isReadOnly = (status: string) => status === "closed" || status === "void";

// ── Reference numbers ───────────────────────────────────────────────────────────

export const REFERENCE_KIND: Record<RecordType, string> = { incident: "CI", capa: "CAPA" };
/** CI-2026-001, CAPA-2026-012 … padded to three digits, growing past 999. */
export const formatReference = (kind: string, year: number, n: number) => `${kind}-${year}-${String(n).padStart(3, "0")}`;

// ── Dates ───────────────────────────────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDay(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
/** 2026-11-21 → 11/21/2026 */
export const formatDay = (iso: string | null | undefined) => (iso && ISO_DAY.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "—");
/** A moment in time as a Pacific date and time: 11/21/2026, 2:05 PM PT */
export const formatMoment = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }) + " PT" : "—";
/** A moment in time as a Pacific date: 11/21/2026 */
export const formatMomentDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric" }) : "—";

// ── Fields ──────────────────────────────────────────────────────────────────────

type FieldKind = "text" | "day" | "bool" | "triBool" | "id" | { oneOf: Record<string, string> } | "facility";
export interface FieldSpec { label: string; kind: FieldKind; max?: number }

export const INCIDENT_FIELDS: Record<string, FieldSpec> = {
  facility: { label: "Facility", kind: "facility" },
  dateReceived: { label: "Date received", kind: "day" },
  channel: { label: "How it came in", kind: { oneOf: CHANNELS } },
  customer: { label: "Customer or account", kind: "text", max: 200 },
  productId: { label: "Product (from the list)", kind: "id" },
  productName: { label: "Product", kind: "text", max: 200 },
  lotCode: { label: "Lot code", kind: "text", max: 100 },
  bestByDate: { label: "Best-by date", kind: "day" },
  description: { label: "What happened", kind: "text", max: 5000 },
  category: { label: "Category", kind: { oneOf: CATEGORIES } },
  foodSafetyConcern: { label: "Food safety concern", kind: "bool" },
  immediateAction: { label: "Immediate action taken", kind: "text", max: 5000 },
  responseDate: { label: "Response date", kind: "day" },
  responseChannel: { label: "Response channel", kind: { oneOf: RESPONSE_CHANNELS } },
  responseSummary: { label: "Response summary", kind: "text", max: 5000 },
  capaRequired: { label: "CAPA needed", kind: "triBool" },
  noCapaReason: { label: "Reason no CAPA is needed", kind: "text", max: 2000 },
};
export const CAPA_FIELDS: Record<string, FieldSpec> = {
  facility: { label: "Facility", kind: "facility" },
  source: { label: "Source", kind: { oneOf: CAPA_SOURCES } },
  problem: { label: "The problem", kind: "text", max: 5000 },
  rootCause: { label: "Root cause", kind: "text", max: 5000 },
  correctiveAction: { label: "Corrective action", kind: "text", max: 5000 },
  preventiveAction: { label: "Preventive action", kind: "text", max: 5000 },
  ownerId: { label: "Owner", kind: "id" },
  dueDate: { label: "Due date", kind: "day" },
  effectivenessDate: { label: "Effectiveness check date", kind: "day" },
  effectivenessResult: { label: "Effectiveness check result", kind: "text", max: 5000 },
};
/** Fields the system sets itself; they appear in the history under these names. */
export const SYSTEM_FIELD_LABELS: Record<string, string> = {
  status: "Status", closedDate: "Closed date", closedByName: "Closed by", voidReason: "Void reason", linkedCapa: "Linked CAPA", linkedIncident: "Linked incident",
};
export const FIELDS: Record<RecordType, Record<string, FieldSpec>> = { incident: INCIDENT_FIELDS, capa: CAPA_FIELDS };
export const fieldLabel = (type: RecordType, field: string) => FIELDS[type][field]?.label ?? SYSTEM_FIELD_LABELS[field] ?? field;

export interface FieldProblem { field: string; message: string }
export type FieldValue = string | boolean | null;

/**
 * Reads the editable fields out of a request body. Unknown keys are ignored; a value of the wrong
 * kind is reported, in plain words, against its field. Only the fields present in the body are returned.
 */
export function parseFields(type: RecordType, body: Record<string, unknown> | null | undefined): { data: Record<string, FieldValue>; problems: FieldProblem[] } {
  const data: Record<string, FieldValue> = {};
  const problems: FieldProblem[] = [];
  for (const [field, spec] of Object.entries(FIELDS[type])) {
    if (!body || !(field in body)) continue;
    const raw = body[field];
    const bad = (message: string) => problems.push({ field, message: `${spec.label}: ${message}` });
    if (spec.kind === "text") {
      if (typeof raw !== "string") bad("must be text.");
      else if (raw.trim().length > (spec.max ?? 5000)) bad(`is too long (${spec.max} characters at most).`);
      else data[field] = raw.trim();
    } else if (spec.kind === "day") {
      if (raw === null || raw === "") data[field] = null;
      else if (isIsoDay(raw)) data[field] = raw;
      else bad("enter a valid date.");
    } else if (spec.kind === "bool") {
      if (typeof raw === "boolean") data[field] = raw; else bad("choose yes or no.");
    } else if (spec.kind === "triBool") {
      if (raw === null || typeof raw === "boolean") data[field] = raw; else bad("choose yes, no, or leave it undecided.");
    } else if (spec.kind === "id") {
      if (raw === null || raw === "") data[field] = null;
      else if (typeof raw === "string" && raw.length <= 60) data[field] = raw;
      else bad("is not valid.");
    } else if (spec.kind === "facility") {
      if (raw === null || raw === "") data[field] = null;
      else if (typeof raw === "string" && (FACILITIES as readonly string[]).includes(raw)) data[field] = raw;
      else bad(`choose ${COMPANY_WIDE}, ${FACILITIES.join(" or ")}.`);
    } else {
      if (raw === null || raw === "") data[field] = null;
      else if (typeof raw === "string" && raw in spec.kind.oneOf) data[field] = raw;
      else bad("choose one from the list.");
    }
  }
  return { data, problems };
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** What a new incident must have: the date received, how it came in, and what happened. */
export function incidentCreateProblems(d: Record<string, FieldValue>): FieldProblem[] {
  const out: FieldProblem[] = [];
  if (blank(d.dateReceived)) out.push({ field: "dateReceived", message: "Date received: enter the date." });
  if (blank(d.channel)) out.push({ field: "channel", message: "How it came in: choose Email, Phone, Retailer or Other." });
  if (blank(d.description)) out.push({ field: "description", message: "What happened: describe the incident." });
  return out;
}

/** What a new CAPA must have: its source and the problem. */
export function capaCreateProblems(d: Record<string, FieldValue>): FieldProblem[] {
  const out: FieldProblem[] = [];
  if (blank(d.source)) out.push({ field: "source", message: "Source: choose one from the list." });
  if (blank(d.problem)) out.push({ field: "problem", message: "The problem: describe it." });
  return out;
}

export interface IncidentForClosing {
  category?: string | null; responseDate?: string | null; foodSafetyConcern?: boolean; immediateAction?: string | null;
  capaRequired?: boolean | null; noCapaReason?: string | null;
}

/** Whether the CAPA decision has been made: a CAPA is linked, or "no CAPA needed" with its reason. */
export function capaDecisionMade(i: IncidentForClosing, hasLinkedCapa: boolean): boolean {
  return hasLinkedCapa || (i.capaRequired === false && !blank(i.noCapaReason));
}

/**
 * What still stops an incident from being closed, by field, in plain words. Empty = it can be closed.
 * A food safety concern cannot be closed without its immediate action and without the CAPA decision.
 */
export function incidentClosingProblems(i: IncidentForClosing, hasLinkedCapa: boolean, closedDate: string | null | undefined): FieldProblem[] {
  const out: FieldProblem[] = [];
  if (blank(i.category)) out.push({ field: "category", message: "Category: choose one." });
  if (blank(i.responseDate)) out.push({ field: "responseDate", message: "Response to the customer: enter the date of the response." });
  if (i.foodSafetyConcern && blank(i.immediateAction)) out.push({ field: "immediateAction", message: "Immediate action taken: required because this is a food safety concern." });
  if (!capaDecisionMade(i, hasLinkedCapa)) {
    out.push({
      field: "capaRequired",
      message: i.capaRequired === false
        ? "CAPA decision: give the reason no CAPA is needed."
        : `CAPA decision: open or link a CAPA, or choose "No CAPA needed" and give the reason.${i.foodSafetyConcern ? " A food safety concern cannot be closed without this decision." : ""}`,
    });
  }
  if (!isIsoDay(closedDate)) out.push({ field: "closedDate", message: "Closed date: enter the date." });
  return out;
}

export interface CapaForClosing {
  rootCause?: string | null; correctiveAction?: string | null; preventiveAction?: string | null; ownerId?: string | null; dueDate?: string | null;
  effectivenessDate?: string | null; effectivenessResult?: string | null;
}

/** What still stops a CAPA from being closed, by field. Empty = it can be closed. */
export function capaClosingProblems(c: CapaForClosing): FieldProblem[] {
  const need: [keyof CapaForClosing, string][] = [
    ["rootCause", "Root cause: describe it."], ["correctiveAction", "Corrective action: describe it."], ["preventiveAction", "Preventive action: describe it."],
    ["ownerId", "Owner: choose who is responsible."], ["dueDate", "Due date: enter the date."],
    ["effectivenessDate", "Effectiveness check: enter the date of the check."], ["effectivenessResult", "Effectiveness check: enter the result."],
  ];
  return need.filter(([f]) => blank(c[f])).map(([field, message]) => ({ field, message }));
}

// ── Status moves ────────────────────────────────────────────────────────────────

export type StatusMove = { ok: true; backward: boolean } | { ok: false; error: string };

/** Incidents move freely between Open and Under review. Closing, voiding and reopening are their own actions. */
export function incidentMove(from: string, to: string): StatusMove {
  if (isReadOnly(from)) return { ok: false, error: `A ${INCIDENT_STATUSES[from].toLowerCase()} incident is read-only. Reopen it first.` };
  if (!["open", "under_review"].includes(to)) return { ok: false, error: "Choose Open or Under review." };
  if (from === to) return { ok: false, error: `The incident is already ${INCIDENT_STATUSES[to]}.` };
  return { ok: true, backward: false };
}

/**
 * A CAPA moves one step at a time along Open → Action in progress → Verifying effectiveness.
 * A step back is allowed but needs a reason. Closing (from Verifying effectiveness) is its own action.
 */
export function capaMove(from: string, to: string): StatusMove {
  if (isReadOnly(from)) return { ok: false, error: `A ${CAPA_STATUSES[from].toLowerCase()} CAPA is read-only. Reopen it first.` };
  const a = CAPA_ORDER.indexOf(from as (typeof CAPA_ORDER)[number]);
  const b = CAPA_ORDER.indexOf(to as (typeof CAPA_ORDER)[number]);
  if (b < 0 || to === "closed") return { ok: false, error: "Choose Open, Action in progress or Verifying effectiveness." };
  if (a === b) return { ok: false, error: `The CAPA is already ${CAPA_STATUSES[to]}.` };
  if (Math.abs(a - b) !== 1) return { ok: false, error: `A CAPA moves one step at a time: from ${CAPA_STATUSES[from]} it cannot go straight to ${CAPA_STATUSES[to]}.` };
  return { ok: true, backward: b < a };
}

/** A CAPA can only be closed from Verifying effectiveness. */
export const capaCanClose = (status: string) => status === "verifying";
/** Where a reopened record goes back to. */
export const REOPEN_TO: Record<RecordType, Record<string, string>> = {
  incident: { closed: "under_review", void: "open" },
  capa: { closed: "verifying", void: "open" },
};

// ── History ─────────────────────────────────────────────────────────────────────

export interface Change { field: string; from: FieldValue; to: FieldValue }
export type EventAction = "created" | "updated" | "status_changed" | "closed" | "reopened" | "voided" | "linked" | "unlinked";
export const ACTION_LABELS: Record<EventAction, string> = {
  created: "Created", updated: "Updated", status_changed: "Status changed", closed: "Closed", reopened: "Reopened", voided: "Voided", linked: "Linked", unlinked: "Unlinked",
};

/** A date value, whatever context created it. */
export const isDate = (v: unknown): v is Date => Object.prototype.toString.call(v) === "[object Date]";

/** Dates as YYYY-MM-DD, empty text and missing values as null, so "nothing" never differs from "nothing". */
export function normalize(v: unknown): FieldValue {
  if (v === undefined || v === null) return null;
  if (isDate(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  return String(v);
}

/** The one diff used by every write: which of the given fields really changed, and from what to what. */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, fields?: string[]): Change[] {
  const out: Change[] = [];
  for (const field of fields ?? Object.keys(after)) {
    if (!(field in after)) continue;
    const [from, to] = [normalize(before[field]), normalize(after[field])];
    if (from !== to) out.push({ field, from, to });
  }
  return out;
}

/** A change as it is shown in the History section: "Category: (empty) → Foreign matter". */
export function describeChange(type: RecordType, c: Change, names: Record<string, string> = {}): string {
  const spec = FIELDS[type][c.field];
  const show = (v: FieldValue): string => {
    if (v === null) return "(empty)";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (spec?.kind === "day" || c.field === "closedDate") return formatDay(v);
    if (spec && typeof spec.kind === "object") return spec.kind.oneOf[v] ?? v;
    if (c.field === "status") return (type === "incident" ? INCIDENT_STATUSES : CAPA_STATUSES)[v] ?? v;
    if (spec?.kind === "id") return names[v] ?? v;
    return v;
  };
  const from = c.field === "facility" && c.from === null ? COMPANY_WIDE : show(c.from);
  const to = c.field === "facility" && c.to === null ? COMPANY_WIDE : show(c.to);
  return `${fieldLabel(type, c.field)}: ${from} → ${to}`;
}

// ── Lists ───────────────────────────────────────────────────────────────────────

export interface IncidentRow {
  id: string; reference: string; facility: string | null; dateReceived: string; channel: string; customer: string; productId: string | null; productName: string;
  description: string; category: string | null; foodSafetyConcern: boolean; status: string; updatedAt: string; updatedByName: string;
  capaId: string | null; capaReference: string | null;
}
export interface CapaRow {
  id: string; reference: string; facility: string | null; source: string; problem: string; status: string; ownerId: string | null; ownerName: string;
  dueDate: string | null; createdAt: string; updatedAt: string; updatedByName: string; incidentReferences: string[];
}
export interface ListFilters { status?: string; category?: string; source?: string; product?: string; facility?: string; from?: string; to?: string; search?: string; showVoid?: boolean }

const matchesText = (needle: string | undefined, ...hay: (string | null | undefined)[]) => {
  const n = needle?.trim().toLowerCase();
  return !n || hay.some((h) => (h ?? "").toLowerCase().includes(n));
};
const matchesFacility = (filter: string | undefined, facility: string | null) => !filter || (filter === COMPANY_WIDE ? facility === null : facility === filter);

/** Void records are hidden unless asked for (or unless the status filter asks for Void itself). */
export function filterIncidents(rows: IncidentRow[], f: ListFilters): IncidentRow[] {
  return rows.filter((r) =>
    (f.showVoid || f.status === "void" || r.status !== "void") &&
    (!f.status || r.status === f.status) &&
    (!f.category || r.category === f.category) &&
    matchesFacility(f.facility, r.facility) &&
    matchesText(f.product, r.productName) &&
    (!f.from || r.dateReceived >= f.from) && (!f.to || r.dateReceived <= f.to) &&
    matchesText(f.search, r.reference, r.description),
  );
}

/** The date a CAPA is listed and filtered by: the Pacific day it was created. */
export const capaDay = (r: Pick<CapaRow, "createdAt">) => {
  const [m, d, y] = formatMomentDay(r.createdAt).split("/");
  return `${y}-${m}-${d}`;
};

export function filterCapas(rows: CapaRow[], f: ListFilters): CapaRow[] {
  return rows.filter((r) =>
    (f.showVoid || f.status === "void" || r.status !== "void") &&
    (!f.status || r.status === f.status) &&
    (!f.source || r.source === f.source) &&
    matchesFacility(f.facility, r.facility) &&
    (!f.from || capaDay(r) >= f.from) && (!f.to || capaDay(r) <= f.to) &&
    matchesText(f.search, r.reference, r.problem),
  );
}

/** Overdue: past its due date (Pacific) and neither closed nor void. */
export function isOverdue(c: Pick<CapaRow, "dueDate" | "status">, today: string): boolean {
  return !!c.dueDate && c.dueDate < today && !isReadOnly(c.status);
}
