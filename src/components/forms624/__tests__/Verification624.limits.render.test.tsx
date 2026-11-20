import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Verification624Form } from "@/components/forms624/Verification624Form";
import { EquipmentEditor624, ItemLimits624 } from "@/components/forms624/EquipmentEditor624";
import { buildVerificationPdfHtml624 } from "@/components/forms624/pdfBuilders624";
import {
  buildSnapshot, instructionsVerOf, periodLabel, progressOf, splitStored, submitProblems, valuesForLiveList, viewOfSnapshot,
  INSTRUCTIONS, INSTRUCTIONS_BY_VERSION, type Equipment, type ItemValues,
} from "@/lib/verification-624";
import { OLD_RECORD } from "./fixtures/verification-old-record";

const eq = (id: string, section: Equipment["section"], name: string, sortOrder: number, over: Partial<Equipment> = {}): Equipment =>
  ({ id, section, name, location: section === "scale" ? "624 Garrison" : "", inUse: true, sortOrder, ...over });
const LIST: Equipment[] = [
  eq("p1", "portable_thermometer", "Dial Probe Thermometer", 10, { tolerance: 1 }),
  eq("f1", "fixed_thermometer", "Cold Room Thermometer", 10, { tolerance: 5 }),
  eq("k1", "scale", "Kitchen Scale 1", 10, { testWeight: 50, weightUnit: "g", tolerance: 1 }),
  eq("d1", "scale", "Digital Scale", 20, { testWeight: 500, weightUnit: "g", tolerance: 45 }),
  eq("b1", "scale", "Bench Scale", 30, { testWeight: 1.1, weightUnit: "lb", tolerance: 0.1 }),
];
const VALUES: Record<string, ItemValues> = {
  p1: { equipmentId: "p1", reading: 33 },
  f1: { equipmentId: "f1", referenceId: "p1", target: 38, fixedReading: 43 },
  k1: { equipmentId: "k1", points: [49, 50, 51, 51.1, 50], pointsUnit: "g", pointsWeight: 50, correctiveAction: "Recalibrated" },
  d1: { equipmentId: "d1", points: [455, 500, 545, 500, 500], pointsUnit: "g", pointsWeight: 500 },
  b1: { equipmentId: "b1", points: [1, 1.1, 1.2, 1.1, 1.1], pointsUnit: "lb", pointsWeight: 1.1 },
};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const fixture = (name: string) => readFileSync(resolve(__dirname, "fixtures", name), "utf8");

