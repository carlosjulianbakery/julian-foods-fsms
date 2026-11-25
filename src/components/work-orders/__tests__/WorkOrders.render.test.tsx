import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string; name: string; role: string; email: string } }, pathname: "/dashboard" }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: state.session, status: state.session ? "authenticated" : "unauthenticated" }), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { WorkOrdersList } from "@/components/work-orders/WorkOrdersList";
import { NewWorkOrderForm, type WorkOrderOptions } from "@/components/work-orders/NewWorkOrderForm";
import { WorkOrderRecord, type WorkOrderRecordProps } from "@/components/work-orders/WorkOrderRecord";
import { EquipmentEditor } from "@/components/work-orders/EquipmentEditor";
import { WorkOrdersHome } from "@/app/(dashboard)/dashboard/work-orders/WorkOrdersHome";
import type { WorkOrderRow } from "@/lib/work-orders";

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
beforeEach(() => { state.session = null; state.pathname = "/dashboard"; });

describe("navigation: one Work Orders entry for every role", () => {
  const LINK = 'href="/dashboard/work-orders"';
  const as = (role: string | null) => { state.session = role ? { user: { id: "u1", name: "Someone", role, email: "someone@example.com" } } : null; };
  it.each(["ADMIN", "SUPERVISOR", "EMPLOYEE"])("%s sees it once, in the sidebar and in the phone drawer", (role) => {
    as(role);
    for (const html of [renderToStaticMarkup(<Sidebar />), renderToStaticMarkup(<DashboardShell><p>page</p></DashboardShell>)]) {
      expect(count(html, LINK)).toBe(1);
      expect(html).toContain("Work Orders");
    }
  });
  it("it sits in the top, untitled group, after Quality, and is not under /dashboard/admin", () => {
    as("ADMIN");
    const html = renderToStaticMarkup(<Sidebar />);
    const firstHeading = html.indexOf("uppercase tracking-wider");
    expect(html.indexOf(LINK)).toBeGreaterThan(html.indexOf('href="/dashboard/admin/quality"'));
    expect(html.indexOf(LINK)).toBeLessThan(firstHeading);
    expect(html).not.toContain("/dashboard/admin/work-orders");
  });
  it("nobody signed in: no entry", () => {
    as(null);
    expect(renderToStaticMarkup(<Sidebar />)).not.toContain(LINK);
  });
  it("it is highlighted on the list, a record and the new form, and Dashboard is not", () => {
    as("SUPERVISOR");
    for (const path of ["/dashboard/work-orders", "/dashboard/work-orders/abc", "/dashboard/work-orders/new"]) {
      state.pathname = path;
      const html = renderToStaticMarkup(<Sidebar />);
      const link = html.slice(html.lastIndexOf("<a", html.indexOf(LINK)), html.indexOf("</a>", html.indexOf(LINK)));
      const dashboard = html.slice(html.lastIndexOf("<a", html.indexOf('href="/dashboard"')), html.indexOf("</a>", html.indexOf('href="/dashboard"')));
      expect(link.includes("bg-") && link !== dashboard, path).toBe(true);
      expect(link.match(/class="([^"]*)"/)![1], path).not.toBe(dashboard.match(/class="([^"]*)"/)![1]);
    }
  });
});

