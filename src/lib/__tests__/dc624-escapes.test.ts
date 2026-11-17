import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildPdfHtml,
  buildWeekPdfHtml,
  formatMDY,
  getWeekMon,
  isoDate,
} from "@/components/forms624/pdfBuilders624";
import type { DailyClean624Record } from "@/components/forms624/types";

const LITERAL_ESCAPE_RE = /\\u[0-9a-fA-F]{4}/;

function makeRecord(overrides: Partial<DailyClean624Record> = {}): DailyClean624Record {
  return {
    id: "test-id-1",
    date: "2025-11-17",
    time: "08:00",
    conductedBy: "Hugo",
    initials: "HM",
    rows: [
      { key: "floor", labelEn: "Floor", labelEs: "Piso", state: "DONE", reason: null, chemical: "Bleach" },
      { key: "walls", labelEn: "Walls", labelEs: "Paredes", state: "NA", reason: "Not applicable", chemical: null },
      { key: "drains", labelEn: "Drains", labelEs: "Drenajes", state: "NOT_DONE", reason: "Clogged", chemical: null },
    ],
    doneCount: 1,
    naCount: 1,
    notDoneCount: 1,
    allergenChange: false,
    notes: "Test notes",
    instructionsVer: "v1.0",
    submittedAt: "2025-11-17T16:00:00.000Z",
    submittedBy: { name: "Hugo Martinez" },
    linkedInstanceId: null,
    ...overrides,
  };
}

// ── formatMDY ───────────────────────────────────────────────────────────────

describe("formatMDY", () => {
  it("converts YYYY-MM-DD to MM/DD/YYYY", () => {
    expect(formatMDY("2025-11-17")).toBe("11/17/2025");
    expect(formatMDY("2025-01-05")).toBe("01/05/2025");
  });
});

// ── getWeekMon / isoDate ────────────────────────────────────────────────────

describe("getWeekMon", () => {
  it("Monday stays Monday", () => {
    expect(isoDate(getWeekMon("2025-11-17"))).toBe("2025-11-17");
  });
  it("Sunday rolls back 6 days", () => {
    expect(isoDate(getWeekMon("2025-11-16"))).toBe("2025-11-10");
  });
  it("Wednesday rolls back 2 days", () => {
    expect(isoDate(getWeekMon("2025-11-19"))).toBe("2025-11-17");
  });
});

// ── buildPdfHtml — no literal escape sequences ──────────────────────────────

describe("buildPdfHtml", () => {
  it("produces HTML with no literal \\uXXXX escape sequences", () => {
    const html = buildPdfHtml(makeRecord());
    expect(html).not.toMatch(LITERAL_ESCAPE_RE);
  });

  it("includes record date and initials", () => {
    const html = buildPdfHtml(makeRecord({ date: "2025-11-17", initials: "HM" }));
    expect(html).toContain("2025-11-17");
    expect(html).toContain("HM");
  });

  it("renders row states without literal \\uXXXX", () => {
    const html = buildPdfHtml(makeRecord());
    expect(html).not.toMatch(LITERAL_ESCAPE_RE);
    expect(html).toContain("Done");
    expect(html).toContain("N/A");
    expect(html).toContain("Not done");
  });
});

// ── buildWeekPdfHtml — no literal escape sequences ──────────────────────────

describe("buildWeekPdfHtml", () => {
  const mon = "2025-11-17";
  const records = [makeRecord({ date: "2025-11-17" }), makeRecord({ id: "test-id-2", date: "2025-11-18" })];

  it("produces HTML with no literal \\uXXXX escape sequences", () => {
    const html = buildWeekPdfHtml(records, mon);
    expect(html).not.toMatch(LITERAL_ESCAPE_RE);
  });

  it("empty-week variant has no literal \\uXXXX", () => {
    const html = buildWeekPdfHtml([], mon);
    expect(html).not.toMatch(LITERAL_ESCAPE_RE);
  });

  it("week subtitle uses MM/DD/YYYY format with en-dash, not 'Week: ... to ...'", () => {
    const html = buildWeekPdfHtml(records, mon);
    expect(html).toContain("Week of 11/17/2025");
    expect(html).toContain("11/21/2025");
    expect(html).not.toContain("Week:");
    expect(html).not.toMatch(/to \d{4}-\d{2}-\d{2}/);
  });

  it("empty-week subtitle uses MM/DD/YYYY format", () => {
    const html = buildWeekPdfHtml([], mon);
    expect(html).toContain("Week of 11/17/2025");
    expect(html).toContain("11/21/2025");
  });
});

// ── Static scan: no \\uXXXX in plain JSX text in records page ───────────────

describe("static JSX scan: records/page.tsx", () => {
  const pagePath = path.resolve(
    __dirname,
    "../../app/(dashboard)/dashboard/supervisor/daily-cleaning-624/records/page.tsx"
  );

  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(pagePath, "utf8");
  });

  it("file exists", () => {
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it("no \\uXXXX outside of JS string/expression context in JSX text", () => {
    // Scope to the JSX return block only (between "return (" and the final ");").
    // Helper functions above the component use \uXXXX inside template literals,
    // which is correct — we don't want to flag those.
    const returnIdx = src.indexOf("  return (\n");
    expect(returnIdx).toBeGreaterThan(-1); // sanity: JSX return block found
    const jsxBlock = src.slice(returnIdx);

    // Within the JSX block, strip JSX expression blocks {…} then check for \uXXXX.
    // Multi-line expressions are stripped with a repeated pass.
    let stripped = jsxBlock;
    let prev: string;
    do {
      prev = stripped;
      stripped = stripped.replace(/\{[^{}]*\}/gs, "{}");
    } while (stripped !== prev);

    const matches = stripped.match(/\\u[0-9a-fA-F]{4}/g);
    if (matches) {
      throw new Error(
        `Found literal \\uXXXX in JSX text of records/page.tsx: ${matches.join(", ")}`
      );
    }
  });
});
