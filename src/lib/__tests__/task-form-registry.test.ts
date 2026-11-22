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

// ── getFormKeyOptions: flat, sorted, equals registry ─────────────────────────

describe("getFormKeyOptions", () => {
  it("returns exactly one option per registry entry that a person may choose — no hardcoded extras", () => {
    const opts = getFormKeyOptions();
    // system-managed entries (the CAPA follow-up) are never offered in the dropdown
    const registryKeys = Object.keys(TASK_FORM_REGISTRY).filter((k) => !TASK_FORM_REGISTRY[k].systemManaged);
    expect(opts.map((o) => o.value).sort()).toEqual(registryKeys.sort());
    expect(Object.keys(TASK_FORM_REGISTRY).filter((k) => TASK_FORM_REGISTRY[k].systemManaged)).toEqual(["quality_capa"]);
  });

  it("each option label matches the registry entry label", () => {
    const opts = getFormKeyOptions();
    for (const opt of opts) {
      expect(opt.label).toBe(TASK_FORM_REGISTRY[opt.value].label);
    }
  });

  it("options are sorted alphabetically by label (flat, no groups)", () => {
    const opts = getFormKeyOptions();
    const labels = opts.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("options have only value and label — no facility, category, or group fields", () => {
    const opts = getFormKeyOptions();
    for (const opt of opts) {
      expect(Object.keys(opt).sort()).toEqual(["label", "value"]);
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
  const mockRules = [
    { title: "Daily Cleaning", formKey: "daily_cleaning" },
    { title: "Pre-Op Inspection", formKey: "preop" },
    { title: "Monthly Cleaning", formKey: "monthly_cleaning" },
    { title: "SOP Review", formKey: "sop_review" },
    { title: "Batch Sheet - Julian Bakery", formKey: "batch_sheet" },
    { title: "Batch Sheet - 624", formKey: "batch_sheet" },
    { title: "Pre-Op Inspection — 624", formKey: "preop_624" },
  ];

  for (const rule of mockRules) {
    it(`rule "${rule.title}" formKey "${rule.formKey}" resolves`, () => {
      expect(TASK_FORM_REGISTRY).toHaveProperty(rule.formKey);
    });
  }

  it("unknown formKey does NOT resolve (guard test)", () => {
    expect(TASK_FORM_REGISTRY).not.toHaveProperty("nonexistent_form_xyz");
    expect(getFormLabel("nonexistent_form_xyz")).toBeNull();
  });
});

// ── Unknown formKey is preserved on save ─────────────────────────────────────

describe("unknown formKey preservation contract", () => {
  it("getFormLabel returns null for an unknown key — UI shows fallback, never clears value", () => {
    expect(getFormLabel("some_future_form")).toBeNull();
  });
  it("getFormEntry returns null for an unknown key", () => {
    expect(getFormEntry("future_form")).toBeNull();
  });
});