describe("the list page", () => {
  it("has a prominent New Work Order button that goes to the form", () => {
    const html = renderToStaticMarkup(<WorkOrdersHome />);
    expect(html).toMatch(/<a[^>]*data-new-work-order[^>]*href="\/dashboard\/work-orders\/new"|<a[^>]*href="\/dashboard\/work-orders\/new"[^>]*data-new-work-order/);
    expect(text(html)).toContain("New Work Order");
    expect(html).toContain("min-h-[48px]");
  });
  const row = (n: number, over: Partial<WorkOrderRow> = {}): WorkOrderRow => ({
    id: `wo-${n}`, reference: `WO-2026-00${n}`, facility: "624", requestType: "machinery_equipment", equipmentName: `Mixer ${n}`, problem: "The belt slips.", priority: "medium", status: "open", dueDate: "2026-12-02",
    requestedById: "carlos", requestedByName: "Carlos Gomory", requestedAt: "2026-11-25T18:00:00Z", assigneeId: "hugo", assigneeName: "Hugo Ayala", completedDate: null, updatedAt: "2026-11-25T18:00:00Z", ...over,
  });
  const ROWS = [
    row(1, { dueDate: "2026-11-24", priority: "high" }), row(2, { status: "in_progress", facility: "Julian Bakery" }), row(3, { status: "completed", dueDate: "2026-11-20", completedDate: "2026-11-21", requestType: "facility" }),
    row(4, { status: "cancelled", dueDate: "2026-11-01" }), row(5, { requestedById: "hugo", requestedByName: "Hugo Ayala", assigneeId: "carlos", assigneeName: "Carlos Gomory" }),
  ];
  const list = (f = {}, viewerId = "hugo") => renderToStaticMarkup(<WorkOrdersList rows={ROWS} today="2026-11-25" viewerId={viewerId} onOpen={noop} initialFilters={f} />);
  const shown = (html: string) => Array.from(html.matchAll(/data-row="WO-2026-00(\d)"/g)).map((m) => m[1]).join("");

  it("shows every work order except cancelled ones, with dates as MM/DD/YYYY and who has it", () => {
    const html = list();
    expect(shown(html)).toBe("1235");
    expect(html).toContain("4 of 5");
    const t = text(html);
    expect(t).toContain("Requested 11/25/2026 by Carlos Gomory · Assigned to Hugo Ayala (you) · Due 11/24/2026");
    expect(t).toContain("Completed 11/21/2026");
    expect(t).toContain("624 · Machinery / Equipment");
  });
  it("overdue work orders are highlighted: past due and still open; not completed or cancelled ones", () => {
    const html = list({ showCancelled: true });
    expect(Array.from(html.matchAll(/data-row="WO-2026-00(\d)" data-overdue="true"/g)).map((m) => m[1])).toEqual(["1"]);
    expect(count(html, ">OVERDUE<")).toBe(1);
    expect(count(renderToStaticMarkup(<WorkOrdersList rows={ROWS} today="2026-11-24" viewerId="hugo" onOpen={noop} />), ">OVERDUE<")).toBe(0); // due today is not overdue
  });
  it("the filters: status, priority, type, facility, assigned to me, requested by me, show cancelled", () => {
    const html = list();
    for (const label of ["Status", "Priority", "Type", "Facility", "Assigned to me", "Requested by me", "Show cancelled"]) expect(text(html)).toContain(label);
    expect(shown(list({ status: "in_progress" }))).toBe("2");
    expect(shown(list({ priority: "high" }))).toBe("1");
    expect(shown(list({ requestType: "facility" }))).toBe("3");
    expect(shown(list({ facility: "Julian Bakery" }))).toBe("2");
    expect(shown(list({ assignedToMe: true }))).toBe("123");
    expect(shown(list({ requestedByMe: true }))).toBe("5");
    expect(shown(list({ assignedToMe: true }, "carlos"))).toBe("5");
    expect(shown(list({ showCancelled: true }))).toBe("12345");
    expect(shown(list({ status: "cancelled" }))).toBe("4");
  });
  it("says so when there is nothing, or nothing that matches", () => {
    expect(renderToStaticMarkup(<WorkOrdersList rows={[]} today="2026-11-25" viewerId="hugo" onOpen={noop} />)).toContain("No work orders yet.");
    expect(list({ status: "completed", priority: "high" })).toContain("No work orders match these filters.");
  });
});

