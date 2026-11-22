import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect, useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/quality-reviews", () => ({ capaOfTask: vi.fn(), periodOfReviewTask: vi.fn() }));

import { getServerSession } from "next-auth";
import { capaOfTask, periodOfReviewTask } from "@/lib/quality-reviews";
import { AttachmentsSection, attachmentHref, type AttachmentsSectionProps } from "@/components/quality/QualityAttachments";
import { ReviewsTab, recentPeriods, type ReviewsTabProps } from "@/components/quality/QualityReviews";
import { CapaRecord, IncidentRecord } from "@/components/quality/QualityRecords";
import CapaTaskPage from "@/app/(dashboard)/dashboard/admin/quality/capa-task/page";
import ReviewTaskPage from "@/app/(dashboard)/dashboard/admin/quality/review-task/page";
import { TaskRulesClient } from "@/app/(dashboard)/dashboard/admin/task-rules/TaskRulesClient";
import type { AttachmentRow, ReviewRow } from "@/lib/quality";

type MockFn = ReturnType<typeof vi.fn>;
const count = (html: string, needle: string) => html.split(needle).length - 1;
const noop = () => {};
const item = (html: string, id: string) => { const a = html.indexOf(`data-attachment="${id}"`); const b = html.indexOf("</li>", a); return html.slice(a, b); };

const file = (id: string, over: Partial<AttachmentRow> = {}): AttachmentRow => ({
  id, kind: "evidence", fileName: `${id}.jpg`, fileSize: 2_000_000, mimeType: "image/jpeg", description: "", uploadedAt: "2026-11-21T18:00:00Z", uploadedByName: "Carlos Gomory",
  removedAt: null, removedByName: "", removeReason: null, ...over,
});
const FILES = [
  file("jpg", { description: "Photo sent by the customer" }), file("png", { fileName: "label.png", mimeType: "image/png" }), file("webp", { fileName: "shelf.webp", mimeType: "image/webp" }),
  file("heic", { fileName: "IMG_0412.heic", mimeType: "image/heic" }), file("pdf", { fileName: "lab-report.pdf", mimeType: "application/pdf", fileSize: 350_000 }),
  file("gone", { fileName: "blurry.jpg", removedAt: "2026-11-22T18:00:00Z", removedByName: "Chris Pence", removeReason: "Blurry photo." }),
  file("reply", { kind: "customer_response", fileName: "reply-to-customer.pdf", mimeType: "application/pdf" }),
];
const attachments = (over: Partial<AttachmentsSectionProps> = {}) =>
  renderToStaticMarkup(<AttachmentsSection attachments={FILES} kind="evidence" title="Attachments" addLabel="Add a file" recordActiveCount={6} readOnly={false} onUpload={noop} onRemove={noop} {...over} />);

