import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import { FacilitiesChecklistForm624 } from "@/components/forms624/FacilitiesChecklistForm624";
import { ChecklistEditor624 } from "@/components/forms624/ChecklistEditor624";
import { FacilitiesRecordsTable624, type FacilitiesListRow } from "@/components/forms624/FacilitiesRecordsTable624";
import {
  CurrentFacilitiesNotice624, FacilitiesSubmittedNotice624, FacilitiesSubmittedView624, OpenCurrentFacilitiesButton624,
} from "@/components/forms624/FacilitiesSubmittedNotice624";
import { buildFacilitiesPdfHtml624 } from "@/components/forms624/pdfBuilders624";
import { TASK_FORM_REGISTRY, getFormLabel } from "@/lib/task-form-registry";
import { buildSnapshot, periodLabel, progressOf, submitProblems, viewOfSnapshot, type ChecklistItem, type ItemValues } from "@/lib/facilities-checklist-624";

/** The 14 checks exactly as seeded. */
const SEED: [string, string, string][] = [
  ["Doors", "Production Doors", "Check for broken or missing parts; ensure doors close properly."],
  ["Doors", "Emergency doors", "Must close properly, have proper sealing (no visible outside light), be locked from outside, and open from inside."],
  ["Doors", "Roll up door", "Check for proper opening/closing, damage, and missing parts."],
  ["Doors", "Freezer & Walk-in Doors", "Ensure doors open/close properly; check for damage and missing parts."],
  ["Doors", "Hawaiian Curtains", "Inspect for stains, damage, bending, and missing parts."],
  ["Ceilings", "Production Ceiling", "Look for loose parts, cracks, dirt, and structural defects."],
  ["Ceilings", "Freezer & Walk-in Ceiling", "Check for rust, leaks, condensation, structural defects, missing parts, dirt, and ensure lights function properly."],
  ["Walls", "Walls of productions", "Inspect for cracks, structural issues, peeling paint, exposed electrical, and any tape or stickers."],
  ["Walls", "Freezer & Walk-in Walls", "Check for cracks, rust, missing or loose parts, and structural defects."],
  ["Floors", "Production Floor", "Look for cracks, pests, old dirt, product residue, wood, and damaged cart/table wheels."],
  ["Floors", "Freezer & Walk-in Floor", "Inspect for cracks, old dirt, product residue, and wood."],
  ["Lights", "Emergency Lights", "Check for cracks, pest activity, dirt, and loose parts."],
  ["Exterior", "Exterior", "Confirm parking area is clean, bait traps are in place, doors are closed and undamaged, and break area is clean and free of cigarette butts."],
  ["Sinks", "Sinks", "Inspect for leaks, dirt buildup, loose parts, and confirm hot water is available."],
];
const LIST: ChecklistItem[] = SEED.map(([groupName, name, description], i) => ({ id: `i${i + 1}`, groupName, name, description, sortOrder: (i + 1) * 10 }));
/** Nine of fourteen checked: eight OK, one Not OK with its corrective action, one Not OK still missing it. */
const VALUES: Record<string, ItemValues> = {
  ...Object.fromEntries(LIST.slice(0, 7).map((i) => [i.id, { itemId: i.id, result: "OK" } as ItemValues])),
  i1: { itemId: "i1", result: "OK", note: "New hinges", checkedAt: "2026-11-24T18:05:00.000Z" },
  i8: { itemId: "i8", result: "NOT_OK", correctiveAction: "Removed the tape", checkedAt: "2026-11-24T18:10:00.000Z" },
  i9: { itemId: "i9", result: "NOT_OK" },
};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const esc = (s: string) => s.replace(/&/g, "&amp;");

