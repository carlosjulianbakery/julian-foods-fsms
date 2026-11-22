import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const blob = vi.hoisted(() => ({ stored: new Map<string, string>(), tokens: [] as unknown[], deleted: [] as string[] }));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", async () => { const { makePrisma } = await import("./memdb"); return { prisma: makePrisma() }; });
// Vercel Blob is mocked: private storage that only `get` can read, and a token step that runs the route's own check
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (url: string, opts: { access: string }) => (opts.access === "private" && blob.stored.has(url) ? { stream: new Response(blob.stored.get(url)!).body, blob: { contentType: "application/octet-stream" } } : null)),
  del: vi.fn(async (url: string) => { blob.deleted.push(url); }),
  put: vi.fn(),
}));
vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(async ({ body, onBeforeGenerateToken }: { body: { payload: { pathname: string; clientPayload: string | null } }; onBeforeGenerateToken: (p: string, c: string | null, m: boolean) => Promise<unknown> }) => {
    const options = await onBeforeGenerateToken(body.payload.pathname, body.payload.clientPayload, false);
    blob.tokens.push(options);
    return { type: "blob.generate-client-token", clientToken: "short-lived-token" };
  }),
}));

import { getServerSession } from "next-auth";
import { db, resetDb, seed, table } from "./memdb";
import { POST as NEW_I } from "@/app/api/quality/incidents/route";
import { GET as GET_I, PATCH as SAVE_I } from "@/app/api/quality/incidents/[id]/route";
import { POST as ACT_I } from "@/app/api/quality/incidents/[id]/status/route";
import { POST as NEW_C } from "@/app/api/quality/capas/route";
import { GET as GET_C, PATCH as SAVE_C } from "@/app/api/quality/capas/[id]/route";
import { POST as ACT_C } from "@/app/api/quality/capas/[id]/status/route";
import { POST as TOKEN } from "@/app/api/quality/attachments/upload-token/route";
import { POST as ATTACH } from "@/app/api/quality/attachments/route";
import { GET as FILE, DELETE as REMOVE } from "@/app/api/quality/attachments/[id]/route";
import { GET as LIST_R, POST as NEW_R } from "@/app/api/quality/reviews/route";
import { GET as GET_R, PATCH as SAVE_R } from "@/app/api/quality/reviews/[id]/route";
import { POST as NEW_RULE } from "@/app/api/task-rules/route";
import { PATCH as EDIT_RULE, DELETE as DELETE_RULE } from "@/app/api/task-rules/[id]/route";
import { capaOfTask, periodOfReviewTask } from "@/lib/quality-reviews";
import { ensureCapaRule } from "@/lib/quality-server";
import { prisma } from "@/lib/prisma";
import { TASK_FORM_REGISTRY, getFormKeyOptions, isSystemManagedFormKey } from "@/lib/task-form-registry";

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
const tasks = () => table("ruleInstance");
const audits = (taskId: string) => table("taskInstanceAudit").filter((a) => a.instanceId === taskId);
const eventsOf = (id: string) => table("qualityEvent").filter((e) => e.recordId === id);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function newIncident(over: Json = {}) { return (await call(NEW_I(req("POST", { dateReceived: "2026-11-20", channel: "email", description: "Plastic in a loaf.", ...over }))))[1] as { id: string; reference: string }; }
async function newCapa(over: Json = {}) { return (await call(NEW_C(req("POST", { source: "audit_finding", problem: "Sanitizer log incomplete on the night shift.", ...over }))))[1] as { id: string; reference: string }; }
const saveC = (id: string, body: Json) => call(SAVE_C(req("PATCH", { expectedUpdatedAt: stamp("qualityCapa", id), ...body }), ctx(id)));
const actC = (id: string, body: Json) => call(ACT_C(req("POST", body), ctx(id)));
const taskOf = (capaId: string) => { const id = row("qualityCapa", capaId).taskInstanceId; return id ? row("ruleInstance", id) : null; };