describe("attachments section (real component)", () => {
  const html = attachments();
  it("shows the count of active files of its kind, and hides removed ones behind a 'Show removed' toggle", () => {
    expect(html).toContain("Attachments (5)");
    expect(count(html, "data-attachment=")).toBe(5);
    expect(html).not.toContain("blurry.jpg");
    expect(html).not.toContain("reply-to-customer.pdf"); // the other kind has its own section
    expect(html).toMatch(/<input type="checkbox"\/> Show removed \(1\)/);
    const withRemoved = attachments({ initialShowRemoved: true });
    expect(count(withRemoved, "data-attachment=")).toBe(6);
    expect(withRemoved).toMatch(/<input type="checkbox" checked=""\/> Show removed \(1\)/);
    const gone = item(withRemoved, "gone");
    expect(gone).toContain('data-removed="true"');
    expect(gone).toContain("by Chris Pence. Reason: Blurry photo.");
    expect(gone).toContain("Download"); // still downloadable
    expect(gone).not.toContain('data-action="gone"'); // but cannot be removed twice
    expect(withRemoved).toContain("Attachments (5)"); // the count is of active files
  });
  it("JPEG, PNG and WebP show a thumbnail; HEIC and PDF show a file icon; every file has a download link", () => {
    for (const id of ["jpg", "png", "webp"]) {
      expect(item(html, id), id).toContain(`<img src="/api/quality/attachments/${id}"`);
      expect(item(html, id), id).not.toContain("data-file-icon");
    }
    for (const id of ["heic", "pdf"]) {
      expect(item(html, id), id).toContain("data-file-icon");
      expect(item(html, id), id).not.toContain("<img");
    }
    for (const id of ["jpg", "png", "webp", "heic", "pdf"]) expect(item(html, id), id).toContain(`href="/api/quality/attachments/${id}?download=1"`);
    expect(item(html, "jpg")).toContain("Photo sent by the customer");
    expect(item(html, "jpg")).toContain("JPEG · 1.9 MB · added");
    expect(item(html, "jpg")).toContain("by Carlos Gomory");
    expect(item(html, "pdf")).toContain("PDF · 342 KB");
    expect(item(html, "heic")).toContain("HEIC ·");
  });
  it("every address on the page is the app's own checked route — never a storage address", () => {
    expect(attachmentHref("abc")).toBe("/api/quality/attachments/abc");
    const all = attachments({ initialShowRemoved: true });
    const addresses = Array.from(all.matchAll(/(?:href|src)="([^"]+)"/g)).map((m) => m[1]);
    expect(addresses.length).toBe(16); // open + download for six files, and a thumbnail for the four pictures
    expect(addresses.every((a) => /^\/api\/quality\/attachments\/\w+(\?download=1)?$/.test(a))).toBe(true);
    expect(all).not.toContain("blob.vercel-storage.com");
    expect(all).not.toContain("https://");
  });
  it("adding: an optional description, the file types accepted, and the limits in words; removing asks for a reason", () => {
    expect(html).toContain('data-add-attachment="evidence"');
    expect(html).toContain("Description (optional)");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"');
    expect(html).toContain(">Add a file</button>");
    expect(html).toContain("JPEG, PNG, WebP, HEIC or PDF, up to 15 MB each. At most 10 per record.");
    expect(count(html, ">Remove</button>")).toBe(5);
  });
  it("ten files: the add control gives way to a message; the files can still be removed", () => {
    const full = attachments({ recordActiveCount: 10 });
    expect(full).toContain("This record has 10 attachments, the most allowed. Remove one to add another.");
    expect(full).not.toContain("data-add-attachment");
    expect(full).not.toContain('type="file"');
    expect(count(full, ">Remove</button>")).toBe(5);
  });
  it("closed or void record: files stay viewable and downloadable; nothing can be added or removed", () => {
    const ro = attachments({ readOnly: true });
    expect(count(ro, "data-attachment=")).toBe(5);
    expect(count(ro, "?download=1")).toBe(5);
    expect(ro).not.toContain(">Remove</button>");
    expect(ro).not.toContain("data-add-attachment");
    expect(ro).not.toContain('type="file"');
    expect(ro).toContain("This record is read-only: its files stay viewable, but none can be added or removed. Reopen it first.");
  });
  it("no files yet", () => {
    const empty = attachments({ attachments: [], recordActiveCount: 0 });
    expect(empty).toContain("Attachments (0)");
    expect(empty).toContain("No files attached.");
    expect(empty).not.toContain("Show removed");
  });
});

const INCIDENT = {
  id: "i1", reference: "CI-2026-001", facility: null, dateReceived: "2026-11-20", channel: "email", customer: "Whole Foods #12", productId: "prod-1", productName: "Keto Bread", lotCode: "L1120",
  bestByDate: "2026-12-20", description: "Customer found a piece of plastic in a loaf.", category: "foreign_matter", foodSafetyConcern: true, immediateAction: "", responseDate: null, responseChannel: null,
  responseSummary: "", capaRequired: null, noCapaReason: "", status: "under_review", closedDate: null, closedById: null, voidedAt: null, voidedById: null, voidReason: null, updatedAt: "2026-11-22T07:30:00Z",
};
const CAPA = {
  id: "c1", reference: "CAPA-2026-001", facility: "624", source: "customer_incident", problem: "Plastic in a loaf.", rootCause: "", correctiveAction: "", preventiveAction: "",
  ownerId: "chris", dueDate: "2026-12-15", effectivenessDate: null, effectivenessResult: "", status: "in_progress", closedDate: null, closedById: null, closedByName: null, voidedAt: null, voidedById: null,
  voidReason: null, updatedAt: "2026-11-21T19:00:00Z",
};
const OPTIONS = { products: [{ id: "prod-1", name: "Keto Bread" }], admins: [{ id: "carlos", name: "Carlos Gomory" }, { id: "chris", name: "Chris Pence" }], today: "2026-11-21" };
const incident = (record: Record<string, string | boolean | null> = {}, files = FILES) =>
  renderToStaticMarkup(<IncidentRecord record={{ ...INCIDENT, ...record }} capa={null} events={[]} options={OPTIONS} attachments={files} onSave={noop} onAction={noop} onOpenCapa={noop} onUnlink={noop} onGoToCapa={noop} />);
