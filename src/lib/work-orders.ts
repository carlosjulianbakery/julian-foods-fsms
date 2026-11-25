/**
 * Maintenance Work Orders — pure rules shared by the routes and the pages: who may do what, the fixed
 * lists, the due date of each priority, validation of the request (Step 1) and of the action (Step 2),
 * the list filters and the task's label. Nothing here touches the database.
 */
import { diffFields, formatDay, isIsoDay, type Change, type FieldValue } from "@/lib/quality";

// ── Fixed lists (stored value → label) ──────────────────────────────────────────

export const WO_FACILITIES = ["Julian Bakery", "624"] as const;
export const WO_STATUSES: Record<string, string> = { open: "Open", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled / Void" };
export const WO_PRIORITIES: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
export const WO_PRIORITY_HINTS: Record<string, string> = { high: "same day", medium: "within the week", low: "within the month" };
export const WO_REQUEST_TYPES: Record<string, string> = { machinery_equipment: "Machinery / Equipment", facility: "Facility" };
export const WO_REPAIRED_BY: Record<string, string> = { internal: "Internal", external: "External" };
/** The value the equipment picker sends for "Other" (a name typed by hand). */
export const OTHER_EQUIPMENT = "other";

export const WORK_ORDER_FORM_KEY = "work_order";
export const WO_RULE_TITLE = "Maintenance work order";
export const isOpenStatus = (status: string) => status === "open" || status === "in_progress";

// ── Permissions: the ONE place that decides who may do what ─────────────────────

export interface Viewer { id: string; role: string | null | undefined }
export interface WorkOrderPeople { requestedById: string | null; assigneeId: string | null }

const isAdmin = (v: Viewer) => v.role === "ADMIN";
const isRequester = (v: Viewer, wo: WorkOrderPeople) => !!wo.requestedById && wo.requestedById === v.id;
const isAssignee = (v: Viewer, wo: WorkOrderPeople) => !!wo.assigneeId && wo.assigneeId === v.id;

export const workOrderCan = {
  /** Open a work order: any signed-in, active user. */
  create: (_v: Viewer) => true,
  /** See every work order: supervisors and admins. Everyone else sees only their own (requested by or assigned to them). */
  viewAll: (v: Viewer) => v.role === "SUPERVISOR" || v.role === "ADMIN",
  view: (v: Viewer, wo: WorkOrderPeople) => workOrderCan.viewAll(v) || isRequester(v, wo) || isAssignee(v, wo),
  /** Give the work order to someone else: the requester, the current assignee, or an admin. */
  reassign: (v: Viewer, wo: WorkOrderPeople) => isAdmin(v) || isRequester(v, wo) || isAssignee(v, wo),
  /** Start the work and fill in Step 2: the assignee; an admin may also do it. */
  work: (v: Viewer, wo: WorkOrderPeople) => isAdmin(v) || isAssignee(v, wo),
  /** Cancel / void, with a reason: the requester or an admin. */
  cancel: (v: Viewer, wo: WorkOrderPeople) => isAdmin(v) || isRequester(v, wo),
  /** Edit the equipment / area list: supervisors and admins. */
  editEquipment: (v: Viewer) => v.role === "SUPERVISOR" || v.role === "ADMIN",
};

// ── Dates and times ─────────────────────────────────────────────────────────────

/** YYYY-MM-DD plus a number of days (calendar days; no clock involved, so daylight saving cannot shift it). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const PRIORITY_DAYS: Record<string, number> = { high: 0, medium: 7, low: 30 };
/** The due date of a work order opened on `today` (a Pacific date): High = that day, Medium = 7 days later, Low = 30 days later. */
export const dueDateFor = (priority: string, today: string) => addDays(today, PRIORITY_DAYS[priority] ?? 0);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
/** 14:05 → 2:05 PM */
export function formatTime(t: string | null | undefined): string {
  if (!isTime(t)) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** Overdue: past its due date (Pacific) and still open or in progress. */
export const isOverdue = (wo: { dueDate: string; status: string }, today: string) => isOpenStatus(wo.status) && wo.dueDate < today;

// ── The task ────────────────────────────────────────────────────────────────────

const short = (text: string, max: number) => { const t = text.replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t; };
/** "WO-2026-001: Mixer 2 — belt slipping". It starts with the reference, so no two tasks ever share a label. */
export const workOrderTaskLabel = (reference: string, equipmentName: string, problem: string) => `${reference}: ${short(equipmentName, 50)} — ${short(problem, 60)}`;
export const workOrderTaskKey = (workOrderId: string) => `wo:${workOrderId}`;
/** The status of a task that nobody is working on, from its due date. */
export const taskStatusForDue = (due: string, today: string) => (due < today ? "OVERDUE" : due === today ? "DUE_TODAY" : "UPCOMING");
/** A task with any audit row other than its own creation has real history and is never deleted. */
export const taskHasRealHistory = (auditActions: readonly string[]) => auditActions.some((a) => a !== "created");

// ── Validation ──────────────────────────────────────────────────────────────────

export interface WoProblem { field: string; message: string }
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max + 1) : "");

