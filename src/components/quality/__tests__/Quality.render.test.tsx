import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CapasList, IncidentsList, NewCapaForm, NewIncidentForm } from "@/components/quality/QualityLists";
import { CapaRecord, IncidentRecord, type CapaRecordProps, type IncidentRecordProps } from "@/components/quality/QualityRecords";
import { ClosureChecklist, QualityHistory, StatusButtons, type QualityEventRow } from "@/components/quality/QualityParts";
import { capaClosingProblems, incidentClosingProblems, type CapaRow, type IncidentRow } from "@/lib/quality";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const section = (html: string, name: string) => { const a = html.indexOf(`data-section="${name}"`); const b = html.indexOf("data-section=", a + 10); return html.slice(a, b === -1 ? undefined : b); };
const noop = () => {};
const OPTIONS = { products: [{ id: "prod-1", name: "Keto Bread" }, { id: "prod-2", name: "Paleo Wraps" }], admins: [{ id: "carlos", name: "Carlos Gomory" }, { id: "chris", name: "Chris Pence" }], today: "2026-11-21" };

const iRow = (over: Partial<IncidentRow>): IncidentRow => ({
  id: "i1", reference: "CI-2026-001", facility: null, dateReceived: "2026-11-20", channel: "email", customer: "Whole Foods #12", productId: "prod-1", productName: "Keto Bread",
  description: "Customer found a piece of plastic in a loaf.", category: "foreign_matter", foodSafetyConcern: true, status: "open", updatedAt: "2026-11-22T07:30:00Z", updatedByName: "Carlos Gomory",
  capaId: "c1", capaReference: "CAPA-2026-001", ...over,
});
const INCIDENTS = [
  iRow({}),
  iRow({ id: "i2", reference: "CI-2026-002", status: "closed", category: "quality_taste", foodSafetyConcern: false, productName: "Paleo Wraps", description: "Tasted stale.", dateReceived: "2026-10-05", capaId: null, capaReference: null, updatedByName: "Chris Pence" }),
  iRow({ id: "i3", reference: "CI-2026-003", status: "void", foodSafetyConcern: false, description: "Entered twice.", capaId: null, capaReference: null }),
];
const cRow = (over: Partial<CapaRow>): CapaRow => ({
  id: "c1", reference: "CAPA-2026-001", facility: null, source: "customer_incident", problem: "Plastic in a loaf.", status: "in_progress", ownerId: "chris", ownerName: "Chris Pence", dueDate: "2026-11-15",
  createdAt: "2026-11-21T18:00:00Z", updatedAt: "2026-11-21T19:00:00Z", updatedByName: "Chris Pence", incidentReferences: ["CI-2026-001", "CI-2026-004"], ...over,
});
const CAPAS = [
  cRow({}),
  cRow({ id: "c2", reference: "CAPA-2026-002", source: "audit_finding", status: "closed", problem: "Sanitizer log incomplete.", dueDate: "2026-11-10", incidentReferences: [] }),
  cRow({ id: "c3", reference: "CAPA-2026-003", status: "open", dueDate: "2026-12-15", ownerName: "", ownerId: null, incidentReferences: [] }),
  cRow({ id: "c4", reference: "CAPA-2026-004", status: "void", dueDate: "2026-11-01", incidentReferences: [] }),
];

