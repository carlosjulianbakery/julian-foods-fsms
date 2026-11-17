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