export interface NewWorkOrder { facility: string; requestType: string; equipmentId: string | null; equipmentName: string; problem: string; priority: string; assigneeId: string }

/**
 * Step 1, the request. The date, the time and "requested by" are never read from the browser: the server
 * sets them. `equipmentId` is an item of the facility's list, or "other" with a name typed by hand.
 */
export function parseRequest(body: Record<string, unknown> | null | undefined): { data: NewWorkOrder; problems: WoProblem[] } {
  const b = body ?? {};
  const problems: WoProblem[] = [];
  const data: NewWorkOrder = {
    facility: str(b.facility, 60), requestType: str(b.requestType, 40), equipmentId: null, equipmentName: str(b.equipmentName, 200),
    problem: str(b.problem, 5000), priority: str(b.priority, 20), assigneeId: str(b.assigneeId, 60),
  };
  if (!(WO_FACILITIES as readonly string[]).includes(data.facility)) problems.push({ field: "facility", message: `Facility: choose ${WO_FACILITIES.join(" or ")}.` });
  if (!(data.requestType in WO_REQUEST_TYPES)) problems.push({ field: "requestType", message: "Request type: choose Machinery / Equipment or Facility." });
  const picked = str(b.equipmentId, 60);
  if (picked && picked !== OTHER_EQUIPMENT) data.equipmentId = picked;
  else if (!data.equipmentName) problems.push({ field: "equipmentName", message: "Equipment or area: choose one from the list, or choose Other and type its name." });
  if (data.equipmentName.length > 200) problems.push({ field: "equipmentName", message: "Equipment or area: the name is too long (200 characters at most)." });
  if (!data.problem) problems.push({ field: "problem", message: "Description of the problem: describe it." });
  if (data.problem.length > 5000) problems.push({ field: "problem", message: "Description of the problem: too long (5000 characters at most)." });
  if (!(data.priority in WO_PRIORITIES)) problems.push({ field: "priority", message: "Priority: choose High, Medium or Low." });
  if (!data.assigneeId) problems.push({ field: "assigneeId", message: "Assigned to: choose who will do the work (it can be you)." });
  return { data, problems };
}

/** The fields of Step 2, the action. */
export const STEP2_FIELDS = ["startDate", "startTime", "stopTime", "repairedByKind", "repairedByUserId", "repairedByName", "toolsAccounted", "workDescription", "completedDate", "signatureName"] as const;
export type Step2Field = (typeof STEP2_FIELDS)[number];
export const STEP2_LABELS: Record<Step2Field, string> = {
  startDate: "Start date", startTime: "Start time", stopTime: "Stop time", repairedByKind: "Repaired by", repairedByUserId: "Repaired by (person)", repairedByName: "Repaired by (name)",
  toolsAccounted: "All tools accounted for and area cleared and cleaned", workDescription: "Description of work", completedDate: "Date work completed", signatureName: "Complete name (signature)",
};

/**
 * Reads the Step 2 fields present in a request body. Only shape is checked here (a date is a date, a
 * time is a time), so a half-filled draft can always be saved; what completion needs is checked by
 * `completionProblems`.
 */
