import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { FM_PDF } from "@/components/forms624/pdfBuilders624";
import {
  Q_PDF, buildQualityPdfHtml, paginateBlocks, pdfCapacity, pdfContentWidth, qualityPdfBlocks, qualityPdfPages, textWidth, wrapText, type PdfBlock, type QualityPdfEvent, type QualityPdfInput,
} from "@/lib/quality-pdf";
import type { AttachmentRow } from "@/lib/quality";

const NAMES = { carlos: "Carlos Gomory", chris: "Chris Pence", "prod-1": "Keto Thin Bread" };
const event = (i: number, over: Partial<QualityPdfEvent> = {}): QualityPdfEvent => ({
  action: "updated", userName: "Carlos Gomory", createdAt: new Date(Date.UTC(2026, 10, 21, 18, 0) - i * 3_600_000).toISOString(),
  changes: [{ field: "customer", from: `Customer ${i}`, to: `Customer ${i + 1}` }], note: null, ...over,
});
const file = (i: number, over: Partial<AttachmentRow> = {}): AttachmentRow => ({
  id: `att-${i}`, kind: "evidence", fileName: `photo-${i}.jpg`, fileSize: 2_000_000, mimeType: "image/jpeg", description: `Photo number ${i}`, uploadedAt: "2026-11-21T18:00:00Z",
  uploadedByName: "Carlos Gomory", removedAt: null, removedByName: "", removeReason: null, ...over,
});
const incident = (over: Partial<QualityPdfInput> & { fields?: Record<string, unknown> } = {}): QualityPdfInput => ({
  type: "incident",
  record: {
    id: "inc-1", reference: "CI-2026-004", facility: null, dateReceived: "2026-11-20", channel: "email", customer: "Whole Foods, Carlsbad", productId: "prod-1", productName: "Keto Thin Bread",
    lotCode: "L-2211", bestByDate: "2027-01-05", description: "Customer found a piece of blue plastic in a loaf.", category: "foreign_matter", foodSafetyConcern: true,
    immediateAction: "Held the rest of the lot.", responseDate: "2026-11-21", responseChannel: "phone", responseSummary: "Apologised and sent a refund.", capaRequired: true, noCapaReason: "",
    status: "open", closedDate: null, closedById: null, voidedAt: null, voidedById: null, voidReason: null, createdById: "carlos", updatedById: "carlos",
    createdAt: "2026-11-21T07:30:00.000Z", updatedAt: "2026-11-21T19:05:00.000Z", ...(over.fields ?? {}),
  },
  names: NAMES, linked: [{ reference: "CAPA-2026-002", status: "in_progress" }], attachments: [file(1)], events: [event(0, { action: "created", changes: [{ field: "category", from: null, to: "foreign_matter" }] })],
  generatedAt: "2026-11-22T17:15:00.000Z", generatedBy: "Carlos Gomory", ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "fields")),
});
const capa = (over: Partial<QualityPdfInput> & { fields?: Record<string, unknown> } = {}): QualityPdfInput => ({
  type: "capa",
  record: {
    id: "capa-1", reference: "CAPA-2026-002", facility: "624", source: "customer_incident", problem: "Plastic in a loaf.", rootCause: "A torn liner on line 2.", correctiveAction: "Replaced the liners.",
    preventiveAction: "Liner check added to the weekly list.", ownerId: "chris", dueDate: "2026-12-15", effectivenessDate: "2026-12-20", effectivenessResult: "No repeat in four weeks.",
    status: "closed", closedDate: "2026-12-21", closedById: "carlos", closedByName: "Carlos Gomory", voidedAt: null, voidedById: null, voidReason: null, createdById: "carlos",
    createdAt: "2026-11-21T18:00:00.000Z", updatedAt: "2026-12-21T18:00:00.000Z", ...(over.fields ?? {}),
  },
  names: NAMES, linked: [{ reference: "CI-2026-003", status: "closed" }, { reference: "CI-2026-004", status: "under_review" }], attachments: [],
  events: [event(0, { action: "closed", changes: [{ field: "status", from: "verifying", to: "closed" }] })],
  generatedAt: "2026-12-22T17:15:00.000Z", generatedBy: "Chris Pence", ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "fields")),
});
const LONG = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}: the customer explained what happened in detail, including where the product was bought, how it was stored and what was found inside the package when it was opened at home.`).join("\n");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const pageHtml = (html: string, n: number) => { const a = html.indexOf(`data-page="${n}"`); const b = html.indexOf(`data-page="${n + 1}"`, a); return html.slice(a, b < 0 ? undefined : b); };

/** The rules every layout must keep, whatever the record holds. */
function expectSoundLayout(p: QualityPdfInput) {
  const blocks = qualityPdfBlocks(p);
  const pages = qualityPdfPages(p);
  for (const pg of pages) {
    // nothing is taller than the page: every block is whole on its page
    expect(pg.used).toBeLessThanOrEqual(pdfCapacity);
    expect(pg.used).toBe(pg.items.reduce((sum, i) => sum + i.height, 0));
    // a heading is never the last thing on a page
    expect(["section", "tableHead", "repeat"]).not.toContain(pg.items[pg.items.length - 1].kind);
  }
  // every block is on exactly one page, in order; nothing is lost and nothing is cut in two
  expect(pages.flatMap((pg) => pg.items.filter((i) => i.kind !== "repeat").map((i) => i.text))).toEqual(blocks.map((b) => b.text));
  // a page that starts inside a table repeats the table's title and column headings
  pages.forEach((pg, n) => {
    const first = pg.items[0];
    const previous = n > 0 ? pages[n - 1].items[pages[n - 1].items.length - 1] : null;
    if (previous && first.kind !== "repeat" && first.group?.startsWith("table:") && previous.group === first.group) throw new Error("a table went on to a new page without its heading");
    if (first.kind === "repeat") { expect(first.text).toContain("(continued)"); expect(previous?.group).toBe(first.group); expect(pg.items[1].group).toBe(first.group); }
  });
  return { blocks, pages };
}

describe("the page geometry is the Foreign Matter builder's", () => {
  it("same A4 page block, padding and footer; every page of the HTML is exactly one page tall", () => {
    expect([Q_PDF.pageHeight, Q_PDF.padding, Q_PDF.footerHeight]).toEqual([FM_PDF.pageHeight, FM_PDF.padding, FM_PDF.footerHeight]);
    expect(pdfCapacity).toBe(FM_PDF.pageHeight - 2 * FM_PDF.padding - FM_PDF.footerHeight);
    const html = buildQualityPdfHtml(incident());
    expect(html).toContain(`.page { position: relative; box-sizing: border-box; width: 794px; height: ${FM_PDF.pageHeight}px;`);
    expect(html).toContain("overflow: hidden; page-break-after: always;");
  });
  it("the builder's source is written with real characters: no \\u sequences", () => {
    const src = readFileSync(resolve(__dirname, "../quality-pdf.ts"), "utf8");
    expect(src).not.toMatch(/\\u[0-9a-fA-F{]/);
    for (const ch of ["—", "→"]) expect(src).toContain(ch);
  });
});

describe("wrapping text", () => {
  it("no line is wider than its column, whatever the text: long words, capitals, addresses, accents", () => {
    const texts = [LONG, "W".repeat(400), "https://example.com/" + "a/very/long/path/".repeat(30), "MMMM WWWW @@@@ ".repeat(40), "Café Münster — señor ".repeat(50), "短い日本語のテキスト".repeat(30)];
    for (const text of texts) for (const [width, font, bold] of [[506, 11, false], [100, 10, false], [270, 10, false], [708, 11, true]] as const) {
      const lines = wrapText(text, width, font, bold);
      for (const line of lines) expect(textWidth(line, font, bold)).toBeLessThanOrEqual(width);
      // nothing is dropped: the same characters, in the same order
      expect(lines.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
    }
  });
  it("line breaks typed by the person are kept, an empty value is one empty line", () => {
    expect(wrapText("First.\n\nSecond.\r\nThird.", 500, 11)).toEqual(["First.", "", "Second.", "Third."]);
    expect(wrapText("", 500, 11)).toEqual([""]);
    expect(wrapText(null, 500, 11)).toEqual([""]);
    expect(wrapText("\n\n  padded  \n\n", 500, 11)).toEqual(["padded"]);
  });
});

describe("a short incident", () => {
  const p = incident();
  const html = buildQualityPdfHtml(p);
  it("fits on one page, with the content in the required order", () => {
    expect(expectSoundLayout(p).pages).toHaveLength(1);
    expect(count(html, 'class="page"')).toBe(1);
    const order = ["CI-2026-004", "Customer Incident", "OPEN", ">The incident<", ">Response to the customer<", ">Closure<", ">Linked CAPA<", ">Attachments (1)<", ">History (1)<", "Generated "];
    const at = order.map((x) => html.indexOf(x, html.indexOf("<body>")));
    expect(at.every((x) => x > 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
  it("shows the record's fields as on the record page, dates as MM/DD/YYYY", () => {
    for (const [label, value] of [
      ["Date received", "11/20/2026"], ["How it came in", "Email"], ["Customer or account", "Whole Foods, Carlsbad"], ["Facility", "Company-wide"], ["Product", "Keto Thin Bread"], ["Lot code", "L-2211"],
      ["Best-by date", "01/05/2027"], ["What happened", "Customer found a piece of blue plastic in a loaf."], ["Category", "Foreign matter"], ["Food safety concern", "Yes"],
      ["Immediate action taken", "Held the rest of the lot."], ["Response date", "11/21/2026"], ["Response channel", "Phone"], ["Response summary", "Apologised and sent a refund."],
    ]) expect(html, label).toContain(`<td class="k">${label}</td><td class="v">${value}</td>`);
    expect(html).toContain("FOOD SAFETY CONCERN");
    expect(html).toContain("Record type: Customer Incident  |  Status: Open  |  Facility: Company-wide");
  });
  it("closure: not closed yet, with the decisions closing depends on", () => {
    const closure = html.slice(html.indexOf(">Closure<"), html.indexOf(">Linked CAPA<"));
    expect(closure).toContain('<td class="k">Closed date</td><td class="v">Not closed</td>');
    expect(closure).toContain('<td class="k">Category</td><td class="v">Foreign matter</td>');
    expect(closure).toContain('<td class="k">Response date</td><td class="v">11/21/2026</td>');
    expect(closure).toContain('<td class="k">CAPA decision</td><td class="v">A CAPA is linked: CAPA-2026-002</td>');
    expect(closure).not.toContain("Reason no CAPA is needed");
  });
  it("linked records: the reference and its status only", () => {
    const linked = html.slice(html.indexOf(">Linked CAPA<"), html.indexOf(">Attachments (1)<"));
    expect(linked).toContain('<div class="l">CAPA-2026-002</div>');
    expect(linked).toContain('<div class="l">Action in progress</div>');
    expect(linked).not.toContain("Plastic");
  });
  it("history: date and time in Pacific, person, action, field: from → to, note", () => {
    const history = html.slice(html.indexOf(">History (1)<"));
    for (const heading of ["Date and time (PT)", "Person", "Action", "Field: from → to", "Note"]) expect(history).toContain(`<th>${heading}</th>`);
    expect(history).toContain('<div class="l">11/21/2026, 10:00 AM PT</div>');
    expect(history).toContain('<div class="l">Carlos Gomory</div>');
    expect(history).toContain('<div class="l">Created</div>');
    expect(history).toContain('<div class="l">Category: (empty) → Foreign matter</div>');
  });
  it("footer: who generated it and when (Pacific), and the page number", () => {
    expect(html).toContain("Generated 11/22/2026, 9:15 AM PT by Carlos Gomory");
    expect(html).toContain("Page 1 of 1");
    expect(html).not.toContain("VOID");
  });
  it("what the person typed is shown as text, never run as HTML", () => {
    const risky = buildQualityPdfHtml(incident({ fields: { description: '<script>alert("x")</script> & more' } }));
    expect(risky).not.toContain("<script>");
    expect(risky).toContain("&lt;script&gt;alert(\"x\")&lt;/script&gt; &amp; more");
  });
});

describe("dates are Pacific, whatever the server's time zone", () => {
  it("a moment late in the evening Pacific stays on its Pacific day; stored days are not shifted", () => {
    const html = buildQualityPdfHtml(incident({
      generatedAt: "2026-11-23T07:30:00.000Z", fields: { dateReceived: "2026-11-21", createdAt: "2026-11-22T07:59:00.000Z" },
      events: [event(0, { createdAt: "2026-11-22T07:30:00.000Z" })],
      attachments: [file(1, { uploadedAt: "2026-11-22T06:00:00.000Z" })],
    }));
    expect(html).toContain("Generated 11/22/2026, 11:30 PM PT");
    expect(html).toContain("Created 11/21/2026, 11:59 PM PT by Carlos Gomory");
    expect(html).toContain('<div class="l">11/21/2026, 11:30 PM PT</div>');
    expect(html).toContain('<div class="l">11/21/2026, 10:00 PM PT</div>');
    expect(html).toContain('<td class="k">Date received</td><td class="v">11/21/2026</td>');
  });
});

describe("a record with a long history and many attachments", () => {
  const p = incident({
    events: Array.from({ length: 140 }, (_, i) => event(i, i % 9 === 0 ? { note: "Corrected after the call with the customer, who sent a second photo of the label." } : {})),
    attachments: Array.from({ length: 14 }, (_, i) => file(i, i % 3 === 0 ? { removedAt: "2026-11-22T18:00:00Z", removedByName: "Chris Pence", removeReason: "Wrong photo: it shows another lot." } : {})),
  });
  const { blocks, pages } = expectSoundLayout(p);
  const html = buildQualityPdfHtml(p);
  it("paginates: several pages, each exactly one page block, numbered", () => {
    expect(pages.length).toBeGreaterThan(3);
    expect(count(html, 'class="page"')).toBe(pages.length);
    pages.forEach((_, n) => expect(html).toContain(`Page ${n + 1} of ${pages.length}`));
  });
  it("no row is cut: each of the 140 history rows and 14 attachment rows is one whole block on one page", () => {
    expect(blocks.filter((b) => b.group === "table:history")).toHaveLength(140);
    expect(blocks.filter((b) => b.group === "table:attachments")).toHaveLength(14);
    for (let r = 0; r < 140; r++) expect(count(html, `data-row="history:${r}"`)).toBe(1);
    // the height a row is given is the height its lines need
    for (const b of blocks.filter((x) => x.kind === "row")) expect(b.html(false)).toContain(`style="height:${b.height}px"`);
  });
  it("the table heading is repeated on every page the history continues on", () => {
    const historyPages = pages.map((pg, n) => ({ n: n + 1, pg })).filter(({ pg }) => pg.items.some((i) => i.group === "table:history" && i.kind === "row"));
    expect(historyPages.length).toBeGreaterThan(2);
    for (const { n, pg } of historyPages.slice(1)) {
      expect(pg.items[0].kind).toBe("repeat");
      const page = pageHtml(html, n);
      expect(page).toContain('data-continued="history">History (140) (continued)</h3>');
      expect(count(page, 'data-table-head="history"')).toBe(1);
      expect(page.indexOf('data-table-head="history"')).toBeLessThan(page.indexOf('data-row="history:'));
    }
    expect(count(html, 'data-table-head="history"')).toBe(historyPages.length);
  });
  it("removed attachments are marked removed, with who, when and the reason; file contents are not embedded", () => {
    expect(html).toContain(">Attachments (9)<"); // 14 listed, 5 of them removed
    expect(count(html, '<div class="l">Attached</div>')).toBe(9);
    expect(count(html, '<div class="l">REMOVED</div><div class="l">11/22/2026, 10:00 AM PT</div><div class="l">by Chris Pence</div><div class="l">Reason: Wrong photo: it')).toBe(5);
    expect(html).toContain("Reason: Wrong photo: it");
    expect(html).toContain("Chris Pence");
    for (const heading of ["File name", "Kind", "Description", "Uploaded by", "Uploaded (PT)", "State"]) expect(html).toContain(`<th>${heading}</th>`);
    expect(html).toContain('<div class="l">photo-1.jpg (1.9 MB)</div>');
    expect(html).toContain('<div class="l">Evidence</div>');
    for (const never of ["blob.vercel-storage", "<img", "data:image", "/api/quality/attachments"]) expect(html).not.toContain(never);
  });
});

describe("long text flows across pages without cutting a line", () => {
  const p = incident({ fields: { description: LONG, immediateAction: LONG, responseSummary: LONG } });
  const { blocks, pages } = expectSoundLayout(p);
  const html = buildQualityPdfHtml(p);
  it("each line of the text is its own block, so a page break always falls between two lines", () => {
    const lines = blocks.filter((b) => b.group === "field:description");
    expect(lines.length).toBeGreaterThan(100);
    expect(lines.map((b) => b.text).join(" ").replace(/\s+/g, " ")).toBe(LONG.replace(/\s+/g, " "));
    for (const b of lines) expect(textWidth(b.text, Q_PDF.fieldFont)).toBeLessThanOrEqual(pdfContentWidth * (1 - Q_PDF.labelShare) - 10);
    expect(pages.length).toBeGreaterThan(3);
  });
  it("where the text goes on to a new page, its label is repeated with (cont.)", () => {
    const starts = pages.slice(1).filter((pg) => pg.items[0].group === "field:description");
    expect(starts.length).toBeGreaterThan(0);
    expect(count(html, '<td class="k">What happened (cont.)</td>')).toBe(starts.length);
    expect(count(html, '<td class="k">What happened</td>')).toBe(1);
  });
  it("every label fits its column, also with (cont.)", () => {
    for (const input of [p, capa(), incident({ fields: { capaRequired: false, noCapaReason: "Shipping damage only." }, linked: [] })]) {
      const labels = Array.from(buildQualityPdfHtml(input).matchAll(/<td class="k">([^<]+)<\/td>/g)).map((m) => m[1]);
      expect(labels.length).toBeGreaterThan(10);
      for (const label of labels) expect(textWidth(`${label.replace(" (cont.)", "")} (cont.)`, 10, true), label).toBeLessThanOrEqual(pdfContentWidth * Q_PDF.labelShare - 10);
    }
  });
});

describe("a history row too tall for a page", () => {
  it("is continued at a line boundary, in blocks that each fit a page", () => {
    const big = "The whole description was rewritten after the investigation. ".repeat(80);
    const p = incident({ events: [event(0, { changes: [{ field: "description", from: big, to: `${big} Final.` }] }), event(1)] });
    const { blocks } = expectSoundLayout(p);
    const rows = blocks.filter((b) => b.group === "table:history");
    expect(rows.length).toBeGreaterThan(3);
    for (const b of rows) expect(b.height).toBeLessThanOrEqual(Q_PDF.rowPadding + Q_PDF.maxRowLines * Q_PDF.tableLine);
    expect(rows[1].text.startsWith("(continued)")).toBe(true);
  });
});

describe("a void record", () => {
  const p = incident({ fields: { status: "void", voidedAt: "2026-11-22T01:30:00.000Z", voidedById: "chris", voidReason: "Entered twice by mistake: the same complaint is CI-2026-003." } });
  const html = buildQualityPdfHtml(p);
  it("has a clear VOID banner with the reason, who and when, right under the title", () => {
    expectSoundLayout(p);
    expect(html).toContain("data-void-banner>VOID — this record was voided on 11/21/2026, 5:30 PM PT by Chris Pence. It is kept for the record.</div>");
    expect(html).toContain('<div class="void" style="height:25px">Reason: Entered twice by mistake: the same complaint is CI-2026-003.</div>');
    expect(html.indexOf("data-void-banner")).toBeLessThan(html.indexOf(">The incident<"));
    expect(html.indexOf("data-void-banner")).toBeGreaterThan(html.indexOf('class="title"'));
    expect(html).toContain('<span class="badge void">VOID</span>');
    expect(html).toContain("Status: Void");
  });
  it("says VOID in the footer of every page", () => {
    const long = incident({ fields: { ...p.record, description: LONG } });
    const pages = qualityPdfPages(long);
    expect(pages.length).toBeGreaterThan(1);
    expect(count(buildQualityPdfHtml(long), "&nbsp;|&nbsp; VOID &nbsp;|&nbsp;")).toBe(pages.length);
  });
  it("a very long void reason flows like any other text", () => {
    const { blocks } = expectSoundLayout(incident({ fields: { ...p.record, voidReason: LONG } }));
    expect(blocks.filter((b) => b.kind === "banner").length).toBeGreaterThan(60);
  });
});

describe("a CAPA", () => {
  const p = capa();
  const html = buildQualityPdfHtml(p);
  it("has its own sections and fields, the owner by name", () => {
    expectSoundLayout(p);
    expect(html).toContain("Record type: Corrective and Preventive Action (CAPA)  |  Status: Closed  |  Facility: 624");
    for (const title of [">The problem<", ">Actions<", ">Effectiveness check<", ">Closure<", ">Linked incidents (2)<", ">Attachments (0)<", ">History (1)<"]) expect(html).toContain(title);
    for (const [label, value] of [
      ["Source", "Customer incident"], ["The problem", "Plastic in a loaf."], ["Root cause", "A torn liner on line 2."], ["Corrective action", "Replaced the liners."],
      ["Preventive action", "Liner check added to the weekly list."], ["Owner", "Chris Pence"], ["Due date", "12/15/2026"], ["Date of the check", "12/20/2026"], ["Result", "No repeat in four weeks."],
    ]) expect(html, label).toContain(`<td class="k">${label}</td><td class="v">${value}</td>`);
  });
  it("closure: who closed it and when", () => {
    const closure = html.slice(html.indexOf(">Closure<"), html.indexOf(">Linked incidents (2)<"));
    expect(closure).toContain('<td class="k">Status</td><td class="v">Closed</td>');
    expect(closure).toContain('<td class="k">Closed date</td><td class="v">12/21/2026</td>');
    expect(closure).toContain('<td class="k">Closed by</td><td class="v">Carlos Gomory</td>');
  });
  it("linked incidents by reference with their status; no attachments says so; the status change reads in words", () => {
    expect(html).toContain('<div class="l">CI-2026-003</div>');
    expect(html).toContain('<div class="l">Under review</div>');
    expect(html).toContain("No attachments. (File contents are not included in this document.)");
    expect(html).toContain('<div class="l">Status: Verifying effectiveness → Closed</div>');
    expect(html).toContain("Generated 12/22/2026, 9:15 AM PT by Chris Pence");
  });
  it("an incident closed with no CAPA shows the reason; a closed incident shows who closed it", () => {
    const closed = buildQualityPdfHtml(incident({ linked: [], fields: { status: "closed", closedDate: "2026-11-22", closedById: "chris", capaRequired: false, noCapaReason: "Shipping damage only; nothing to correct in production." } }));
    expect(closed).toContain('<td class="k">Closed date</td><td class="v">11/22/2026</td>');
    expect(closed).toContain('<td class="k">Closed by</td><td class="v">Chris Pence</td>');
    expect(closed).toContain('<td class="k">CAPA decision</td><td class="v">No CAPA needed</td>');
    expect(closed).toContain('<td class="k">Reason no CAPA is needed</td><td class="v">Shipping damage only; nothing to correct in production.</td>');
    expect(closed).toContain("No CAPA is linked to this incident.");
  });
});

describe("the page-fitting rule itself", () => {
  const block = (text: string, height: number, over: Partial<PdfBlock> = {}): PdfBlock => ({ kind: "field", text, height, html: (c) => `${text}${c ? "+" : ""}`, ...over });
  it("a block that does not fit moves whole to the next page", () => {
    const pages = paginateBlocks([block("a", 60), block("b", 60), block("c", 60)], 130);
    expect(pages.map((p) => p.items.map((i) => i.text))).toEqual([["a", "b"], ["c"]]);
  });
  it("a heading goes to the next page together with what follows it", () => {
    const pages = paginateBlocks([block("a", 100), block("H", 20, { keepWithNext: true, kind: "section" }), block("b", 30)], 130);
    expect(pages.map((p) => p.items.map((i) => i.text))).toEqual([["a"], ["H", "b"]]);
  });
  it("a group that goes on to a new page gets its repeated heading, and its first block is told it is continued", () => {
    const repeat = { height: 10, text: "T (continued)", html: "T (continued)" };
    const pages = paginateBlocks([block("r1", 60, { group: "t", repeat }), block("r2", 60, { group: "t", repeat }), block("r3", 60, { group: "t", repeat }), block("x", 60, { group: "f" }), block("y", 60, { group: "f" })], 130);
    expect(pages.map((p) => p.items.map((i) => i.html))).toEqual([["r1", "r2"], ["T (continued)", "r3+", "x"], ["y+"]]);
  });
});
