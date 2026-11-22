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

export type RecordType = "incident" | "capa" | "review";
export const isReadOnly = (status: string) => status === "closed" || status === "void";

// ── Reference numbers ───────────────────────────────────────────────────────────

export const REFERENCE_KIND: Record<"incident" | "capa", string> = { incident: "CI", capa: "CAPA" };
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
/** The monthly review. The reviewer and the counts are recorded by the system, not typed. */
export const REVIEW_FIELDS: Record<string, FieldSpec> = {
  reviewDate: { label: "Review date", kind: "day" },
  whatWasReviewed: { label: "What was reviewed", kind: "text", max: 5000 },
  notes: { label: "Notes", kind: "text", max: 5000 },
};
/** Fields the system sets itself; they appear in the history under these names. */
export const SYSTEM_FIELD_LABELS: Record<string, string> = {
  status: "Status", closedDate: "Closed date", closedByName: "Closed by", voidReason: "Void reason", linkedCapa: "Linked CAPA", linkedIncident: "Linked incident",
  attachment: "Attachment", followUpTask: "Follow-up task",
};
export const FIELDS: Record<RecordType, Record<string, FieldSpec>> = { incident: INCIDENT_FIELDS, capa: CAPA_FIELDS, review: REVIEW_FIELDS };
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
export const REOPEN_TO: Record<"incident" | "capa", Record<string, string>> = {
  incident: { closed: "under_review", void: "open" },
  capa: { closed: "verifying", void: "open" },
};

// ── History ─────────────────────────────────────────────────────────────────────

export interface Change { field: string; from: FieldValue; to: FieldValue }
export type EventAction = "created" | "updated" | "status_changed" | "closed" | "reopened" | "voided" | "linked" | "unlinked" | "attachment_added" | "attachment_removed" | "task_completed";
export const ACTION_LABELS: Record<EventAction, string> = {
  created: "Created", updated: "Updated", status_changed: "Status changed", closed: "Closed", reopened: "Reopened", voided: "Voided", linked: "Linked", unlinked: "Unlinked",
  attachment_added: "Attachment added", attachment_removed: "Attachment removed", task_completed: "Follow-up task completed",
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
    if (c.field === "status") return (type === "capa" ? CAPA_STATUSES : INCIDENT_STATUSES)[v] ?? v;
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

// ── Attachments ─────────────────────────────────────────────────────────────────

export const ATTACHMENT_TYPES: Record<string, string> = {
  "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP", "image/heic": "HEIC", "image/heif": "HEIC", "application/pdf": "PDF",
};
export const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_RECORD = 10;
export const ATTACHMENT_KINDS: Record<string, string> = { evidence: "Evidence", customer_response: "Message sent to the customer" };
/** Types the browser can show as a picture. HEIC and PDF get a file icon and a download link. */
export const hasThumbnail = (mimeType: string | null | undefined) => ["image/jpeg", "image/png", "image/webp"].includes(mimeType ?? "");
export const formatBytes = (n: number | null | undefined) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export interface AttachmentInput { recordType?: unknown; kind?: unknown; fileName?: unknown; fileSize?: unknown; mimeType?: unknown; description?: unknown }

/**
 * Why a file cannot be attached, in plain words; null when it can. Checked when the upload token is
 * asked for and again when the attachment is recorded. `activeCount` is how many the record already has.
 */
export function attachmentProblem(a: AttachmentInput, activeCount: number): string | null {
  if (a.recordType !== "incident" && a.recordType !== "capa") return "Attachments belong to an incident or a CAPA.";
  if (typeof a.kind !== "string" || !(a.kind in ATTACHMENT_KINDS)) return "Choose what the file is: evidence, or the message sent to the customer.";
  if (a.kind === "customer_response" && a.recordType !== "incident") return "The message sent to the customer belongs to an incident.";
  if (typeof a.fileName !== "string" || !a.fileName.trim()) return "The file has no name.";
  if (a.fileName.length > 200) return "The file name is too long (200 characters at most).";
  if (typeof a.mimeType !== "string" || !(a.mimeType in ATTACHMENT_TYPES)) return "That file type is not allowed. Use JPEG, PNG, WebP, HEIC or PDF.";
  if (typeof a.fileSize !== "number" || !Number.isInteger(a.fileSize) || a.fileSize <= 0) return "The file is empty.";
  if (a.fileSize > ATTACHMENT_MAX_BYTES) return "The file is too large (15 MB at most).";
  if (a.description !== undefined && a.description !== null && (typeof a.description !== "string" || a.description.length > 500)) return "The description is too long (500 characters at most).";
  if (activeCount >= ATTACHMENT_MAX_PER_RECORD) return `This record already has ${ATTACHMENT_MAX_PER_RECORD} attachments, the most allowed. Remove one first.`;
  return null;
}

/** Where a record's files are stored. A recorded attachment must point inside its own record's folder. */
export const attachmentFolder = (recordType: string, recordId: string) => `quality/${recordType}/${recordId}/`;
export function attachmentUrlBelongs(url: unknown, recordType: string, recordId: string): boolean {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com") && decodeURIComponent(u.pathname).startsWith(`/${attachmentFolder(recordType, recordId)}`);
  } catch { return false; }
}

