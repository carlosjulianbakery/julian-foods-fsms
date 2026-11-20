import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Verification624Form, ScaleDiagram624 } from "@/components/forms624/Verification624Form";
import { EquipmentEditor624 } from "@/components/forms624/EquipmentEditor624";
import { VerificationRecordsTable624, type VerificationListRow } from "@/components/forms624/VerificationRecordsTable624";
import { buildVerificationPdfHtml624 } from "@/components/forms624/pdfBuilders624";
import { buildSnapshot, progressOf, submitProblems, viewOfSnapshot, INSTRUCTIONS, type Equipment, type ItemValues } from "@/lib/verification-624";

const eq = (id: string, section: Equipment["section"], name: string, sortOrder: number, over: Partial<Equipment> = {}): Equipment =>
  ({ id, section, name, location: section === "scale" ? "624 Garrison" : "", inUse: true, sortOrder, ...over });
const LIST: Equipment[] = [
  eq("p1", "portable_thermometer", "Dial Probe Thermometer", 10),
  eq("p2", "portable_thermometer", "Dial Oven Thermometer", 20),
  eq("p3", "portable_thermometer", "Dial Oven Thermometer #2", 30, { inUse: false }),
  eq("f1", "fixed_thermometer", "Cold Room Thermometer", 10),
  eq("s1", "scale", "Digital Scale", 10),
];
const VALUES: Record<string, ItemValues> = {
  p1: { equipmentId: "p1", reading: 32, checkedAt: "2026-11-20T18:05:00.000Z" },
  p2: { equipmentId: "p2", reading: 36, recheck: 32.2, correctiveAction: "Recalibrated the dial", notes: "Dial was loose" },
  f1: { equipmentId: "f1", referenceId: "p1", target: 38, fixedReading: 39.5 },
  s1: { equipmentId: "s1", points: [1.1, 1.1, 1.25, 1.1, 1.1] },
};
const count = (html: string, needle: string) => html.split(needle).length - 1;

function form(values: Record<string, ItemValues>, over: Partial<Parameters<typeof Verification624Form>[0]> = {}) {
  return renderToStaticMarkup(
    <Verification624Form
      periodLabel="November 2026 · 16–30" date="2026-11-20" time="10:05" initials="HGA"
      equipment={LIST} values={values} progress={progressOf(LIST, values)} problems={submitProblems(LIST, values, "HGA")} {...over}
    />,
  );
}