export function parseStep2(body: Record<string, unknown> | null | undefined): { data: Partial<Record<Step2Field, FieldValue>>; problems: WoProblem[] } {
  const data: Partial<Record<Step2Field, FieldValue>> = {};
  const problems: WoProblem[] = [];
  for (const field of STEP2_FIELDS) {
    if (!body || !(field in body)) continue;
    const raw = body[field];
    const bad = (message: string) => problems.push({ field, message: `${STEP2_LABELS[field]}: ${message}` });
    const empty = raw === null || raw === "" || raw === undefined;
    if (field === "startDate" || field === "completedDate") { if (empty) data[field] = null; else if (isIsoDay(raw)) data[field] = raw; else bad("enter a valid date."); }
    else if (field === "startTime" || field === "stopTime") { if (empty) data[field] = null; else if (isTime(raw)) data[field] = raw; else bad("enter a valid time."); }
    else if (field === "repairedByKind") { if (empty) data[field] = null; else if (typeof raw === "string" && raw in WO_REPAIRED_BY) data[field] = raw; else bad("choose Internal or External."); }
    else if (field === "repairedByUserId") { if (empty) data[field] = null; else if (typeof raw === "string" && raw.length <= 60) data[field] = raw; else bad("is not valid."); }
    else if (field === "toolsAccounted") { if (empty) data[field] = null; else if (typeof raw === "boolean") data[field] = raw; else bad("choose Yes or No."); }
    else if (typeof raw !== "string" && !empty) bad("must be text.");
    else { const text = empty ? "" : (raw as string).trim(); if (text.length > (field === "workDescription" ? 5000 : 200)) bad("is too long."); else data[field] = text; }
  }
  return { data, problems };
}

export type Step2Values = Partial<Record<Step2Field, unknown>>;
const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Problems with the dates and times as they stand, whether or not Step 2 is being completed. */
export function step2OrderProblems(s: Step2Values): WoProblem[] {
  const out: WoProblem[] = [];
  if (isIsoDay(s.startDate) && isIsoDay(s.completedDate)) {
    if (s.completedDate < s.startDate) out.push({ field: "completedDate", message: `Date work completed: it cannot be before the start date (${formatDay(s.startDate)}).` });
    else if (s.completedDate === s.startDate && isTime(s.startTime) && isTime(s.stopTime) && s.stopTime < s.startTime) {
      out.push({ field: "stopTime", message: `Stop time: it cannot be before the start time (${formatTime(s.startTime)}) when the work started and finished on the same day.` });
    }
  }
  return out;
}

/**
 * What still stops Step 2 from being submitted, by field, in plain words. Empty = it can be completed.
 * "No" to the tools question always blocks: the work order stays In progress until the answer is Yes.
 */
export function completionProblems(s: Step2Values): WoProblem[] {
  const out: WoProblem[] = [];
  const need = (field: Step2Field, message: string) => { if (blank(s[field])) out.push({ field, message }); };
  need("startDate", "Start date: enter the date the work started.");
  need("startTime", "Start time: enter the time the work started.");
  need("stopTime", "Stop time: enter the time the work stopped.");
  if (blank(s.repairedByKind)) out.push({ field: "repairedByKind", message: "Repaired by: choose Internal or External." });
  else if (s.repairedByKind === "external" && blank(s.repairedByName)) out.push({ field: "repairedByName", message: "Repaired by: enter the name or company." });
  else if (s.repairedByKind === "internal" && blank(s.repairedByUserId) && blank(s.repairedByName)) out.push({ field: "repairedByName", message: "Repaired by: choose the person, or type the name." });
  if (s.toolsAccounted !== true) {
    out.push({
      field: "toolsAccounted",
      message: s.toolsAccounted === false
        ? "Tools and area: the answer is No. Count the tools and clear and clean the area, then answer Yes. The work order stays In progress until then."
        : "Tools and area: answer whether all tools are accounted for and the area is cleared and cleaned.",
    });
  }
  need("workDescription", "Description of work: describe what was done.");
  need("completedDate", "Date work completed: enter the date.");
  need("signatureName", "Complete name: type your full name as your signature.");
  return [...out, ...step2OrderProblems(s)];
}