const capa = (record: Record<string, string | boolean | null> = {}, task: Parameters<typeof CapaRecord>[0]["task"] = null) =>
  renderToStaticMarkup(<CapaRecord record={{ ...CAPA, ...record }} incidents={[]} linkable={[]} events={[]} options={OPTIONS} attachments={FILES.filter((f) => f.kind === "evidence")} task={task} onSave={noop} onAction={noop} onLink={noop} onUnlink={noop} onGoToIncident={noop} />);
const part = (html: string, marker: string, end = "</section>") => { const a = html.indexOf(marker); return html.slice(a, html.indexOf(end, a)); };

describe("attachments on the record pages (real components)", () => {
  it("incident: 'Attach the message sent' sits in the response section; evidence has its own section with its count", () => {
    const html = incident();
    const response = part(html, "Response to the customer");
    expect(response).toContain('data-attachments="customer_response"');
    expect(response).toContain("Message sent to the customer (1)");
    expect(response).toContain(">Attach the message sent</button>");
    expect(response).toContain("reply-to-customer.pdf");
    expect(response).not.toContain("lab-report.pdf");
    const evidence = part(html, 'data-section="attachments"');
    expect(evidence).toContain("Attachments (5)");
    expect(evidence).toContain(">Add a file</button>");
    expect(evidence).not.toContain("reply-to-customer.pdf");
    expect(html).not.toContain("blob.vercel-storage.com");
  });
  it("incident: the limit of ten is for the whole record (both kinds together)", () => {
    const ten = [...Array.from({ length: 9 }, (_, n) => file(`e${n}`)), file("reply", { kind: "customer_response", fileName: "reply.pdf", mimeType: "application/pdf" })];
    const html = incident({}, ten);
    expect(count(html, "This record has 10 attachments, the most allowed.")).toBe(2); // in both sections
    expect(html).not.toContain("data-add-attachment");
  });
  it("closed and void incidents keep their files in view, read-only", () => {
    for (const status of ["closed", "void"]) {
      const html = incident({ status, closedDate: "2026-11-21", voidReason: "Entered twice.", voidedAt: "2026-11-21T19:00:00Z" });
      expect(count(html, "data-attachment="), status).toBe(6);
      expect(html, status).not.toContain("data-add-attachment");
      expect(html, status).not.toContain(">Remove</button>");
      expect(count(html, "This record is read-only: its files stay viewable"), status).toBe(2);
    }
  });
  it("CAPA: an evidence section with its count; no 'message sent' section", () => {
    const html = capa();
    expect(part(html, 'data-section="attachments"')).toContain("Attachments (5)");
    expect(html).toContain(">Add a file</button>");
    expect(html).not.toContain("Attach the message sent");
    expect(html).not.toContain('data-attachments="customer_response"');
    const closed = capa({ status: "closed", closedDate: "2026-12-20", closedByName: "Carlos Gomory" });
    expect(count(closed, "data-attachment=")).toBe(5);
    expect(closed).not.toContain("data-add-attachment");
  });
});