describe("the form (real component)", () => {
  const html = form(VALUES);

  it("header with initials prefilled once, a progress counter and a submit button", () => {
    expect(html).toContain('value="HGA"');
    expect(html).toContain("4 of 4 verified");
    expect(html).toContain("2 OK · 2 Not OK · 1 not in use");
    expect(html).toContain("Submit verification");
    expect(count(html, 'placeholder="HGA"')).toBe(1); // no per-row initials
  });

  it("instructions: versioned, collapsible, verbatim, with the five-point diagram", () => {
    expect(html).toContain("<details");
    expect(html).toContain("(v1.0)");
    expect(html).toContain(INSTRUCTIONS.scale.replace(/&/g, "&amp;"));
    expect(html).toContain("until reaching 32°F (0°C)");
    expect(html).toContain("Use a portable thermometer that has been recently verified for accuracy");
    expect(html).toContain("Scale platform with five weight points");
    expect(count(renderToStaticMarkup(<ScaleDiagram624 />), "<circle")).toBe(5);
  });

  it("bilingual section titles and column labels from the sheet; no 'Verificación Por' column", () => {
    for (const text of ["Portable Thermometers", "Termómetros Portátiles", "Non-Movable Thermometers", "Scales", "Básculas", "Agua c/ Hielo 32 °F ± 1 °F", "Condiciones de la Inspección", "Acciones Correctivas"])
      expect(html).toContain(text);
    expect(html).not.toContain("Verificación Por");
  });

  it("positions are numbered within each section and scales show their location", () => {
    expect(html).toContain("#1</span>Dial Probe Thermometer");
    expect(html).toContain("#3</span>Dial Oven Thermometer #2");
    expect(html).toContain("#1</span>Cold Room Thermometer");
    expect(html).toContain("624 Garrison");
  });

  it("results are computed and shown: OK, Not OK, per-point for scales; the difference for non-movable", () => {
    expect(count(html, ">OK</span>")).toBe(2); // p1 and f1
    expect(count(html, ">Not OK</span>")).toBe(2); // p2 and the scale
    expect(html).toContain("1: OK · 2: OK · 3: Not OK · 4: OK · 5: OK");
    expect(html).toContain("Difference: 1.5 °F (allowed ± 5.0 °F)");
  });

  it("a Not OK item shows the corrective action field; an OK item does not", () => {
    expect(count(html, "Corrective action (required)")).toBe(2);
    expect(html).toContain("Recalibrated the dial");
    expect(html).toContain("Re-check reading (°F), after the corrective action");
    const okOnly = form({ p1: VALUES.p1 });
    expect(okOnly).not.toContain("Corrective action (required)");
    expect(okOnly).not.toContain("Re-check reading");
  });

  it("a 'Not in use' item is greyed, has no inputs and does not count", () => {
    const start = html.indexOf('data-item="p3"');
    const card = html.slice(start, html.indexOf("</div></div>", start));
    expect(card).toContain("Not in use");
    expect(card).not.toContain("<input");
    expect(html).toContain('data-item="p3" data-in-use="false"');
  });

  it("the reference dropdown lists only portables that passed in this record", () => {
    const start = html.indexOf("Reference thermometer used");
    const select = html.slice(start, html.indexOf("</select>", start));
    expect(select).toContain("Dial Probe Thermometer");
    expect(select).toContain("Dial Oven Thermometer"); // failed first, passed its re-check
    expect(select).not.toContain("Dial Oven Thermometer #2"); // not in use
    const none = form({ p1: { equipmentId: "p1", reading: 40 } });
    expect(none).toContain("No portable thermometer has passed yet");
  });

  it("what is missing is shown in plain words and the submit button is disabled until it is fixed", () => {
    const missing = form({ p1: VALUES.p1, p2: { equipmentId: "p2", reading: 36 } });
    expect(missing).toContain("Before you can submit:");
    expect(missing).toContain("Dial Oven Thermometer is Not OK and needs a corrective action.");
    expect(missing).toContain("Digital Scale needs all five weight readings.");
    expect(missing).toMatch(/<button[^>]*disabled=""[^>]*>Submit verification/);
    const ready = form({ ...VALUES, s1: { ...VALUES.s1, correctiveAction: "Levelled the scale" } });
    expect(ready).not.toContain("Before you can submit:");
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit verification/);
  });

  it("checkedAt is shown in Pacific time", () => {
    expect(html).toContain("Checked 11/20/2026, 10:05 AM PT");
  });

  it("read-only view of a submitted record: values shown, nothing editable, no submit", () => {
    const view = viewOfSnapshot(buildSnapshot(LIST, VALUES).items);
    const ro = form(view.values, { readOnly: true, equipment: view.equipment, progress: progressOf(view.equipment, view.values) });
    expect(ro).not.toContain("<input");
    expect(ro).not.toContain("<select");
    expect(ro).not.toContain("Submit verification");
    expect(ro).toContain("32.0");
    expect(ro).toContain("1.25");
    expect(ro).toContain("Dial Probe Thermometer</span>"); // the reference used, by name
  });
});

describe("equipment editor (real component)", () => {
  const html = renderToStaticMarkup(
    <EquipmentEditor624 equipment={LIST} onAdd={() => {}} onRename={() => {}} onLocation={() => {}} onInUse={() => {}} onRetire={() => {}} onMove={() => {}} />,
  );
  it("every item can be renamed, switched in or out of use, moved and retired — never deleted", () => {
    expect(count(html, 'aria-label="Name of ')).toBe(5);
    expect(count(html, ">Retire</button>")).toBe(5);
    expect(count(html, 'aria-label="Move ')).toBe(10);
    expect(html).not.toContain("Delete");
    expect(html).toContain("Add item");
    expect(html).toContain("Changes are saved immediately and stay for all future forms.");
  });
  it("location is editable for scales only; the 'in use' box reflects the list", () => {
    expect(count(html, 'aria-label="Location of ')).toBe(1);
    expect(count(html, 'type="checkbox" checked=""')).toBe(4);
  });
  it("the first item of a section cannot move up, the last cannot move down", () => {
    expect(html).toMatch(/aria-label="Move Dial Probe Thermometer up" disabled=""/);
    expect(html).toMatch(/aria-label="Move Dial Oven Thermometer #2 down" disabled=""/);
    expect(html).not.toMatch(/aria-label="Move Dial Oven Thermometer up" disabled=""/);
  });
});

