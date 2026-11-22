/**
 * Quality, phase 3: the CSV exports, the record PDF routes, and the three fixes to the CAPA follow-up task.
 * Real routes and functions throughout, over the in-memory database; nothing here reaches a real one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { NextRequest } from "next/server";

const nav = vi.hoisted(() => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect, useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", async () => { const { makePrisma } = await import("./memdb"); return { prisma: makePrisma() }; });
vi.mock("@vercel/blob", () => ({ get: vi.fn(), del: vi.fn(), put: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: vi.fn() }));
vi.mock("@/lib/google-sheets-fetcher", () => ({ fetchSheetRows: vi.fn(async () => ({ rows: [] })), invalidateSheetCache: vi.fn() }));

import { getServerSession } from "next-auth";
import { db, resetDb, seed, table } from "./memdb";
import { GET as LIST_I, POST as NEW_I } from "@/app/api/quality/incidents/route";
import { PATCH as SAVE_I } from "@/app/api/quality/incidents/[id]/route";
import { POST as ACT_I } from "@/app/api/quality/incidents/[id]/status/route";
import { POST as OPEN_CAPA } from "@/app/api/quality/incidents/[id]/capa/route";
import { GET as LIST_C, POST as NEW_C } from "@/app/api/quality/capas/route";
import { GET as GET_C, PATCH as SAVE_C } from "@/app/api/quality/capas/[id]/route";
import { POST as ACT_C } from "@/app/api/quality/capas/[id]/status/route";
import { POST as ATTACH } from "@/app/api/quality/attachments/route";
import { DELETE as REMOVE } from "@/app/api/quality/attachments/[id]/route";
import { GET as LIST_R, POST as NEW_R } from "@/app/api/quality/reviews/route";
import { GET as EXPORT_I } from "@/app/api/quality/incidents/export/route";
import { GET as EXPORT_C } from "@/app/api/quality/capas/export/route";
import { GET as EXPORT_R } from "@/app/api/quality/reviews/export/route";
import { GET as PDF_I } from "@/app/api/quality/incidents/[id]/pdf/route";
import { GET as PDF_C } from "@/app/api/quality/capas/[id]/pdf/route";
import { POST as START } from "@/app/api/task-instances/[id]/start/route";
import CapaTaskPage from "@/app/(dashboard)/dashboard/admin/quality/capa-task/page";
import ReviewTaskPage from "@/app/(dashboard)/dashboard/admin/quality/review-task/page";
import CapaPage from "@/app/(dashboard)/dashboard/admin/quality/capas/[id]/page";
import IncidentPage from "@/app/(dashboard)/dashboard/admin/quality/incidents/[id]/page";
import QualityPage from "@/app/(dashboard)/dashboard/admin/quality/page";
import { updateStatuses } from "@/lib/task-generator";
import { healCapaTasks, noteTaskStarted } from "@/lib/quality-server";
import { CSV_BOM, exportHref } from "@/lib/quality-export";
import { filterCapas, filterIncidents, planCapaTask, capaTaskStatusAfterMove, taskHasHistory, type CapaRow, type IncidentRow, type ListFilters } from "@/lib/quality";

type MockFn = ReturnType<typeof vi.fn>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const session = getServerSession as unknown as MockFn;
const as = (role: string | null, id = "carlos", name = "Carlos Gomory") => session.mockResolvedValue(role ? { user: { id, role, name, email: `${id}@example.com` } } : null);
const req = (method: string, body?: unknown, url = "http://localhost/api/quality") => new NextRequest(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const call = async (r: Promise<Response>): Promise<[number, Json]> => { const res = await r; return [res.status, await res.json()]; };
const ctx = (id: string) => ({ params: { id } });
const row = (model: string, id: string) => table(model).find((r) => r.id === id)!;
const stamp = (model: string, id: string) => row(model, id).updatedAt.toISOString();
const audits = (taskId: string) => table("taskInstanceAudit").filter((a) => a.instanceId === taskId);
const eventsOf = (id: string) => table("qualityEvent").filter((e) => e.recordId === id);
const taskOf = (capaId: string) => { const id = row("qualityCapa", capaId).taskInstanceId; return id ? row("ruleInstance", id) : null; };
const ACTOR = { id: "carlos", name: "Carlos Gomory" };
/** Everything stored, as text. (Looking into a table that has no rows yet does not count as a change.) */
const state = () => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length > 0)));

async function newIncident(over: Json = {}) { return (await call(NEW_I(req("POST", { dateReceived: "2026-11-20", channel: "email", description: "Plastic in a loaf.", ...over }))))[1] as { id: string; reference: string }; }
async function newCapa(over: Json = {}) { return (await call(NEW_C(req("POST", { source: "audit_finding", problem: "Sanitizer log incomplete on the night shift.", ...over }))))[1] as { id: string; reference: string }; }
const saveI = (id: string, body: Json) => call(SAVE_I(req("PATCH", { expectedUpdatedAt: stamp("qualityIncident", id), ...body }), ctx(id)));
const saveC = (id: string, body: Json) => call(SAVE_C(req("PATCH", { expectedUpdatedAt: stamp("qualityCapa", id), ...body }), ctx(id)));
const actI = (id: string, body: Json) => call(ACT_I(req("POST", body), ctx(id)));
const actC = (id: string, body: Json) => call(ACT_C(req("POST", body), ctx(id)));

/** Fetches an export as the browser would: the raw bytes, the text without its BOM, and the rows as cells. */
async function exported(run: (r: NextRequest) => Promise<Response>, href: string) {
  const res = await run(new NextRequest(`http://localhost${href}`));
  const bytes = new Uint8Array(await res.clone().arrayBuffer());
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  return { res, bytes, text, lines: parseCsv(text.slice(1)) };
}
/** A plain CSV reader (quotes, doubled quotes, line breaks inside quotes), to read the file the way a spreadsheet does. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") { rows[rows.length - 1].push(cell); cell = ""; }
    else if (ch === "\r" && text[i + 1] === "\n") { rows[rows.length - 1].push(cell); cell = ""; rows.push([]); i++; }
    else cell += ch;
  }
  if (rows[rows.length - 1].length === 0 && cell === "") rows.pop();
  return rows;
}
/** The PDF layout with the line breaks of wrapped table cells taken out, to read a cell as one sentence. */
const flat = (html: string) => html.replace(/<\/div><div class="l">/g, " ");
const column = (lines: string[][], name: string) => { const i = lines[0].indexOf(name); return lines.slice(1).map((l) => l[i]); };