beforeEach(() => {
  vi.clearAllMocks();
  at("2026-11-21T18:00:00Z"); // 10:00 AM Pacific, November 21, 2026
  resetDb(); blob.stored.clear(); blob.tokens.length = 0; blob.deleted.length = 0;
  seed("user", [
    { id: "carlos", name: "Carlos Gomory", role: "ADMIN", active: true }, { id: "chris", name: "Chris Pence", role: "ADMIN", active: true },
    { id: "hugo", name: "Hugo Ayala", role: "SUPERVISOR", active: true },
  ]);
  seed("facility", [{ id: "fac-jb", name: "Julian Bakery" }, { id: "fac-624", name: "624" }]);
  seed("taskRule", [{ id: "rule-preop", title: "Pre-Op Inspection", facilityId: "fac-jb", ownerId: "hugo", triggerType: "PRODUCTION_DAY", formKey: "preop", recurrenceStart: new Date("2026-11-12T00:00:00Z"), sortOrder: 10 },
    { id: "rule-fm", title: "Foreign Matter Inspection", facilityId: "fac-624", ownerId: "hugo", triggerType: "RECURRING", recurrenceUnit: "half_month", formKey: "foreign_matter_624", recurrenceStart: new Date("2026-11-20T00:00:00Z"), sortOrder: 120 }]);
  as("ADMIN");
  for (const m of ["error", "log", "warn"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

// ════════════════════════════════════════════════════════════════════════════════
describe("attachments", () => {
  const file = (over: Json = {}) => ({ kind: "evidence", fileName: "photo.jpg", fileSize: 2_000_000, mimeType: "image/jpeg", ...over });
  const urlFor = (type: string, id: string, name = "photo-AbC123.jpg") => `https://store123.private.blob.vercel-storage.com/quality/${type}/${id}/${name}`;
  const token = (type: string, id: string, f: Json = {}) => {
    const details = { recordType: type, recordId: id, ...file(f) };
    return call(TOKEN(req("POST", { type: "blob.generate-client-token", payload: { pathname: `quality/${type}/${id}/${details.fileName}`, clientPayload: JSON.stringify(details), multipart: false } })));
  };
  /** Records an uploaded file and puts its content in the (mocked) private store. */
  async function attach(type: string, id: string, f: Json = {}, name?: string) {
    const fileUrl = urlFor(type, id, name ?? `f-${table("qualityAttachment").length}.jpg`);
    blob.stored.set(fileUrl, "FILE-CONTENT");
    return call(ATTACH(req("POST", { recordType: type, recordId: id, ...file(f), fileUrl })));
  }

  it("the token route is admin only, and hands out a token limited to that one type and 15 MB", async () => {
    const { id } = await newIncident();
    as(null);
    expect((await token("incident", id))[0]).toBe(401);
    as("SUPERVISOR", "hugo", "Hugo Ayala");
    expect((await token("incident", id))[0]).toBe(403);
    expect(blob.tokens).toHaveLength(0);
    as("ADMIN");
    const [status, body] = await token("incident", id);
    expect([status, body.clientToken]).toEqual([200, "short-lived-token"]);
    expect(blob.tokens).toEqual([{ allowedContentTypes: ["image/jpeg"], maximumSizeInBytes: 15 * 1024 * 1024, addRandomSuffix: true }]);
  });

  it("type and size are checked before a token is given: JPEG, PNG, WebP, HEIC and PDF up to 15 MB, nothing else", async () => {
    const { id } = await newIncident();
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]) expect((await token("incident", id, { mimeType }))[0], mimeType).toBe(200);
    expect((await token("incident", id, { fileSize: 15 * 1024 * 1024 }))[0]).toBe(200); // exactly 15 MB
    for (const mimeType of ["image/gif", "video/mp4", "application/zip", "text/html", "image/svg+xml", ""]) expect((await token("incident", id, { mimeType }))[1].error, mimeType).toBe("That file type is not allowed. Use JPEG, PNG, WebP, HEIC or PDF.");
    expect((await token("incident", id, { fileSize: 15 * 1024 * 1024 + 1 }))[1].error).toBe("The file is too large (15 MB at most).");
    expect((await token("incident", id, { fileSize: 0 }))[1].error).toBe("The file is empty.");
    expect((await token("incident", id, { kind: "selfie" }))[1].error).toBe("Choose what the file is: evidence, or the message sent to the customer.");
    expect((await token("incident", "nope"))[0]).toBe(404);
    // a file cannot be stored outside its record's folder
    const [status, body] = await call(TOKEN(req("POST", { type: "blob.generate-client-token", payload: { pathname: "quality/incident/another-id/photo.jpg", clientPayload: JSON.stringify({ recordType: "incident", recordId: id, ...file() }) } })));
    expect([status, body.error]).toEqual([400, "The file is not being stored with its record."]);
    expect(blob.tokens).toHaveLength(6);
  });

  it("the same rules are checked again when the attachment is recorded, and the file must be this record's own", async () => {
    const { id } = await newIncident();
    const other = await newIncident();
    expect((await attach("incident", id, { mimeType: "image/gif" }))[1].error).toBe("That file type is not allowed. Use JPEG, PNG, WebP, HEIC or PDF.");
    expect((await attach("incident", id, { fileSize: 16 * 1024 * 1024 }))[1].error).toBe("The file is too large (15 MB at most).");
    for (const fileUrl of [urlFor("incident", other.id), "https://evil.example.com/quality/incident/" + id + "/x.jpg", "http://store123.private.blob.vercel-storage.com/quality/incident/" + id + "/x.jpg", urlFor("capa", id), "not a url"])
      expect((await call(ATTACH(req("POST", { recordType: "incident", recordId: id, ...file(), fileUrl }))))[1].error, fileUrl).toBe("That file was not uploaded for this record.");
    expect(table("qualityAttachment")).toHaveLength(0);
    const [status, body] = await attach("incident", id, { description: "  Photo sent by the customer " });
    expect(status).toBe(201);
    expect(row("qualityAttachment", body.id)).toMatchObject({ recordType: "incident", recordId: id, kind: "evidence", fileName: "photo.jpg", fileSize: 2_000_000, mimeType: "image/jpeg", description: "Photo sent by the customer", uploadedById: "carlos", removedAt: null });
  });

  it("'the message sent' is an incident attachment of its own kind; a CAPA only takes evidence", async () => {
    const i = await newIncident();
    const c = await newCapa();
    expect((await attach("incident", i.id, { kind: "customer_response", fileName: "reply.pdf", mimeType: "application/pdf" }))[0]).toBe(201);
    expect((await attach("capa", c.id, { kind: "customer_response" }))[1].error).toBe("The message sent to the customer belongs to an incident.");
    expect((await attach("capa", c.id))[0]).toBe(201);
    const [, page] = await call(GET_I(req("GET"), ctx(i.id)));
    expect(page.attachments.map((a: Json) => [a.kind, a.fileName])).toEqual([["customer_response", "reply.pdf"]]);
    expect((await call(GET_C(req("GET"), ctx(c.id))))[1].attachments).toHaveLength(1);
  });

  it("adding writes an 'attachment added' event in the same transaction — if the history cannot be written, nothing is attached", async () => {
    const { id, reference } = await newIncident();
    await attach("incident", id, { description: "Close-up" });
    expect(eventsOf(id).at(-1)).toMatchObject({ recordType: "incident", reference, action: "attachment_added", userName: "Carlos Gomory", note: "Evidence: Close-up", changes: [{ field: "attachment", from: null, to: "photo.jpg" }] });
    db.failOn = (model, op, data) => model === "qualityEvent" && op === "create" && data.action === "attachment_added";
    expect((await attach("incident", id))[0]).toBe(500);
    db.failOn = null;
    expect(table("qualityAttachment")).toHaveLength(1);
  });

  it("at most ten active attachments per record: the eleventh is refused, at the token step and at the record step", async () => {
    const { id } = await newIncident();
    for (let n = 0; n < 10; n++) expect((await attach("incident", id, { fileName: `p${n}.jpg` }))[0]).toBe(201);
    const refused = "This record already has 10 attachments, the most allowed. Remove one first.";
    expect((await token("incident", id))[1].error).toBe(refused);
    expect((await attach("incident", id))[1].error).toBe(refused);
    expect(table("qualityAttachment")).toHaveLength(10);
    // removing one frees a place (a removed attachment does not count)
    await call(REMOVE(req("DELETE", { reason: "Blurry photo" }), ctx(table("qualityAttachment")[0].id)));
    expect((await attach("incident", id))[0]).toBe(201);
    expect(table("qualityAttachment")).toHaveLength(11);
  });

  it("files are private: only the route can read them, after the session check; the page never gets a storage address", async () => {
    const { id } = await newIncident();
    const [, made] = await attach("incident", id, {}, "evidence-1.jpg");
    as(null);
    expect((await FILE(req("GET"), ctx(made.id))).status).toBe(401);
    as("SUPERVISOR", "hugo", "Hugo Ayala");
    expect((await FILE(req("GET"), ctx(made.id))).status).toBe(403);
    as("ADMIN");
    const res = await FILE(req("GET"), ctx(made.id));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("FILE-CONTENT");
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="photo.jpg"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const download = await FILE(req("GET", undefined, "http://localhost/api/quality/attachments/x?download=1"), ctx(made.id));
    expect(download.headers.get("Content-Disposition")).toBe('attachment; filename="photo.jpg"');
    expect((await FILE(req("GET"), ctx("nope"))).status).toBe(404);
    // nothing the page receives contains the storage address
    const [, page] = await call(GET_I(req("GET"), ctx(id)));
    expect(page.attachments).toHaveLength(1);
    expect(Object.keys(page.attachments[0]).sort()).toEqual(["description", "fileName", "fileSize", "id", "kind", "mimeType", "removeReason", "removedAt", "removedByName", "uploadedAt", "uploadedByName"]);
    expect(JSON.stringify(page)).not.toContain("blob.vercel-storage.com");
    expect(page.attachments[0]).toMatchObject({ uploadedByName: "Carlos Gomory", removedAt: null });
  });

  it("removing needs a reason, only marks the attachment removed, keeps the file, and is recorded in the history", async () => {
    const { id } = await newIncident();
    const [, made] = await attach("incident", id, {}, "evidence-2.jpg");
    expect((await call(REMOVE(req("DELETE", {}), ctx(made.id))))[1].problems).toEqual([{ field: "reason", message: "Reason: say why you are removing this attachment." }]);
    as("ADMIN", "chris", "Chris Pence");
    const [status, body] = await call(REMOVE(req("DELETE", { reason: "Wrong lot in the photo." }), ctx(made.id)));
    expect([status, body]).toEqual([200, { removed: "photo.jpg" }]);
    expect(row("qualityAttachment", made.id)).toMatchObject({ removedById: "chris", removeReason: "Wrong lot in the photo." });
    expect(row("qualityAttachment", made.id).removedAt).toBeInstanceOf(Date);
    expect(table("qualityAttachment")).toHaveLength(1); // the row stays
    expect(blob.deleted).toEqual([]); // the file is not deleted from storage
    expect(blob.stored.size).toBe(1);
    expect((await FILE(req("GET"), ctx(made.id))).status).toBe(200); // and can still be viewed
    expect(eventsOf(id).at(-1)).toMatchObject({ action: "attachment_removed", userName: "Chris Pence", note: "Wrong lot in the photo.", changes: [{ field: "attachment", from: "photo.jpg", to: null }] });
    const [, page] = await call(GET_I(req("GET"), ctx(id)));
    expect(page.attachments[0]).toMatchObject({ removedByName: "Chris Pence", removeReason: "Wrong lot in the photo." });
    expect((await call(REMOVE(req("DELETE", { reason: "again" }), ctx(made.id))))[0]).toBe(409);
    // a failed history write undoes the removal
    const [, second] = await attach("incident", id);
    db.failOn = (model, _op, data) => model === "qualityEvent" && data.action === "attachment_removed";
    expect((await call(REMOVE(req("DELETE", { reason: "Trying" }), ctx(second.id))))[0]).toBe(500);
    db.failOn = null;
    expect(row("qualityAttachment", second.id).removedAt).toBeNull();
  });

  it("a closed or void record keeps its attachments viewable but refuses adding and removing", async () => {
    const { id } = await newIncident();
    const [, made] = await attach("incident", id);
    await call(ACT_I(req("POST", { action: "void", reason: "Entered twice." }), ctx(id)));
    expect((await token("incident", id))[1].code).toBe("read_only");
    expect((await attach("incident", id))[1].code).toBe("read_only");
    expect((await call(REMOVE(req("DELETE", { reason: "Tidy up" }), ctx(made.id))))[1].code).toBe("read_only");
    expect(table("qualityAttachment")).toHaveLength(1);
    expect((await FILE(req("GET"), ctx(made.id))).status).toBe(200);
    expect((await call(GET_I(req("GET"), ctx(id))))[1].attachments).toHaveLength(1);

    const c = await newCapa();
    const [, capaFile] = await attach("capa", c.id);
    await saveC(c.id, { rootCause: "a", correctiveAction: "b", preventiveAction: "c", ownerId: "chris", dueDate: "2026-12-15", effectivenessDate: "2026-12-20", effectivenessResult: "d" });
    await actC(c.id, { action: "move", to: "in_progress" }); await actC(c.id, { action: "move", to: "verifying" }); await actC(c.id, { action: "close" });
    expect(row("qualityCapa", c.id).status).toBe("closed");
    expect((await attach("capa", c.id))[1].code).toBe("read_only");
    expect((await call(REMOVE(req("DELETE", { reason: "Tidy up" }), ctx(capaFile.id))))[1].code).toBe("read_only");
    expect((await FILE(req("GET"), ctx(capaFile.id))).status).toBe(200);
    await actC(c.id, { action: "reopen", reason: "More evidence arrived." });
    expect((await attach("capa", c.id))[0]).toBe(201); // reopened: allowed again
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CAPA follow-up task", () => {
  it("no task until BOTH the owner and the due date are set; then one task for the owner on that date", async () => {
    const { id, reference } = await newCapa();
    expect(tasks()).toHaveLength(0);
    await saveC(id, { ownerId: "chris" });
    expect(tasks()).toHaveLength(0);
    await saveC(id, { ownerId: null, dueDate: "2026-12-15" });
    expect(tasks()).toHaveLength(0);
    await saveC(id, { ownerId: "chris" });
    expect(tasks()).toHaveLength(1);
    const task = taskOf(id)!;
    const rule = table("taskRule").find((r) => r.formKey === "quality_capa")!;
    expect(task).toMatchObject({ ruleId: rule.id, status: "UPCOMING", ownerUserId: "chris", calendarKey: `capa:${id}`, label: `${reference}: Sanitizer log incomplete on the night shift.` });
    expect(day(task.dueDate)).toBe("2026-12-15");
    expect(audits(task.id).map((a) => [a.action, a.userId])).toEqual([["created", "carlos"]]);
    expect(audits(task.id)[0].note).toBe(`Created for ${reference} (owner and due date set)`);
    expect((await call(GET_C(req("GET"), ctx(id))))[1].task).toMatchObject({ id: task.id, status: "UPCOMING", dueDate: "2026-12-15" });
  });

  it("the system rule is created once, attached to Julian Bakery, ranked last, and never produces tasks on its own", async () => {
    await saveC((await newCapa()).id, { ownerId: "chris", dueDate: "2026-12-15" });
    await saveC((await newCapa({ problem: "Second problem" })).id, { ownerId: "carlos", dueDate: "2026-12-20" });
    const rules = table("taskRule").filter((r) => r.formKey === "quality_capa");
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ title: "CAPA follow-up", facilityId: "fac-jb", triggerType: "ONE_OFF", windowMode: "NONE", isActive: true, sortOrder: 130 });
    expect(rules[0].recurrenceStart.toISOString().slice(0, 10)).toBe("2026-01-01"); // in the past: the generator makes nothing from it
    expect(tasks().map((t) => t.ownerUserId)).toEqual(["chris", "carlos"]);
    expect(await ensureCapaRule(prisma as never, "carlos")).toEqual({ id: rules[0].id, created: false });
  });

  it("a long problem is shortened in the label; a due date of today or in the past starts as due today or overdue", async () => {
    const long = await newCapa({ problem: "The night shift sanitizer log has gaps on six of the last fourteen nights and nobody countersigned the entries that are there" });
    await saveC(long.id, { ownerId: "chris", dueDate: "2026-11-21" });
    expect(taskOf(long.id)!.label).toBe(`${long.reference}: The night shift sanitizer log has gaps on six of the last fourteen ni…`);
    expect(taskOf(long.id)!.status).toBe("DUE_TODAY");
    const past = await newCapa({ problem: "Old finding" });
    await saveC(past.id, { ownerId: "chris", dueDate: "2026-11-10" });
    expect(taskOf(past.id)!.status).toBe("OVERDUE");
  });

  it("a new owner or due date updates an untouched task in place, with an audit row", async () => {
    const { id, reference } = await newCapa();
    await saveC(id, { ownerId: "chris", dueDate: "2026-12-15" });
    const taskId = taskOf(id)!.id;
    await saveC(id, { dueDate: "2026-12-22" });
    await saveC(id, { ownerId: "carlos" });
    expect(tasks()).toHaveLength(1);
    expect(taskOf(id)).toMatchObject({ id: taskId, ownerUserId: "carlos", status: "UPCOMING" });
    expect(day(taskOf(id)!.dueDate)).toBe("2026-12-22");
    expect(audits(taskId).map((a) => [a.action, a.note])).toEqual([
      ["created", `Created for ${reference} (owner and due date set)`], ["updated", `${reference}: due date changed on the CAPA`], ["updated", `${reference}: owner changed on the CAPA`],
    ]);
    // a change that does not concern the task leaves it alone
    await saveC(id, { rootCause: "No countersign step." });
    expect(audits(taskId)).toHaveLength(3);
    // the label follows the problem text
    await saveC(id, { problem: "Sanitizer log incomplete." });
    expect(taskOf(id)!.label).toBe(`${reference}: Sanitizer log incomplete.`);
  });

  it("a started task keeps its history and its status: only the date and the owner change", async () => {
    const { id } = await newCapa();
    await saveC(id, { ownerId: "chris", dueDate: "2026-12-15" });
    const task = taskOf(id)!;
    task.status = "IN_PROGRESS";
    seed("taskInstanceAudit", [{ id: "a-start", instanceId: task.id, action: "started", userId: "chris", note: null }]);
    await saveC(id, { dueDate: "2026-12-30", ownerId: "carlos" });
    expect(taskOf(id)).toMatchObject({ id: task.id, status: "IN_PROGRESS", ownerUserId: "carlos" });
    expect(day(taskOf(id)!.dueDate)).toBe("2026-12-30");
    expect(audits(task.id).map((a) => a.action)).toEqual(["created", "started", "updated"]);
  });

  it("clearing the owner or the due date deletes an untouched task (not skipped), and keeps a started or done one", async () => {
    const a = await newCapa();
    await saveC(a.id, { ownerId: "chris", dueDate: "2026-12-15" });
    const untouched = taskOf(a.id)!.id;
    seed("notification", [{ id: "n1", instanceId: untouched, userId: "chris" }]);
    await saveC(a.id, { dueDate: null });
    expect(tasks()).toHaveLength(0);
    expect(audits(untouched)).toHaveLength(0); // its audit rows went with it
    expect(table("notification")).toHaveLength(0);
    expect(row("qualityCapa", a.id).taskInstanceId).toBeNull();
    // setting it again makes a new task
    await saveC(a.id, { dueDate: "2026-12-18" });
    expect(tasks()).toHaveLength(1);

    for (const status of ["IN_PROGRESS", "DONE", "SKIPPED", "MISSED"]) {
      const c = await newCapa({ problem: `Problem ${status}` });
      await saveC(c.id, { ownerId: "chris", dueDate: "2026-12-15" });
      taskOf(c.id)!.status = status;
      const kept = taskOf(c.id)!.id;
      await saveC(c.id, { ownerId: null });
      expect(row("ruleInstance", kept), status).toMatchObject({ status, ownerUserId: "chris" }); // kept exactly as it was
      expect(row("qualityCapa", c.id).taskInstanceId, status).toBe(kept);
    }
  });

  it("void: an untouched task is deleted, a started or done one is kept; reopening a void CAPA gives it a task again", async () => {
    const a = await newCapa();
    await saveC(a.id, { ownerId: "chris", dueDate: "2026-12-15" });
    await actC(a.id, { action: "void", reason: "Raised in error." });
    expect(tasks()).toHaveLength(0);
    expect(tasks().some((t) => t.status === "SKIPPED")).toBe(false); // removed, not skipped
    await actC(a.id, { action: "reopen", reason: "It was valid after all." });
    expect(taskOf(a.id)).toMatchObject({ status: "UPCOMING", ownerUserId: "chris" });

    const b = await newCapa({ problem: "Started one" });
    await saveC(b.id, { ownerId: "chris", dueDate: "2026-12-15" });
    taskOf(b.id)!.status = "IN_PROGRESS";
    const started = taskOf(b.id)!.id;
    await actC(b.id, { action: "void", reason: "Superseded." });
    expect(row("ruleInstance", started).status).toBe("IN_PROGRESS");
  });

  it("the task completes when the CAPA reaches Verifying effectiveness — through the shared completion helper, with its audit row", async () => {
    const { id } = await newCapa();
    await saveC(id, { ownerId: "chris", dueDate: "2026-12-15" });
    const taskId = taskOf(id)!.id;
    await actC(id, { action: "move", to: "in_progress" });
    expect(row("ruleInstance", taskId).status).toBe("UPCOMING"); // not yet
    as("ADMIN", "chris", "Chris Pence");
    await actC(id, { action: "move", to: "verifying" });
    expect(row("ruleInstance", taskId)).toMatchObject({ status: "DONE", doneById: "chris", completedLate: false, daysLate: null, completedBySubmissionId: id, ownerUserId: "chris" });
    expect(audits(taskId).at(-1)).toMatchObject({ action: "completed", userId: "chris", note: `Auto-completed by form submission ${id}` });
    // closing afterwards does nothing more to it
    await saveC(id, { rootCause: "a", correctiveAction: "b", preventiveAction: "c", effectivenessDate: "2026-12-20", effectivenessResult: "d" });
    await actC(id, { action: "close" });
    expect(audits(taskId).filter((a) => a.action === "completed")).toHaveLength(1);
    expect((await call(GET_C(req("GET"), ctx(id))))[1].task).toMatchObject({ status: "DONE" });
  });

  it("completing after the due date records it as late, with the number of days (Pacific dates)", async () => {
    const { id } = await newCapa();
    await saveC(id, { ownerId: "chris", dueDate: "2026-11-25" });
    await actC(id, { action: "move", to: "in_progress" });
    at("2026-11-29T07:30:00Z"); // November 28, 11:30 PM Pacific: three days late, not four
    await actC(id, { action: "move", to: "verifying" });
    expect(taskOf(id)).toMatchObject({ status: "DONE", completedLate: true, daysLate: 3 });
    expect(audits(taskOf(id)!.id).at(-1)!.note).toContain("3 day(s) late");
    // on the due date itself it is on time
    const b = await newCapa({ problem: "On time" });
    await saveC(b.id, { ownerId: "chris", dueDate: "2026-11-28" });
    await actC(b.id, { action: "move", to: "in_progress" }); await actC(b.id, { action: "move", to: "verifying" });
    expect(taskOf(b.id)).toMatchObject({ status: "DONE", completedLate: false });
  });

  it("stepping back, or reopening a closed CAPA, never recreates or reopens a completed task", async () => {
    const { id } = await newCapa();
    await saveC(id, { rootCause: "a", correctiveAction: "b", preventiveAction: "c", ownerId: "chris", dueDate: "2026-12-15", effectivenessDate: "2026-12-20", effectivenessResult: "d" });
    await actC(id, { action: "move", to: "in_progress" }); await actC(id, { action: "move", to: "verifying" });
    const done = taskOf(id)!.id;
    await actC(id, { action: "move", to: "in_progress", reason: "The fix did not hold." });
    await saveC(id, { dueDate: "2027-01-10" }); // even a new due date does not touch the finished task
    expect(tasks()).toHaveLength(1);
    expect(row("ruleInstance", done).status).toBe("DONE");
    expect(day(row("ruleInstance", done).dueDate)).toBe("2026-12-15");
    await actC(id, { action: "move", to: "verifying" }); await actC(id, { action: "close" });
    await actC(id, { action: "reopen", reason: "Complaint repeated." });
    expect(tasks()).toHaveLength(1);
    expect(row("ruleInstance", done).status).toBe("DONE");
    expect(audits(done).filter((a) => a.action === "completed")).toHaveLength(1);
  });

  it("a CAPA created with owner and due date gets its task at once; one opened from an incident has none until both are set", async () => {
    const direct = await newCapa({ ownerId: "chris", dueDate: "2026-12-15" });
    expect(taskOf(direct.id)).toMatchObject({ ownerUserId: "chris" });
    const i = await newIncident();
    const { POST: OPEN_CAPA } = await import("@/app/api/quality/incidents/[id]/capa/route");
    const [, opened] = await call(OPEN_CAPA(req("POST"), ctx(i.id)));
    expect(taskOf(opened.capa.id)).toBeNull();
    expect(tasks()).toHaveLength(1);
  });

  it("if the CAPA change fails, its task change is rolled back with it", async () => {
    const { id } = await newCapa();
    db.failOn = (model, op) => model === "taskInstanceAudit" && op === "create";
    expect((await saveC(id, { ownerId: "chris", dueDate: "2026-12-15" }))[0]).toBe(500);
    db.failOn = null;
    expect(tasks()).toHaveLength(0);
    expect(row("qualityCapa", id)).toMatchObject({ ownerId: null, dueDate: null, taskInstanceId: null });
    expect(eventsOf(id)).toHaveLength(1);
  });

  it("Start opens the CAPA: the registry entry points at a route that finds the CAPA holding the task id", async () => {
    const { id, reference } = await newCapa();
    await saveC(id, { ownerId: "chris", dueDate: "2026-12-15" });
    expect(TASK_FORM_REGISTRY.quality_capa.href("any")).toBe("/dashboard/admin/quality/capa-task");
    expect(await capaOfTask(taskOf(id)!.id)).toEqual({ id, reference });
    expect(await capaOfTask("some-other-task")).toBeNull();
    expect(await capaOfTask(undefined)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("the CAPA follow-up rule on the Task Rules page", () => {
  async function capaRuleId() { await saveC((await newCapa()).id, { ownerId: "chris", dueDate: "2026-12-15" }); return table("taskRule").find((r) => r.formKey === "quality_capa")!.id; }
  const SYSTEM = "This rule is managed by the system and cannot be changed, archived or deleted here.";

  it("cannot be edited, rescheduled, re-assigned or deactivated", async () => {
    const id = await capaRuleId();
    const before = structuredClone(row("taskRule", id));
    for (const body of [{ title: "Renamed" }, { recurrenceStart: "2027-01-01" }, { triggerType: "RECURRING", recurrenceUnit: "day" }, { ownerId: "hugo" }, { isActive: false }, { formKey: "manual" }, { facilityId: "fac-624" }]) {
      const [status, out] = await call(EDIT_RULE(req("PATCH", body), ctx(id)));
      expect([status, out.error], JSON.stringify(body)).toEqual([403, SYSTEM]);
    }
    expect(row("taskRule", id)).toEqual(before);
    expect(tasks()).toHaveLength(1); // its task was not swept away by a schedule change
  });

  it("cannot be archived or deleted, even permanently", async () => {
    const id = await capaRuleId();
    expect(await call(DELETE_RULE(req("DELETE"), ctx(id)))).toEqual([403, { error: SYSTEM }]);
    expect(await call(DELETE_RULE(req("DELETE", undefined, "http://localhost/api/task-rules/x?permanent=true"), ctx(id)))).toEqual([403, { error: SYSTEM }]);
    expect(row("taskRule", id)).toMatchObject({ isArchived: false, isActive: true });
    expect(tasks()).toHaveLength(1);
    expect(tasks()[0].status).toBe("UPCOMING"); // not skipped by an archive
  });

  it("is not offered in the 'Linked Form' dropdown and cannot be created by hand; the monthly review is offered", async () => {
    const options = getFormKeyOptions();
    expect(options.map((o) => o.value)).not.toContain("quality_capa");
    expect(options).toContainEqual({ value: "quality_review", label: "Review customer incidents and CAPAs" });
    expect(isSystemManagedFormKey("quality_capa")).toBe(true);
    for (const key of ["quality_review", "sop_review", "manual", "verification_624", null, undefined]) expect(isSystemManagedFormKey(key), String(key)).toBe(false);
    const [status, body] = await call(NEW_RULE(req("POST", { title: "My own CAPA rule", facilityId: "fac-jb", ownerId: "carlos", triggerType: "RECURRING", recurrenceUnit: "day", recurrenceStart: "2026-11-21", formKey: "quality_capa" })));
    expect([status, body.error]).toEqual([403, "This kind of rule is created by the system and cannot be added here."]);
    expect(table("taskRule").filter((r) => r.formKey === "quality_capa")).toHaveLength(0);
  });

  it("other rules are still edited and archived as before", async () => {
    expect((await call(EDIT_RULE(req("PATCH", { title: "Foreign Matter Inspection (renamed)" }), ctx("rule-fm"))))[0]).toBe(200);
    expect(row("taskRule", "rule-fm").title).toBe("Foreign Matter Inspection (renamed)");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("monthly review", () => {
  const REVIEW = { period: "2026-11", reviewDate: "2026-11-21", whatWasReviewed: "All incidents received in November and every open CAPA.", notes: "One CAPA is overdue; owner reminded." };
  const reviewTask = (id: string, due: string, status = "UPCOMING") => seed("ruleInstance", [{ id, ruleId: "rule-review", dueDate: new Date(`${due}T00:00:00Z`), status }]);
  beforeEach(() => {
    seed("taskRule", [{ id: "rule-review", title: "Review customer incidents and CAPAs", facilityId: "fac-jb", ownerId: "carlos", triggerType: "RECURRING", recurrenceUnit: "month", recurrenceEndOfMonth: true, formKey: "quality_review", windowMode: "DAYS_BEFORE", windowDaysBefore: 4, recurrenceStart: new Date("2026-11-01T00:00:00Z"), sortOrder: 140 }]);
    reviewTask("rt-oct", "2026-10-31", "OVERDUE"); reviewTask("rt-nov", "2026-11-30"); reviewTask("rt-dec", "2026-12-31");
  });

  it("saves one review for the month, recording the reviewer and a snapshot of the counts at that moment", async () => {
    const open = await newIncident({ dateReceived: "2026-11-05" });
    const closed = await newIncident({ dateReceived: "2026-11-18" });
    await call(SAVE_I(req("PATCH", { expectedUpdatedAt: stamp("qualityIncident", closed.id), category: "order_error", responseDate: "2026-11-19", capaRequired: false, noCapaReason: "One-off." }), ctx(closed.id)));
    await call(ACT_I(req("POST", { action: "close", closedDate: "2026-11-19" }), ctx(closed.id)));
    const voided = await newIncident({ dateReceived: "2026-11-10" });
    await call(ACT_I(req("POST", { action: "void", reason: "Duplicate." }), ctx(voided.id)));
    await newIncident({ dateReceived: "2026-10-30" }); // open, but received in October
    await saveC((await newCapa()).id, { ownerId: "chris", dueDate: "2026-11-10" }); // overdue
    await saveC((await newCapa({ problem: "Second" })).id, { ownerId: "chris", dueDate: "2026-12-15" });
    expect(open.reference).toBe("CI-2026-001");

    const [, before] = await call(LIST_R());
    expect(before).toMatchObject({ reviews: [], today: "2026-11-21", currentPeriod: "2026-11", currentCounts: { openIncidents: 2, openCapas: 2, overdueCapas: 1, incidentsReceived: 2 } });

    const [status, body] = await call(NEW_R(req("POST", REVIEW)));
    expect(status).toBe(201);
    expect(body.counts).toEqual({ openIncidents: 2, openCapas: 2, overdueCapas: 1, incidentsReceived: 2 });
    const saved = row("qualityReview", body.id);
    expect(saved).toMatchObject({ period: "2026-11", reviewedById: "carlos", reviewedByName: "Carlos Gomory", whatWasReviewed: REVIEW.whatWasReviewed, notes: REVIEW.notes, counts: body.counts });
    expect(day(saved.reviewDate)).toBe("2026-11-21");
    expect(eventsOf(body.id)).toHaveLength(1);
    expect(eventsOf(body.id)[0]).toMatchObject({ recordType: "review", reference: "REVIEW-2026-11", action: "created", userName: "Carlos Gomory" });

    // the snapshot stays as it was, whatever happens afterwards
    await newIncident({ dateReceived: "2026-11-21" });
    expect(row("qualityReview", body.id).counts).toEqual({ openIncidents: 2, openCapas: 2, overdueCapas: 1, incidentsReceived: 2 });
    expect((await call(LIST_R()))[1].reviews).toHaveLength(1);
  });

  it("one per month: a second review for the same month is refused with a clear message", async () => {
    const [, first] = await call(NEW_R(req("POST", REVIEW)));
    const [status, body] = await call(NEW_R(req("POST", { ...REVIEW, notes: "Again" })));
    expect([status, body.error, body.code, body.review]).toEqual([409, "November 2026 already has a review. Open it to make changes.", "already_reviewed", { id: first.id }]);
    expect(table("qualityReview")).toHaveLength(1);
    expect((await call(NEW_R(req("POST", { ...REVIEW, period: "2026-10" }))))[0]).toBe(201); // another month is fine
  });

  it("needs the month, the date and what was reviewed; a month that has not started cannot be reviewed", async () => {
    expect((await call(NEW_R(req("POST", {}))))[1].problems).toEqual([
      { field: "period", message: "Month: choose the month being reviewed." }, { field: "reviewDate", message: "Review date: enter the date." },
      { field: "whatWasReviewed", message: "What was reviewed: describe it briefly." },
    ]);
    expect((await call(NEW_R(req("POST", { ...REVIEW, period: "2026-13" }))))[1].problems[0].field).toBe("period");
    expect((await call(NEW_R(req("POST", { ...REVIEW, period: "2026-12" }))))[1].problems).toEqual([{ field: "period", message: "Month: a month that has not started cannot be reviewed yet." }]);
    expect(table("qualityReview")).toHaveLength(0);
    expect(row("ruleInstance", "rt-nov").status).toBe("UPCOMING");
  });

  it("the month is the Pacific month: at 11:30 PM on November 30, December has not started", async () => {
    at("2026-12-01T07:30:00Z");
    expect((await call(LIST_R()))[1].currentPeriod).toBe("2026-11");
    expect((await call(NEW_R(req("POST", { ...REVIEW, period: "2026-12", reviewDate: "2026-11-30" }))))[0]).toBe(422);
    at("2026-12-01T08:30:00Z");
    expect((await call(LIST_R()))[1].currentPeriod).toBe("2026-12");
    expect((await call(NEW_R(req("POST", { ...REVIEW, period: "2026-12", reviewDate: "2026-12-01" }))))[0]).toBe(201);
  });

  it("saving the review completes that month's task — and only that one — on time", async () => {
    const [, body] = await call(NEW_R(req("POST", REVIEW)));
    expect(body.completedInstanceId).toBe("rt-nov");
    expect(row("ruleInstance", "rt-nov")).toMatchObject({ status: "DONE", completedLate: false, doneById: "carlos", completedBySubmissionId: body.id });
    expect(row("ruleInstance", "rt-oct").status).toBe("OVERDUE");
    expect(row("ruleInstance", "rt-dec").status).toBe("UPCOMING");
    expect(row("qualityReview", body.id).linkedInstanceId).toBe("rt-nov");
    expect(audits("rt-nov").at(-1)).toMatchObject({ action: "completed" });
  });

  it("saved after the month ended, it completes that month's task as late", async () => {
    at("2026-11-21T18:00:00Z");
    const [, body] = await call(NEW_R(req("POST", { ...REVIEW, period: "2026-10", reviewDate: "2026-11-21", taskId: "rt-oct" })));
    expect(body.completedInstanceId).toBe("rt-oct");
    expect(row("ruleInstance", "rt-oct")).toMatchObject({ status: "DONE", completedLate: true, daysLate: 21 }); // due 10/31, done 11/21
    expect(row("ruleInstance", "rt-nov").status).toBe("UPCOMING");
    // also without the task id: the month decides the task
    const [, nov] = await call(NEW_R(req("POST", REVIEW)));
    expect(nov.completedInstanceId).toBe("rt-nov");
  });

  it("a review can be saved when the month has no task, and editing does not complete anything", async () => {
    table("ruleInstance").length = 0;
    const [status, body] = await call(NEW_R(req("POST", REVIEW)));
    expect([status, body.completedInstanceId]).toEqual([201, null]);
  });

  it("an existing review can be edited, with a history entry per change; the month, the reviewer and the counts stay", async () => {
    const [, made] = await call(NEW_R(req("POST", REVIEW)));
    const counts = structuredClone(row("qualityReview", made.id).counts);
    await newIncident(); // the live counts move on
    at("2026-11-22T18:00:00Z"); // the next day
    as("ADMIN", "chris", "Chris Pence");
    const [status, body] = await call(SAVE_R(req("PATCH", { expectedUpdatedAt: stamp("qualityReview", made.id), notes: "Owner replied; new due date agreed.", reviewDate: "2026-11-22", period: "2026-01", reviewedByName: "Someone" }), ctx(made.id)));
    expect([status, body.changed]).toEqual([200, 2]);
    expect(row("qualityReview", made.id)).toMatchObject({ period: "2026-11", reviewedByName: "Carlos Gomory", notes: "Owner replied; new due date agreed.", counts });
    const [, page] = await call(GET_R(req("GET"), ctx(made.id)));
    expect(page.events.map((e: Json) => [e.action, e.userName])).toEqual([["updated", "Chris Pence"], ["created", "Carlos Gomory"]]);
    expect(page.events[0].changes).toEqual([{ field: "reviewDate", from: "2026-11-21", to: "2026-11-22" }, { field: "notes", from: REVIEW.notes, to: "Owner replied; new due date agreed." }]);
    // same values: nothing written; stale copy: refused; emptied required field: refused
    expect((await call(SAVE_R(req("PATCH", { expectedUpdatedAt: stamp("qualityReview", made.id), notes: "Owner replied; new due date agreed." }), ctx(made.id))))[1].changed).toBe(0);
    expect((await call(SAVE_R(req("PATCH", { expectedUpdatedAt: "2026-01-01T00:00:00.000Z", notes: "x" }), ctx(made.id))))[1].code).toBe("conflict");
    expect((await call(SAVE_R(req("PATCH", { expectedUpdatedAt: stamp("qualityReview", made.id), whatWasReviewed: " " }), ctx(made.id))))[0]).toBe(422);
    expect(eventsOf(made.id)).toHaveLength(2);
    expect((await call(SAVE_R(req("PATCH", { expectedUpdatedAt: "x", notes: "x" }), ctx("nope"))))[0]).toBe(404);
  });

  it("if the history row cannot be written, the review is not saved and its task is not completed", async () => {
    db.failOn = (model, op) => model === "qualityEvent" && op === "create";
    expect((await call(NEW_R(req("POST", REVIEW))))[0]).toBe(500);
    db.failOn = null;
    expect(table("qualityReview")).toHaveLength(0);
    expect(row("ruleInstance", "rt-nov").status).toBe("UPCOMING");
  });

  it("Start from the task opens the Reviews tab on that task's month", async () => {
    expect(TASK_FORM_REGISTRY.quality_review).toMatchObject({ label: "Review customer incidents and CAPAs" });
    expect(TASK_FORM_REGISTRY.quality_review.href("any")).toBe("/dashboard/admin/quality/review-task");
    expect(await periodOfReviewTask("rt-oct")).toBe("2026-10");
    expect(await periodOfReviewTask("rt-nov")).toBe("2026-11");
    expect(await periodOfReviewTask("nope")).toBeNull();
    await saveC((await newCapa()).id, { ownerId: "chris", dueDate: "2026-12-15" });
    expect(await periodOfReviewTask(tasks().find((t) => t.calendarKey?.startsWith("capa:"))!.id)).toBeNull(); // a CAPA task is not a review task
  });

  it("every review and attachment route answers 401 without a session and 403 for a supervisor", async () => {
    const routes: [string, () => Promise<Response>][] = [
      ["GET reviews", () => LIST_R()], ["POST reviews", () => NEW_R(req("POST", REVIEW))], ["GET review", () => GET_R(req("GET"), ctx("x"))], ["PATCH review", () => SAVE_R(req("PATCH", {}), ctx("x"))],
      ["POST upload-token", () => TOKEN(req("POST", {}))], ["POST attachments", () => ATTACH(req("POST", {}))], ["GET attachment", () => FILE(req("GET"), ctx("x"))], ["DELETE attachment", () => REMOVE(req("DELETE", { reason: "x" }), ctx("x"))],
    ];
    for (const [name, run] of routes) {
      as(null); expect((await run()).status, name).toBe(401);
      as("SUPERVISOR", "hugo", "Hugo Ayala"); expect((await run()).status, name).toBe(403);
    }
    expect(table("qualityReview")).toHaveLength(0);
    expect(table("qualityAttachment")).toHaveLength(0);
  });
});
