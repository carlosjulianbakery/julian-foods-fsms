import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ForeignMatterForm624 } from "@/components/forms624/ForeignMatterForm624";
import { ForeignMatterEditor624 } from "@/components/forms624/ForeignMatterEditor624";
import { ForeignMatterRecordsTable624, type ForeignMatterListRow } from "@/components/forms624/ForeignMatterRecordsTable624";
import {
  CurrentForeignMatterNotice624, ForeignMatterSubmittedView624, OpenCurrentForeignMatterButton624,
} from "@/components/forms624/ForeignMatterSubmittedNotice624";
import { FM_PDF, buildForeignMatterPdfHtml624, fmPdfRowHeight, paginateForeignMatter } from "@/components/forms624/pdfBuilders624";
import { TASK_FORM_REGISTRY, getFormLabel } from "@/lib/task-form-registry";
import {
  SEED_ITEMS, buildSnapshot, periodDates, progressOf, submitProblems, viewOfSnapshot, type FmItem, type ItemValues,
} from "@/lib/foreign-matter-624";

/** The 49 items exactly as seeded. */
const LIST: FmItem[] = SEED_ITEMS.map(([section, areaName, name, expectedQuantity], i) => ({ id: `i${i + 1}`, section, areaName, name, expectedQuantity, sortOrder: (i + 1) * 10 }));
const ok = (ids: number[]) => Object.fromEntries(ids.map((n) => [`i${n}`, { itemId: `i${n}`, result: "OK" } as ItemValues]));
/** 12 of 49 checked: ten OK in the first area, both Walk In Fridge items (one Not OK with its comment and found quantity). */
const VALUES: Record<string, ItemValues> = {
  ...ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  i1: { itemId: "i1", result: "OK", comment: "All in place", checkedAt: "2026-11-24T18:05:00.000Z", expectedAtCheck: 58 },
  i18: { itemId: "i18", result: "NOT_OK", comment: "Bulb cracked, replaced", foundQuantity: 0, checkedAt: "2026-11-24T18:10:00.000Z" },
  i19: { itemId: "i19", result: "OK" },
};
const ALL: Record<string, ItemValues> = { ...ok(LIST.map((_, i) => i + 1)), i18: VALUES.i18 };
const count = (html: string, needle: string) => html.split(needle).length - 1;
const esc = (s: string) => s.replace(/&/g, "&amp;");