describe("the request form (Step 1)", () => {
  const OPTIONS: WorkOrderOptions = {
    users: [{ id: "carlos", name: "Carlos Gomory" }, { id: "hugo", name: "Hugo Ayala" }], equipment: [{ id: "eq-1", facility: "624", name: "Mixer 2" }, { id: "eq-2", facility: "624", name: "Oven 1" }, { id: "eq-3", facility: "Julian Bakery", name: "Proofer" }],
    facilities: ["Julian Bakery", "624"], today: "2026-11-25", now: "2026-11-26T07:30:00.000Z", defaultFacility: "624", viewer: { id: "hugo", name: "Hugo Ayala" },
  };
  const form = (over: Partial<Parameters<typeof NewWorkOrderForm>[0]> = {}) => renderToStaticMarkup(<NewWorkOrderForm options={OPTIONS} onCreate={noop} onCancel={noop} {...over} />);
  const field = (html: string, name: string) => { const a = html.indexOf(`data-field="${name}"`); return html.slice(html.lastIndexOf("<", a), html.indexOf(name === "problem" ? "</textarea>" : name === "equipmentName" ? "/>" : "</select>", a)); };

  it("date, time and requested by are shown in Pacific time and are not inputs", () => {
    const html = form();
    const system = html.slice(html.indexOf("data-system-fields"), html.indexOf("</div></div>", html.indexOf("data-system-fields")));
    expect(text(system)).toContain("11/25/2026, 11:30 PM PT"); // 07:30 UTC on the 26th
    expect(text(system)).toContain("Requested by Hugo Ayala");
    expect(system).not.toMatch(/<input|<select|<textarea/);
  });
  it("the facility starts on the person's usual one and is required; with none known it starts blank", () => {
    expect(field(form(), "facility")).toContain('<option value="624" selected="">624</option>');
    const blank = form({ options: { ...OPTIONS, defaultFacility: "" } });
    expect(field(blank, "facility")).toContain('<option value="" selected="">Choose…</option>');
    expect(blank).toMatch(/<button[^>]*disabled=""[^>]*data-create|<button[^>]*data-create[^>]*disabled=""/);
  });
  it("the equipment picker offers that facility's items and always Other", () => {
    const picker = field(form(), "equipmentId");
    expect(Array.from(picker.matchAll(/<option value="([^"]*)"/g)).map((m) => m[1])).toEqual(["", "eq-1", "eq-2", "other"]);
    expect(picker).toContain("Other (type the name)");
    expect(picker).not.toContain("Proofer");
    expect(form()).not.toContain('data-field="equipmentName"');
    expect(form({ initial: { equipmentId: "other" } })).toContain('data-field="equipmentName"'); // Other: the name is typed
  });
  it("an empty list never blocks: the name is simply typed", () => {
    const html = form({ options: { ...OPTIONS, equipment: [] } });
    expect(html).not.toContain('data-field="equipmentId"');
    expect(html).toContain('data-field="equipmentName"');
    expect(text(html)).toContain("This facility's list is empty for now: type the name.");
    const ready = form({ options: { ...OPTIONS, equipment: [] }, initial: { requestType: "facility", equipmentName: "Roof vent", problem: "Leaks", priority: "low", assigneeId: "hugo" } });
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*data-create|<button[^>]*data-create[^>]*disabled=""/);
  });
  it("priorities say what they mean and show the due date; the assignee list marks the person themselves", () => {
    const html = form({ initial: { priority: "medium" } });
    for (const label of ["High — same day", "Medium — within the week", "Low — within the month"]) expect(text(html)).toContain(label);
    expect(text(html)).toContain("Due 12/02/2026");
    expect(text(form({ initial: { priority: "high" } }))).toContain("Due 11/25/2026");
    expect(field(html, "assigneeId")).toContain("Hugo Ayala (me)");
    expect(count(field(html, "assigneeId"), "<option")).toBe(3);
  });
  it("the duplicate warning lists the open work orders and does not block", () => {
    const html = form({
      initial: { requestType: "machinery_equipment", equipmentId: "eq-1", problem: "Belt", priority: "high", assigneeId: "hugo" },
      duplicates: [{ id: "wo-1", reference: "WO-2026-001", status: "in_progress", priority: "high", requestedAt: "2026-11-24T18:00:00Z", requestedByName: "Carlos Gomory", assigneeName: "Hugo Ayala" }],
    });
    expect(html).toContain('data-duplicates="1"');
    expect(text(html)).toContain("There is already an open work order for this equipment:");
    expect(text(html)).toContain("WO-2026-001 · In progress · opened 11/24/2026, 10:00 AM PT by Carlos Gomory · assigned to Hugo Ayala");
    expect(text(html)).toContain("You can still open this one if it is a different problem.");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-create|<button[^>]*data-create[^>]*disabled=""/);
    expect(form()).not.toContain("data-duplicates");
  });
  it("what the server refuses is shown by field; inputs are thumb-sized", () => {
    const html = form({ error: "Some fields need attention.", problems: [{ field: "assigneeId", message: "Assigned to: choose an active user." }] });
    expect(html).toContain('data-problem="assigneeId"');
    expect(text(html)).toContain("Assigned to: choose an active user.");
    expect(count(html, "min-h-[44px]")).toBeGreaterThan(6);
  });
});