describe("incidents list (real component)", () => {
  const html = renderToStaticMarkup(<IncidentsList rows={INCIDENTS} onOpen={noop} />);
  it("columns: reference, date, category, status, linked CAPA and who last changed it and when", () => {
    for (const head of ["Reference", "Date received", "Category", "Product", "What happened", "Status", "CAPA", "Last changed"]) expect(html).toContain(`>${head}</th>`);
    const row = html.slice(html.indexOf('data-row="CI-2026-001"'), html.indexOf('data-row="CI-2026-002"'));
    for (const text of ["CI-2026-001", "FOOD SAFETY", "11/20/2026", "Foreign matter", "Keto Bread", 'data-status="open"', ">Open<", "CAPA-2026-001", "11/21/2026 · Carlos Gomory"]) expect(row, text).toContain(text);
    expect(html).toContain("10/05/2026");
    expect(html).toContain("Quality or taste");
  });
  it("void records are hidden by default; 'Show void' and the Void status bring them back, marked void", () => {
    expect(count(html, "data-row=")).toBe(2);
    expect(html).not.toContain("CI-2026-003");
    expect(html).toContain(">2 of 3</span>");
    expect(html).toMatch(/<input type="checkbox"\/> Show void/); // unticked
    const withVoid = renderToStaticMarkup(<IncidentsList rows={INCIDENTS} onOpen={noop} initialFilters={{ showVoid: true }} />);
    expect(count(withVoid, "data-row=")).toBe(3);
    expect(withVoid).toContain('data-status="void"');
    expect(withVoid).toMatch(/<input type="checkbox" checked=""\/> Show void/);
  });
  it("filters: status, category, product, facility, date range and search", () => {
    for (const label of ["Search", "Status", "Category", "Product", "Facility", "From", "To"]) expect(html).toContain(`>${label}<`);
    expect(html).toContain('<option value="foreign_matter">Foreign matter</option>');
    expect(html).toContain('<option value="Company-wide">Company-wide</option><option value="Julian Bakery">Julian Bakery</option><option value="624">624</option>');
    const shows = (f: Parameters<typeof IncidentsList>[0]["initialFilters"]) => Array.from(renderToStaticMarkup(<IncidentsList rows={INCIDENTS} onOpen={noop} initialFilters={f} />).matchAll(/data-row="CI-2026-(\d+)"/g)).map((m) => m[1]);
    expect(shows({ status: "closed" })).toEqual(["002"]);
    expect(shows({ category: "foreign_matter" })).toEqual(["001"]);
    expect(shows({ product: "wraps" })).toEqual(["002"]);
    expect(shows({ from: "2026-11-01" })).toEqual(["001"]);
    expect(shows({ search: "stale" })).toEqual(["002"]);
    expect(shows({ status: "void" })).toEqual(["003"]);
    expect(renderToStaticMarkup(<IncidentsList rows={INCIDENTS} onOpen={noop} initialFilters={{ search: "zzz" }} />)).toContain("No incidents match these filters.");
    expect(renderToStaticMarkup(<IncidentsList rows={[]} onOpen={noop} />)).toContain("No incidents yet.");
  });
});

describe("CAPAs list (real component)", () => {
  const html = renderToStaticMarkup(<CapasList rows={CAPAS} today="2026-11-21" onOpen={noop} />);
  const row = (ref: string) => { const a = html.indexOf(`data-row="${ref}"`); const b = html.indexOf("data-row=", a + 10); return html.slice(a, b === -1 ? undefined : b); };
  it("columns: reference, date opened, source, status, owner, due date, linked incidents, last changed", () => {
    for (const head of ["Reference", "Date opened", "Source", "The problem", "Incidents", "Status", "Owner", "Due date", "Last changed"]) expect(html).toContain(`>${head}</th>`);
    for (const text of ["CAPA-2026-001", "11/21/2026", "Customer incident", "CI-2026-001, CI-2026-004", ">Action in progress<", "Chris Pence", "11/15/2026"]) expect(row("CAPA-2026-001"), text).toContain(text);
  });
  it("the overdue mark shows on a CAPA past its due date that is not closed — and only there", () => {
    expect(row("CAPA-2026-001")).toContain('data-overdue="true"');
    expect(row("CAPA-2026-001")).toContain(">OVERDUE</span>");
    expect(row("CAPA-2026-002")).not.toContain("OVERDUE"); // past due but closed
    expect(row("CAPA-2026-003")).not.toContain("OVERDUE"); // not due yet
    expect(count(html, ">OVERDUE</span>")).toBe(1);
    // on the due date itself it is not overdue yet
    expect(renderToStaticMarkup(<CapasList rows={CAPAS} today="2026-11-15" onOpen={noop} />)).not.toContain("OVERDUE");
    // a void one never is, even when shown
    expect(count(renderToStaticMarkup(<CapasList rows={CAPAS} today="2026-11-21" onOpen={noop} initialFilters={{ showVoid: true }} />), ">OVERDUE</span>")).toBe(1);
  });
  it("filters by source instead of category, and hides void by default", () => {
    expect(html).toContain('<option value="audit_finding">Audit finding</option>');
    expect(html).not.toContain(">Category<");
    expect(count(html, "data-row=")).toBe(3);
    const shows = (f: Parameters<typeof CapasList>[0]["initialFilters"]) => Array.from(renderToStaticMarkup(<CapasList rows={CAPAS} today="2026-11-21" onOpen={noop} initialFilters={f} />).matchAll(/data-row="CAPA-2026-(\d+)"/g)).map((m) => m[1]);
    expect(shows({ source: "audit_finding" })).toEqual(["002"]);
    expect(shows({ status: "open" })).toEqual(["003"]);
    expect(shows({ search: "sanitizer" })).toEqual(["002"]);
  });
});

