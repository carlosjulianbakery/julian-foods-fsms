import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_MAX_BYTES, attachmentFolder, attachmentProblem, attachmentUrlBelongs, capaTaskKey, capaTaskLabel, filterReviews, formatBytes, hasThumbnail, isPeriod,
  periodBounds, periodLabel, periodOfDay, planCapaTask, reviewCounts, reviewProblems, reviewReference, reviewYears, taskUntouched, type CapaForTask, type TaskForCapa,
} from "@/lib/quality";

describe("attachment rules", () => {
  const ok = { recordType: "incident", kind: "evidence", fileName: "photo.jpg", fileSize: 1000, mimeType: "image/jpeg" };
  it("JPEG, PNG, WebP, HEIC and PDF are accepted; anything else is refused in plain words", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]) expect(attachmentProblem({ ...ok, mimeType }, 0), mimeType).toBeNull();
    for (const mimeType of ["image/gif", "image/svg+xml", "video/mp4", "text/plain", "application/msword", "", null, undefined, 5]) expect(attachmentProblem({ ...ok, mimeType }, 0), String(mimeType)).toBe("That file type is not allowed. Use JPEG, PNG, WebP, HEIC or PDF.");
  });
  it("15 MB each: exactly 15 MB passes, one byte more does not; an empty file is refused", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(15_728_640);
    expect(attachmentProblem({ ...ok, fileSize: ATTACHMENT_MAX_BYTES }, 0)).toBeNull();
    expect(attachmentProblem({ ...ok, fileSize: ATTACHMENT_MAX_BYTES + 1 }, 0)).toBe("The file is too large (15 MB at most).");
    for (const fileSize of [0, -1, 1.5, "1000", null, undefined]) expect(attachmentProblem({ ...ok, fileSize }, 0), String(fileSize)).toBe("The file is empty.");
  });
  it("ten active attachments per record at most", () => {
    expect(attachmentProblem(ok, 9)).toBeNull();
    expect(attachmentProblem(ok, 10)).toBe("This record already has 10 attachments, the most allowed. Remove one first.");
  });
  it("kind: evidence on both records; the message sent only on an incident", () => {
    expect(attachmentProblem({ ...ok, kind: "customer_response" }, 0)).toBeNull();
    expect(attachmentProblem({ ...ok, recordType: "capa" }, 0)).toBeNull();
    expect(attachmentProblem({ ...ok, recordType: "capa", kind: "customer_response" }, 0)).toBe("The message sent to the customer belongs to an incident.");
    expect(attachmentProblem({ ...ok, kind: "other" }, 0)).toBe("Choose what the file is: evidence, or the message sent to the customer.");
    expect(attachmentProblem({ ...ok, recordType: "review" }, 0)).toBe("Attachments belong to an incident or a CAPA.");
  });
  it("name and description limits", () => {
    expect(attachmentProblem({ ...ok, fileName: " " }, 0)).toBe("The file has no name.");
    expect(attachmentProblem({ ...ok, fileName: "x".repeat(201) }, 0)).toBe("The file name is too long (200 characters at most).");
    expect(attachmentProblem({ ...ok, description: "x".repeat(500) }, 0)).toBeNull();
    expect(attachmentProblem({ ...ok, description: "x".repeat(501) }, 0)).toBe("The description is too long (500 characters at most).");
  });
  it("a recorded file must sit in its own record's folder in the private store", () => {
    expect(attachmentFolder("incident", "abc")).toBe("quality/incident/abc/");
    const host = "https://x1.private.blob.vercel-storage.com";
    expect(attachmentUrlBelongs(`${host}/quality/incident/abc/photo-9f.jpg`, "incident", "abc")).toBe(true);
    expect(attachmentUrlBelongs(`${host}/quality/incident/abc%2F..%2Fabd/photo.jpg`, "incident", "abd")).toBe(false);
    for (const url of [`${host}/quality/incident/abd/photo.jpg`, `${host}/quality/capa/abc/photo.jpg`, `${host}/other/quality/incident/abc/p.jpg`, "https://blob.vercel-storage.com.evil.com/quality/incident/abc/p.jpg", `http://x1.private.blob.vercel-storage.com/quality/incident/abc/p.jpg`, "", null, 7])
      expect(attachmentUrlBelongs(url, "incident", "abc"), String(url)).toBe(false);
  });
  it("pictures get a thumbnail; HEIC and PDF do not; sizes read naturally", () => {
    expect(["image/jpeg", "image/png", "image/webp"].map(hasThumbnail)).toEqual([true, true, true]);
    expect(["image/heic", "image/heif", "application/pdf", null, undefined].map(hasThumbnail)).toEqual([false, false, false, false, false]);
    expect([formatBytes(300), formatBytes(2048), formatBytes(1_572_864), formatBytes(ATTACHMENT_MAX_BYTES), formatBytes(null)]).toEqual(["1 KB", "2 KB", "1.5 MB", "15.0 MB", ""]);
  });
});

