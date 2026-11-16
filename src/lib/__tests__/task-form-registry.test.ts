import { describe, it, expect } from "vitest";
import {
  TASK_FORM_REGISTRY,
  getFormKeyOptions,
  getFormLabel,
  getFormEntry,
} from "../task-form-registry";

// ── Registry completeness ─────────────────────────────────────────────────────

describe("TASK_FORM_REGISTRY completeness", () => {
  const entries = Object.entries(TASK_FORM_REGISTRY);

  it("every entry has a non-empty label", () => {
    for (const [key, entry] of entries) {
      expect(entry.label, `${key}.label`).toBeTruthy();
    }
  });

  it("every entry has an href that is a function", () => {
    for (const [key, entry] of entries) {
      expect(typeof entry.href, `${key}.href`).toBe("function");
    }
  });

  it("every entry has a non-empty category", () => {
    for (const [key, entry] of entries) {
      expect(entry.category, `${key}.category`).toBeTruthy();
    }
  });

  it("all formKeys are unique (by design of an object)", () => {
    const keys = entries.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes all 8 expected formKeys", () => {
    const expected = [
      "daily_cleaning",
      "preop",
      "monthly_cleaning",
      "batch_sheet",
      "receiving",
      "sop_review",
      "preop_624",
      "manual",
    ];
    for (const key of expected) {
      expect(TASK_FORM_REGISTRY, `missing key: ${key}`).toHaveProperty(key);
    }
  });
});

// ── href stability — Start links must not change ──────────────────────────────

describe("href values are stable for all existing formKeys", () => {
  it("daily_cleaning", () => {
    expect(TASK_FORM_REGISTRY.daily_cleaning.href("x")).toBe("/dashboard/supervisor/cleaning/daily");
  });
  it("preop", () => {
    expect(TASK_FORM_REGISTRY.preop.href("x")).toBe("/dashboard/supervisor/pre-op");
  });
  it("monthly_cleaning", () => {
    expect(TASK_FORM_REGISTRY.monthly_cleaning.href("x")).toBe("/dashboard/supervisor/cleaning/monthly");
  });
  it("batch_sheet", () => {
    expect(TASK_FORM_REGISTRY.batch_sheet.href("x")).toBe("/dashboard/supervisor/batch-sheet");
  });
  it("receiving", () => {
    expect(TASK_FORM_REGISTRY.receiving.href("x")).toBe("/dashboard/supervisor/receiving");
  });
  it("sop_review", () => {
    expect(TASK_FORM_REGISTRY.sop_review.href("x")).toBe("/dashboard/compliance/sops");
  });
  it("preop_624", () => {
    expect(TASK_FORM_REGISTRY.preop_624.href("x")).toBe("/dashboard/supervisor/pre-op-624");
  });
  it("manual returns null", () => {
    expect(TASK_FORM_REGISTRY.manual.href("x")).toBeNull();
  });
});

// ── getFormKeyOptions equals registry ─────────────────────────────────────────

describe("getFormKeyOptions", () => {
  it("returns exactly one option per registry entry — no hardcoded extras", () => {
    const opts = getFormKeyOptions();
    const registryKeys = Object.keys(TASK_FORM_REGISTRY);
    expect(opts.map((o) => o.value).sort()).toEqual(registryKeys.sort());
  });

  it("each option label matches the registry entry label", () => {
    const opts = getFormKeyOptions();
    for (const opt of opts) {
      expect(opt.label).toBe(TASK_FORM_REGISTRY[opt.value].label);
    }
  });
});

// ── getFormLabel / getFormEntry helpers ───────────────────────────────────────

describe("getFormLabel", () => {
  it("returns label for a known key", () => {
    expect(getFormLabel("preop_624")).toBe("Pre-Op Inspection — 624");
  });
  it("returns null for an unknown key", () => {
    expect(getFormLabel("does_not_exist")).toBeNull();
  });
  it("returns null for null/undefined", () => {
    expect(getFormLabel(null)).toBeNull();
    expect(getFormLabel(undefined)).toBeNull();
  });
});

describe("getFormEntry", () => {
  it("returns entry for a known key", () => {
    expect(getFormEntry("batch_sheet")).not.toBeNull();
  });
  it("returns null for unknown key", () => {
    expect(getFormEntry("unknown_form")).toBeNull();
  });
});

// ── Every formKey used by existing rules resolves ────────────────────────────

describe("every formKey used by rules resolves to a registry entry", () => {
  // Representative mock of all current non-archived rules
  const mockRules = [
    { title: "Daily Cleaning", formKey: "daily_cleaning", isArchived: false },
    { title: "Pre-Op Inspection", formKey: "preop", isArchived: false },
    { title: "Monthly Cleaning", formKey: "monthly_cleaning", isArchived: false },
    { title: "SOP Review", formKey: "sop_review", isArchived: false },
    { title: "Batch Sheet - Julian Bakery", formKey: "batch_sheet", isArchived: false },
    { title: "Batch Sheet - 624", formKey: "batch_sheet", isArchived: false },
    { title: "Pre-Op Inspection — 624", formKey: "preop_624", isArchived: false },
  ];

  for (const rule of mockRules) {
    if (rule.formKey) {
      it(`rule "${rule.title}" formKey "${rule.formKey}" resolves`, () => {
        expect(TASK_FORM_REGISTRY, `formKey "${rule.formKey}" not in registry`).toHaveProperty(
          rule.formKey!
        );
      });
    }
  }

  it("unknown formKey in a mock rule does NOT resolve (guard test)", () => {
    const unknownKey = "nonexistent_form_xyz";
    expect(TASK_FORM_REGISTRY).not.toHaveProperty(unknownKey);
    expect(getFormLabel(unknownKey)).toBeNull();
  });
});

// ── Unknown formKey is preserved on save (contractual test) ──────────────────

describe("unknown formKey preservation contract", () => {
  it("getFormLabel returns null for an unknown key (UI should show fallback, not blank)", () => {
    const unknownKey = "some_future_form";
    expect(getFormLabel(unknownKey)).toBeNull();
    // UI contract: when null, display `Unknown form (${key})` and do not clear the value
  });

  it("getFormEntry returns null for an unknown key", () => {
    expect(getFormEntry("future_form")).toBeNull();
  });
});