export interface AttachmentRow {
  id: string; kind: string; fileName: string; fileSize: number | null; mimeType: string | null; description: string; uploadedAt: string; uploadedByName: string;
  removedAt: string | null; removedByName: string; removeReason: string | null;
}

// ── The CAPA follow-up task ─────────────────────────────────────────────────────

export const QUALITY_CAPA_FORM_KEY = "quality_capa";
export const QUALITY_REVIEW_FORM_KEY = "quality_review";
/** The facility the two Quality task rules are attached to (a rule needs one; the records stay company-wide). */
export const QUALITY_RULE_FACILITY = "Julian Bakery";
export const CAPA_RULE_TITLE = "CAPA follow-up";

/** The task's label: "CAPA-2026-003: Mislabeled allergen on the sleeve…" */
export function capaTaskLabel(reference: string, problem: string): string {
  const text = problem.replace(/\s+/g, " ").trim();
  return `${reference}: ${text.length > 70 ? `${text.slice(0, 69).trimEnd()}…` : text}`;
}
export const capaTaskKey = (capaId: string) => `capa:${capaId}`;

/** A task whose status says nobody has acted on it. The status alone is not proof: see taskHasHistory. */
export const taskUntouched = (status: string) => ["UPCOMING", "DUE_TODAY", "OVERDUE"].includes(status);
export const taskOpen = (status: string) => taskUntouched(status) || status === "IN_PROGRESS";
export const TASK_STATUS_LABELS: Record<string, string> = { UPCOMING: "Upcoming", DUE_TODAY: "Due today", IN_PROGRESS: "In progress", OVERDUE: "Overdue", DONE: "Done", SKIPPED: "Skipped", MISSED: "Missed" };

/** The audit rows the CAPA sync writes itself when it creates or moves a task. Every other row means a person acted on the task. */
export const CAPA_SYNC_AUDIT_ACTIONS: readonly string[] = ["created", "updated"];
/** The audit row written the first time a Quality task is opened from its Start button. */
export const TASK_STARTED_ACTION = "started";
/**
 * Whether a task has any audit history of its own (started, reopened, completed …). The shared status
 * promotion turns a started task that passes its due date into "Overdue", so its status no longer says
 * it was started; its audit rows still do.
 */
export const taskHasHistory = (auditActions: readonly string[] | undefined) => (auditActions ?? []).some((a) => !CAPA_SYNC_AUDIT_ACTIONS.includes(a));
export const taskWasStarted = (auditActions: readonly string[] | undefined) => (auditActions ?? []).includes(TASK_STARTED_ACTION);

/**
 * The status of a CAPA task after its due date moved. A task in progress stays in progress; a started
 * task that had gone overdue is in progress again once its date is no longer in the past; a task nobody
 * acted on simply follows the calendar.
 */
export function capaTaskStatusAfterMove(current: string, wasStarted: boolean, due: string, today: string): string {
  if (current === "IN_PROGRESS") return current;
  if (due < today) return "OVERDUE";
  if (wasStarted) return "IN_PROGRESS";
  return due === today ? "DUE_TODAY" : "UPCOMING";
}

export interface CapaForTask { id: string; reference: string; problem: string; status: string; ownerId: string | null; dueDate: string | null }
export interface TaskForCapa { status: string; dueDate: string; ownerUserId: string | null; label: string; /** The actions of the task's audit rows. */ auditActions?: readonly string[] }
export type CapaTaskPlan =
  | { do: "nothing" }
  | { do: "create"; dueDate: string; ownerUserId: string; label: string }
  | { do: "update"; dueDate: string; ownerUserId: string; label: string; changed: string[] }
  | { do: "delete" }
  | { do: "complete" };