describe("the follow-up task line on the CAPA page (real component)", () => {
  it("says when there is no task yet, and shows the task's due date and state when there is one", () => {
    const none = capa({ ownerId: null, dueDate: null });
    expect(none).toContain('data-capa-task="none"');
    expect(none).toContain("A follow-up task is created for the owner once both the owner and the due date are saved.");
    const open = capa({}, { id: "t1", status: "UPCOMING", dueDate: "2026-12-15" });
    expect(open).toContain('data-capa-task="UPCOMING"');
    expect(open).toContain("Follow-up task for the owner: due 12/15/2026 · <b>Upcoming</b>. It is completed when this CAPA reaches Verifying effectiveness or Closed.");
    expect(capa({}, { id: "t1", status: "OVERDUE", dueDate: "2026-11-10" })).toContain("<b>Overdue</b>");
    expect(capa({}, { id: "t1", status: "IN_PROGRESS", dueDate: "2026-12-15" })).toContain("<b>In progress</b>");
    const late = capa({ status: "verifying" }, { id: "t1", status: "DONE", dueDate: "2026-11-25", completedLate: true, daysLate: 3 });
    expect(late).toContain("<b>Done</b> (3 day(s) late)");
  });
});

const review = (period: string, over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: `r-${period}`, period, reviewDate: `${period}-28`, reviewedByName: "Carlos Gomory", whatWasReviewed: `All incidents and CAPAs of ${period}.`, notes: "Nothing unusual.",
  counts: { openIncidents: 3, openCapas: 2, overdueCapas: 1, incidentsReceived: 4 }, updatedAt: "2026-10-29T18:00:00Z", ...over,
});
const REVIEWS = [review("2026-10"), review("2026-09", { reviewedByName: "Chris Pence", counts: { openIncidents: 1, openCapas: 1, overdueCapas: 0, incidentsReceived: 2 } }), review("2025-12")];
const NOW = { openIncidents: 5, openCapas: 4, overdueCapas: 2, incidentsReceived: 6 };
const reviews = (over: Partial<ReviewsTabProps> = {}) =>
  renderToStaticMarkup(<ReviewsTab reviews={REVIEWS} today="2026-11-21" currentPeriod="2026-11" currentCounts={NOW} reviewerName="Carlos Gomory" onCreate={noop} onUpdate={noop} {...over} />);
const counts = (html: string) => Array.from(html.matchAll(/data-count="(\w+)">(\d+)</g)).map((m) => [m[1], Number(m[2])]);