describe("records list and PDF", () => {
  const rows: VerificationListRow[] = [
    { id: "r2", period: "2026-11-B", status: "draft", conductedBy: "", initials: "", okCount: 2, failCount: 0, notInUseCount: 1, submittedAt: null, submittedBy: null },
    { id: "r1", period: "2026-11-A", status: "submitted", conductedBy: "Hugo Ayala", initials: "HGA", okCount: 11, failCount: 2, notInUseCount: 1, submittedAt: "2026-11-14T22:30:00.000Z", submittedBy: { name: "Hugo Ayala" } },
  ];
  const table = (isAdmin: boolean) => renderToStaticMarkup(<VerificationRecordsTable624 rows={rows} isAdmin={isAdmin} onView={() => {}} onPdf={() => {}} onDelete={() => {}} />);

  it("the list is the log: period, status, date submitted, submitted by and the three counts", () => {
    const html = table(false);
    for (const head of ["Period", "Status", "Date submitted", "Submitted by", "OK", "Not OK", "Not in use"]) expect(html).toContain(`>${head}</th>`);
    expect(html).toContain("November 2026 · 1–15");
    expect(html).toContain("November 2026 · 16–30");
    expect(html).toContain("11/14/2026, 2:30 PM PT");
    expect(html).toContain("Hugo Ayala");
    expect(html).toContain(">11</td>");
    expect(count(html, "> PDF</button>")).toBe(2);
    expect(html).toContain("Continue"); // the draft
  });

  it("delete is offered to admins only", () => {
    expect(count(table(true), 'aria-label="Delete record')).toBe(2);
    expect(table(false)).not.toContain("Delete");
    expect(renderToStaticMarkup(<VerificationRecordsTable624 rows={[]} isAdmin onView={() => {}} onPdf={() => {}} onDelete={() => {}} />)).toContain("No records yet.");
  });

  it("the PDF shows the three sections with readings, results, corrective actions, the reference, initials, date and instructions version", () => {
    const snap = buildSnapshot(LIST, { ...VALUES, s1: { ...VALUES.s1, correctiveAction: "Levelled the scale" } });
    const html = buildVerificationPdfHtml624({
      period: "2026-11-B", status: "submitted", conductedBy: "Hugo Ayala", initials: "HGA", listVersion: 3, notes: null,
      items: [...snap.items, { kind: "header", date: "2026-11-20", time: "10:05" }],
      okCount: snap.okCount, failCount: snap.failCount, notInUseCount: snap.notInUseCount, submittedAt: "2026-11-20T18:30:00.000Z",
    });
    for (const text of [
      "Scales &amp; Thermometer Verification — 624", "Period: November 2026 · 16–30", "Initials: HGA", "11/20/2026 10:05",
      "Portable Thermometers / Termómetros Portátiles", "Non-Movable Thermometers / Termómetros Fijos", "Scales / Básculas",
      "Agua c/ Hielo 32 °F ± 1 °F", "Condiciones de la Inspección", "Acciones Correctivas",
      "32.0", "36.0", "32.2", "38.0", "39.5", "1.25", "Recalibrated the dial", "Dial was loose", "Levelled the scale",
      "Dial Probe Thermometer", "Not in use", "Instructions v1.0", "Equipment list v3", "By: Hugo Ayala (HGA)", "2 OK · 2 Not OK · 1 not in use",
    ]) expect(html, text).toContain(text);
    expect(html).not.toContain("DRAFT");
    expect(html).not.toContain("Verificación Por");
    expect(buildVerificationPdfHtml624({ period: "2026-11-B", status: "draft", conductedBy: "", initials: "", listVersion: 1, notes: null, items: [], okCount: 0, failCount: 0, notInUseCount: 0, submittedAt: null })).toContain("DRAFT");
  });

  it("equipment names in the PDF are escaped", () => {
    const list = [eq("x", "portable_thermometer", "Probe <b>&</b>", 10)];
    const snap = buildSnapshot(list, { x: { equipmentId: "x", reading: 32 } });
    const html = buildVerificationPdfHtml624({ period: "2026-11-B", status: "submitted", conductedBy: "", initials: "", listVersion: 1, notes: null, items: snap.items, okCount: 1, failCount: 0, notInUseCount: 0, submittedAt: null });
    expect(html).toContain("Probe &lt;b&gt;&amp;&lt;/b&gt;");
  });
});

describe("no escape sequences in titles or labels", () => {
  it("the new files contain real characters, never \\u escapes", () => {
    const files = [
      "../Verification624Form.tsx", "../EquipmentEditor624.tsx", "../VerificationRecordsTable624.tsx", "../../../lib/verification-624.ts",
      "../../../app/(dashboard)/dashboard/supervisor/verification-624/page.tsx", "../../../app/(dashboard)/dashboard/supervisor/verification-624/records/page.tsx",
    ];
    for (const f of files) expect(readFileSync(resolve(__dirname, f), "utf8"), f).not.toMatch(/\\u[0-9a-fA-F]{4}/);
    const pdf = readFileSync(resolve(__dirname, "../pdfBuilders624.ts"), "utf8");
    expect(pdf.slice(pdf.indexOf("Scales & Thermometer Verification"))).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });
});