describe("the one rule for the CAPA follow-up task (planCapaTask)", () => {
  const capa = (over: Partial<CapaForTask> = {}): CapaForTask => ({ id: "c1", reference: "CAPA-2026-001", problem: "Plastic in a loaf.", status: "open", ownerId: "chris", dueDate: "2026-12-15", ...over });
  const LABEL = "CAPA-2026-001: Plastic in a loaf.";
  const task = (over: Partial<TaskForCapa> = {}): TaskForCapa => ({ status: "UPCOMING", dueDate: "2026-12-15", ownerUserId: "chris", label: LABEL, ...over });

  it("label and key", () => {
    expect(capaTaskLabel("CAPA-2026-001", "  Plastic \n in a   loaf. ")).toBe(LABEL);
    const long = capaTaskLabel("CAPA-2026-001", "x".repeat(70));
    expect(long).toBe(`CAPA-2026-001: ${"x".repeat(70)}`); // 70 characters fit
    expect(capaTaskLabel("CAPA-2026-001", "x".repeat(71))).toBe(`CAPA-2026-001: ${"x".repeat(69)}…`);
    expect(capaTaskKey("c1")).toBe("capa:c1");
    expect(["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS", "DONE", "SKIPPED", "MISSED"].map(taskUntouched)).toEqual([true, true, true, false, false, false, false]);
  });
  it("no task: created only when both the owner and the due date are there, while Open or In progress", () => {
    expect(planCapaTask(capa(), null)).toEqual({ do: "create", dueDate: "2026-12-15", ownerUserId: "chris", label: LABEL });
    expect(planCapaTask(capa({ status: "in_progress" }), null).do).toBe("create");
    expect(planCapaTask(capa({ ownerId: null }), null)).toEqual({ do: "nothing" });
    expect(planCapaTask(capa({ dueDate: null }), null)).toEqual({ do: "nothing" });
    for (const status of ["verifying", "closed", "void"]) expect(planCapaTask(capa({ status }), null), status).toEqual({ do: "nothing" });
  });
  it("an open task follows the CAPA's owner, due date and wording; nothing to do when they agree", () => {
    expect(planCapaTask(capa(), task())).toEqual({ do: "nothing" });
    expect(planCapaTask(capa({ dueDate: "2026-12-20" }), task())).toMatchObject({ do: "update", dueDate: "2026-12-20", changed: ["due date"] });
    expect(planCapaTask(capa({ ownerId: "carlos" }), task())).toMatchObject({ do: "update", ownerUserId: "carlos", changed: ["owner"] });
    expect(planCapaTask(capa({ problem: "New wording", ownerId: "carlos", dueDate: "2027-01-05" }), task({ status: "IN_PROGRESS" }))).toMatchObject({ do: "update", changed: ["due date", "owner", "label"] });
  });
  it("owner or due date cleared: an untouched task is deleted, a started one is kept", () => {
    for (const status of ["UPCOMING", "DUE_TODAY", "OVERDUE"]) {
      expect(planCapaTask(capa({ ownerId: null }), task({ status })), status).toEqual({ do: "delete" });
      expect(planCapaTask(capa({ dueDate: null }), task({ status })), status).toEqual({ do: "delete" });
    }
    expect(planCapaTask(capa({ ownerId: null }), task({ status: "IN_PROGRESS" }))).toEqual({ do: "nothing" });
  });
  it("void: an untouched task is deleted; a started, done, skipped or missed one is kept", () => {
    for (const status of ["UPCOMING", "DUE_TODAY", "OVERDUE"]) expect(planCapaTask(capa({ status: "void" }), task({ status })), status).toEqual({ do: "delete" });
    for (const status of ["IN_PROGRESS", "DONE", "SKIPPED", "MISSED"]) expect(planCapaTask(capa({ status: "void" }), task({ status })), status).toEqual({ do: "nothing" });
  });
  it("Verifying effectiveness or Closed completes an open task, once", () => {
    for (const status of ["verifying", "closed"]) {
      for (const t of ["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"]) expect(planCapaTask(capa({ status }), task({ status: t })), `${status}/${t}`).toEqual({ do: "complete" });
      for (const t of ["DONE", "SKIPPED", "MISSED"]) expect(planCapaTask(capa({ status }), task({ status: t })), `${status}/${t}`).toEqual({ do: "nothing" });
      expect(planCapaTask(capa({ status, ownerId: null, dueDate: null }), task()), status).toEqual({ do: "complete" });
    }
  });
  it("a finished, skipped or missed task is never changed and never replaced — also after a reopen with a new date", () => {
    for (const t of ["DONE", "SKIPPED", "MISSED"]) {
      for (const status of ["open", "in_progress"]) expect(planCapaTask(capa({ status, dueDate: "2027-02-01", ownerId: "carlos" }), task({ status: t })), `${status}/${t}`).toEqual({ do: "nothing" });
      expect(planCapaTask(capa({ ownerId: null }), task({ status: t })), t).toEqual({ do: "nothing" });
    }
  });
});