describe("Reviews tab (real component)", () => {
  it("a month without a review: a blank form for the current month, today's date, the signed-in admin as reviewer, and the counts as of now", () => {
    const html = reviews();
    expect(html).toContain('data-review-form="new"');
    expect(html).toContain('<option value="2026-11" selected="">November 2026</option>');
    expect(html).toContain("Reviewer: <b>Carlos Gomory</b> (recorded when you save). Saving completes the review task for November 2026.");
    expect(html).toContain("Counts right now (recorded when you save)");
    expect(counts(html)).toEqual([["openIncidents", 5], ["openCapas", 4], ["overdueCapas", 2], ["incidentsReceived", 6]]);
    for (const label of ["Open incidents", "Open CAPAs", "Overdue CAPAs", "Incidents received that month", "Review date", "What was reviewed", "Notes"]) expect(html, label).toContain(label);
    expect(html).toContain("Save the review for November 2026</button>");
    expect(html).toMatch(/<button type="button" disabled="" class="btn-primary[^"]*">Save the review/); // nothing to save until "what was reviewed" is filled
    expect(html).not.toContain("data-history");
  });
  it("the month list: the last twelve months, newest first, with reviewed months marked", () => {
    expect(recentPeriods("2026-11")).toEqual(["2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01", "2025-12"]);
    expect(recentPeriods("2027-01").slice(0, 3)).toEqual(["2027-01", "2026-12", "2026-11"]);
    const html = reviews();
    expect(html).toContain('<option value="2026-10">October 2026 (reviewed)</option>');
    expect(html).toContain('<option value="2025-12">December 2025 (reviewed)</option>');
    expect(html).toContain('<option value="2026-08">August 2026</option>');
    expect(html).not.toContain('value="2026-12"'); // a month that has not started is not offered
  });
  it("a month that has a review opens it for editing: its saved text, its own counts snapshot, its reviewer and its history", () => {
    const html = reviews({ initialPeriod: "2026-10", events: [{ id: "e1", action: "created", userName: "Carlos Gomory", createdAt: "2026-10-29T18:00:00Z", changes: [], note: null }] });
    expect(html).toContain('data-review-form="edit"');
    expect(html).toContain('<option value="2026-10" selected="">October 2026 (reviewed)</option>');
    expect(html).toContain("Reviewed by <b>Carlos Gomory</b>. Last saved");
    expect(html).toContain("Counts recorded when this review was saved");
    expect(counts(html)).toEqual([["openIncidents", 3], ["openCapas", 2], ["overdueCapas", 1], ["incidentsReceived", 4]]); // not the live counts
    expect(html).toContain(">All incidents and CAPAs of 2026-10.</textarea>");
    expect(html).toContain(">Nothing unusual.</textarea>");
    expect(html).toContain(">Save changes</button>");
    expect(html).not.toContain("Save the review for");
    expect(html).toContain("Carlos Gomory"); // history entry
  });
  it("opened from the task's Start button on an older month, that month is selected even when outside the last twelve", () => {
    const html = reviews({ initialPeriod: "2025-09" });
    expect(html).toContain('<option value="2025-09" selected="">September 2025</option>');
    expect(html).toContain("Save the review for September 2025</button>");
  });
  it("past reviews: one row per month with reviewer and counts, newest first, and a year filter", () => {
    const html = reviews();
    expect(Array.from(html.matchAll(/data-row="([\d-]+)"/g)).map((m) => m[1])).toEqual(["2026-10", "2026-09", "2025-12"]);
    for (const head of ["Month", "Review date", "Reviewer", "What was reviewed", "Open incidents", "Open CAPAs", "Overdue CAPAs", "Received"]) expect(html, head).toContain(`${head}</th>`);
    const row = part(html, 'data-row="2026-09"', "</tr>");
    for (const text of ["September 2026", "09/28/2026", "Chris Pence", "All incidents and CAPAs of 2026-09."]) expect(row, text).toContain(text);
    expect(html).toContain('<option value="" selected="">All</option><option value="2026">2026</option><option value="2025">2025</option>');
    expect(html).toContain(">3 of 3</span>");
    const y2025 = reviews({ initialYear: "2025" });
    expect(Array.from(y2025.matchAll(/data-row="([\d-]+)"/g)).map((m) => m[1])).toEqual(["2025-12"]);
    expect(y2025).toContain(">1 of 3</span>");
    expect(reviews({ reviews: [] })).toContain("No reviews yet.");
  });
  it("a refusal from the server (for example a second review for the month) is shown above the form", () => {
    const html = reviews({ error: "November 2026 already has a review. Open it to make changes.", problems: [{ field: "whatWasReviewed", message: "What was reviewed: describe it briefly." }] });
    expect(html).toContain("November 2026 already has a review. Open it to make changes.");
    expect(html).toContain("What was reviewed: describe it briefly.");
  });
});