describe("create forms (real components)", () => {
  it("a new incident asks only for the date received, how it came in and what happened", () => {
    const html = renderToStaticMarkup(<NewIncidentForm today="2026-11-21" onCreate={noop} onCancel={noop} />);
    for (const label of ["Date received (required)", "How it came in (required)", "What happened (required)", "Facility (optional)"]) expect(html).toContain(label);
    expect(html).toContain('<option value="email">Email</option><option value="phone">Phone</option><option value="retailer">Retailer</option><option value="other">Other</option>');
    expect(html).toContain('<option value="" selected="">Company-wide</option>');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create incident<\/button>/); // nothing typed yet
    const refused = renderToStaticMarkup(<NewIncidentForm today="2026-11-21" onCreate={noop} onCancel={noop} error="Some fields need attention." problems={[{ field: "description", message: "What happened: describe the incident." }]} />);
    expect(refused).toContain("What happened: describe the incident.");
  });
  it("a new CAPA asks for the source and the problem, and points to 'Open CAPA' for incidents", () => {
    const html = renderToStaticMarkup(<NewCapaForm onCreate={noop} onCancel={noop} />);
    for (const text of ["Source (required)", "The problem (required)", "Open CAPA", '<option value="supplier_issue">Supplier issue</option>']) expect(html).toContain(text);
  });
});

const EVENTS: QualityEventRow[] = [
  { id: "e3", action: "status_changed", userName: "Chris Pence", createdAt: "2026-11-22T07:30:00Z", changes: [{ field: "status", from: "open", to: "under_review" }], note: null },
  { id: "e2", action: "updated", userName: "Carlos Gomory", createdAt: "2026-11-21T19:00:00Z", changes: [{ field: "category", from: null, to: "foreign_matter" }, { field: "foodSafetyConcern", from: false, to: true }], note: null },
  { id: "e1", action: "created", userName: "Carlos Gomory", createdAt: "2026-11-21T18:00:00Z", changes: [{ field: "dateReceived", from: null, to: "2026-11-20" }], note: null },
];
const INCIDENT = {
  id: "i1", reference: "CI-2026-001", facility: null, dateReceived: "2026-11-20", channel: "email", customer: "Whole Foods #12", productId: "prod-1", productName: "Keto Bread", lotCode: "L1120",
  bestByDate: "2026-12-20", description: "Customer found a piece of plastic in a loaf.", category: "foreign_matter", foodSafetyConcern: true, immediateAction: "", responseDate: null, responseChannel: null,
  responseSummary: "", capaRequired: null, noCapaReason: "", status: "under_review", closedDate: null, closedById: null, voidedAt: null, voidedById: null, voidReason: null, updatedAt: "2026-11-22T07:30:00Z",
};
function incident(over: Partial<IncidentRecordProps> = {}, record: Record<string, string | boolean | null> = {}) {
  return renderToStaticMarkup(
    <IncidentRecord record={{ ...INCIDENT, ...record }} capa={null} events={EVENTS} options={OPTIONS} onSave={noop} onAction={noop} onOpenCapa={noop} onUnlink={noop} onGoToCapa={noop} {...over} />,
  );
}