describe("the record", () => {
  const RECORD = {
    id: "wo-1", reference: "WO-2026-001", facility: "624", requestType: "machinery_equipment", equipmentName: "Mixer 2", problem: "The belt slips under load.", priority: "high", status: "open", dueDate: "2026-11-25",
    requestedById: "carlos", requestedByName: "Carlos Gomory", requestedAt: "2026-11-25T18:00:00.000Z", assigneeId: "hugo", assigneeName: "Hugo Ayala", startedAt: null, startDate: null, startTime: null, stopTime: null,
    repairedByKind: null, repairedByUserId: null, repairedByName: "", toolsAccounted: null, workDescription: "", completedDate: null, signatureName: "", signedById: null, signedAt: null, cancelledAt: null,
    cancelReason: null, updatedAt: "2026-11-25T18:00:00.000Z",
  };
  const USERS = [{ id: "carlos", name: "Carlos Gomory" }, { id: "hugo", name: "Hugo Ayala" }, { id: "ivan", name: "Ivan Diaz" }];
  const ASSIGNEE = { work: true, reassign: true, cancel: false };
  const record = (over: Partial<WorkOrderRecordProps> = {}, fields: Record<string, string | boolean | null> = {}) => renderToStaticMarkup(
    <WorkOrderRecord record={{ ...RECORD, ...fields }} events={[]} users={USERS} viewer={{ id: "hugo", name: "Hugo Ayala" }} can={ASSIGNEE} assigneeActive today="2026-11-25"
      onStart={noop} onSaveDraft={noop} onComplete={noop} onReassign={noop} onCancel={noop} {...over} />,
  );
  const IN_PROGRESS = { status: "in_progress", startedAt: "2026-11-25T18:05:00.000Z" };
  const FILLED = { ...IN_PROGRESS, startDate: "2026-11-25", startTime: "08:00", stopTime: "09:30", repairedByKind: "internal", repairedByUserId: "hugo", repairedByName: "Hugo Ayala", toolsAccounted: true, workDescription: "Replaced the belt.", completedDate: "2026-11-25", signatureName: "Hugo Ayala" };
  const button = (html: string, action: string) => new RegExp(`<button[^>]*data-action="${action}"[^>]*>`).exec(html)?.[0] ?? "";

  it("Step 1 is read-only for everyone: date and time in Pacific, requested by, type, equipment, problem", () => {
    const html = record();
    const step1 = html.slice(html.indexOf('data-section="request"'), html.indexOf('data-section="assignment"'));
    expect(step1).not.toMatch(/<input|<select|<textarea/);
    const t = text(step1);
    for (const piece of ["11/25/2026, 10:00 AM PT", "Carlos Gomory", "Machinery / Equipment", "Mixer 2", "The belt slips under load."]) expect(t).toContain(piece);
    expect(text(html)).toContain("Assigned to Hugo Ayala (you)");
    expect(text(html)).toContain("Due date 11/25/2026");
  });
  it("Open: the assignee has a Start button; anyone else is told who it is waiting for; Step 2 is not shown yet", () => {
    expect(button(record(), "start")).toContain("data-action");
    expect(record()).not.toContain('data-section="action"');
    const other = record({ can: { work: false, reassign: false, cancel: false }, viewer: { id: "ivan", name: "Ivan Diaz" } });
    expect(other).not.toContain('data-action="start"');
    expect(text(other)).toContain("Waiting for Hugo Ayala to press Start.");
    expect(other).not.toContain('data-action="reassign"');
    expect(other).not.toContain('data-action="cancel"');
  });
  it("reassign and cancel are offered only to those who may; cancelling asks for a reason", () => {
    expect(record()).toContain('data-action="reassign"');
    expect(record()).not.toContain('data-action="cancel"'); // the assignee cannot cancel
    const requester = record({ can: { work: false, reassign: true, cancel: true }, viewer: { id: "carlos", name: "Carlos Gomory" } });
    expect(requester).toContain('data-action="reassign"');
    expect(requester).toContain('data-action="cancel"');
    const panel = record({ can: { work: false, reassign: true, cancel: true }, initialPanel: "cancel" });
    expect(text(panel)).toContain("Reason (required, kept in the change log)");
    expect(panel).toMatch(/<button[^>]*disabled=""[^>]*>Confirm/);
    const reassign = record({ initialPanel: "reassign" }, IN_PROGRESS);
    expect(text(reassign)).toContain("It goes back to Open: the new person presses Start.");
    expect(reassign.slice(reassign.indexOf('data-panel="reassign"'))).not.toMatch(/<option value="hugo"/); // not to the person who already has it
  });
  it("In progress, for the assignee: the Step 2 form, with the start date and the signature suggested", () => {
    const html = record({}, IN_PROGRESS);
    expect(html).toContain('data-section="action" data-editing="true"');
    for (const f of ["startTime", "stopTime", "repairedByKind", "workDescription", "toolsAccounted", "signatureName"]) expect(html, f).toContain(`data-field="${f}"`);
    expect(html).toMatch(/<input[^>]*value="Hugo Ayala"[^>]*data-field="signatureName"|<input[^>]*data-field="signatureName"[^>]*value="Hugo Ayala"/);
    expect(text(html)).toContain("Are all tools accounted for and the area cleared and cleaned?");
    expect(text(html)).toContain("Your account and the time are recorded with it.");
    expect(html).not.toContain('data-action="start"');
  });
  it("nothing answered yet: the submit button is disabled and what is missing is listed", () => {
    const html = record({}, IN_PROGRESS);
    expect(button(html, "complete")).toContain('disabled=""');
    expect(Array.from(html.matchAll(/data-missing-field="(\w+)"/g)).map((m) => m[1])).toEqual(["startTime", "stopTime", "repairedByKind", "toolsAccounted", "workDescription", "completedDate"]);
  });
  it("tools No: completion is blocked in the UI with a plain explanation, and Save draft stays available", () => {
    const html = record({}, { ...FILLED, toolsAccounted: false, signatureName: "" });
    expect(button(html, "complete")).toContain('disabled=""');
    expect(html).toContain("data-tools-block");
    expect(text(html)).toContain("The work order cannot be completed while the answer is No.");
    expect(Array.from(html.matchAll(/data-missing-field="(\w+)"/g)).map((m) => m[1])).toEqual(["toolsAccounted"]);
    expect(button(html, "save-draft")).not.toContain('disabled=""'); // the suggested signature is a change to save
    expect(html).toMatch(/aria-pressed="true"[^>]*>No<|<button[^>]*aria-pressed="true"[^>]*class="[^"]*bg-red-600/);
  });
  it("everything filled in and tools Yes: it can be submitted", () => {
    const html = record({}, FILLED);
    expect(button(html, "complete")).not.toContain('disabled=""');
    expect(html).not.toContain("data-missing=");
    expect(html).not.toContain("data-tools-block");
    expect(button(html, "save-draft")).toContain('disabled=""'); // nothing changed since the last save
    expect(text(html)).toContain("Draft saved");
  });
  it("a date or time that cannot be right is said before submitting", () => {
    const html = record({}, { ...FILLED, completedDate: "2026-11-24" });
    expect(button(html, "complete")).toContain('disabled=""');
    expect(text(html)).toContain("Date work completed: it cannot be before the start date (11/25/2026).");
    expect(text(record({}, { ...FILLED, startTime: "14:00", stopTime: "13:00" }))).toContain("Stop time: it cannot be before the start time (2:00 PM)");
  });
  it("In progress, for someone who is not the assignee: Step 2 is shown read-only", () => {
    const html = record({ can: { work: false, reassign: false, cancel: false }, viewer: { id: "ivan", name: "Ivan Diaz" } }, { ...FILLED, toolsAccounted: false });
    expect(html).toContain('data-section="action" data-editing="false"');
    const step2 = html.slice(html.indexOf('data-section="action"'), html.indexOf("data-change-log"));
    expect(step2).not.toMatch(/<input|<select|<textarea|<button/);
    expect(text(step2)).toContain("Only Hugo Ayala or an admin can fill in this step.");
    expect(text(step2)).toContain("11/25/2026 · 8:00 AM");
    expect(text(step2)).toContain("Internal: Hugo Ayala");
  });
  it("Completed: a banner with who signed and when, everything read-only, no Start, no reassign", () => {
    const html = record({}, { ...FILLED, status: "completed", signedById: "hugo", signedAt: "2026-11-25T19:00:00.000Z" });
    expect(text(html)).toContain("Completed on 11/25/2026. Signed by Hugo Ayala on 11/25/2026, 11:00 AM PT.");
    expect(html).toContain('data-editing="false"');
    expect(html).not.toMatch(/<input|<select|<textarea/);
    for (const action of ["start", "reassign", "save-draft", "complete"]) expect(html).not.toContain(`data-action="${action}"`);
    expect(text(html)).toContain("All tools accounted for and area cleared and cleaned Yes");
    // an admin or the requester can still void it
    expect(record({ can: { work: true, reassign: true, cancel: true } }, { ...FILLED, status: "completed" })).toContain('data-action="cancel"');
  });
  it("Cancelled: a banner with the reason, read-only", () => {
    const html = record({ can: { work: true, reassign: true, cancel: true } }, { status: "cancelled", cancelledAt: "2026-11-25T19:00:00.000Z", cancelReason: "Fixed itself after a restart" });
    expect(html).toContain('data-banner="cancelled"');
    expect(text(html)).toContain("CANCELLED / VOID on 11/25/2026, 11:00 AM PT. Reason: Fixed itself after a restart.");
    for (const action of ["start", "reassign", "cancel", "complete"]) expect(html).not.toContain(`data-action="${action}"`);
  });
  it("an assignee who is no longer active: a warning, and the work order stays open", () => {
    const html = record({ assigneeActive: false, can: { work: false, reassign: true, cancel: true }, viewer: { id: "carlos", name: "Carlos Gomory" } });
    expect(html).toContain('data-warning="assignee-inactive"');
    expect(text(html)).toContain("Hugo Ayala is no longer an active user. This work order stays open until it is reassigned.");
    expect(html).toContain('data-action="reassign"');
    expect(record()).not.toContain("data-warning");
    expect(record({ assigneeActive: false }, { ...FILLED, status: "completed" })).not.toContain("data-warning"); // only while it is open
  });
  it("overdue is flagged on the record, and the change log shows who did what in plain words", () => {
    const html = record({
      today: "2026-11-27",
      events: [
        { id: "e2", action: "reassigned", userName: "Carlos Gomory", createdAt: "2026-11-26T18:00:00Z", changes: [{ field: "assignee", from: "Ivan Diaz", to: "Hugo Ayala" }, { field: "status", from: "in_progress", to: "open" }], note: null },
        { id: "e1", action: "created", userName: "Carlos Gomory", createdAt: "2026-11-25T18:00:00Z", changes: [{ field: "priority", from: null, to: "high" }, { field: "dueDate", from: null, to: "2026-11-25" }], note: null },
      ],
    });
    expect(html).toContain("data-overdue");
    const log = text(html.slice(html.indexOf("data-change-log")));
    expect(log).toContain("11/26/2026, 10:00 AM PT · Carlos Gomory · Reassigned");
    expect(log).toContain("Assigned to: Ivan Diaz → Hugo Ayala");
    expect(log).toContain("Status: In progress → Open");
    expect(log).toContain("Priority: (empty) → High");
    expect(log).toContain("Due date: (empty) → 11/25/2026");
    expect(log.indexOf("Reassigned")).toBeLessThan(log.indexOf("Created"));
  });
});