function form(items: ChecklistItem[], values: Record<string, ItemValues>, over: Partial<Parameters<typeof FacilitiesChecklistForm624>[0]> = {}) {
  return renderToStaticMarkup(
    <FacilitiesChecklistForm624
      periodLabel={periodLabel("2026-W48")} date="2026-11-24" time="10:05" initials="HA"
      items={items} values={values} progress={progressOf(items, values)} problems={submitProblems(items, values, "HA")} {...over}
    />,
  );
}
function card(html: string, id: string) {
  const start = html.indexOf(`data-item="${id}"`);
  const next = html.indexOf("data-item=", start + 10);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("the form (real component)", () => {
  const html = form(LIST, VALUES);

  it("header with initials prefilled once at the top, a progress counter and a submit button", () => {
    expect(html).toContain('value="HA"');
    expect(html).toContain("9 of 14 checked");
    expect(html).toContain("7 OK · 2 Not OK");
    expect(html).toContain("Week 48 · Nov 23–29, 2026");
    expect(html).toContain("Submit checklist");
    expect(html).not.toContain('placeholder="Init"'); // no per-item initials
  });

  it("the fourteen checks under their seven groups, in order, each with its name and its description as helper text", () => {
    expect(count(html, "data-item=")).toBe(14);
    const groups = Array.from(html.matchAll(/data-group="([^"]+)"/g)).map((m) => m[1]);
    expect(groups).toEqual(["Doors", "Ceilings", "Walls", "Floors", "Lights", "Exterior", "Sinks"]);
    for (const [, name, description] of SEED) {
      expect(html, name).toContain(`>${esc(name)}</span>`);
      expect(html, name).toContain(`data-description="true">${esc(description)}</p>`);
    }
    expect(html.indexOf("Hawaiian Curtains")).toBeLessThan(html.indexOf("Production Ceiling"));
    expect(html.indexOf("Exterior</h2>")).toBeLessThan(html.indexOf("Sinks</h2>"));
  });

  it("each check has OK and Not OK; the chosen one is highlighted; an unchecked one has neither", () => {
    expect(count(html, ">OK</button>")).toBe(14);
    expect(count(html, ">Not OK</button>")).toBe(14);
    expect(card(html, "i1")).toContain('data-result="OK"');
    expect(card(html, "i1")).toMatch(/bg-emerald-600 text-white[^>]*>OK<\/button>/);
    expect(card(html, "i8")).toMatch(/bg-red-600 text-white[^>]*>Not OK<\/button>/);
    const pending = card(html, "i14");
    expect(pending).toContain('data-result="pending"');
    expect(pending).not.toContain("bg-emerald-600 text-white");
    expect(pending).not.toContain("bg-red-600 text-white");
  });

  it("the corrective action field appears only for a Not OK, and says when it is still missing", () => {
    expect(count(html, "Describe corrective action taken…")).toBe(2); // the two Not OK checks only
    expect(card(html, "i8")).toContain("Removed the tape");
    expect(card(html, "i8")).not.toContain("A corrective action is required for a Not OK.");
    expect(card(html, "i9")).toContain("A corrective action is required for a Not OK.");
    expect(card(html, "i1")).not.toContain("Describe corrective action taken…");
    expect(card(html, "i14")).not.toContain("Describe corrective action taken…");
  });

  it("an optional note per check, and the automatic checked-at time in Pacific time", () => {
    expect(count(html, "Note (optional)")).toBe(14);
    expect(card(html, "i1")).toContain('value="New hinges"');
    expect(card(html, "i1")).toContain("Checked 11/24/2026, 10:05 AM PT");
    expect(card(html, "i8")).toContain("Checked 11/24/2026, 10:10 AM PT");
    expect(card(html, "i14")).not.toContain("Checked ");
  });

  it("what is missing is listed in plain words and the submit button is disabled until it is fixed", () => {
    expect(html).toContain("Before you can submit:");
    expect(html).toContain("Freezer &amp; Walk-in Walls is Not OK and needs a corrective action.");
    expect(html).toContain("Production Floor needs OK or Not OK.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit checklist/);
  });

  it("a Not OK does not block submission once it has its corrective action", () => {
    const done: Record<string, ItemValues> = {
      ...Object.fromEntries(LIST.map((i) => [i.id, { itemId: i.id, result: "OK" } as ItemValues])),
      i8: VALUES.i8, i9: { itemId: "i9", result: "NOT_OK", correctiveAction: "Re-fastened the panel" },
    };
    const ready = form(LIST, done);
    expect(ready).toContain("14 of 14 checked");
    expect(ready).toContain("12 OK · 2 Not OK");
    expect(ready).not.toContain("Before you can submit:");
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit checklist/);
  });

  it("read-only view of a submitted record: results, corrective action and notes shown, nothing editable, no submit", () => {
    const done: Record<string, ItemValues> = { ...Object.fromEntries(LIST.map((i) => [i.id, { itemId: i.id, result: "OK" } as ItemValues])), i1: VALUES.i1, i8: VALUES.i8 };
    const view = viewOfSnapshot(buildSnapshot(LIST, done).items);
    const ro = form(view.items, view.values, { readOnly: true, problems: [] });
    expect(ro).not.toContain("<input");
    expect(ro).not.toContain("<textarea");
    expect(ro).not.toContain("Submit checklist");
    expect(count(ro, "data-item=")).toBe(14);
    expect(card(ro, "i8")).toContain(">Not OK</span>");
    expect(card(ro, "i8")).toContain("Removed the tape");
    expect(card(ro, "i1")).toContain("New hinges");
    expect(card(ro, "i1")).toContain("Checked 11/24/2026, 10:05 AM PT");
    expect(ro).toContain(esc(SEED[12][2]));
  });
});

describe("edit mode (real components)", () => {
  const editor = (items = LIST) =>
    renderToStaticMarkup(<ChecklistEditor624 items={items} onAdd={() => {}} onRename={() => {}} onDescription={() => {}} onGroup={() => {}} onRetire={() => {}} onMove={() => {}} />);
  const html = editor();

  it("every check can be renamed, described, regrouped, moved and retired — never deleted", () => {
    expect(count(html, 'aria-label="Name of ')).toBe(14);
    expect(count(html, 'aria-label="Description of ')).toBe(14);
    expect(count(html, 'aria-label="Group of ')).toBe(14);
    expect(count(html, 'aria-label="Move ')).toBe(28);
    expect(count(html, ">Retire</button>")).toBe(14);
    expect(html).not.toContain("Delete");
    expect(html).toContain("Changes are saved immediately and stay for all future forms.");
    expect(html).toMatch(/aria-label="Name of Roll up door"[^>]*value="Roll up door"/);
    expect(html).toContain(`>${esc(SEED[2][2])}</textarea>`);
    expect(html).toMatch(/aria-label="Group of Sinks"[^>]*value="Sinks"/);
  });

  it("the group can be picked from the existing groups or typed new, for an item and for a new check", () => {
    for (const g of ["Doors", "Ceilings", "Walls", "Floors", "Lights", "Exterior", "Sinks"]) expect(html).toContain(`<option value="${g}"></option>`);
    expect(count(html, 'list="facilities-checklist-groups"')).toBe(15); // 14 items and the add form
    expect(html).toContain("Group (pick one or type a new name)");
    expect(html).toContain("Add check");
    expect(html).toContain("New check: name");
    expect(html).toContain("Description: what to inspect");
  });

  it("the first check of a group cannot move up, the last cannot move down (moves stay inside the group)", () => {
    expect(html).toMatch(/aria-label="Move Production Doors up" disabled=""/);
    expect(html).toMatch(/aria-label="Move Hawaiian Curtains down" disabled=""/);
    expect(html).toMatch(/aria-label="Move Production Ceiling up" disabled=""/); // first of its own group
    expect(html).not.toMatch(/aria-label="Move Emergency doors up" disabled=""/);
    expect(html).toMatch(/aria-label="Move Sinks up" disabled=""/);
    expect(html).toMatch(/aria-label="Move Sinks down" disabled=""/); // alone in its group
  });

  it("the form with the editor open shows both; the add button waits for a name", () => {
    const withEditor = form(LIST, VALUES, { children: <ChecklistEditor624 items={LIST} onAdd={() => {}} onRename={() => {}} onDescription={() => {}} onGroup={() => {}} onRetire={() => {}} onMove={() => {}} /> });
    expect(withEditor).toContain("data-checklist-editor");
    expect(withEditor.indexOf("data-checklist-editor")).toBeLessThan(withEditor.indexOf('data-group="Doors"'));
    expect(count(withEditor, "data-item=")).toBe(14);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Add check<\/button>/);
  });

  it("errors from the server are shown", () => {
    const withError = renderToStaticMarkup(<ChecklistEditor624 items={LIST} error="Enter a name for the check." onAdd={() => {}} onRename={() => {}} onDescription={() => {}} onGroup={() => {}} onRetire={() => {}} onMove={() => {}} />);
    expect(withError).toContain("Enter a name for the check.");
  });
});

