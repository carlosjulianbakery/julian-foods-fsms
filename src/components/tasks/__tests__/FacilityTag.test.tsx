import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Source-code structural test: ensures FacilityTag renders with pill-only classes
// and cannot stretch in a flex-col container. If someone accidentally changes
// inline-flex or self-start, this test fails before it hits prod.

const src = readFileSync(
  resolve(__dirname, "../FacilityTag.tsx"),
  "utf8"
);

describe("FacilityTag source assertions", () => {
  it("uses inline-flex to stay pill-width in any context", () => {
    expect(src).toContain("inline-flex");
    // Must NOT use bare block display — that would stretch as a flex-col child
    expect(src).not.toMatch(/className="[^"]*\bblock\b[^"]*"/);
  });

  it("uses self-start to prevent stretch inside flex-col containers", () => {
    // self-start = align-self: flex-start, overrides the default align-items: stretch
    // that would otherwise make the tag full-width inside a flex-col chip
    expect(src).toContain("self-start");
  });

  it("does not contain w-full which would force full-width stretch", () => {
    expect(src).not.toContain("w-full");
  });

  it("renders named facility with indigo styling", () => {
    expect(src).toContain("bg-indigo-100");
    expect(src).toContain("text-indigo-600");
  });

  it("renders null facility (All facilities) with gray styling", () => {
    expect(src).toContain("All facilities");
    expect(src).toContain("bg-gray-100");
    expect(src).toContain("text-gray-500");
  });

  it("both spans use the same pill classes (shrink-0, rounded)", () => {
    const spans = src.match(/<span className="[^"]+"/g) ?? [];
    expect(spans.length).toBe(2);
    spans.forEach(span => {
      expect(span).toContain("inline-flex");
      expect(span).toContain("self-start");
      expect(span).toContain("shrink-0");
      expect(span).toContain("rounded");
    });
  });
});
