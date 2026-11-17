import { describe, it, expect } from "vitest";
import { deriveInitials, normalizeInitials, validateInitials } from "@/components/forms624/initialsHelper";

describe("deriveInitials", () => {
  it("extracts first letters of each word", () => {
    expect(deriveInitials("Hugo Garcia Ayala")).toBe("HGA");
  });

  it("caps at 4 letters", () => {
    expect(deriveInitials("Anna Beth Carol Dana")).toBe("ABCD");
  });

  it("handles hyphenated names", () => {
    expect(deriveInitials("Marie-Claire Dupont")).toBe("MCD");
  });

  it("falls back to email prefix when name is empty", () => {
    expect(deriveInitials("", "hugo@julianbakery.com")).toBe("H");
  });

  it("falls back to email when name is null", () => {
    expect(deriveInitials(null, "carlos@example.com")).toBe("C");
  });

  it("returns empty string when both are empty", () => {
    expect(deriveInitials(null, null)).toBe("");
  });

  it("uppercases the result", () => {
    expect(deriveInitials("john doe")).toBe("JD");
  });
});

describe("normalizeInitials", () => {
  it("strips non-letter characters", () => {
    expect(normalizeInitials("H.G.A.")).toBe("HGA");
  });

  it("uppercases", () => {
    expect(normalizeInitials("hga")).toBe("HGA");
  });

  it("caps at 4 characters", () => {
    expect(normalizeInitials("abcde")).toBe("ABCD");
  });
});

describe("validateInitials", () => {
  it("returns null for valid initials", () => {
    expect(validateInitials("HGA")).toBeNull();
  });

  it("returns error message for empty string", () => {
    expect(validateInitials("")).toBe("Initials are required");
  });

  it("returns error for whitespace-only", () => {
    expect(validateInitials("   ")).toBe("Initials are required");
  });
});


// ─── Source-code assertions: FormHeader624 and form pages ────────────────────
// These tests verify the initials refactor at the source level without a renderer.

import { readFileSync } from "fs";
import { resolve } from "path";

describe("FormHeader624 source — only Date/Time/Initials labels", () => {
  const src = readFileSync(
    resolve(__dirname, "../../components/forms624/FormHeader624.tsx"),
    "utf-8"
  );

  it("renders an Initials label", () => {
    expect(src).toContain("Initials");
  });

  it("does not render a 'Conducted by' label", () => {
    expect(src.toLowerCase()).not.toContain("conducted by");
  });
});

describe("DC624 route — conductedBy set from session, not client", () => {
  const src = readFileSync(
    resolve(__dirname, "../../app/api/daily-cleaning-624/route.ts"),
    "utf-8"
  );

  it("uses session.user.name as conductedBy", () => {
    expect(src).toContain("session.user.name");
  });

  it("does NOT read conductedBy from the request body", () => {
    // The body type does not include conductedBy
    expect(src).not.toContain("body.conductedBy");
  });
});

describe("Pre-Op 624 route — conductedBy stored as-is from body (initials)", () => {
  const src = readFileSync(
    resolve(__dirname, "../../app/api/pre-op-624/route.ts"),
    "utf-8"
  );

  it("persists body.conductedBy directly (the form sends initials there)", () => {
    expect(src).toContain("body.conductedBy");
  });
});