describe("incident record page (real component)", () => {
  const html = incident();
  it("shows every field with its saved value", () => {
    for (const text of ["CI-2026-001", 'data-status="under_review"', "FOOD SAFETY CONCERN", "Company-wide", 'value="11/20/2026"', 'value="Whole Foods #12"', 'value="L1120"', 'value="12/20/2026"',
      "Customer found a piece of plastic in a loaf.", '<option value="foreign_matter" selected="">Foreign matter</option>', '<option value="email" selected="">Email</option>',
      '<option value="prod-1" selected="">Keto Bread</option>', '<option value="yes" selected="">Yes</option>']) expect(html, text).toContain(text);
    for (const label of ["Date received", "How it came in", "Customer or account", "Facility", "Product (as written)", "Lot code", "Best-by date", "What happened", "Category", "Food safety concern",
      "Immediate action taken (required for a food safety concern)", "Date of the response", "Channel", "Short summary of the message"]) expect(html, label).toContain(label);
    expect(section(html, "response")).toContain('<option value="email">Email</option><option value="phone">Phone</option><option value="other">Other</option>');
  });

  it("the closure checklist lists what is missing by field, and the Close button waits for it", () => {
    const closing = section(html, "closing");
    expect(closing).toContain('data-closure="missing"');
    expect(closing).toContain("Before this incident can be closed:");
    expect(Array.from(closing.matchAll(/data-missing="(\w+)"/g)).map((m) => m[1])).toEqual(["responseDate", "immediateAction", "capaRequired"]);
    expect(closing).toContain("Response to the customer: enter the date of the response.");
    expect(closing).toContain("Immediate action taken: required because this is a food safety concern.");
    expect(closing).toContain("A food safety concern cannot be closed without this decision.");
    expect(closing).toContain('value="11/21/2026"'); // the closed date starts at today (Pacific)
    expect(section(html, "status")).toMatch(/<button[^>]*disabled=""[^>]*data-action="close"[^>]*>Close incident<\/button>/);
  });

  it("with everything filled in the checklist says so and the Close button is enabled", () => {
    const ready = incident({}, { immediateAction: "Lot pulled.", responseDate: "2026-11-21", capaRequired: false, noCapaReason: "Isolated; supplier bag fragment, lot destroyed." });
    expect(section(ready, "closing")).toContain('data-closure="ready"');
    expect(section(ready, "closing")).toContain("Everything needed to close this incident is filled in.");
    expect(section(ready, "status")).not.toMatch(/<button[^>]*disabled=""[^>]*data-action="close"/);
    expect(section(ready, "capa")).toContain('<option value="no" selected="">No CAPA needed</option>');
    expect(section(ready, "capa")).toContain("Reason no CAPA is needed (required with that choice)");
  });

  it("the checklist is the same rule the server uses", () => {
    const problems = incidentClosingProblems(INCIDENT, false, "2026-11-21");
    expect(renderToStaticMarkup(<ClosureChecklist problems={problems} what="incident" />)).toContain(problems[0].message);
    expect(count(section(html, "closing"), "data-missing=")).toBe(problems.length);
  });

  it("status buttons: Under review can go back to Open, be closed or voided; an open one moves forward", () => {
    expect(Array.from(section(html, "status").matchAll(/data-action="([\w:]+)"/g)).map((m) => m[1])).toEqual(["move:open", "close", "void"]);
    expect(section(html, "status")).toContain("Status: Under review");
    expect(section(incident({}, { status: "open" }), "status")).toContain('data-action="move:under_review"');
  });

  it("'Open CAPA' is offered while there is none; with one linked it shows a link to it and an Unlink action instead", () => {
    expect(section(html, "capa")).toContain("data-open-capa");
    expect(section(html, "capa")).toContain(">Open CAPA</button>");
    const linked = incident({ capa: { id: "c1", reference: "CAPA-2026-001", status: "in_progress", problem: "Plastic" } }, { capaRequired: true });
    expect(section(linked, "capa")).toContain('data-linked-capa="CAPA-2026-001"');
    expect(section(linked, "capa")).toMatch(/<button[^>]*>CAPA-2026-001<\/button>/);
    expect(section(linked, "capa")).toContain(">Action in progress<");
    expect(section(linked, "capa")).not.toContain("data-open-capa");
    expect(section(linked, "capa")).toContain(">Unlink this CAPA</button>");
    expect(Array.from(section(linked, "closing").matchAll(/data-missing="(\w+)"/g)).map((m) => m[1])).toEqual(["responseDate", "immediateAction"]); // the decision is made
  });

  it("the History section shows date, person, action and each field's change, newest first", () => {
    const from = html.indexOf("data-history");
    const history = html.slice(from, html.indexOf("</section>", from));
    expect(Array.from(history.matchAll(/data-event="(\w+)"/g)).map((m) => m[1])).toEqual(["status_changed", "updated", "created"]);
    for (const text of ["11/21/2026, 11:30 PM PT", "Chris Pence", "Status changed", "Status: Open → Under review", "Carlos Gomory", "Category: (empty) → Foreign matter", "Food safety concern: No → Yes", "Date received: (empty) → 11/20/2026"])
      expect(history, text).toContain(text);
    expect(history).not.toContain("<input"); // nothing in the history can be edited
    expect(history).not.toContain("<button");
  });

  it("a closed incident is read-only: plain text, a banner, and only Reopen", () => {
    const closed = incident({ names: { carlos: "Carlos Gomory" } }, { status: "closed", closedDate: "2026-11-22", closedById: "carlos", responseDate: "2026-11-21", capaRequired: false, noCapaReason: "One-off." });
    expect(closed).toContain('data-banner="closed"');
    expect(closed).toContain("Closed on 11/22/2026 by Carlos Gomory.");
    expect(closed.slice(0, closed.indexOf("data-history"))).not.toContain("<input");
    expect(closed).not.toContain("<select");
    expect(closed).not.toContain("<textarea");
    expect(closed).not.toContain("data-save-bar");
    expect(closed).not.toContain("data-open-capa");
    expect(closed).not.toContain('data-section="closing"');
    expect(count(closed, "data-read-only")).toBeGreaterThan(12);
    expect(closed).toContain(">Whole Foods #12</span>");
    expect(Array.from(section(closed, "status").matchAll(/data-action="([\w:]+)"/g)).map((m) => m[1])).toEqual(["reopen"]);
  });

  it("a void incident stays visible, marked void with its reason, and is read-only", () => {
    const voided = incident({ names: { carlos: "Carlos Gomory" } }, { status: "void", voidReason: "Duplicate of CI-2026-000.", voidedAt: "2026-11-21T19:00:00Z", voidedById: "carlos" });
    expect(voided).toContain('data-banner="void"');
    expect(voided).toContain("this incident was voided on 11/21/2026, 11:00 AM PT by Carlos Gomory. Reason: Duplicate of CI-2026-000.");
    expect(voided).toContain('data-status="void"');
    expect(voided).not.toContain("data-save-bar");
    expect(Array.from(section(voided, "status").matchAll(/data-action="([\w:]+)"/g)).map((m) => m[1])).toEqual(["reopen"]);
  });

  it("errors and field problems from the server are shown", () => {
    const refused = incident({ error: "Someone else changed this record. Reload to see the latest version.", problems: [{ field: "category", message: "Category: choose one from the list." }] });
    expect(refused).toContain("Someone else changed this record.");
    expect(refused).toContain("Category: choose one from the list.");
  });
});

