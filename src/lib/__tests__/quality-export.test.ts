import { describe, it, expect } from "vitest";
import {
  CAPA_COLUMNS, CSV_BOM, INCIDENT_COLUMNS, REVIEW_COLUMNS, capaDecisionLabel, csvCell, csvOf, exportFileName, exportHref, parseExportFilters, toCsv,
  type CapaExportRow, type IncidentExportRow,
} from "@/lib/quality-export";
import type { ReviewRow } from "@/lib/quality";

describe("a CSV cell", () => {
  it("plain text and numbers go as they are; nothing is an empty cell; booleans are Yes or No", () => {
    expect(csvCell("Keto Thin Bread")).toBe("Keto Thin Bread");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(0)).toBe("0");
    expect([csvCell(null), csvCell(undefined), csvCell("")]).toEqual(["", "", ""]);
    expect([csvCell(true), csvCell(false)]).toEqual(["Yes", "No"]);
  });
  it("commas, quotes and line breaks are quoted, with quotes doubled", () => {
    expect(csvCell("Smith, John")).toBe('"Smith, John"');
    expect(csvCell('She said "moldy"')).toBe('"She said ""moldy"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
    expect(csvCell(" padded ")).toBe('" padded "');
  });
  it("formula injection: a cell that starts with =, +, - or @ (or a tab or carriage return) gets a leading apostrophe", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\",\"click\")")).toBe('"\'=HYPERLINK(""http://evil"",""click"")"');
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1 555 0100")).toBe("'+1 555 0100");
    expect(csvCell("-2 loaves")).toBe("'-2 loaves");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe("\"'\rcmd\"");
    // only the first character matters
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("11/22/2026")).toBe("11/22/2026");
  });
  it("accents and other characters are kept as they are", () => {
    expect(csvCell("Café Münster — señor")).toBe("Café Münster — señor");
  });
});