describe("monthly review rules", () => {
  it("the month: format, bounds, label and reference", () => {
    expect(["2026-11", "2026-01", "2026-12"].every(isPeriod)).toBe(true);
    expect(["2026-13", "2026-00", "2026-1", "26-11", "2026-11-01", "", null, undefined, 202611].some(isPeriod)).toBe(false);
    expect(periodOfDay("2026-11-30")).toBe("2026-11");
    expect([periodBounds("2026-11"), periodBounds("2026-12"), periodBounds("2027-02"), periodBounds("2028-02")]).toEqual([
      { start: "2026-11-01", end: "2026-11-30" }, { start: "2026-12-01", end: "2026-12-31" }, { start: "2027-02-01", end: "2027-02-28" }, { start: "2028-02-01", end: "2028-02-29" },
    ]);
    expect([periodLabel("2026-11"), periodLabel("2027-01"), periodLabel("nonsense")]).toEqual(["November 2026", "January 2027", "nonsense"]);
    expect(reviewReference("2026-11")).toBe("REVIEW-2026-11");
  });
  it("counts: open incidents, open CAPAs, overdue CAPAs, incidents received in the month — void never counted", () => {
    const incidents = [
      { status: "open", dateReceived: "2026-11-01" }, { status: "under_review", dateReceived: "2026-11-30" }, { status: "closed", dateReceived: "2026-11-15" },
      { status: "void", dateReceived: "2026-11-10" }, { status: "open", dateReceived: "2026-10-31" }, { status: "responded", dateReceived: "2026-12-01" },
    ];
    const capas = [
      { status: "open", dueDate: "2026-11-20" }, { status: "in_progress", dueDate: "2026-11-21" }, { status: "verifying", dueDate: "2026-10-01" }, { status: "open", dueDate: null },
      { status: "closed", dueDate: "2026-11-01" }, { status: "void", dueDate: "2026-11-01" },
    ];
    expect(reviewCounts(incidents, capas, "2026-11", "2026-11-21")).toEqual({ openIncidents: 4, openCapas: 4, overdueCapas: 2, incidentsReceived: 3 });
    expect(reviewCounts(incidents, capas, "2026-10", "2026-11-22")).toEqual({ openIncidents: 4, openCapas: 4, overdueCapas: 3, incidentsReceived: 1 });
    expect(reviewCounts([], [], "2026-11", "2026-11-21")).toEqual({ openIncidents: 0, openCapas: 0, overdueCapas: 0, incidentsReceived: 0 });
  });
  it("a review needs its month, its date and what was reviewed; notes are optional", () => {
    expect(reviewProblems({ reviewDate: "2026-11-21", whatWasReviewed: "Everything", notes: "" }, "2026-11")).toEqual([]);
    expect(reviewProblems({ reviewDate: null, whatWasReviewed: "  " }, "2026-14").map((p) => p.field)).toEqual(["period", "reviewDate", "whatWasReviewed"]);
  });
  it("year filter for the list of past reviews", () => {
    const rows = [{ period: "2026-11" }, { period: "2026-10" }, { period: "2027-01" }];
    expect(reviewYears(rows)).toEqual(["2027", "2026"]);
    expect(filterReviews(rows, "2026")).toEqual([{ period: "2026-11" }, { period: "2026-10" }]);
    expect(filterReviews(rows, undefined)).toHaveLength(3);
    expect(filterReviews(rows, "2025")).toEqual([]);
  });
});