describe("the equipment and area editor", () => {
  const editor = (items: Parameters<typeof EquipmentEditor>[0]["items"], showRetired = false) =>
    renderToStaticMarkup(<EquipmentEditor facilities={["Julian Bakery", "624"]} items={items} onAdd={noop} onRename={noop} onRetire={noop} initialShowRetired={showRetired} />);
  it("starts empty for both facilities, and says what that means", () => {
    const html = editor([]);
    expect(count(html, "data-facility=")).toBe(2);
    expect(count(html, "data-empty")).toBe(2);
    expect(text(html)).toContain("The list is empty. Until it is filled in, people type the name of the equipment or area on the work order.");
    expect(count(html, "data-add=")).toBe(2);
  });
  it("items are listed per facility; retired ones are hidden until asked for, and are brought back, never deleted", () => {
    const items = [{ id: "a", facility: "624", name: "Mixer 2", retiredAt: null }, { id: "b", facility: "624", name: "Old oven", retiredAt: "2026-11-20T18:00:00Z" }, { id: "c", facility: "Julian Bakery", name: "Proofer", retiredAt: null }];
    const html = editor(items);
    expect(Array.from(html.matchAll(/data-item="([^"]+)"/g)).map((m) => m[1])).toEqual(["Proofer", "Mixer 2"]);
    expect(text(html)).toContain("624 (1 in use)");
    const all = editor(items, true);
    expect(all).toContain('data-item="Old oven" data-retired="true"');
    expect(text(all)).toContain("Old oven (retired)");
    expect(text(all)).toContain("Bring back");
    expect(text(all)).not.toMatch(/Delete|Remove/);
  });
});