function form(equipment: Equipment[], values: Record<string, ItemValues>, over: Partial<Parameters<typeof Verification624Form>[0]> = {}) {
  return renderToStaticMarkup(
    <Verification624Form
      periodLabel="November 2026 · 16–30" date="2026-11-20" time="10:05" initials="HA"
      equipment={equipment} values={values} progress={progressOf(equipment, values)} problems={submitProblems(equipment, values, "HA")} {...over}
    />,
  );
}
/** The markup of one item's card. */
function card(html: string, id: string) {
  const start = html.indexOf(`data-item="${id}"`);
  const next = html.indexOf("data-item=", start + 10);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("the form with per-item limits (real component)", () => {
  const html = form(LIST, VALUES);

  it("a scale read in grams: its own test weight and margin, readings to one decimal in g, judged by its own limits", () => {
    const k1 = card(html, "k1");
    expect(k1).toContain("Test weight 50 g, margin ± 1 g (49.0 to 51.0 g)");
    for (const label of ["1. Center (g)", "2. Front left (g)", "5. Back right (g)"]) expect(k1).toContain(label);
    expect(count(k1, 'step="0.1"')).toBe(5);
    expect(k1).not.toContain("(lb)");
    expect(k1).toContain("1: OK · 2: OK · 3: OK · 4: Not OK · 5: OK"); // 49.0 and 51.0 pass, 51.1 fails
    expect(k1).toContain(">Not OK</span>");
    expect(k1).toContain("Corrective action (required)");

    const d1 = card(html, "d1");
    expect(d1).toContain("Test weight 500 g, margin ± 45 g (455.0 to 545.0 g)");
    expect(d1).toContain("1: OK · 2: OK · 3: OK · 4: OK · 5: OK"); // 455.0 and 545.0 pass
    expect(d1).toContain(">OK</span>");
  });

  it("a scale read in lb: its own line, readings to two decimals in lb", () => {
    const b1 = card(html, "b1");
    expect(b1).toContain("Test weight 1.10 lb, margin ± 0.10 lb (1.00 to 1.20 lb)");
    expect(b1).toContain("1. Center (lb)");
    expect(count(b1, 'step="0.01"')).toBe(5);
    expect(b1).not.toContain("(g)");
    expect(b1).toContain("1: OK · 2: OK · 3: OK · 4: OK · 5: OK"); // 1.00 and 1.20 pass
  });

  it("a portable thermometer: the fixed 32.0 °F target with its own margin", () => {
    const p1 = card(html, "p1");
    expect(p1).toContain("Ice water 32.0 °F, margin ± 1.0 °F (31.0 to 33.0 °F)");
    expect(p1).toContain("Agua c/ Hielo 32 °F ± 1.0 °F");
    expect(p1).toContain(">OK</span>"); // 33.0 is on the boundary
    const strict = form(LIST.map((e) => (e.id === "p1" ? { ...e, tolerance: 0.5 } : e)), VALUES);
    expect(card(strict, "p1")).toContain("Ice water 32.0 °F, margin ± 0.5 °F (31.5 to 32.5 °F)");
    expect(card(strict, "p1")).toContain(">Not OK</span>");
  });

  it("a non-movable thermometer: its own margin from the reference reading", () => {
    const f1 = card(html, "f1");
    expect(f1).toContain("Margin ± 5.0 °F from the reference reading");
    expect(f1).toContain("Difference: 5.0 °F (allowed ± 5.0 °F)");
    expect(f1).toContain(">OK</span>");
    const strict = form(LIST.map((e) => (e.id === "f1" ? { ...e, tolerance: 2.5 } : e)), VALUES);
    expect(card(strict, "f1")).toContain("Margin ± 2.5 °F from the reference reading");
    expect(card(strict, "f1")).toContain("Difference: 5.0 °F (allowed ± 2.5 °F)");
    expect(card(strict, "f1")).toContain(">Not OK</span>");
  });

  it("the instructions are v1.1 and nothing on the form says 500 g or 1.10 lb for every scale any more", () => {
    expect(html).toContain("(v1.1)");
    expect(html).toContain("Place the test weight shown for that scale over the points seen in the image in each corner and center.");
    expect(html).toContain("The margin is the target weight shown for that scale, plus or minus its tolerance.");
    expect(html).not.toContain("500 gram weight");
    expect(html).not.toContain("500 g weight");
    expect(html).not.toContain("The margin is 1.10 lb");
    expect(html).toContain(INSTRUCTIONS.portable_thermometer);
    expect(html).toContain(INSTRUCTIONS.fixed_thermometer);
    expect(count(html, "data-margin")).toBe(5);
  });

  it("lb readings on a scale that is now in grams: kept on screen with a clear prompt to weigh again, never converted, never counted", () => {
    const draft = valuesForLiveList(LIST, [{ equipmentId: "d1", points: [1.1, 1.1, 1.1, 1.1, 1.1] }, { equipmentId: "p1", reading: 32 }]);
    const again = form(LIST, draft);
    const d1 = card(again, "d1");
    expect(d1).toContain("data-reenter");
    expect(d1).toContain("Weigh this scale again and enter the five readings in g.");
    expect(d1).toContain("This scale is now checked with a 500 g test weight.");
    expect(d1).toContain("(1.10, 1.10, 1.10, 1.10, 1.10 lb)");
    expect(d1).toContain("They were not converted and do not count.");
    expect(d1).toContain(">Pending</span>");
    expect(count(d1, 'value=""')).toBeGreaterThanOrEqual(5); // the five inputs are empty
    expect(d1).not.toContain("498"); expect(d1).not.toContain("499");
    expect(again).toContain("Digital Scale needs its five weight readings entered again in g (the earlier lb readings were not converted).");
    expect(again).toMatch(/<button[^>]*disabled=""[^>]*>Submit verification/);
    expect(count(again, "data-reenter")).toBe(1); // only that scale
    expect(card(again, "p1")).toContain('value="32"');
    // once the scale has five new readings the prompt is gone
    const done = form(LIST, { ...draft, d1: { ...draft.d1, points: [500, 500, 500, 500, 500], pointsUnit: "g", pointsWeight: 500 } });
    expect(done).not.toContain("data-reenter");
  });
});

describe("equipment editor with limits (real component)", () => {
  const html = renderToStaticMarkup(
    <EquipmentEditor624 equipment={LIST} onAdd={() => {}} onRename={() => {}} onLocation={() => {}} onInUse={() => {}} onRetire={() => {}} onMove={() => {}} onLimits={() => {}} />,
  );
  const limits = (id: string) => { const start = html.indexOf(`data-limits="${id}"`); return html.slice(start, html.indexOf("</p></div>", start)); };

  it("each scale has a test weight, a unit (g, lb, oz) and a tolerance, filled with its saved values", () => {
    expect(count(html, 'aria-label="Test weight of ')).toBe(3);
    expect(count(html, 'aria-label="Unit of ')).toBe(3);
    const k1 = limits("k1");
    expect(k1).toMatch(/aria-label="Test weight of Kitchen Scale 1"[^>]*value="50"/);
    expect(k1).toMatch(/aria-label="Tolerance of Kitchen Scale 1"[^>]*value="1"/);
    expect(k1).toContain('<option value="g" selected="">g</option><option value="lb">lb</option><option value="oz">oz</option>');
    expect(k1).toContain("Tolerance ± (g)");
    expect(k1).toContain("Test weight 50 g, margin ± 1 g (49.0 to 51.0 g)");
    const b1 = limits("b1");
    expect(b1).toMatch(/aria-label="Test weight of Bench Scale"[^>]*value="1.1"/);
    expect(b1).toContain('<option value="lb" selected="">lb</option>');
    expect(b1).toContain("Tolerance ± (lb)");
  });

  it("each thermometer has a tolerance only; the 32.0 °F target is not a field", () => {
    expect(count(html, 'aria-label="Tolerance of ')).toBe(5);
    const p1 = limits("p1");
    expect(p1).toMatch(/aria-label="Tolerance of Dial Probe Thermometer"[^>]*value="1"/);
    expect(p1).toContain("Tolerance ± (°F, up to 10)");
    expect(p1).not.toContain("Test weight of");
    expect(p1).not.toContain("<select");
    expect(p1).toContain("Ice water 32.0 °F, margin ± 1.0 °F (31.0 to 33.0 °F)");
    expect(limits("f1")).toMatch(/aria-label="Tolerance of Cold Room Thermometer"[^>]*value="5"/);
    expect(limits("f1")).toContain("Margin ± 5.0 °F from the reference reading");
    expect(html).toContain("The 32.0 °F ice water target is fixed.");
  });

  it("nothing is offered to save until a value changes; a new item's starting limits are shown", () => {
    expect(html).not.toContain("Save limits");
    expect(html).not.toContain("not saved yet");
    expect(html).toContain("A new item starts with: Ice water 32.0 °F, margin ± 1.0 °F (31.0 to 33.0 °F). Change it above after adding.");
  });

  it("an item without saved limits shows what applies to it", () => {
    const bare = renderToStaticMarkup(<ItemLimits624 item={eq("x", "scale", "Old Scale", 10)} onSave={() => {}} />);
    expect(bare).toMatch(/aria-label="Test weight of Old Scale"[^>]*value="1.1"/);
    expect(bare).toContain('<option value="lb" selected="">lb</option>');
    expect(bare).toMatch(/aria-label="Tolerance of Old Scale"[^>]*value="0.1"/);
  });
});

describe("records view and PDF use the record's own limits and units", () => {
  const snap = buildSnapshot(LIST, VALUES);
  const record = {
    period: "2026-11-B", status: "submitted", conductedBy: "Hugo Ayala", initials: "HA", listVersion: 2, notes: null,
    items: [...snap.items, { kind: "header", date: "2026-11-20", time: "10:05", instructionsVer: "v1.1" }],
    okCount: snap.okCount, failCount: snap.failCount, notInUseCount: snap.notInUseCount, submittedAt: "2026-11-20T20:30:00.000Z",
  };

  it("the read-only view of a new record shows each item's margin and unit from the snapshot, whatever the list says now", () => {
    const stored = splitStored(record.items);
    const view = viewOfSnapshot(stored.snapshots);
    const ro = form(view.equipment, view.values, { readOnly: true, instructionsVer: instructionsVerOf(stored), problems: [] });
    expect(ro).not.toContain("<input");
    expect(ro).toContain("(v1.1)");
    expect(card(ro, "k1")).toContain("Test weight 50 g, margin ± 1 g (49.0 to 51.0 g)");
    expect(card(ro, "k1")).toContain("1. Center (g)");
    for (const n of ["49.0", "51.0", "51.1"]) expect(card(ro, "k1")).toContain(`>${n}</span>`);
    expect(card(ro, "b1")).toContain("Test weight 1.10 lb, margin ± 0.10 lb (1.00 to 1.20 lb)");
    for (const n of ["1.00", "1.20"]) expect(card(ro, "b1")).toContain(`>${n}</span>`);
    expect(card(ro, "p1")).toContain("Ice water 32.0 °F, margin ± 1.0 °F (31.0 to 33.0 °F)");
    expect(card(ro, "f1")).toContain("Margin ± 5.0 °F from the reference reading");
  });

  it("the PDF shows units and margins for every item, and the v1.1 instructions", () => {
    const pdf = buildVerificationPdfHtml624(record);
    for (const text of [
      "Test weight 50 g, margin ± 1 g (49.0 to 51.0 g)", "Test weight 500 g, margin ± 45 g (455.0 to 545.0 g)",
      "Test weight 1.10 lb, margin ± 0.10 lb (1.00 to 1.20 lb)", "Ice water 32.0 °F, margin ± 1.0 °F (31.0 to 33.0 °F)",
      "Margin ± 5.0 °F from the reference reading", "<th>Target and margin</th>",
      "49.0 g", "51.1 g", "455.0 g", "545.0 g", "1.00 lb", "1.20 lb", "33.0", "43.0", "Recalibrated",
      "Instructions v1.1", "Equipment list v2", "Place the test weight shown for that scale",
    ]) expect(pdf, text).toContain(text);
    expect(count(pdf, "<th>Target and margin</th>")).toBe(3);
    expect(pdf).not.toContain("500 g, 1.10 lb");
    expect(pdf).not.toContain("500 gram weight");
    expect(pdf).not.toContain("Result (± 5 °F)");
    expect(pdf).toMatch(/color:#dc2626;font-weight:600">51\.1 g<\/td>/); // the failing point is marked
  });

  it("a later change to the list does not change the PDF of a submitted record", () => {
    const before = buildVerificationPdfHtml624(record);
    LIST.find((e) => e.id === "k1")!.testWeight = 100; // the live list moves on…
    expect(buildVerificationPdfHtml624(record)).toBe(before); // …the record does not
    LIST.find((e) => e.id === "k1")!.testWeight = 50;
  });
});

describe("a record stored before per-item limits renders and exports exactly as it did", () => {
  const stored = splitStored(OLD_RECORD.items);
  const view = viewOfSnapshot(stored.snapshots);

  it("the read-only view is identical, character for character, to the one produced before this change", () => {
    const html = renderToStaticMarkup(
      <Verification624Form
        readOnly periodLabel={periodLabel(OLD_RECORD.period)} instructionsVer={instructionsVerOf(stored)}
        date={stored.header?.date ?? "—"} time={stored.header?.time ?? "—"} initials={OLD_RECORD.initials}
        equipment={view.equipment} values={view.values} progress={progressOf(view.equipment, view.values)}
      />,
    );
    expect(html).toBe(fixture("verification-old-record.view.html"));
    // and what that means in words
    expect(html).toContain("(v1.0)");
    expect(html).toContain(INSTRUCTIONS_BY_VERSION["v1.0"].scale);
    expect(html).toContain("500 g weight · each point must read 1.00 to 1.20 lb · 1: OK · 2: OK · 3: Not OK · 4: OK · 5: OK");
    expect(html).toContain("1. Center (lb)");
    expect(html).toContain("Agua c/ Hielo 32 °F ± 1 °F");
    expect(html).not.toContain("data-margin");
    expect(html).not.toContain("Test weight");
  });

  it("the PDF is identical, character for character, to the one produced before this change", () => {
    const pdf = buildVerificationPdfHtml624(OLD_RECORD);
    expect(pdf).toBe(fixture("verification-old-record.pdf.html"));
    expect(pdf).toContain("Instructions v1.0");
    expect(pdf).toContain("Scales / Básculas — 500 g, 1.10 lb ± 0.1 lb");
    expect(pdf).toContain("Result (± 5 °F)");
    expect(pdf).not.toContain("Target and margin");
  });
});