/**
 * What should happen to a CAPA's follow-up task after the CAPA changed. One rule for every case:
 *  - a task exists only while the CAPA has BOTH an owner and a due date;
 *  - the task is done when the CAPA reaches Verifying effectiveness or Closed, whichever comes first;
 *  - an untouched task follows the CAPA (new date, new owner; removed when it is no longer wanted);
 *  - a started task keeps its history: only its date and owner follow, and it is never removed. A task
 *    counts as started when it is in progress OR has any audit history of its own, whatever its status;
 *  - a finished, skipped or missed task is never changed and never recreated.
 */
export function planCapaTask(capa: CapaForTask, task: TaskForCapa | null): CapaTaskPlan {
  const wanted = !!capa.ownerId && !!capa.dueDate;
  const removable = !!task && taskUntouched(task.status) && !taskHasHistory(task.auditActions);
  if (capa.status === "void") return removable ? { do: "delete" } : { do: "nothing" };
  if (capa.status === "verifying" || capa.status === "closed") return task && taskOpen(task.status) ? { do: "complete" } : { do: "nothing" };
  // Open or Action in progress
  if (!task) return wanted ? { do: "create", dueDate: capa.dueDate!, ownerUserId: capa.ownerId!, label: capaTaskLabel(capa.reference, capa.problem) } : { do: "nothing" };
  if (!taskOpen(task.status)) return { do: "nothing" };
  if (!wanted) return removable ? { do: "delete" } : { do: "nothing" };
  const label = capaTaskLabel(capa.reference, capa.problem);
  const changed = [task.dueDate !== capa.dueDate ? "due date" : "", task.ownerUserId !== capa.ownerId ? "owner" : "", task.label !== label ? "label" : ""].filter(Boolean);
  return changed.length ? { do: "update", dueDate: capa.dueDate!, ownerUserId: capa.ownerId!, label, changed } : { do: "nothing" };
}

// ── The monthly review ──────────────────────────────────────────────────────────

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isPeriod = (v: unknown): v is string => typeof v === "string" && PERIOD.test(v);
/** The month a Pacific date falls in: 2026-11. */
export const periodOfDay = (day: string) => day.slice(0, 7);
export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  return { start: `${period}-01`, end: `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}
/** November 2026 */
export const periodLabel = (period: string) =>
  isPeriod(period) ? new Date(`${period}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : period;
export const reviewReference = (period: string) => `REVIEW-${period}`;

export interface ReviewCounts { openIncidents: number; openCapas: number; overdueCapas: number; incidentsReceived: number }
export const REVIEW_COUNT_LABELS: Record<keyof ReviewCounts, string> = {
  openIncidents: "Open incidents", openCapas: "Open CAPAs", overdueCapas: "Overdue CAPAs", incidentsReceived: "Incidents received that month",
};

/** The numbers recorded with a review, taken at the moment it is saved. Void records are never counted. */
export function reviewCounts(
  incidents: { status: string; dateReceived: string }[], capas: { status: string; dueDate: string | null }[], period: string, today: string,
): ReviewCounts {
  const { start, end } = periodBounds(period);
  return {
    openIncidents: incidents.filter((i) => !isReadOnly(i.status)).length,
    openCapas: capas.filter((c) => !isReadOnly(c.status)).length,
    overdueCapas: capas.filter((c) => isOverdue(c, today)).length,
    incidentsReceived: incidents.filter((i) => i.status !== "void" && i.dateReceived >= start && i.dateReceived <= end).length,
  };
}

/** What a review must have to be saved. */
export function reviewProblems(d: Record<string, FieldValue>, period: unknown): FieldProblem[] {
  const out: FieldProblem[] = [];
  if (!isPeriod(period)) out.push({ field: "period", message: "Month: choose the month being reviewed." });
  if (blank(d.reviewDate)) out.push({ field: "reviewDate", message: "Review date: enter the date." });
  if (blank(d.whatWasReviewed)) out.push({ field: "whatWasReviewed", message: "What was reviewed: describe it briefly." });
  return out;
}

export interface ReviewRow {
  id: string; period: string; reviewDate: string; reviewedByName: string; whatWasReviewed: string; notes: string; counts: ReviewCounts; updatedAt: string;
}
export const reviewYears = (rows: Pick<ReviewRow, "period">[]) => Array.from(new Set(rows.map((r) => r.period.slice(0, 4)))).sort().reverse();
export const filterReviews = <T extends Pick<ReviewRow, "period">>(rows: T[], year: string | undefined) => rows.filter((r) => !year || r.period.startsWith(`${year}-`));
