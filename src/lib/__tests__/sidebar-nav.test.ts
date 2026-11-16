// Unit tests for the isNavActive sidebar helper.
// Critical invariant: a path must NOT activate a sibling whose href is a string
// prefix of that path (e.g. /pre-op must NOT activate when at /pre-op-624).

import { describe, it, expect } from "vitest";
import { isNavActive } from "@/components/layout/Sidebar";

describe("isNavActive", () => {
  // ── The core pre-op collision ────────────────────────────────────────────
  it("/pre-op-624 does NOT activate /pre-op", () => {
    expect(isNavActive("/dashboard/supervisor/pre-op-624", "/dashboard/supervisor/pre-op")).toBe(false);
  });

  it("/pre-op/records DOES activate /pre-op (child path)", () => {
    expect(isNavActive("/dashboard/supervisor/pre-op/records", "/dashboard/supervisor/pre-op")).toBe(true);
  });

  it("/pre-op itself activates /pre-op (exact)", () => {
    expect(isNavActive("/dashboard/supervisor/pre-op", "/dashboard/supervisor/pre-op")).toBe(true);
  });

  it("/pre-op-624 itself activates /pre-op-624", () => {
    expect(isNavActive("/dashboard/supervisor/pre-op-624", "/dashboard/supervisor/pre-op-624")).toBe(true);
  });

  it("/pre-op-624/records DOES activate /pre-op-624 (child path)", () => {
    expect(isNavActive("/dashboard/supervisor/pre-op-624/records", "/dashboard/supervisor/pre-op-624")).toBe(true);
  });

  // ── Dashboard (always exact) ─────────────────────────────────────────────
  it("/dashboard activates /dashboard", () => {
    expect(isNavActive("/dashboard", "/dashboard")).toBe(true);
  });

  it("/dashboard/supervisor/pre-op does NOT activate /dashboard", () => {
    expect(isNavActive("/dashboard/supervisor/pre-op", "/dashboard")).toBe(false);
  });

  // ── exact flag ───────────────────────────────────────────────────────────
  it("exact flag: /batch-sheet/draft does NOT activate /batch-sheet when exact=true", () => {
    expect(isNavActive("/dashboard/supervisor/batch-sheet/draft", "/dashboard/supervisor/batch-sheet", true)).toBe(false);
  });

  it("exact flag: /batch-sheet activates /batch-sheet when exact=true", () => {
    expect(isNavActive("/dashboard/supervisor/batch-sheet", "/dashboard/supervisor/batch-sheet", true)).toBe(true);
  });

  // ── Other potential prefix collisions ────────────────────────────────────
  it("/logs/pre-op does NOT activate /logs/pre-op-other (hypothetical)", () => {
    expect(isNavActive("/dashboard/logs/pre-op-other", "/dashboard/logs/pre-op")).toBe(false);
  });
});