// ── The list ────────────────────────────────────────────────────────────────────

export interface WorkOrderRow {
  id: string; reference: string; facility: string; requestType: string; equipmentName: string; problem: string; priority: string; status: string; dueDate: string;
  requestedById: string | null; requestedByName: string; requestedAt: string; assigneeId: string | null; assigneeName: string; completedDate: string | null; updatedAt: string;
}
export interface WorkOrderFilters { status?: string; priority?: string; requestType?: string; facility?: string; assignedToMe?: boolean; requestedByMe?: boolean; showCancelled?: boolean }

/** Cancelled work orders are hidden unless asked for (or unless the status filter asks for them). */
export function filterWorkOrders(rows: WorkOrderRow[], f: WorkOrderFilters, viewerId: string): WorkOrderRow[] {
  return rows.filter((r) =>
    (f.showCancelled || f.status === "cancelled" || r.status !== "cancelled") &&
    (!f.status || r.status === f.status) &&
    (!f.priority || r.priority === f.priority) &&
    (!f.requestType || r.requestType === f.requestType) &&
    (!f.facility || r.facility === f.facility) &&
    (!f.assignedToMe || r.assigneeId === viewerId) &&
    (!f.requestedByMe || r.requestedById === viewerId),
  );
}

/** The facility a new work order starts on: where this person last opened one; else where they own the most task rules; else none. */
export function defaultFacility(lastWorkOrderFacility: string | null | undefined, ownedRuleFacilities: readonly string[]): string {
  const known = (f: string | null | undefined): f is string => !!f && (WO_FACILITIES as readonly string[]).includes(f);
  if (known(lastWorkOrderFacility)) return lastWorkOrderFacility;
  const counts = new Map<string, number>();
  for (const f of ownedRuleFacilities) if (known(f)) counts.set(f, (counts.get(f) ?? 0) + 1);
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  // A tie is not a "usual" facility: the person chooses
  return ranked.length === 0 || (ranked.length > 1 && ranked[0][1] === ranked[1][1]) ? "" : ranked[0][0];
}

// ── The change log ──────────────────────────────────────────────────────────────

export type WoEventAction = "created" | "started" | "draft_saved" | "completed" | "reassigned" | "cancelled" | "task_completed";
export const WO_ACTION_LABELS: Record<WoEventAction, string> = {
  created: "Created", started: "Started", draft_saved: "Step 2 saved", completed: "Completed", reassigned: "Reassigned", cancelled: "Cancelled / voided", task_completed: "Task completed",
};
export const WO_FIELD_LABELS: Record<string, string> = {
  ...STEP2_LABELS, status: "Status", assignee: "Assigned to", priority: "Priority", dueDate: "Due date", cancelReason: "Reason", facility: "Facility", requestType: "Request type",
  equipmentName: "Equipment or area", problem: "Problem", task: "Task",
};
/** A change as the log shows it: "Status: Open → In progress". */
export function describeWoChange(c: Change, names: Record<string, string> = {}): string {
  const show = (v: FieldValue): string => {
    if (v === null) return "(empty)";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (c.field === "status") return WO_STATUSES[v] ?? v;
    if (c.field === "priority") return WO_PRIORITIES[v] ?? v;
    if (c.field === "requestType") return WO_REQUEST_TYPES[v] ?? v;
    if (c.field === "repairedByKind") return WO_REPAIRED_BY[v] ?? v;
    if (c.field === "repairedByUserId") return names[v] ?? v;
    if (c.field === "startTime" || c.field === "stopTime") return formatTime(v);
    if (["dueDate", "startDate", "completedDate"].includes(c.field)) return formatDay(v);
    return v;
  };
  return `${WO_FIELD_LABELS[c.field] ?? c.field}: ${show(c.from)} → ${show(c.to)}`;
}
export { diffFields };
export type { Change, FieldValue };