describe("the file", () => {
  it("starts with the UTF-8 byte order mark, has a heading row, CRLF line ends, and ends with a line end", () => {
    const csv = toCsv(["A", "B"], [["1", "x,y"], [true, null]]);
    expect(csv).toBe(`${CSV_BOM}A,B\r\n1,"x,y"\r\nYes,\r\n`);
    expect(Array.from(new TextEncoder().encode(csv).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });
  it("an empty list is the heading row alone", () => {
    expect(toCsv(["A", "B"], [])).toBe(`${CSV_BOM}A,B\r\n`);
  });
  it("the file name carries the kind and the Pacific date", () => {
    expect(exportFileName("incidents", "2026-11-22")).toBe("quality-incidents-2026-11-22.csv");
    expect(exportFileName("capas", "2026-11-22")).toBe("quality-capas-2026-11-22.csv");
    expect(exportFileName("reviews", "2026-11-22")).toBe("quality-reviews-2026-11-22.csv");
  });
});

describe("the filters in the export link", () => {
  it("only the filters that are set are sent, and the server reads the same filters back", () => {
    expect(exportHref("incidents")).toBe("/api/quality/incidents/export");
    expect(exportHref("incidents", { status: "", search: "  ", showVoid: false })).toBe("/api/quality/incidents/export");
    const f = { status: "closed", category: "foreign_matter", product: "Keto Thin", facility: "Company-wide", from: "2026-11-01", to: "2026-11-30", search: "plastic & glass", showVoid: true };
    const href = exportHref("incidents", f);
    expect(href.startsWith("/api/quality/incidents/export?")).toBe(true);
    expect(parseExportFilters(new URL(`http://x${href}`).searchParams)).toEqual(f);
    expect(parseExportFilters(new URL(`http://x${exportHref("capas", { source: "audit_finding" })}`).searchParams)).toEqual({ source: "audit_finding" });
    expect(exportHref("reviews", { year: "2026" })).toBe("/api/quality/reviews/export?year=2026");
  });
  it("anything that is not a known filter is ignored: a list of ids from the browser means nothing", () => {
    const q = new URLSearchParams("ids=inc-1,inc-2&id=inc-9&status=open&showVoid=yes&year=26&limit=1");
    expect(parseExportFilters(q)).toEqual({ status: "open" });
    expect(parseExportFilters(new URLSearchParams("showVoid=true&year=2025"))).toEqual({ showVoid: true, year: "2025" });
  });
});

describe("the columns", () => {
  const incident: IncidentExportRow = {
    reference: "CI-2026-004", dateReceived: "2026-11-20", channel: "email", customer: "Smith, John", productName: "Keto Thin Bread", lotCode: "L-2211", bestByDate: "2027-01-05",
    description: "Found plastic.\nSecond line.", category: "foreign_matter", foodSafetyConcern: true, immediateAction: "Held the lot.", responseDate: "2026-11-21", responseChannel: "phone",
    responseSummary: "Apologised, refund sent.", capaRequired: true, noCapaReason: "", capaReference: "CAPA-2026-002", status: "closed", closedDate: "2026-11-22", closedByName: "Carlos Gomory",
    voidReason: null, facility: null, createdByName: "Carlos Gomory", createdAt: "2026-11-21T07:30:00Z", updatedByName: "Chris Pence", updatedAt: "2026-11-23T02:00:00Z", attachmentCount: 2,
  };
  it("incidents: every field of the record page in one flat row", () => {
    expect(INCIDENT_COLUMNS.map((c) => c.label)).toEqual([
      "Reference", "Date received", "Channel", "Customer", "Product", "Lot code", "Best-by date", "What happened", "Category", "Food safety concern", "Immediate action",
      "Response date", "Response channel", "Response summary", "CAPA decision", "Reason no CAPA is needed", "Linked CAPA", "Status", "Closed date", "Closed by", "Void reason", "Facility",
      "Created by", "Created date", "Last changed by", "Last changed date", "Attachments",
    ]);
    expect(INCIDENT_COLUMNS.map((c) => c.value(incident))).toEqual([
      "CI-2026-004", "11/20/2026", "Email", "Smith, John", "Keto Thin Bread", "L-2211", "01/05/2027", "Found plastic.\nSecond line.", "Foreign matter", true, "Held the lot.",
      "11/21/2026", "Phone", "Apologised, refund sent.", "CAPA linked", "", "CAPA-2026-002", "Closed", "11/22/2026", "Carlos Gomory", "", "Company-wide",
      // created 07:30 UTC on the 21st is still the 20th in Pacific time; changed 02:00 UTC on the 23rd is the 22nd
      "Carlos Gomory", "11/20/2026", "Chris Pence", "11/22/2026", 2,
    ]);
  });
  it("the CAPA decision in words", () => {
    expect(capaDecisionLabel({ capaReference: "CAPA-2026-001", capaRequired: true })).toBe("CAPA linked");
    expect(capaDecisionLabel({ capaReference: null, capaRequired: false })).toBe("No CAPA needed");
    expect(capaDecisionLabel({ capaReference: null, capaRequired: null })).toBe("Not decided");
  });
  const capa: CapaExportRow = {
    reference: "CAPA-2026-002", source: "customer_incident", problem: "Plastic in a loaf.", rootCause: "Torn liner.", correctiveAction: "Replaced liners.", preventiveAction: "Weekly liner check.",
    ownerName: "Chris Pence", dueDate: "2026-11-15", overdue: true, effectivenessDate: null, effectivenessResult: "", status: "in_progress", closedDate: null, closedByName: "", voidReason: null,
    incidentReferences: ["CI-2026-003", "CI-2026-004"], facility: "624", createdByName: "Carlos Gomory", createdAt: "2026-11-21T18:00:00Z", updatedByName: "Carlos Gomory", updatedAt: "2026-11-21T19:00:00Z", attachmentCount: 0,
  };
  it("CAPAs: every field of the record page in one flat row", () => {
    expect(CAPA_COLUMNS.map((c) => c.label)).toEqual([
      "Reference", "Source", "The problem", "Root cause", "Corrective action", "Preventive action", "Owner", "Due date", "Overdue", "Effectiveness check date", "Effectiveness check result",
      "Status", "Closed date", "Closed by", "Void reason", "Linked incidents", "Facility", "Created by", "Created date", "Last changed by", "Last changed date", "Attachments",
    ]);
    expect(CAPA_COLUMNS.map((c) => c.value(capa))).toEqual([
      "CAPA-2026-002", "Customer incident", "Plastic in a loaf.", "Torn liner.", "Replaced liners.", "Weekly liner check.", "Chris Pence", "11/15/2026", true, "", "",
      "Action in progress", "", "", "", "CI-2026-003; CI-2026-004", "624", "Carlos Gomory", "11/21/2026", "Carlos Gomory", "11/21/2026", 0,
    ]);
    expect(csvOf(CAPA_COLUMNS, [capa]).split("\r\n")[1]).toContain(",11/15/2026,Yes,,,Action in progress,");
  });
  it("reviews: the period, the review and the four counts", () => {
    const review: ReviewRow = { id: "r1", period: "2026-10", reviewDate: "2026-11-02", reviewedByName: "Carlos Gomory", whatWasReviewed: "All incidents, open CAPAs", notes: "", counts: { openIncidents: 2, openCapas: 1, overdueCapas: 0, incidentsReceived: 5 }, updatedAt: "2026-11-02T18:00:00Z" };
    expect(REVIEW_COLUMNS.map((c) => c.label)).toEqual(["Period", "Review date", "Reviewer", "What was reviewed", "Notes", "Open incidents", "Open CAPAs", "Overdue CAPAs", "Incidents received that month"]);
    expect(csvOf(REVIEW_COLUMNS, [review])).toBe(`${CSV_BOM}Period,Review date,Reviewer,What was reviewed,Notes,Open incidents,Open CAPAs,Overdue CAPAs,Incidents received that month\r\nOctober 2026,11/02/2026,Carlos Gomory,"All incidents, open CAPAs",,2,1,0,5\r\n`);
  });
});