beforeEach(() => {
  vi.clearAllMocks();
  at("2026-11-21T18:00:00Z"); // 10:00 AM Pacific, November 21, 2026
  resetDb();
  seed("user", [
    { id: "carlos", name: "Carlos Gomory", role: "ADMIN", active: true }, { id: "chris", name: "Chris Pence", role: "ADMIN", active: true },
    { id: "hugo", name: "Hugo Ayala", role: "SUPERVISOR", active: true },
  ]);
  seed("facility", [{ id: "fac-jb", name: "Julian Bakery" }, { id: "fac-624", name: "624" }]);
  seed("product", [{ id: "prod-1", name: "Keto Thin Bread", isActive: true }]);
  seed("taskRule", [
    { id: "rule-preop", title: "Pre-Op Inspection", facilityId: "fac-jb", ownerId: "hugo", triggerType: "PRODUCTION_DAY", formKey: "preop", recurrenceStart: new Date("2026-11-12T00:00:00Z"), sortOrder: 10 },
    { id: "rule-review", title: "Review customer incidents and CAPAs", facilityId: "fac-jb", ownerId: "carlos", triggerType: "RECURRING", recurrenceUnit: "month", recurrenceEndOfMonth: true, formKey: "quality_review", recurrenceStart: new Date("2026-11-01T00:00:00Z"), windowMode: "DAYS_BEFORE", windowDaysBefore: 4, sortOrder: 130 },
  ]);
  as("ADMIN");
  for (const m of ["error", "log", "warn"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CSV exports", () => {
  /** A varied set of incidents and CAPAs, entered through the real routes. */
  async function world() {
    const a = await newIncident({ dateReceived: "2026-10-05", channel: "phone", description: "Mold on a loaf, =cmd|' /C calc'!A0", facility: "624" });
    await saveI(a.id, { customer: '=HYPERLINK("http://evil","x")', productId: "prod-1", lotCode: "+L-99", category: "quality_taste", bestByDate: "2026-12-01" });
    const b = await newIncident({ dateReceived: "2026-11-10", description: 'Customer wrote: "plastic, blue"\nSecond line.' });
    await saveI(b.id, { customer: "Café Münster", productName: "Paleo Wraps", category: "foreign_matter", foodSafetyConcern: true, immediateAction: "Held the lot.", responseDate: "2026-11-11", responseChannel: "email", responseSummary: "-refund sent" });
    const [, opened] = await call(OPEN_CAPA(req("POST", {}), ctx(b.id)));
    // one attachment on b, and one that was removed
    for (const n of [1, 2]) await call(ATTACH(req("POST", { recordType: "incident", recordId: b.id, kind: "evidence", fileName: `p${n}.jpg`, fileSize: 1000, mimeType: "image/jpeg", fileUrl: `https://s.private.blob.vercel-storage.com/quality/incident/${b.id}/p${n}.jpg` })));
    await call(REMOVE(req("DELETE", { reason: "Wrong photo" }), ctx(table("qualityAttachment")[1].id)));
    await actI(b.id, { action: "close", closedDate: "2026-11-12" });
    const c = await newIncident({ dateReceived: "2026-11-18", description: "Late delivery." });
    await saveI(c.id, { category: "shipping_delivery", capaRequired: false, noCapaReason: "@carrier issue" });
    await actI(c.id, { action: "move", to: "under_review" });
    const d = await newIncident({ dateReceived: "2026-11-19", description: "Entered twice." });
    await actI(d.id, { action: "void", reason: "Duplicate of the one above" });
    const capaB = opened.capa as { id: string; reference: string };
    await saveC(capaB.id, { ownerId: "chris", dueDate: "2026-11-15" }); // already past: overdue
    const other = await newCapa({ source: "supplier_issue", problem: "Supplier sent the wrong flour.", facility: "Julian Bakery" });
    await saveC(other.id, { ownerId: "carlos", dueDate: "2026-12-20" });
    const voided = await newCapa({ source: "other", problem: "Opened by mistake." });
    await actC(voided.id, { action: "void", reason: "Opened by mistake" });
    return { a, b, c, d, capaB, other, voided };
  }

  describe.each([
    ["incidents", EXPORT_I], ["capas", EXPORT_C], ["reviews", EXPORT_R],
  ] as const)("%s export: who may use it", (kind, run) => {
    it("401 without a session, 403 for a supervisor, and no file either way", async () => {
      await world();
      as(null);
      const none = await run(new NextRequest(`http://localhost/api/quality/${kind}/export`));
      expect(none.status).toBe(401);
      expect(await none.json()).toEqual({ error: "Unauthorized" });
      as("SUPERVISOR", "hugo", "Hugo Ayala");
      const sup = await run(new NextRequest(`http://localhost/api/quality/${kind}/export?showVoid=1`));
      expect(sup.status).toBe(403);
      expect(sup.headers.get("Content-Type")).toContain("application/json");
      expect(await sup.text()).not.toContain("CI-2026");
    });
    it("an admin gets a CSV file: UTF-8 with a BOM, named with the kind and the Pacific date, never cached", async () => {
      at("2026-11-23T06:30:00Z"); // 10:30 PM on November 22 in Pacific time
      const { res, bytes, text } = await exported(run, `/api/quality/${kind}/export`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="quality-${kind}-2026-11-22.csv"`);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      expect(text.startsWith(CSV_BOM)).toBe(true);
      // an empty list is the heading row alone
      expect(parseCsv(text.slice(1))).toHaveLength(1);
      expect(text.endsWith("\r\n")).toBe(true);
    });
  });

  it("incidents: the filters are applied on the server and give exactly what the list shows", async () => {
    await world();
    const list = (await (await LIST_I()).json()) as IncidentRow[];
    expect(list).toHaveLength(4);
    const cases: ListFilters[] = [
      {}, { showVoid: true }, { status: "closed" }, { status: "under_review" }, { status: "void" }, { category: "foreign_matter" }, { category: "shipping_delivery", status: "under_review" },
      { product: "keto" }, { product: "paleo" }, { from: "2026-11-01" }, { to: "2026-10-31" }, { from: "2026-11-10", to: "2026-11-18" }, { from: "2026-11-19", showVoid: true },
      { facility: "624" }, { facility: "Company-wide" }, { search: "plastic" }, { search: "CI-2026-003" }, { status: "open", category: "foreign_matter" }, { category: "illness_health" },
    ];
    for (const f of cases) {
      const { lines } = await exported(EXPORT_I, exportHref("incidents", f));
      expect(column(lines, "Reference"), JSON.stringify(f)).toEqual(filterIncidents(list, f).map((r) => r.reference));
    }
    // void records are left out unless "show void" is on
    expect(column((await exported(EXPORT_I, "/api/quality/incidents/export")).lines, "Reference")).toEqual(["CI-2026-003", "CI-2026-002", "CI-2026-001"]);
    expect(column((await exported(EXPORT_I, "/api/quality/incidents/export?showVoid=1")).lines, "Reference")).toEqual(["CI-2026-004", "CI-2026-003", "CI-2026-002", "CI-2026-001"]);
  });

  it("a list of ids from the browser is not trusted: it changes nothing", async () => {
    const w = await world();
    const { lines } = await exported(EXPORT_I, `/api/quality/incidents/export?ids=${w.d.id}&id=${w.d.id}&status=closed`);
    expect(column(lines, "Reference")).toEqual(["CI-2026-002"]);
  });

  it("exporting writes nothing", async () => {
    await world();
    const before = db.writes.length;
    const snapshot = state();
    for (const [run, kind] of [[EXPORT_I, "incidents"], [EXPORT_C, "capas"], [EXPORT_R, "reviews"]] as const) await exported(run, `/api/quality/${kind}/export?showVoid=1`);
    expect(db.writes.length).toBe(before);
    expect(state()).toBe(snapshot);
  });

  it("incidents: one flat row per record with every field, Pacific dates, Yes / No, and cells a spreadsheet cannot run", async () => {
    await world();
    at("2026-11-22T07:30:00Z"); // still November 21 in Pacific time
    const { lines, text } = await exported(EXPORT_I, "/api/quality/incidents/export?showVoid=1");
    expect(lines[0]).toEqual([
      "Reference", "Date received", "Channel", "Customer", "Product", "Lot code", "Best-by date", "What happened", "Category", "Food safety concern", "Immediate action",
      "Response date", "Response channel", "Response summary", "CAPA decision", "Reason no CAPA is needed", "Linked CAPA", "Status", "Closed date", "Closed by", "Void reason", "Facility",
      "Created by", "Created date", "Last changed by", "Last changed date", "Attachments",
    ]);
    const byRef = Object.fromEntries(lines.slice(1).map((l) => [l[0], Object.fromEntries(lines[0].map((h, i) => [h, l[i]]))]));
    expect(byRef["CI-2026-002"]).toEqual({
      Reference: "CI-2026-002", "Date received": "11/10/2026", Channel: "Email", Customer: "Café Münster", Product: "Paleo Wraps", "Lot code": "", "Best-by date": "",
      "What happened": 'Customer wrote: "plastic, blue"\nSecond line.', Category: "Foreign matter", "Food safety concern": "Yes", "Immediate action": "Held the lot.",
      "Response date": "11/11/2026", "Response channel": "Email", "Response summary": "'-refund sent", "CAPA decision": "CAPA linked", "Reason no CAPA is needed": "", "Linked CAPA": "CAPA-2026-001",
      Status: "Closed", "Closed date": "11/12/2026", "Closed by": "Carlos Gomory", "Void reason": "", Facility: "Company-wide",
      "Created by": "Carlos Gomory", "Created date": "11/21/2026", "Last changed by": "Carlos Gomory", "Last changed date": "11/21/2026", Attachments: "1",
    });
    // formula injection: =, +, - and @ at the start of a cell get a leading apostrophe
    expect(byRef["CI-2026-001"].Customer).toBe("'=HYPERLINK(\"http://evil\",\"x\")");
    expect(byRef["CI-2026-001"]["Lot code"]).toBe("'+L-99");
    expect(byRef["CI-2026-003"]["Reason no CAPA is needed"]).toBe("'@carrier issue");
    expect(byRef["CI-2026-001"]["What happened"]).toBe("Mold on a loaf, =cmd|' /C calc'!A0"); // not at the start: left as it is
    expect(text).not.toMatch(/(^|,|\n)[=+\-@]/); // no cell in the whole file starts with one of them
    // the rest of the columns
    expect(byRef["CI-2026-001"]).toMatchObject({ Product: "Keto Thin Bread", "Best-by date": "12/01/2026", Channel: "Phone", "Food safety concern": "No", Facility: "624", Status: "Open", "CAPA decision": "Not decided", Attachments: "0" });
    expect(byRef["CI-2026-003"]).toMatchObject({ Status: "Under review", "CAPA decision": "No CAPA needed", "Linked CAPA": "" });
    expect(byRef["CI-2026-004"]).toMatchObject({ Status: "Void", "Void reason": "Duplicate of the one above" });
    // quoting survives a round trip through the file
    expect(text).toContain('"Customer wrote: ""plastic, blue""\nSecond line."');
    expect(text).toContain("Café Münster");
  });

  it("CAPAs: the filters on the server match the list; the row has every field, overdue as Yes / No", async () => {
    await world();
    const list = (await (await LIST_C()).json()) as CapaRow[];
    expect(list).toHaveLength(3);
    for (const f of [{}, { showVoid: true }, { status: "open" }, { status: "void" }, { source: "customer_incident" }, { source: "supplier_issue" }, { facility: "Julian Bakery" }, { from: "2026-11-21", to: "2026-11-21" }, { to: "2026-11-20" }, { search: "flour" }] as ListFilters[]) {
      const { lines } = await exported(EXPORT_C, exportHref("capas", f));
      expect(column(lines, "Reference"), JSON.stringify(f)).toEqual(filterCapas(list, f).map((r) => r.reference));
    }
    const { lines } = await exported(EXPORT_C, "/api/quality/capas/export?showVoid=1");
    expect(lines[0]).toEqual([
      "Reference", "Source", "The problem", "Root cause", "Corrective action", "Preventive action", "Owner", "Due date", "Overdue", "Effectiveness check date", "Effectiveness check result",
      "Status", "Closed date", "Closed by", "Void reason", "Linked incidents", "Facility", "Created by", "Created date", "Last changed by", "Last changed date", "Attachments",
    ]);
    const byRef = Object.fromEntries(lines.slice(1).map((l) => [l[0], Object.fromEntries(lines[0].map((h, i) => [h, l[i]]))]));
    expect(byRef["CAPA-2026-001"]).toMatchObject({ Source: "Customer incident", Owner: "Chris Pence", "Due date": "11/15/2026", Overdue: "Yes", Status: "Open", "Linked incidents": "CI-2026-002", Facility: "Company-wide", "Created by": "Carlos Gomory", "Created date": "11/21/2026", Attachments: "0" });
    expect(byRef["CAPA-2026-001"]["The problem"]).toBe('Customer wrote: "plastic, blue"\nSecond line.');
    expect(byRef["CAPA-2026-002"]).toMatchObject({ Source: "Supplier issue", Owner: "Carlos Gomory", "Due date": "12/20/2026", Overdue: "No", Facility: "Julian Bakery", "Linked incidents": "" });
    expect(byRef["CAPA-2026-003"]).toMatchObject({ Status: "Void", "Void reason": "Opened by mistake", Overdue: "No", "Due date": "" });
  });

  it("CAPAs: a closed CAPA carries who closed it and when", async () => {
    const c = await newCapa();
    await saveC(c.id, { rootCause: "r", correctiveAction: "c", preventiveAction: "p", ownerId: "chris", dueDate: "2026-12-15", effectivenessDate: "2026-11-21", effectivenessResult: "Fine." });
    for (const to of ["in_progress", "verifying"]) await actC(c.id, { action: "move", to });
    as("ADMIN", "chris", "Chris Pence");
    expect((await actC(c.id, { action: "close" }))[0]).toBe(200);
    const { lines } = await exported(EXPORT_C, "/api/quality/capas/export?status=closed");
    const r = Object.fromEntries(lines[0].map((h, i) => [h, lines[1][i]]));
    expect(r).toMatchObject({ Status: "Closed", "Closed date": "11/21/2026", "Closed by": "Chris Pence", "Effectiveness check date": "11/21/2026", "Effectiveness check result": "Fine.", "Last changed by": "Chris Pence", Overdue: "No" });
  });

  it("reviews: the period, the review and the four counts; the year filter is applied on the server", async () => {
    await world();
    seed("qualityReview", [{ id: "rev-old", period: "2025-12", reviewDate: new Date("2026-01-03T00:00:00Z"), reviewedByName: "Chris Pence", whatWasReviewed: "Everything, twice", notes: "=SUM(1)", counts: { openIncidents: 1, openCapas: 0, overdueCapas: 0, incidentsReceived: 2 } }]);
    expect((await call(NEW_R(req("POST", { period: "2026-11", reviewDate: "2026-11-21", whatWasReviewed: "All incidents, and the open CAPAs", notes: "" }))))[0]).toBe(201);
    const all = await exported(EXPORT_R, "/api/quality/reviews/export");
    expect(all.lines).toEqual([
      ["Period", "Review date", "Reviewer", "What was reviewed", "Notes", "Open incidents", "Open CAPAs", "Overdue CAPAs", "Incidents received that month"],
      ["November 2026", "11/21/2026", "Carlos Gomory", "All incidents, and the open CAPAs", "", "2", "2", "1", "2"],
      ["December 2025", "01/03/2026", "Chris Pence", "Everything, twice", "'=SUM(1)", "1", "0", "0", "2"],
    ]);
    expect(column((await exported(EXPORT_R, exportHref("reviews", { year: "2025" }))).lines, "Period")).toEqual(["December 2025"]);
    expect(column((await exported(EXPORT_R, exportHref("reviews", { year: "2024" }))).lines, "Period")).toEqual([]);
    expect((await (await LIST_R()).json()).reviews).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("record PDF routes", () => {
  it.each([["incident", PDF_I], ["CAPA", PDF_C]] as const)("%s: 401 without a session, 403 for a supervisor", async (_n, run) => {
    const i = await newIncident();
    as(null);
    expect(await call(run(req("GET"), ctx(i.id)))).toEqual([401, { error: "Unauthorized" }]);
    as("SUPERVISOR", "hugo", "Hugo Ayala");
    expect(await call(run(req("GET"), ctx(i.id)))).toEqual([403, { error: "Forbidden — admins only" }]);
  });
  it("an incident: the page layout and the file name, generated by the admin who asked, in Pacific time", async () => {
    const i = await newIncident({ description: "Plastic in a loaf.\nSecond paragraph." });
    await saveI(i.id, { productId: "prod-1", category: "foreign_matter" });
    const [, opened] = await call(OPEN_CAPA(req("POST", {}), ctx(i.id)));
    await call(ATTACH(req("POST", { recordType: "incident", recordId: i.id, kind: "customer_response", fileName: "reply.pdf", fileSize: 5000, mimeType: "application/pdf", fileUrl: `https://s.private.blob.vercel-storage.com/quality/incident/${i.id}/reply.pdf`, description: "Our reply" })));
    at("2026-11-22T07:30:00Z");
    as("ADMIN", "chris", "Chris Pence");
    const before = state();
    const [status, body] = await call(PDF_I(req("GET"), ctx(i.id)));
    expect(status).toBe(200);
    expect(body.filename).toBe("CI-2026-001.pdf");
    expect(body.html).toContain("CI-2026-001");
    expect(body.html).toContain("Generated 11/21/2026, 11:30 PM PT by Chris Pence");
    expect(body.html).toContain(`A CAPA is linked: ${opened.capa.reference}`);
    expect(body.html).toContain('<div class="l">reply.pdf (5 KB)</div>');
    expect(body.html).toContain("Message sent to the");
    // the product id in the history reads as the product's name
    expect(flat(body.html)).toContain("Product (from the list): (empty) → Keto Thin Bread");
    expect(body.html).not.toContain("blob.vercel-storage");
    expect(state()).toBe(before); // making the PDF layout writes nothing
  });
  it("a CAPA: its incidents by reference and status, the owner by name in the fields and in the history", async () => {
    const i = await newIncident();
    const [, opened] = await call(OPEN_CAPA(req("POST", {}), ctx(i.id)));
    const id = opened.capa.id as string;
    await saveC(id, { ownerId: "chris", dueDate: "2026-12-15" });
    await actC(id, { action: "void", reason: "Covered by another CAPA" });
    const [status, body] = await call(PDF_C(req("GET"), ctx(id)));
    expect(status).toBe(200);
    expect(body.filename).toBe("CAPA-2026-001.pdf");
    expect(body.html).toContain('<td class="k">Owner</td><td class="v">Chris Pence</td>');
    expect(flat(body.html)).toContain("Owner: (empty) → Chris Pence");
    expect(body.html).toContain('<div class="l">CI-2026-001</div>');
    expect(body.html).toContain("data-void-banner>VOID — this record was voided on 11/21/2026, 10:00 AM PT by Carlos Gomory.");
    expect(body.html).toContain("Reason: Covered by another CAPA");
  });
  it("404 for a record that does not exist", async () => {
    expect((await call(PDF_I(req("GET"), ctx("nope"))))[0]).toBe(404);
    expect((await call(PDF_C(req("GET"), ctx("nope"))))[0]).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("fix a: a CAPA task with any audit history is treated as started", () => {
  /** A CAPA with its task, opened from the task's Start button (the real pages, the real start route), then left past its due date. */
  async function startedThenOverdue() {
    const c = await newCapa();
    await saveC(c.id, { ownerId: "chris", dueDate: "2026-11-25" });
    const task = taskOf(c.id)!;
    expect(task.status).toBe("UPCOMING");
    await CapaTaskPage({ searchParams: { taskId: task.id } }).catch(() => {});
    expect((await call(START(req("POST"), ctx(task.id))))[1].status).toBe("IN_PROGRESS");
    at("2026-11-27T18:00:00Z"); // two days past the due date
    await updateStatuses(); // the shared status promotion, unchanged
    expect(taskOf(c.id)!.status).toBe("OVERDUE"); // the status no longer says it was started …
    expect(audits(task.id).map((a) => a.action)).toEqual(["created", "started"]); // … its audit history does
    return { c, taskId: task.id as string };
  }

  it("the rule: a task with history of its own is never removed, whatever its status says", () => {
    const capa = { id: "c", reference: "CAPA-2026-001", problem: "p", status: "open", ownerId: null, dueDate: null };
    const task = { status: "OVERDUE", dueDate: "2026-11-25", ownerUserId: "chris", label: "CAPA-2026-001: p" };
    expect(planCapaTask(capa, task)).toEqual({ do: "delete" });
    expect(planCapaTask(capa, { ...task, auditActions: ["created", "updated"] })).toEqual({ do: "delete" }); // the sync's own rows are not history
    for (const actions of [["created", "started"], ["created", "reopened"], ["created", "completed", "reopened"], ["anything-else"]]) {
      expect(planCapaTask(capa, { ...task, auditActions: actions }), actions.join()).toEqual({ do: "nothing" });
      expect(planCapaTask({ ...capa, status: "void", ownerId: "chris", dueDate: "2026-11-25" }, { ...task, auditActions: actions })).toEqual({ do: "nothing" });
    }
    expect(taskHasHistory([])).toBe(false);
    expect(taskHasHistory(undefined)).toBe(false);
    expect(capaTaskStatusAfterMove("OVERDUE", true, "2026-12-05", "2026-11-27")).toBe("IN_PROGRESS");
    expect(capaTaskStatusAfterMove("OVERDUE", true, "2026-11-20", "2026-11-27")).toBe("OVERDUE");
    expect(capaTaskStatusAfterMove("OVERDUE", false, "2026-12-05", "2026-11-27")).toBe("UPCOMING");
    expect(capaTaskStatusAfterMove("UPCOMING", false, "2026-11-27", "2026-11-27")).toBe("DUE_TODAY");
    expect(capaTaskStatusAfterMove("IN_PROGRESS", true, "2026-11-20", "2026-11-27")).toBe("IN_PROGRESS");
  });

  it("clearing the due date keeps a started-then-overdue task", async () => {
    const { c, taskId } = await startedThenOverdue();
    expect((await saveC(c.id, { dueDate: null }))[0]).toBe(200);
    expect(row("qualityCapa", c.id).taskInstanceId).toBe(taskId);
    expect(row("ruleInstance", taskId)).toMatchObject({ status: "OVERDUE", ownerUserId: "chris" });
    expect(audits(taskId).map((a) => a.action)).toEqual(["created", "started"]);
  });
  it("clearing the owner keeps it too", async () => {
    const { c, taskId } = await startedThenOverdue();
    expect((await saveC(c.id, { ownerId: null }))[0]).toBe(200);
    expect(row("qualityCapa", c.id).taskInstanceId).toBe(taskId);
    expect(row("ruleInstance", taskId)).toBeTruthy();
  });
  it("voiding the CAPA keeps it", async () => {
    const { c, taskId } = await startedThenOverdue();
    expect((await actC(c.id, { action: "void", reason: "No longer needed" }))[0]).toBe(200);
    expect(row("qualityCapa", c.id)).toMatchObject({ status: "void", taskInstanceId: taskId });
    expect(row("ruleInstance", taskId)).toMatchObject({ status: "OVERDUE" });
  });
  it("its date and owner still follow the CAPA, as for a started task: a new date in the future puts it back in progress", async () => {
    const { c, taskId } = await startedThenOverdue();
    // a new date that is still in the past leaves it overdue
    await saveC(c.id, { dueDate: "2026-11-26" });
    expect(row("ruleInstance", taskId).status).toBe("OVERDUE");
    await saveC(c.id, { dueDate: "2026-12-05", ownerId: "carlos" });
    expect(row("ruleInstance", taskId)).toMatchObject({ status: "IN_PROGRESS", ownerUserId: "carlos" });
    expect(row("ruleInstance", taskId).dueDate.toISOString().slice(0, 10)).toBe("2026-12-05");
    expect(audits(taskId).map((a) => a.action)).toEqual(["created", "started", "updated", "updated"]);
  });
  it("it is still completed when the CAPA reaches Verifying effectiveness", async () => {
    const { c, taskId } = await startedThenOverdue();
    await actC(c.id, { action: "move", to: "in_progress" });
    await actC(c.id, { action: "move", to: "verifying" });
    expect(row("ruleInstance", taskId)).toMatchObject({ status: "DONE", completedLate: true, daysLate: 2 });
  });
  it("a task nobody acted on is still removed, also once it is overdue", async () => {
    const c = await newCapa();
    await saveC(c.id, { ownerId: "chris", dueDate: "2026-11-25" });
    const taskId = taskOf(c.id)!.id;
    at("2026-11-27T18:00:00Z");
    await updateStatuses();
    expect(row("ruleInstance", taskId).status).toBe("OVERDUE");
    await saveC(c.id, { dueDate: null });
    expect(row("ruleInstance", taskId)).toBeUndefined();
    expect(row("qualityCapa", c.id).taskInstanceId).toBeNull();
    // and on void
    const d = await newCapa({ problem: "Another one." });
    await saveC(d.id, { ownerId: "chris", dueDate: "2026-11-20" });
    await saveC(d.id, { dueDate: "2026-11-22" }); // the sync's own "updated" row does not count as history
    const other = taskOf(d.id)!.id;
    expect(audits(other).map((a) => a.action)).toEqual(["created", "updated"]);
    await actC(d.id, { action: "void", reason: "Opened by mistake" });
    expect(row("ruleInstance", other)).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("fix b: self-heal when the CAPA list or a CAPA page loads", () => {
  /** The completion's two statements (the task and its audit row) fail together, as its transaction would. */
  const completionFails = (model: string, op: string, data: Json) => (model === "ruleInstance" && op === "update" && data.status === "DONE") || (model === "taskInstanceAudit" && op === "create" && data.action === "completed");
  /** A CAPA already at Verifying effectiveness whose task was left open (its completion failed at the time). */
  async function stranded(problem = "Stranded task.") {
    const c = await newCapa({ problem });
    await saveC(c.id, { ownerId: "chris", dueDate: "2026-11-20" }); // one day late by now
    await actC(c.id, { action: "move", to: "in_progress" });
    db.failOn = completionFails;
    expect((await actC(c.id, { action: "move", to: "verifying" }))[0]).toBe(200); // the CAPA change stands
    db.failOn = null;
    at(new Date(Date.now() + 60_000).toISOString()); // a minute later
    const task = taskOf(c.id)!;
    expect(task.status).toBe("OVERDUE");
    expect(row("qualityCapa", c.id).status).toBe("verifying");
    return { c, taskId: task.id as string };
  }
  /** Other open tasks that must never be touched: an ordinary one, and the task of a CAPA still in progress. */
  async function bystanders() {
    seed("ruleInstance", [{ id: "preop-open", ruleId: "rule-preop", dueDate: new Date("2026-11-20T00:00:00Z"), status: "OVERDUE", label: "" }, { id: "review-nov", ruleId: "rule-review", dueDate: new Date("2026-11-30T00:00:00Z"), status: "UPCOMING", label: "" }]);
    const working = await newCapa({ problem: "Still being worked on." });
    await saveC(working.id, { ownerId: "carlos", dueDate: "2026-11-19" });
    await actC(working.id, { action: "move", to: "in_progress" });
    return { workingTask: taskOf(working.id)!.id as string, working };
  }
  const others = (ids: string[]) => JSON.stringify(table("ruleInstance").filter((t) => !ids.includes(t.id)).concat(table("taskInstanceAudit").filter((a) => !ids.includes(a.instanceId))));

  it("loading the CAPA list completes the stranded task once, with its audit row and a line in the CAPA's history", async () => {
    const { workingTask } = await bystanders();
    const { c, taskId } = await stranded();
    const untouched = others([taskId]);
    as("ADMIN", "chris", "Chris Pence");
    const list = (await (await LIST_C()).json()) as CapaRow[];
    expect(list.map((r) => r.reference)).toContain(c.reference);
    expect(row("ruleInstance", taskId)).toMatchObject({ status: "DONE", doneById: "chris", completedLate: true, daysLate: 1, completedBySubmissionId: c.id });
    expect(audits(taskId).map((a) => a.action)).toEqual(["created", "completed"]);
    expect(audits(taskId)[1].note).toContain("1 day(s) late");
    const history = eventsOf(c.id).filter((e) => e.action === "task_completed");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ userName: "Chris Pence", reference: c.reference, changes: [{ field: "followUpTask", from: "Overdue", to: "Done" }] });
    expect(history[0].note).toContain("was still open although this CAPA was already Verifying effectiveness");
    // nothing else moved: the ordinary task, the review task and the task of the CAPA still in progress
    expect(others([taskId])).toBe(untouched);
    expect(row("ruleInstance", workingTask).status).toBe("OVERDUE");
    expect(row("ruleInstance", "preop-open").status).toBe("OVERDUE");
  });
  it("is idempotent: loading again, the list or the record, changes nothing", async () => {
    const { c } = await stranded();
    await LIST_C();
    const after = state();
    const writes = db.writes.length;
    await LIST_C(); await GET_C(req("GET"), ctx(c.id)); await LIST_C();
    expect(state()).toBe(after);
    expect(db.writes.length).toBe(writes);
    expect(await healCapaTasks(ACTOR)).toEqual([]);
  });
  it("loading the CAPA's own page heals that CAPA, and only that one", async () => {
    const one = await stranded("First stranded.");
    const two = await stranded("Second stranded.");
    const [status, body] = await call(GET_C(req("GET"), ctx(one.c.id)));
    expect(status).toBe(200);
    expect(body.task).toMatchObject({ id: one.taskId, status: "DONE" }); // the page shows the healed task straight away
    expect(body.events[0]).toMatchObject({ action: "task_completed" });
    expect(row("ruleInstance", two.taskId).status).toBe("OVERDUE");
    expect(eventsOf(two.c.id).some((e) => e.action === "task_completed")).toBe(false);
    await LIST_C();
    expect(row("ruleInstance", two.taskId).status).toBe("DONE");
  });
  it("a closed CAPA with an open task is healed as well; a started task keeps its start in its history", async () => {
    const { c, taskId } = await stranded();
    await noteTaskStarted(ACTOR, taskId);
    table("qualityCapa").find((r) => r.id === c.id)!.status = "closed";
    table("ruleInstance").find((r) => r.id === taskId)!.status = "IN_PROGRESS";
    expect(await healCapaTasks(ACTOR)).toEqual([c.id]);
    expect(row("ruleInstance", taskId).status).toBe("DONE");
    expect(audits(taskId).map((a) => a.action)).toEqual(["created", "started", "completed"]);
    expect(eventsOf(c.id).find((e) => e.action === "task_completed")).toMatchObject({ changes: [{ field: "followUpTask", from: "In progress", to: "Done" }] });
  });
  it("does not touch: open or in-progress CAPAs, void CAPAs, finished or skipped tasks, or a task that is not a CAPA task", async () => {
    const { working, workingTask } = await bystanders();
    const done = await stranded("Already done.");
    await LIST_C(); // heals it; from here on it is finished
    const skipped = await stranded("Skipped by hand.");
    Object.assign(table("ruleInstance").find((r) => r.id === skipped.taskId)!, { status: "SKIPPED", skipReason: "Plant closed" });
    const voided = await newCapa({ problem: "Voided with a started task." });
    await saveC(voided.id, { ownerId: "chris", dueDate: "2026-11-25" });
    await noteTaskStarted(ACTOR, taskOf(voided.id)!.id);
    await actC(voided.id, { action: "void", reason: "Not needed" });
    // a CAPA at Verifying that (wrongly) points at another rule's task: left alone
    const odd = await stranded("Points at a foreign task.");
    table("qualityCapa").find((r) => r.id === odd.c.id)!.taskInstanceId = "preop-open";
    Object.assign(table("ruleInstance").find((r) => r.id === odd.taskId)!, { status: "DONE" });
    const before = state();
    expect(await healCapaTasks(ACTOR)).toEqual([]);
    await LIST_C(); await GET_C(req("GET"), ctx(working.id)); await GET_C(req("GET"), ctx(odd.c.id)); await GET_C(req("GET"), ctx(voided.id));
    expect(state()).toBe(before);
    expect(row("ruleInstance", workingTask).status).toBe("OVERDUE");
    expect(row("ruleInstance", "preop-open").status).toBe("OVERDUE");
    expect(row("ruleInstance", done.taskId).status).toBe("DONE");
  });
  it("a failure while healing never breaks the page: the list still loads", async () => {
    const { c, taskId } = await stranded();
    db.failOn = completionFails;
    const res = await LIST_C();
    expect(res.status).toBe(200);
    expect(((await res.json()) as CapaRow[]).map((r) => r.reference)).toContain(c.reference);
    expect(row("ruleInstance", taskId).status).toBe("OVERDUE");
    expect(eventsOf(c.id).some((e) => e.action === "task_completed")).toBe(false);
    db.failOn = null;
  });
  it("lives in the Quality code only: the list and record routes call it, and no shared task file or cron mentions it", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "../../../..", p), "utf8");
    expect(read("app/api/quality/capas/route.ts")).toContain("await healCapaTasks(actor); return listCapas();");
    expect(read("app/api/quality/capas/[id]/route.ts")).toContain("await healCapaTasks(actor, params.id); return getCapa(params.id);");
    for (const shared of ["lib/task-generator.ts", "lib/task-completion.ts", "lib/calendar-generator.ts", "lib/task-reminders.ts", "lib/task-escalation.ts", "lib/batch-sheet-reconcile.ts", "app/api/task-instances/[id]/start/route.ts", "hooks/useMarkInProgress.ts"]) {
      expect(read(shared), shared).not.toMatch(/healCapaTasks|noteTaskStarted|quality/i);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("fix c: Start on a CAPA or review task marks it In progress the first time", () => {
  const landing = async (run: () => Promise<JSX.Element>) => { try { return await run(); } catch (e) { return (e as Error).message; } };
  async function capaWithTask(due = "2026-11-25") {
    const c = await newCapa();
    await saveC(c.id, { ownerId: "chris", dueDate: due });
    return { c, taskId: taskOf(c.id)!.id as string };
  }
  const reviewTask = (over: Json = {}) => { seed("ruleInstance", [{ id: "review-nov", ruleId: "rule-review", dueDate: new Date("2026-11-30T00:00:00Z"), status: "UPCOMING", label: "", ...over }]); return "review-nov"; };

  it("CAPA task: Start notes the start on the task once and opens the CAPA with the task id", async () => {
    const { c, taskId } = await capaWithTask();
    expect(await landing(() => CapaTaskPage({ searchParams: { taskId } }))).toBe(`REDIRECT /dashboard/admin/quality/capas/${c.id}?taskId=${taskId}`);
    expect(audits(taskId).map((a) => [a.action, a.userId, a.note])).toEqual([["created", "carlos", `Created for ${c.reference} (owner and due date set)`], ["started", "carlos", "Opened from the task's Start button"]]);
    // a second Start (or the Back button) adds nothing
    await landing(() => CapaTaskPage({ searchParams: { taskId } }));
    await landing(() => CapaTaskPage({ searchParams: { taskId } }));
    expect(audits(taskId).filter((a) => a.action === "started")).toHaveLength(1);
  });
  it("the CAPA page is told to mark the task only when the task id really is that CAPA's task", async () => {
    const { c, taskId } = await capaWithTask();
    const other = await capaWithTask("2026-11-26");
    reviewTask();
    const props = async (id: string, tid?: string) => ((await CapaPage({ params: { id }, searchParams: tid === undefined ? undefined : { taskId: tid } })) as JSX.Element).props as { kind: string; id: string; startTaskId?: string };
    expect(await props(c.id, taskId)).toEqual({ kind: "capas", id: c.id, startTaskId: taskId });
    expect((await props(c.id, other.taskId)).startTaskId).toBeUndefined(); // another CAPA's task
    expect((await props(c.id, "review-nov")).startTaskId).toBeUndefined(); // not a CAPA task at all
    expect((await props(c.id, "no-such-task")).startTaskId).toBeUndefined();
    expect((await props(c.id)).startTaskId).toBeUndefined(); // opened from the list
  });
  it("the task goes to In progress through the app's existing start route, once, and never backwards", async () => {
    const { taskId } = await capaWithTask();
    await landing(() => CapaTaskPage({ searchParams: { taskId } }));
    expect(await call(START(req("POST"), ctx(taskId)))).toEqual([200, { id: taskId, status: "IN_PROGRESS", formKey: "quality_capa" }]);
    const once = JSON.stringify(table("ruleInstance"));
    expect((await call(START(req("POST"), ctx(taskId))))[1].status).toBe("IN_PROGRESS");
    expect(JSON.stringify(table("ruleInstance"))).toBe(once);
  });
  it("a finished task is not touched: no note, no status change, by the page or by the start route", async () => {
    const { c, taskId } = await capaWithTask();
    await actC(c.id, { action: "move", to: "in_progress" });
    await actC(c.id, { action: "move", to: "verifying" });
    expect(row("ruleInstance", taskId).status).toBe("DONE");
    const before = JSON.stringify([table("ruleInstance"), table("taskInstanceAudit")]);
    expect(await landing(() => CapaTaskPage({ searchParams: { taskId } }))).toBe(`REDIRECT /dashboard/admin/quality/capas/${c.id}?taskId=${taskId}`);
    expect((await call(START(req("POST"), ctx(taskId))))[1].status).toBe("DONE");
    expect(await noteTaskStarted(ACTOR, taskId)).toBe(false);
    expect(JSON.stringify([table("ruleInstance"), table("taskInstanceAudit")])).toBe(before);
    for (const status of ["SKIPPED", "MISSED"]) {
      table("ruleInstance").find((t) => t.id === taskId)!.status = status;
      expect(await noteTaskStarted(ACTOR, taskId)).toBe(false);
      expect((await call(START(req("POST"), ctx(taskId))))[1].status).toBe(status);
    }
    expect(audits(taskId).some((a) => a.action === "started")).toBe(false);
  });
  it("the note is only ever written on Quality tasks", async () => {
    seed("ruleInstance", [{ id: "preop-open", ruleId: "rule-preop", dueDate: new Date("2026-11-21T00:00:00Z"), status: "DUE_TODAY", label: "" }]);
    expect(await noteTaskStarted(ACTOR, "preop-open")).toBe(false);
    expect(await noteTaskStarted(ACTOR, "no-such-task")).toBe(false);
    expect(await noteTaskStarted(ACTOR, undefined)).toBe(false);
    expect(table("taskInstanceAudit")).toHaveLength(0);
    // a task id that is not a CAPA task shows the plain message and writes nothing
    const page = await landing(() => CapaTaskPage({ searchParams: { taskId: "preop-open" } }));
    expect(typeof page).toBe("object");
    expect(table("taskInstanceAudit")).toHaveLength(0);
  });
  it("review task: Start notes the start once, opens the month's review, and the page marks only that month's task", async () => {
    const taskId = reviewTask();
    const to = "REDIRECT /dashboard/admin/quality?tab=reviews&period=2026-11&taskId=review-nov";
    expect(await landing(() => ReviewTaskPage({ searchParams: { taskId } }))).toBe(to);
    expect(await landing(() => ReviewTaskPage({ searchParams: { taskId } }))).toBe(to);
    expect(audits(taskId).map((a) => a.action)).toEqual(["started"]);
    const props = async (searchParams: Json) => ((await QualityPage({ searchParams })) as JSX.Element).props as { initialTab: string; initialPeriod?: string; taskId?: string; startTaskId?: string };
    expect(await props({ tab: "reviews", period: "2026-11", taskId })).toMatchObject({ initialTab: "reviews", initialPeriod: "2026-11", taskId, startTaskId: taskId });
    expect((await props({ tab: "reviews", period: "2026-10", taskId })).startTaskId).toBeUndefined(); // not that month's task
    expect((await props({ tab: "reviews", period: "2026-11" })).startTaskId).toBeUndefined();
    expect((await props({ tab: "incidents", period: "2026-11", taskId })).startTaskId).toBeUndefined();
    const capa = await capaWithTask();
    expect((await props({ tab: "reviews", period: "2026-11", taskId: capa.taskId })).startTaskId).toBeUndefined(); // a CAPA task is not a review task
    expect((await call(START(req("POST"), ctx(taskId))))[1].status).toBe("IN_PROGRESS");
    // saving the review then completes it; Start afterwards changes nothing
    expect((await call(NEW_R(req("POST", { period: "2026-11", reviewDate: "2026-11-21", whatWasReviewed: "Everything", taskId }))))[0]).toBe(201);
    expect(row("ruleInstance", taskId).status).toBe("DONE");
    await landing(() => ReviewTaskPage({ searchParams: { taskId } }));
    expect((await call(START(req("POST"), ctx(taskId))))[1].status).toBe("DONE");
    expect(audits(taskId).map((a) => a.action)).toEqual(["started", "completed"]);
  });
  it("the pages use the forms' own hook, and only fire it for a task nobody has acted on", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "../../../..", p), "utf8");
    const record = read("app/(dashboard)/dashboard/admin/quality/QualityRecordPage.tsx");
    expect(record).toContain('import { useMarkInProgress } from "@/hooks/useMarkInProgress";');
    expect(record).toContain("const markInProgress = useMarkInProgress({ taskId: startTaskId ?? null, formKey: QUALITY_CAPA_FORM_KEY, facilityName: QUALITY_RULE_FACILITY });");
    expect(record).toContain("if (startTaskId && task && task.id === startTaskId && taskUntouched(task.status)) markInProgress();");
    const home = read("app/(dashboard)/dashboard/admin/quality/QualityHome.tsx");
    expect(home).toContain("const markInProgress = useMarkInProgress({ taskId: startTaskId ?? null, formKey: QUALITY_REVIEW_FORM_KEY, facilityName: QUALITY_RULE_FACILITY });");
    expect(home).toContain("useEffect(() => { if (startTaskId) markInProgress(); }, [startTaskId, markInProgress]);");
    // the hook goes to the existing start route when it has a task id, and fires once
    const hook = read("hooks/useMarkInProgress.ts");
    expect(hook).toContain("`/api/task-instances/${tid}/start`");
    expect(hook).toContain("if (firedRef.current) return;");
  });
  it("the record pages and the start pages are for admins only", async () => {
    const { c, taskId } = await capaWithTask();
    const before = state();
    for (const who of [{ user: { id: "hugo", role: "SUPERVISOR", name: "Hugo Ayala" } }, null]) {
      session.mockResolvedValue(who);
      expect(await landing(() => CapaTaskPage({ searchParams: { taskId } }))).toBe("REDIRECT /dashboard");
      expect(await landing(() => ReviewTaskPage({ searchParams: { taskId } }))).toBe("REDIRECT /dashboard");
      expect(await landing(() => CapaPage({ params: { id: c.id }, searchParams: { taskId } }))).toBe("REDIRECT /dashboard");
      expect(await landing(() => IncidentPage({ params: { id: "x" } }))).toBe("REDIRECT /dashboard");
      expect(await landing(() => QualityPage({ searchParams: { tab: "reviews", period: "2026-11", taskId } }))).toBe("REDIRECT /dashboard");
    }
    expect(state()).toBe(before);
  });
});