const CAPA = {
  id: "c1", reference: "CAPA-2026-001", facility: "624", source: "customer_incident", problem: "Plastic in a loaf.", rootCause: "No second check at packing.", correctiveAction: "", preventiveAction: "",
  ownerId: "chris", dueDate: "2026-12-15", effectivenessDate: null, effectivenessResult: "", status: "verifying", closedDate: null, closedById: null, closedByName: null, voidedAt: null, voidedById: null,
  voidReason: null, updatedAt: "2026-11-21T19:00:00Z",
};
const LINKED = [{ id: "i1", reference: "CI-2026-001", status: "under_review", dateReceived: "2026-11-20", description: "Plastic in a loaf." }, { id: "i4", reference: "CI-2026-004", status: "open", dateReceived: "2026-11-21", description: "Second report." }];
const LINKABLE = [{ id: "i5", reference: "CI-2026-005", status: "open", dateReceived: "2026-11-21", description: "Third report, same lot." }];
function capa(over: Partial<CapaRecordProps> = {}, record: Record<string, string | boolean | null> = {}) {
  return renderToStaticMarkup(
    <CapaRecord record={{ ...CAPA, ...record }} incidents={LINKED} linkable={LINKABLE} events={[{ id: "e1", action: "created", userName: "Carlos Gomory", createdAt: "2026-11-21T18:00:00Z", changes: [{ field: "ownerId", from: null, to: "chris" }], note: "Opened from CI-2026-001" }]}
      options={OPTIONS} onSave={noop} onAction={noop} onLink={noop} onUnlink={noop} onGoToIncident={noop} {...over} />,
  );
}