describe("records page pieces (real components)", () => {
  const row = (period: string, status: string, over: Partial<FacilitiesListRow> = {}): FacilitiesListRow => ({
    id: `rec-${period}`, period, status, conductedBy: "Hugo Ayala", initials: "HA", okCount: 13, failCount: 1,
    submittedAt: status === "submitted" ? "2026-11-26T20:03:00.000Z" : null, submittedBy: status === "submitted" ? { name: "Hugo Ayala" } : null, ...over,
  });
  const rows = [row("2026-W49", "draft", { okCount: 3, failCount: 0 }), row("2026-W48", "submitted"), row("2026-W53", "submitted", { submittedAt: "2027-01-01T05:30:00.000Z" })];
  const table = (isAdmin: boolean) => renderToStaticMarkup(<FacilitiesRecordsTable624 rows={rows} isAdmin={isAdmin} onView={() => {}} onPdf={() => {}} onDelete={() => {}} />);
  const header = (list: FacilitiesListRow[], today: string) =>
    renderToStaticMarkup(
      <div>
        <OpenCurrentFacilitiesButton624 rows={list} today={today} onOpen={() => {}} />
        <CurrentFacilitiesNotice624 rows={list} today={today} onView={() => {}} />
      </div>,
    );

  it("the list is the log: period as dates, status, submitted on, submitted by, OK and Not OK counts", () => {
    const html = table(false);
    for (const head of ["Period", "Status", "Submitted on", "Submitted by", "OK", "Not OK"]) expect(html).toContain(`>${head}</th>`);
    expect(html).toContain("Nov 23–29, 2026");
    expect(html).toContain("Nov 30 – Dec 6, 2026");
    expect(html).toContain("Dec 28, 2026 – Jan 3, 2027");
    expect(html).toContain("11/26/2026, 12:03 PM PT");
    expect(html).toContain("12/31/2026, 9:30 PM PT"); // Pacific time, not the UTC date
    expect(html).toContain("Hugo Ayala");
    expect(html).toContain(">13</td>");
    expect(count(html, "> PDF</button>")).toBe(3);
    expect(html).toContain("Continue"); // the draft
    expect(count(html, "> View</button>")).toBe(2);
  });

  it("delete is offered to admins only", () => {
    expect(count(table(true), 'aria-label="Delete record')).toBe(3);
    expect(table(false)).not.toContain("Delete");
    expect(renderToStaticMarkup(<FacilitiesRecordsTable624 rows={[]} isAdmin onView={() => {}} onPdf={() => {}} onDelete={() => {}} />)).toContain("No records yet.");
  });

  it("current week already submitted: only the notice — no button, not even a disabled one", () => {
    const html = header(rows, "2026-11-27");
    expect(OpenCurrentFacilitiesButton624({ rows, today: "2026-11-27", onOpen: () => {} })).toBeNull();
    expect(html).not.toContain("Open current form");
    expect(html).not.toContain("disabled");
    expect(html).toContain('data-period-submitted="2026-W48"');
    expect(html).toContain("The Nov 23–29, 2026 checklist was submitted on 11/26/2026 by Hugo Ayala.");
    expect(html).toContain(">View that record</button>");
    expect(html).toContain("The next form, for Nov 30 – Dec 6, 2026, opens on Monday, November 30, 2026 (Pacific time).");
    expect(count(html, "<button")).toBe(1); // only the "View that record" link
    expect(header(rows, "2026-11-29")).toContain("data-period-submitted"); // through Sunday
  });

  it("current week not submitted (a draft, or no record yet): the normal button, which opens the form, and no notice", () => {
    for (const today of ["2026-11-30", "2026-12-08"]) {
      const html = header(rows, today);
      expect(html).toContain(">Open current form</button>");
      expect(html).not.toContain("was submitted");
    }
    const onOpen = vi.fn();
    const button = OpenCurrentFacilitiesButton624({ rows, today: "2026-11-30", onOpen }) as ReactElement<{ onClick: () => void; disabled?: boolean }>;
    expect(button.props.disabled).toBeUndefined();
    button.props.onClick();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("the notice across the year boundary names the Monday the next form opens", () => {
    const html = header(rows, "2027-01-02");
    expect(html).toContain("The Dec 28, 2026 – Jan 3, 2027 checklist was submitted on 12/31/2026 by Hugo Ayala.");
    expect(html).toContain("The next form, for Jan 4–10, 2027, opens on Monday, January 4, 2027 (Pacific time).");
  });

  it("the form route, when that week is already submitted, shows the same explanation instead of a form", () => {
    const html = renderToStaticMarkup(<FacilitiesSubmittedView624 info={{ period: "2026-W48", submittedAt: "2026-11-26T20:03:00Z", submittedBy: "Hugo Ayala" }} onView={() => {}} onRecords={() => {}} />);
    expect(html).toContain("data-form-closed");
    expect(html).toContain("The Nov 23–29, 2026 checklist was submitted on 11/26/2026 by Hugo Ayala.");
    expect(html).toContain(">View that record</button>");
    expect(html).toContain(">View Records</button>");
    expect(html).not.toContain("Submit checklist");
    expect(renderToStaticMarkup(<FacilitiesSubmittedNotice624 info={{ period: "2026-W48", submittedAt: null, submittedBy: null }} />)).not.toContain("<button");
  });
});

describe("PDF", () => {
  const done: Record<string, ItemValues> = {
    ...Object.fromEntries(LIST.map((i) => [i.id, { itemId: i.id, result: "OK", checkedAt: "2026-11-24T18:05:00.000Z" } as ItemValues])),
    i1: VALUES.i1, i8: { ...VALUES.i8, reInspected: true }, i9: { itemId: "i9", result: "NOT_OK", correctiveAction: "Re-fastened <the> panel & sealed" },
  };
  const snap = buildSnapshot(LIST, done);
  const record = {
    period: "2026-W48", status: "submitted", conductedBy: "Hugo Ayala", initials: "HA", listVersion: 3, notes: null,
    items: [...snap.items, { kind: "header", date: "2026-11-24", time: "10:05" }],
    okCount: snap.okCount, failCount: snap.failCount, submittedAt: "2026-11-24T19:30:00.000Z",
  };
  const pdf = buildFacilitiesPdfHtml624(record);

  it("shows the week, date, initials, the groups, every check with its description, results, corrective actions and notes", () => {
    for (const text of [
      "Facilities Checklist — 624", "Week: Nov 23–29, 2026 (Week 48)", "Date: 11/24/2026 10:05", "Initials: HA", "12 OK · 2 Not OK",
      "Removed the tape", "Re-inspected and confirmed corrected", "Re-inspection pending", "New hinges", "11/24/2026, 10:05 AM",
      "Checklist v3", "By: Hugo Ayala (HA)", "Submitted: 11/24/2026, 11:30:00 AM PT",
    ]) expect(pdf, text).toContain(text);
    for (const g of ["Doors", "Ceilings", "Walls", "Floors", "Lights", "Exterior", "Sinks"]) expect(pdf).toContain(`<h2>${g}</h2>`);
    for (const [, name, description] of SEED) { expect(pdf, name).toContain(`<b>${esc(name)}</b>`); expect(pdf, name).toContain(esc(description)); }
    expect(count(pdf, '<span style="color:#059669;font-weight:600">OK</span>')).toBe(12);
    expect(count(pdf, '<span style="color:#dc2626;font-weight:600">Not OK</span>')).toBe(2);
    expect(pdf).not.toContain("DRAFT");
  });

  it("text typed by people is escaped", () => {
    expect(pdf).toContain("Re-fastened &lt;the&gt; panel &amp; sealed");
    expect(pdf).not.toContain("<the>");
  });

  it("a draft says so; a later change to the checklist does not change a submitted record's PDF", () => {
    expect(buildFacilitiesPdfHtml624({ ...record, status: "draft", submittedAt: null })).toContain("DRAFT — not yet submitted");
    expect(buildFacilitiesPdfHtml624({ period: "2026-W48", status: "draft", conductedBy: "", initials: "", listVersion: 1, notes: null, items: [], okCount: 0, failCount: 0, submittedAt: null })).toContain("No checks recorded.");
    LIST[0].name = "Renamed later";
    expect(buildFacilitiesPdfHtml624(record)).toBe(pdf);
    LIST[0].name = "Production Doors";
  });
});

describe("registry, sidebar and no escape sequences", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
  it("the form is registered under facilities_checklist_624 with its label and route", () => {
    expect(getFormLabel("facilities_checklist_624")).toBe("Facilities Checklist (624)");
    expect(TASK_FORM_REGISTRY.facilities_checklist_624.href("any")).toBe("/dashboard/supervisor/facilities-checklist-624");
  });
  it("the sidebar has the entry for supervisors and admins", () => {
    const sidebar = read("../../layout/Sidebar.tsx");
    const at = sidebar.indexOf('label: "Facilities Checklist - 624"');
    expect(at).toBeGreaterThan(-1);
    const entry = sidebar.slice(at, sidebar.indexOf("},", at));
    expect(entry).toContain('href: "/dashboard/supervisor/facilities-checklist-624"');
    expect(entry).toContain('roles: ["SUPERVISOR", "ADMIN"]');
  });
  it("the new files contain real characters, never \\u escapes", () => {
    const files = [
      "../FacilitiesChecklistForm624.tsx", "../ChecklistEditor624.tsx", "../FacilitiesRecordsTable624.tsx", "../FacilitiesSubmittedNotice624.tsx",
      "../../../lib/facilities-checklist-624.ts", "../../../lib/facilities-checklist-624-server.ts",
      "../../../app/(dashboard)/dashboard/supervisor/facilities-checklist-624/page.tsx", "../../../app/(dashboard)/dashboard/supervisor/facilities-checklist-624/records/page.tsx",
      "../../../app/api/facilities-checklist-624/route.ts", "../../../app/api/facilities-checklist-624/[id]/route.ts", "../../../app/api/facilities-checklist-624/[id]/submit/route.ts",
      "../../../app/api/facilities-checklist-624/items/route.ts", "../../../app/api/facilities-checklist-624/items/[id]/route.ts",
    ];
    for (const f of files) expect(read(f), f).not.toMatch(/\\u[0-9a-fA-F]{4}/);
    const pdf = read("../pdfBuilders624.ts");
    expect(pdf.slice(pdf.indexOf("Facilities Checklist (weekly)"))).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });
});