function form(items: FmItem[], values: Record<string, ItemValues>, over: Partial<Parameters<typeof ForeignMatterForm624>[0]> = {}) {
  return renderToStaticMarkup(
    <ForeignMatterForm624
      periodLabel={periodDates("2026-11-B")} date="2026-11-24" time="10:05" initials="HA"
      items={items} values={values} progress={progressOf(items, values)} problems={submitProblems(items, values, "HA")} {...over}
    />,
  );
}
function card(html: string, id: string) {
  const start = html.indexOf(`data-item="${id}"`);
  const next = html.indexOf("data-item=", start + 10);
  return html.slice(start, next === -1 ? undefined : next);
}
function areaBlock(html: string, name: string, nth = 0) {
  let start = -1;
  for (let k = 0; k <= nth; k++) start = html.indexOf(`data-area="${esc(name)}"`, start + 1);
  const next = html.indexOf("data-area=", start + 10);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("the form (real component)", () => {
  const html = form(LIST, VALUES);

  it("header with initials prefilled once at the top, the overall counter and a submit button; no Verified By, no per-item initials", () => {
    expect(html).toContain('value="HA"');
    expect(html).toContain("12 of 49 checked");
    expect(html).toContain("11 OK · 1 Not OK");
    expect(html).toContain("November 16–30, 2026");
    expect(html).toContain("Submit inspection");
    expect(html).not.toMatch(/Verified By/i);
    expect(html).not.toContain('placeholder="Init"');
  });

  it("two fixed sections in order, with the areas as collapsible groups showing their own progress", () => {
    expect(Array.from(html.matchAll(/data-section="([^"]+)"/g)).map((m) => m[1])).toEqual(["glass_brittle", "knives_blades"]);
    expect(html.indexOf(">Glass and Brittle</h2>")).toBeLessThan(html.indexOf(">Knives and Blades</h2>"));
    expect(Array.from(html.matchAll(/<details open="" class="card p-3" data-area="([^"]+)"/g)).map((m) => m[1])).toEqual([
      "Production and Storage Area", "Walk In Fridge", "Air Compressor", "Ovens", "Bread Freezer at 3021", "Cameras", "Timers and Scales",
      "Restroom and Handwash Station", "Production Tools", "Machine Screens", "Production and Storage Area",
    ]);
    expect(areaBlock(html, "Walk In Fridge")).toMatch(/>Walk In Fridge<\/span><span[^>]*data-area-progress="true">2 of 2<\/span>/);
    expect(areaBlock(html, "Walk In Fridge")).toContain(">1 Not OK</span>");
    expect(areaBlock(html, "Production and Storage Area")).toMatch(/data-area-progress="true">10 of 17</);
    expect(areaBlock(html, "Production and Storage Area", 1)).toMatch(/data-area-progress="true">0 of 3</); // the Knives and Blades area
    expect(areaBlock(html, "Machine Screens")).toMatch(/data-area-progress="true">0 of 8</);
  });

  it("all 49 items, numbered automatically, each with its name, 'Expected: <quantity>', OK / Not OK and a comment", () => {
    expect(count(html, "data-item=")).toBe(49);
    expect(Array.from(html.matchAll(/w-7 shrink-0">#(\d+)</g)).map((m) => Number(m[1]))).toEqual(Array.from({ length: 49 }, (_, k) => k + 1));
    for (const [, , name, quantity] of SEED_ITEMS) expect(html, name).toContain(`>${esc(name)}</p><p class="text-xs text-gray-500" data-expected="true">Expected: <span class="font-mono font-semibold text-gray-700">${quantity}</span>`);
    expect(count(html, ">OK</button>")).toBe(49);
    expect(count(html, ">Not OK</button>")).toBe(49);
    expect(count(html, 'aria-label="Comment for ')).toBe(49);
    expect(card(html, "i49")).toContain(">Knife</p>");
    expect(card(html, "i1")).toContain("#1<");
    expect(card(html, "i47")).toContain("#47<"); // numbering carries on into the second section
  });

  it("the chosen answer is highlighted; an unanswered item has neither", () => {
    expect(card(html, "i1")).toMatch(/bg-emerald-600 text-white[^>]*>OK<\/button>/);
    expect(card(html, "i18")).toMatch(/bg-red-600 text-white[^>]*>Not OK<\/button>/);
    const pending = card(html, "i30");
    expect(pending).toContain('data-result="pending"');
    expect(pending).not.toContain("bg-emerald-600 text-white");
    expect(pending).not.toContain("bg-red-600 text-white");
  });

  it("a Not OK requires a comment and offers an optional found quantity; an OK has an optional comment and no found quantity", () => {
    const notOk = card(html, "i18");
    expect(notOk).toContain("Comment (required for a Not OK)");
    expect(notOk).toContain('value="Bulb cracked, replaced"');
    expect(notOk).toContain("Quantity found (optional)");
    expect(notOk).toMatch(/aria-label="Quantity found for Light Bulbs"[^>]*value="0"/);
    expect(notOk).toMatch(/type="number"[^>]*min="0"[^>]*step="1"/);
    const fine = card(html, "i1");
    expect(fine).toContain("Comment (optional)");
    expect(fine).not.toContain("Quantity found");
    expect(count(html, "Quantity found (optional)")).toBe(1);
    expect(card(html, "i30")).not.toContain("Quantity found");
  });

  it("the automatic checked-at time is shown in Pacific time", () => {
    expect(card(html, "i1")).toContain("Checked 11/24/2026, 10:05 AM PT");
    expect(card(html, "i18")).toContain("Checked 11/24/2026, 10:10 AM PT");
    expect(card(html, "i30")).not.toContain("Checked ");
  });

  it("'Mark all OK' is offered on every area that still has unchecked items, and not on a finished one", () => {
    expect(count(html, "data-mark-all-ok")).toBe(10); // eleven areas, Walk In Fridge is complete
    expect(areaBlock(html, "Walk In Fridge")).not.toContain("Mark all OK");
    expect(areaBlock(html, "Production and Storage Area")).toContain(">Mark all OK</button>");
    expect(form(LIST, ALL)).not.toContain("Mark all OK");
  });

  it("the hint appears when the expected quantity changed after the item was checked, and the result is kept", () => {
    const changed = LIST.map((i) => (i.id === "i1" ? { ...i, expectedQuantity: 60 } : i));
    const withHint = form(changed, VALUES);
    expect(card(withHint, "i1")).toContain("Expected quantity changed since this was checked");
    expect(card(withHint, "i1")).toContain("Expected: <span class=\"font-mono font-semibold text-gray-700\">60</span>");
    expect(card(withHint, "i1")).toMatch(/bg-emerald-600 text-white[^>]*>OK<\/button>/);
    expect(count(withHint, "data-quantity-changed")).toBe(1);
    expect(html).not.toContain("data-quantity-changed");
  });

  it("what is missing is listed by area in plain words and the submit button is disabled until it is fixed", () => {
    expect(html).toContain("Before you can submit:");
    expect(html).toContain("Glass and Brittle, Production and Storage Area: Tape Dispenser needs OK or Not OK.");
    expect(html).toMatch(/…and \d+ more\./);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit inspection/);
    const missingComment = form(LIST, { ...ALL, i18: { itemId: "i18", result: "NOT_OK" } });
    expect(missingComment).toContain("Walk In Fridge: Light Bulbs is Not OK and needs a comment.");
    expect(missingComment).toMatch(/<button[^>]*disabled=""[^>]*>Submit inspection/);
  });

  it("a Not OK with its comment does not block submission", () => {
    const ready = form(LIST, ALL);
    expect(ready).toContain("49 of 49 checked");
    expect(ready).toContain("48 OK · 1 Not OK");
    expect(ready).not.toContain("Before you can submit:");
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit inspection/);
  });

  it("read-only view of a submitted record: everything shown from the snapshot, nothing editable", () => {
    const view = viewOfSnapshot(buildSnapshot(LIST, ALL).items);
    const ro = form(view.items, view.values, { readOnly: true, problems: [] });
    expect(ro).not.toContain("<input");
    expect(ro).not.toContain("Submit inspection");
    expect(ro).not.toContain("Mark all OK");
    expect(count(ro, "data-item=")).toBe(49);
    expect(card(ro, "i18")).toContain(">Not OK</span>");
    expect(card(ro, "i18")).toContain("Bulb cracked, replaced");
    expect(card(ro, "i18")).toMatch(/Quantity found \(optional\)<\/span><span[^>]*>0<\/span>/);
    expect(card(ro, "i1")).toContain("Expected: <span class=\"font-mono font-semibold text-gray-700\">58</span>");
  });
});

describe("edit mode (real components)", () => {
  const noop = () => {};
  const handlers = { onAdd: noop, onRename: noop, onQuantity: noop, onArea: noop, onSection: noop, onRetire: noop, onMove: noop, onRenameArea: noop, onRetireArea: noop };
  const html = renderToStaticMarkup(<ForeignMatterEditor624 items={LIST} {...handlers} />);

  it("every item can be renamed, re-counted, moved to another area or section, reordered and retired — never deleted", () => {
    expect(count(html, 'aria-label="Name of area ')).toBe(11);
    expect(count(html, 'aria-label="Name of ') - 11).toBe(49);
    expect(count(html, 'aria-label="Expected quantity of ')).toBe(49);
    expect(count(html, 'aria-label="Area of ')).toBe(49);
    expect(count(html, 'aria-label="Section of ')).toBe(49);
    expect(count(html, 'aria-label="Move ')).toBe(98);
    expect(count(html, ">Retire</button>")).toBe(49);
    expect(html).not.toContain("Delete");
    expect(html).toMatch(/aria-label="Expected quantity of Shatter Proof Lamps"[^>]*value="58"/);
    expect(html).toMatch(/aria-label="Area of Knife"[^>]*value="Production and Storage Area"/);
    expect(html).toContain("Changes are saved immediately and stay for all future forms.");
  });

  it("every area can be renamed and retired, and shows how many items it has", () => {
    expect(count(html, ">Retire area</button>")).toBe(11);
    expect(html).toMatch(/aria-label="Name of area Walk In Fridge"[^>]*value="Walk In Fridge"/);
    const fridge = html.slice(html.indexOf('data-editor-area="Walk In Fridge"'), html.indexOf('data-editor-area="Air Compressor"'));
    expect(fridge).toContain(">2 items</span>");
    expect(html.slice(html.indexOf('data-editor-area="Cameras"'), html.indexOf('data-editor-area="Timers and Scales"'))).toContain(">1 item</span>");
  });

  it("an area can be picked from its section's areas or typed new; a new item needs section, area, name and quantity", () => {
    expect(html).toContain('<datalist id="foreign-matter-areas-glass_brittle">');
    expect(html).toContain('<datalist id="foreign-matter-areas-knives_blades"><option value="Production and Storage Area"></option></datalist>');
    expect(count(html, '<option value="Machine Screens"></option>')).toBe(1);
    for (const label of ["Section", "Area (pick one or type a new name)", "New item: name", "Expected quantity", "Add item"]) expect(html).toContain(label);
    expect(html).toContain('<option value="glass_brittle" selected="">Glass and Brittle</option><option value="knives_blades">Knives and Blades</option>');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Add item<\/button>/); // waits for a name
  });

  it("the first item of an area cannot move up, the last cannot move down", () => {
    expect(html).toMatch(/aria-label="Move Shatter Proof Lamps up" disabled=""/);
    expect(html).toMatch(/aria-label="Move Blackboard down" disabled=""/);
    expect(html).toMatch(/aria-label="Move Site Cameras up" disabled=""/);
    expect(html).toMatch(/aria-label="Move Site Cameras down" disabled=""/);
    expect(html).not.toMatch(/aria-label="Move Door Window up" disabled=""/);
  });

  it("the form with the editor open shows both, and server errors are shown", () => {
    const withEditor = form(LIST, VALUES, { children: <ForeignMatterEditor624 items={LIST} error='There is already an item called "Clock" in Production and Storage Area.' {...handlers} /> });
    expect(withEditor.indexOf("data-list-editor")).toBeLessThan(withEditor.indexOf('data-section="glass_brittle"'));
    expect(withEditor).toContain("There is already an item called &quot;Clock&quot; in Production and Storage Area.");
    expect(count(withEditor, "data-item=")).toBe(49);
  });
});

describe("records page pieces (real components)", () => {
  const row = (period: string, status: string, over: Partial<ForeignMatterListRow> = {}): ForeignMatterListRow => ({
    id: `rec-${period}`, period, status, conductedBy: "Hugo Ayala", initials: "HA", okCount: 48, failCount: 1,
    submittedAt: status === "submitted" ? "2026-11-24T20:03:00.000Z" : null, submittedBy: status === "submitted" ? { name: "Hugo Ayala" } : null, ...over,
  });
  const rows = [row("2026-12-A", "draft", { okCount: 5, failCount: 0 }), row("2026-11-B", "submitted"), row("2026-11-A", "submitted", { submittedAt: "2026-11-16T07:30:00.000Z" })];
  const table = (isAdmin: boolean) => renderToStaticMarkup(<ForeignMatterRecordsTable624 rows={rows} isAdmin={isAdmin} onView={() => {}} onPdf={() => {}} onDelete={() => {}} />);
  const header = (today: string) =>
    renderToStaticMarkup(
      <div>
        <OpenCurrentForeignMatterButton624 rows={rows} today={today} onOpen={() => {}} />
        <CurrentForeignMatterNotice624 rows={rows} today={today} onView={() => {}} />
      </div>,
    );

  it("the list is the log: period as dates, status, submitted on, submitted by, OK and Not OK counts; delete for admins only", () => {
    const html = table(false);
    for (const head of ["Period", "Status", "Submitted on", "Submitted by", "OK", "Not OK"]) expect(html).toContain(`>${head}</th>`);
    for (const text of ["November 16–30, 2026", "November 1–15, 2026", "December 1–15, 2026", "11/24/2026, 12:03 PM PT", "11/15/2026, 11:30 PM PT", "Hugo Ayala", ">48</td>", "Continue"]) expect(html, text).toContain(text);
    expect(count(html, "> PDF</button>")).toBe(3);
    expect(html).not.toContain("Delete");
    expect(count(table(true), 'aria-label="Delete record')).toBe(3);
  });

  it("current period already submitted: only the notice — no button at all", () => {
    const html = header("2026-11-27");
    expect(OpenCurrentForeignMatterButton624({ rows, today: "2026-11-27", onOpen: () => {} })).toBeNull();
    expect(html).not.toContain("Open current form");
    expect(html).not.toContain("disabled");
    expect(html).toContain("The November 16–30, 2026 inspection was submitted on 11/24/2026 by Hugo Ayala.");
    expect(html).toContain(">View that record</button>");
    expect(html).toContain("The next form, for December 1–15, 2026, opens on Tuesday, December 1, 2026 (Pacific time).");
    expect(count(html, "<button")).toBe(1);
    expect(header("2026-11-30")).toContain("data-period-submitted"); // through the last day
  });

  it("current period not submitted: the normal button, which opens the form, and no notice", () => {
    const html = header("2026-12-01"); // only a draft exists for December A
    expect(html).toContain(">Open current form</button>");
    expect(html).not.toContain("was submitted");
    const onOpen = vi.fn();
    (OpenCurrentForeignMatterButton624({ rows, today: "2026-12-20", onOpen }) as ReactElement<{ onClick: () => void }>).props.onClick();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("the form route, when that period is already submitted, shows the same explanation instead of a form", () => {
    const html = renderToStaticMarkup(<ForeignMatterSubmittedView624 info={{ period: "2026-11-B", submittedAt: "2026-11-24T20:03:00Z", submittedBy: "Hugo Ayala" }} onView={() => {}} onRecords={() => {}} />);
    expect(html).toContain("The November 16–30, 2026 inspection was submitted on 11/24/2026 by Hugo Ayala.");
    expect(html).toContain(">View Records</button>");
    expect(html).not.toContain("Submit inspection");
  });
});

describe("PDF", () => {
  const snap = buildSnapshot(LIST, { ...ALL, i2: { itemId: "i2", result: "OK", comment: "Frame <chipped> & repainted", checkedAt: "2026-11-24T18:05:00.000Z" } });
  const record = {
    period: "2026-11-B", status: "submitted", conductedBy: "Hugo Ayala", initials: "HA", listVersion: 3, notes: null,
    items: [...snap.items, { kind: "header", date: "2026-11-24", time: "10:05" }],
    okCount: snap.okCount, failCount: snap.failCount, submittedAt: "2026-11-24T19:30:00.000Z",
  };
  const pdf = buildForeignMatterPdfHtml624(record);
  const pagesHtml = pdf.split('<div class="page"').slice(1);

  it("shows the period, date, initials, both sections, the areas, and for every item its expected quantity, result, found quantity and comment", () => {
    for (const text of [
      "Foreign Matter Inspection — 624", "Period: November 16–30, 2026", "Date: 11/24/2026 10:05", "Initials: HA", "48 OK · 1 Not OK",
      "Glass and Brittle: 46 · Knives and Blades: 3", ">Glass and Brittle</h2>", ">Knives and Blades</h2>",
      "<th style=\"width:9%\">Expected</th>", "<th style=\"width:8%\">Found</th>", "Bulb cracked, replaced", "List v3", "By: Hugo Ayala (HA)", "Submitted: 11/24/2026, 11:30:00 AM PT",
    ]) expect(pdf, text).toContain(text);
    for (const area of ["Production and Storage Area", "Walk In Fridge", "Air Compressor", "Ovens", "Bread Freezer at 3021", "Cameras", "Timers and Scales", "Restroom and Handwash Station", "Production Tools", "Machine Screens"])
      expect(pdf, area).toMatch(new RegExp(`<h3[^>]*>${area}( \\(continued\\))?</h3>`));
    for (const [, , name] of SEED_ITEMS) expect(pdf, name).toContain(`<b>${esc(name)}</b>`);
    expect(pdf).toMatch(/<tr data-row="1"[^>]*>\s*<td class="n">1<\/td>\s*<td><b>Shatter Proof Lamps<\/b><\/td>\s*<td class="n">58<\/td>/);
    expect(pdf).toMatch(/<td><b>Light Bulbs<\/b><\/td>\s*<td class="n">1<\/td>\s*<td><span[^>]*>Not OK<\/span><\/td>\s*<td class="n">0<\/td>\s*<td>Bulb cracked, replaced<\/td>/);
    expect(count(pdf, '<span style="color:#dc2626;font-weight:600">Not OK</span>')).toBe(1);
    expect(pdf).not.toContain("DRAFT");
    expect(pdf).toContain("Frame &lt;chipped&gt; &amp; repainted"); // typed text is escaped
  });

  it("all 49 rows are there, each exactly once, in order", () => {
    expect(Array.from(pdf.matchAll(/data-row="(\d+)"/g)).map((m) => Number(m[1]))).toEqual(Array.from({ length: 49 }, (_, k) => k + 1));
  });

  it("no row is ever cut by a page break: the record is laid out as whole pages, and every row sits inside one page", () => {
    const pages = paginateForeignMatter(snap.items);
    expect(pages.length).toBeGreaterThan(1); // 49 rows do not fit on one page
    expect(pagesHtml).toHaveLength(pages.length);
    // each page is a block exactly one A4 page tall, so the exporter's cuts fall between pages, never inside one
    expect(pdf).toContain(`.page { position: relative; box-sizing: border-box; width: 794px; height: ${FM_PDF.pageHeight}px;`);
    expect(FM_PDF.pageHeight).toBeCloseTo((794 * 297) / 210, 0);
    for (const [n, p] of pages.entries()) {
      expect(p.used, `page ${n + 1}`).toBeLessThanOrEqual(p.capacity); // what is placed on a page fits on it
      expect(p.blocks.some((b) => b.kind === "area" && b.rows.length > 0)).toBe(true);
      // a heading is never left alone at the foot of a page
      const last = p.blocks[p.blocks.length - 1];
      expect(last.kind === "area" && last.rows.length > 0, `page ${n + 1} ends with rows`).toBe(true);
    }
    // every row is on exactly one page, as a whole <tr>
    const rowsPerPage = pagesHtml.map((h) => count(h, "<tr data-row="));
    expect(rowsPerPage.reduce((a, b) => a + b, 0)).toBe(49);
    for (const h of pagesHtml) expect(count(h, "<tr data-row=")).toBe(count(h, "</tr>") - count(h, "<thead><tr"));
    expect(pdf).toContain("tr { page-break-inside: avoid; break-inside: avoid; }");
    expect(pdf).toContain(`Page 1 of ${pages.length}`);
    expect(pdf).toContain(`Page ${pages.length} of ${pages.length}`);
  });

  it("an area that continues on the next page repeats its heading; long comments make rows taller and are still kept whole", () => {
    const long = "The lens is cracked along the lower edge and the housing is loose; taped off and reported to maintenance for replacement this week. ".repeat(2).trim();
    const heavy = buildSnapshot(LIST, Object.fromEntries(LIST.map((i) => [i.id, { itemId: i.id, result: "NOT_OK", comment: long, foundQuantity: 0 } as ItemValues])));
    const pages = paginateForeignMatter(heavy.items);
    expect(pages.length).toBeGreaterThan(paginateForeignMatter(snap.items).length);
    for (const p of pages) expect(p.used).toBeLessThanOrEqual(p.capacity);
    expect(pages.flatMap((p) => p.blocks).filter((b) => b.kind === "area").reduce((n, b) => n + (b.kind === "area" ? b.rows.length : 0), 0)).toBe(49);
    expect(pages.flatMap((p) => p.blocks).some((b) => b.kind === "area" && b.continued)).toBe(true);
    expect(buildForeignMatterPdfHtml624({ ...record, items: heavy.items })).toContain("Production and Storage Area (continued)</h3>");
    expect(fmPdfRowHeight({ name: "Clock", comment: long })).toBeGreaterThan(fmPdfRowHeight({ name: "Clock", comment: "" }) * 4);
    expect(fmPdfRowHeight({ name: "Clock", comment: "" })).toBe(FM_PDF.rowPadding + FM_PDF.lineHeight);
  });

  it("a draft says so; an empty record still renders; later list changes do not change a submitted record's PDF", () => {
    expect(buildForeignMatterPdfHtml624({ ...record, status: "draft", submittedAt: null })).toContain("DRAFT — not yet submitted");
    expect(buildForeignMatterPdfHtml624({ period: "2026-11-B", status: "draft", conductedBy: "", initials: "", listVersion: 1, notes: null, items: [], okCount: 0, failCount: 0, submittedAt: null })).toContain("No items recorded.");
    LIST[0].expectedQuantity = 99; LIST[0].name = "Renamed later";
    expect(buildForeignMatterPdfHtml624(record)).toBe(pdf);
    LIST[0].expectedQuantity = 58; LIST[0].name = "Shatter Proof Lamps";
  });
});

describe("registry, sidebar and no escape sequences", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
  it("the form is registered under foreign_matter_624 with its label and route", () => {
    expect(getFormLabel("foreign_matter_624")).toBe("Foreign Matter Inspection (624)");
    expect(TASK_FORM_REGISTRY.foreign_matter_624.href("any")).toBe("/dashboard/supervisor/foreign-matter-624");
  });
  it("the sidebar has the entry for supervisors and admins", () => {
    const sidebar = read("../../layout/Sidebar.tsx");
    const at = sidebar.indexOf('label: "Foreign Matter Inspection - 624"');
    expect(at).toBeGreaterThan(-1);
    const entry = sidebar.slice(at, sidebar.indexOf("},", at));
    expect(entry).toContain('href: "/dashboard/supervisor/foreign-matter-624"');
    expect(entry).toContain('roles: ["SUPERVISOR", "ADMIN"]');
  });
  it("the new files contain real characters, never \\u escapes", () => {
    const files = [
      "../ForeignMatterForm624.tsx", "../ForeignMatterEditor624.tsx", "../ForeignMatterRecordsTable624.tsx", "../ForeignMatterSubmittedNotice624.tsx",
      "../../../lib/foreign-matter-624.ts", "../../../lib/foreign-matter-624-server.ts",
      "../../../app/(dashboard)/dashboard/supervisor/foreign-matter-624/page.tsx", "../../../app/(dashboard)/dashboard/supervisor/foreign-matter-624/records/page.tsx",
      "../../../app/api/foreign-matter-624/route.ts", "../../../app/api/foreign-matter-624/[id]/route.ts", "../../../app/api/foreign-matter-624/[id]/submit/route.ts",
      "../../../app/api/foreign-matter-624/items/route.ts", "../../../app/api/foreign-matter-624/items/[id]/route.ts", "../../../app/api/foreign-matter-624/areas/route.ts",
    ];
    for (const f of files) expect(read(f), f).not.toMatch(/\\u[0-9a-fA-F]{4}/);
    const pdf = read("../pdfBuilders624.ts");
    expect(pdf.slice(pdf.indexOf("Foreign Matter Inspection (twice a month)"))).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });
});