describe("'Start' on a task lands on the right page (real pages)", () => {
  const session = getServerSession as unknown as MockFn;
  const admin = () => session.mockResolvedValue({ user: { id: "carlos", role: "ADMIN", name: "Carlos Gomory" } });
  const landing = async (run: () => Promise<JSX.Element>) => { try { return renderToStaticMarkup(await run()); } catch (e) { return (e as Error).message; } };
  beforeEach(() => { vi.clearAllMocks(); admin(); });

  it("CAPA follow-up task: opens the CAPA that holds the task id", async () => {
    (capaOfTask as MockFn).mockResolvedValue({ id: "capa-7", reference: "CAPA-2026-007" });
    expect(await landing(() => CapaTaskPage({ searchParams: { taskId: "task-1" } }))).toBe("REDIRECT /dashboard/admin/quality/capas/capa-7");
    expect(capaOfTask).toHaveBeenCalledWith("task-1");
  });
  it("CAPA follow-up task: a clear message when no CAPA holds that task, or no task id came with the link", async () => {
    (capaOfTask as MockFn).mockResolvedValue(null);
    for (const searchParams of [{ taskId: "gone" }, {}, undefined]) {
      const html = await landing(() => CapaTaskPage({ searchParams }));
      expect(html).toContain("No CAPA was found for this task");
      expect(html).toContain("The task is not linked to a CAPA any more.");
      expect(html).toContain('href="/dashboard/admin/quality?tab=capas"');
    }
    expect(nav.redirect).not.toHaveBeenCalled();
  });
  it("monthly review task: opens the Reviews tab on that task's month, carrying the task id", async () => {
    (periodOfReviewTask as MockFn).mockResolvedValue("2026-10");
    expect(await landing(() => ReviewTaskPage({ searchParams: { taskId: "rt-oct" } }))).toBe("REDIRECT /dashboard/admin/quality?tab=reviews&period=2026-10&taskId=rt-oct");
    (periodOfReviewTask as MockFn).mockResolvedValue(null);
    const html = await landing(() => ReviewTaskPage({ searchParams: { taskId: "something-else" } }));
    expect(html).toContain("This task is not a monthly review task");
    expect(html).toContain('href="/dashboard/admin/quality?tab=reviews"');
  });
  it("both pages are for admins only: a supervisor, or nobody, is sent to the dashboard before anything is looked up", async () => {
    for (const who of [{ user: { id: "hugo", role: "SUPERVISOR", name: "Hugo Ayala" } }, null]) {
      session.mockResolvedValue(who);
      expect(await landing(() => CapaTaskPage({ searchParams: { taskId: "task-1" } }))).toBe("REDIRECT /dashboard");
      expect(await landing(() => ReviewTaskPage({ searchParams: { taskId: "rt-oct" } }))).toBe("REDIRECT /dashboard");
    }
    expect(capaOfTask).not.toHaveBeenCalled();
    expect(periodOfReviewTask).not.toHaveBeenCalled();
  });
});

describe("Task Rules page (real component)", () => {
  const rule = (id: string, title: string, formKey: string, over: Record<string, unknown> = {}) => ({
    id, title, description: null, facilityId: "fac-jb", facilityName: "Julian Bakery", ownerId: "carlos", ownerName: "Carlos Gomory", triggerType: "RECURRING", recurrenceUnit: "month", recurrenceEvery: 1,
    recurrenceStart: "2026-11-01", recurrenceEndOfMonth: true, formKey, productName: null, isActive: true, windowMode: "NONE", windowDaysBefore: null, isArchived: false, archivedAt: null,
    instanceCount: 2, openInstanceCount: 2, completedInstanceCount: 0, auditCount: 2, createdAt: "2026-11-21T18:00:00Z", ...over,
  });
  const html = renderToStaticMarkup(
    <TaskRulesClient
      rules={[rule("r-capa", "CAPA follow-up", "quality_capa", { triggerType: "ONE_OFF", recurrenceUnit: null, recurrenceStart: "2026-01-01", recurrenceEndOfMonth: false }), rule("r-review", "Review customer incidents and CAPAs", "quality_review", { windowMode: "DAYS_BEFORE", windowDaysBefore: 4 })]}
      facilities={[{ id: "fac-jb", name: "Julian Bakery" }]} users={[{ id: "carlos", name: "Carlos Gomory" }]} syncStatuses={[]}
    />,
  );
  const rowOf = (title: string) => { const a = html.indexOf(`>${title}<`); const start = html.lastIndexOf("<tr", a); return html.slice(start, html.indexOf("</tr>", a)); };

  it("the CAPA follow-up rule is listed as system-managed, with no Edit, Deactivate or Delete", () => {
    const row = rowOf("CAPA follow-up");
    expect(row).toContain("System-managed");
    for (const label of [">Edit<", "Deactivate", "Archive", "Delete"]) expect(row, label).not.toContain(label);
    expect(row).not.toContain("<button");
  });
  it("the monthly review rule is an ordinary rule: it keeps its buttons", () => {
    const row = rowOf("Review customer incidents and CAPAs");
    expect(row).not.toContain("System-managed");
    expect(row).toMatch(/<button[^>]*>\s*Edit\s*<\/button>/);
  });
});
