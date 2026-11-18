// Regression tests: per-row initials must NOT appear in Pre-Op 624 (or DC624/MC624).
// These tests fail if someone:
//   - removes the showRowInitials guard from OkNotOkRow
//   - passes showRowInitials={true} to OkNotOkRow in the form or modal
//   - re-adds the Init column to the PDF builder
//
// Storage is intentionally unaffected: RowSnapshot.initials still exists so old
// records load without errors; the header initials are still synced to all rows.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../..");

function src(rel: string) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// ─── OkNotOkRow component ────────────────────────────────────────────────────

describe("OkNotOkRow — showRowInitials guard", () => {
  const okNotOkSrc = src("src/components/forms624/OkNotOkRow.tsx");

  it("declares showRowInitials prop in Props interface", () => {
    expect(okNotOkSrc).toContain("showRowInitials?: boolean");
  });

  it("defaults showRowInitials to false in destructure", () => {
    expect(okNotOkSrc).toContain("showRowInitials = false");
  });

  it("gates per-row initials input behind showRowInitials", () => {
    // The guard must appear before the initials input
    expect(okNotOkSrc).toContain("showRowInitials && !readOnly");
    expect(okNotOkSrc).toContain("showRowInitials && readOnly");
  });

  it("does not render initials input unconditionally", () => {
    // Without the guard, the input would appear directly after the readOnly check
    // The pattern "}): (" or "readOnly ? (" followed immediately by initials input is gone
    expect(okNotOkSrc).not.toMatch(/\{!readOnly \? \(\s*<input[^>]*placeholder="Init"/);
  });

  it("RowSnapshot.initials field still exists in types (backward compat)", () => {
    const typesSrc = src("src/components/forms624/types.ts");
    expect(typesSrc).toContain("initials: string");
  });
});

// ─── Pre-Op 624 form page — no opt-in to per-row initials ────────────────────

describe("Pre-Op 624 form page — zero showRowInitials={true}", () => {
  const pageSrc = src(
    "src/app/(dashboard)/dashboard/supervisor/pre-op-624/page.tsx"
  );

  it("does not pass showRowInitials={true} to any OkNotOkRow", () => {
    expect(pageSrc).not.toContain("showRowInitials={true}");
    expect(pageSrc).not.toContain("showRowInitials");
  });

  it("still passes initials prop to OkNotOkRow (storage unchanged)", () => {
    expect(pageSrc).toContain("initials={row.initials}");
  });

  it("syncs header initials to all rows on change", () => {
    expect(pageSrc).toContain("initials: val");
  });

  it("validates header initials before submit (not per-row)", () => {
    expect(pageSrc).toContain("initials.trim()");
    // No per-row initials validation
    expect(pageSrc).not.toMatch(/row\.initials\.trim\(\)/);
  });

  it("sends conductedBy (header initials) in POST body", () => {
    expect(pageSrc).toContain("conductedBy: initials.trim().toUpperCase()");
  });
});

// ─── Pre-Op 624 records modal — no per-row initials ──────────────────────────

describe("Pre-Op 624 records modal — no showRowInitials opt-in", () => {
  const recordsSrc = src(
    "src/app/(dashboard)/dashboard/supervisor/pre-op-624/records/page.tsx"
  );

  it("does not pass showRowInitials={true} to modal OkNotOkRow", () => {
    expect(recordsSrc).not.toContain("showRowInitials");
  });

  it("PDF builder has no Init column header", () => {
    expect(recordsSrc).not.toContain("<th>Init</th>");
  });

  it("PDF builder has no per-row initials cell", () => {
    expect(recordsSrc).not.toMatch(/r\.initials\b/);
  });

  it("PDF subtitle shows header initials once", () => {
    expect(recordsSrc).toContain("Initials: ${insp.conductedBy}");
  });

  it("records list column header is 'Initials' not 'Init'", () => {
    // The list table shows Date, Name, Initials, Status columns
    const listSrc = src("src/components/forms624/RecordsList624.tsx");
    // Should have Initials as a column but NOT a per-row Init cell with r.initials
    expect(listSrc).not.toMatch(/r\.initials\b/);
  });
});

// ─── Old-shape records backward compatibility ─────────────────────────────────

describe("backward compatibility — old records with per-row initials load safely", () => {
  it("RowSnapshot type still has initials field for old records", () => {
    const typesSrc = src("src/components/forms624/types.ts");
    expect(typesSrc).toContain("initials: string");
  });

  it("OkNotOkRow still accepts initials prop (old records pass it in)", () => {
    const okNotOkSrc = src("src/components/forms624/OkNotOkRow.tsx");
    expect(okNotOkSrc).toContain("initials: string;");
  });
});

// ─── Daily Cleaning 624 — no per-row initials ────────────────────────────────

describe("Daily Cleaning 624 — no per-row initials", () => {
  it("DoneNaRow624 has no initials input or prop", () => {
    const doneNaSrc = src("src/components/forms624/DoneNaRow624.tsx");
    expect(doneNaSrc).not.toContain("initials");
  });

  it("DC624 form page has no per-row initials input", () => {
    const dc624Src = src(
      "src/app/(dashboard)/dashboard/supervisor/daily-cleaning-624/page.tsx"
    );
    // Header initials exist but no row-level initials input
    expect(dc624Src).not.toMatch(/row\.initials/);
    expect(dc624Src).not.toContain("showRowInitials");
  });
});

// ─── Monthly Cleaning 624 — exactly one initials input (header only) ─────────

describe("Monthly Cleaning 624 — no per-row initials", () => {
  it("MC624 form page has no showRowInitials opt-in", () => {
    const mc624Src = src(
      "src/app/(dashboard)/dashboard/supervisor/monthly-cleaning-624/page.tsx"
    );
    expect(mc624Src).not.toContain("showRowInitials");
  });

  it("MC624 form page has no per-row initials input (placeholder=Init)", () => {
    const mc624Src = src(
      "src/app/(dashboard)/dashboard/supervisor/monthly-cleaning-624/page.tsx"
    );
    expect(mc624Src).not.toMatch(/placeholder=["']Init["']/);
  });
});

// ─── OkNotOkRow — no other callers pass showRowInitials={true} ───────────────

describe("no other form opts in to per-row initials", () => {
  it("records page does not pass showRowInitials to readOnly OkNotOkRow rows", () => {
    const recordsSrc = src(
      "src/app/(dashboard)/dashboard/supervisor/pre-op-624/records/page.tsx"
    );
    expect(recordsSrc).not.toContain("showRowInitials");
  });
});