describe("CAPA record page (real component)", () => {
  const html = capa();
  it("shows every field, the owner picked from the admins, and the linked incidents", () => {
    for (const text of ["CAPA-2026-001", 'data-status="verifying"', ">624<", '<option value="customer_incident" selected="">Customer incident</option>', "No second check at packing.",
      '<option value="chris" selected="">Chris Pence</option>', 'value="12/15/2026"', "Linked incidents (2)", 'data-linked-incident="CI-2026-001"', 'data-linked-incident="CI-2026-004"']) expect(html, text).toContain(text);
    for (const label of ["Source", "The problem", "Root cause", "Corrective action", "Preventive action", "Owner", "Due date", "Date of the check", "Result"]) expect(html, label).toContain(`>${label}<`);
    expect(section(html, "incidents")).toContain("CI-2026-005 · 11/21/2026 · Third report, same lot.");
    expect(count(section(html, "incidents"), ">Unlink</button>")).toBe(2);
    expect(section(html, "incidents")).toContain(">Link incident</button>");
  });

  it("the closure checklist lists the missing fields; the name of who closes it is recorded automatically", () => {
    const closing = section(html, "closing");
    expect(Array.from(closing.matchAll(/data-missing="(\w+)"/g)).map((m) => m[1])).toEqual(["correctiveAction", "preventiveAction", "effectivenessDate", "effectivenessResult"]);
    expect(closing).toContain("Effectiveness check: enter the date of the check.");
    expect(closing).toContain("The name of the admin who closes it and the date are recorded automatically.");
    expect(count(closing, "data-missing=")).toBe(capaClosingProblems(CAPA).length);
    expect(section(html, "status")).toMatch(/<button[^>]*disabled=""[^>]*data-action="close"/);
    const ready = capa({}, { correctiveAction: "Lot recalled.", preventiveAction: "Second check added.", effectivenessDate: "2026-12-20", effectivenessResult: "No repeat." });
    expect(section(ready, "closing")).toContain('data-closure="ready"');
    expect(section(ready, "status")).not.toMatch(/<button[^>]*disabled=""[^>]*data-action="close"/);
  });

  it("status buttons follow the one-step rule: a step back, a step forward, Close only from Verifying effectiveness", () => {
    const actions = (status: string) => Array.from(section(capa({}, { status }), "status").matchAll(/data-action="([\w:]+)"/g)).map((m) => m[1]);
    expect(actions("open")).toEqual(["move:in_progress", "void"]);
    expect(actions("in_progress")).toEqual(["move:open", "move:verifying", "void"]);
    expect(actions("verifying")).toEqual(["move:in_progress", "close", "void"]);
    expect(section(capa({}, { status: "open" }), "closing")).toContain("A CAPA is closed from Verifying effectiveness.");
    expect(section(html, "status")).toContain(">Back to Action in progress</button>");
  });

  it("an action that needs a reason asks for it before anything is sent", () => {
    const asking = renderToStaticMarkup(<StatusButtons buttons={[{ key: "move:in_progress", label: "Back to Action in progress", needsReason: true }, { key: "void", label: "Void", needsReason: true, danger: true }]} onAction={noop} initialAsking="void" />);
    expect(asking).toContain('data-reason-for="void"');
    expect(asking).toContain("Reason for “Void” (required, kept in the history)");
    expect(asking).toMatch(/<button[^>]*disabled=""[^>]*>Confirm<\/button>/); // no reason typed yet
    const onAction = vi.fn();
    expect(renderToStaticMarkup(<StatusButtons buttons={[{ key: "close", label: "Close" }]} onAction={onAction} />)).not.toContain("data-reason-for");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("the history shows the reason and people by name", () => {
    const history = html.slice(html.indexOf("data-history"));
    expect(history).toContain("Reason: Opened from CI-2026-001");
    expect(history).toContain("Owner: (empty) → Chris Pence");
    expect(renderToStaticMarkup(<QualityHistory type="capa" events={[]} />)).toContain("No history yet.");
  });

  it("a closed CAPA is read-only and names who closed it and when; a void one shows its reason", () => {
    const closed = capa({}, { status: "closed", closedDate: "2026-12-21", closedById: "chris", closedByName: "Chris Pence", correctiveAction: "Lot recalled.", preventiveAction: "Second check added.", effectivenessDate: "2026-12-20", effectivenessResult: "No repeat." });
    expect(closed).toContain("Closed on 12/21/2026 by Chris Pence.");
    expect(closed.slice(0, closed.indexOf("data-history"))).not.toContain("<input");
    expect(closed).not.toContain("<select");
    expect(closed).not.toContain("data-save-bar");
    expect(closed).not.toContain(">Unlink</button>");
    expect(closed).not.toContain("data-link-incident");
    expect(closed).toContain(">Chris Pence</span>"); // the owner, as text
    expect(Array.from(section(closed, "status").matchAll(/data-action="([\w:]+)"/g)).map((m) => m[1])).toEqual(["reopen"]);
    const voided = capa({}, { status: "void", voidReason: "Raised in error.", voidedAt: "2026-11-21T19:00:00Z" });
    expect(voided).toContain("Reason: Raised in error.");
    expect(voided).toContain('data-banner="void"');
  });
});

describe("sidebar and files", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
  it("the sidebar has one 'Quality' entry, for admins only", () => {
    const sidebar = read("../../layout/Sidebar.tsx");
    expect(count(sidebar, 'label: "Quality"')).toBe(1);
    const at = sidebar.indexOf('label: "Quality"');
    const entry = sidebar.slice(at, sidebar.indexOf("},", at));
    expect(entry).toContain('href: "/dashboard/admin/quality"');
    // who sees it is decided by canUseQuality: see src/components/layout/__tests__/QualityNav.test.tsx
    expect(sidebar).toContain("canUseQuality(session?.user?.role) ? qualityNav : []");
  });
  it("the pages check canUseQuality on the server before rendering anything", () => {
    for (const page of ["page.tsx", "incidents/[id]/page.tsx", "capas/[id]/page.tsx"]) {
      const src = read(`../../../app/(dashboard)/dashboard/admin/quality/${page}`);
      expect(src, page).toContain('if (!session || !canUseQuality(session.user.role)) redirect("/dashboard");');
    }
  });
  it("three tabs: Incidents, CAPAs and Reviews; still no code for PDFs or exports (phase 3)", () => {
    const home = read("../../../app/(dashboard)/dashboard/admin/quality/QualityHome.tsx");
    expect(Array.from(home.matchAll(/role="tab"/g))).toHaveLength(3);
    expect(Array.from(home.matchAll(/onClick=\{\(\) => choose\("(\w+)"\)\}/g)).map((m) => m[1])).toEqual(["incidents", "capas", "reviews"]);
    expect(home).not.toMatch(/\bpdf\b|\bcsv\b/i);
  });
  it("the new files contain real characters, never \\u escapes", () => {
    const files = ["../QualityParts.tsx", "../QualityLists.tsx", "../QualityRecords.tsx", "../../../lib/quality.ts", "../../../lib/quality-server.ts", "../../../lib/quality-sql.ts",
      "../../../app/(dashboard)/dashboard/admin/quality/QualityHome.tsx", "../../../app/(dashboard)/dashboard/admin/quality/QualityRecordPage.tsx"];
    for (const f of files) expect(read(f), f).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });
});
