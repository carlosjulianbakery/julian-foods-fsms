import { describe, it, expect } from "vitest";
import {
  MONTHLY_ACTIVITIES,
  MONTHLY_CHEMICAL_MAP,
  MONTHLY_CHEM_FOOD_CONTACT,
  MONTHLY_CHEM_SIMPLE_GREEN,
  MONTHLY_CHEM_PINE_SOL,
  INSTRUCTIONS_TEXT_MONTHLY,
  INSTRUCTIONS_VER_MONTHLY,
} from "@/app/(dashboard)/dashboard/supervisor/monthly-cleaning-624/config";

// ─── 19 activities check ────────────────────────────────────────────────────

describe("MONTHLY_ACTIVITIES", () => {
  it("has exactly 19 activities", () => {
    expect(MONTHLY_ACTIVITIES).toHaveLength(19);
  });

  it("all activities have key, en, and es", () => {
    for (const a of MONTHLY_ACTIVITIES) {
      expect(a.key).toBeTruthy();
      expect(a.en).toBeTruthy();
      expect(a.es).toBeTruthy();
    }
  });

  it("keys are unique", () => {
    const keys = MONTHLY_ACTIVITIES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("contains all expected keys in order", () => {
    const expected = [
      "trays", "bread_racks", "oven_carts", "oven_interiors", "cooling_fans",
      "zip_tie_machines", "walk_in_cooler", "production_ceiling", "utensil_racks",
      "ingredient_racks", "warehouse_doors", "warehouse_walls", "roll_up_door",
      "office_space", "outside_break_area", "extinguisher", "warehouse_ceiling",
      "hawaiian_curtain", "freezer_floor",
    ];
    expect(MONTHLY_ACTIVITIES.map((a) => a.key)).toEqual(expected);
  });

  it("item 19 has exact English label including (3021 Industry St)", () => {
    const item19 = MONTHLY_ACTIVITIES[18];
    expect(item19.en).toBe("Freezer Floor (3021 Industry St)");
  });

  it("does NOT contain daily-only items (Mixer 07, Mono Depositor, Flowrapper, etc.)", () => {
    const keys = MONTHLY_ACTIVITIES.map((a) => a.key);
    const dailyOnlyKeys = ["mixer_07", "mixer_08", "mono_depositor", "unifiller_depositor", "flowrapper", "bread_slicer", "bun_slicer", "food_processor", "mixing_bowls"];
    for (const k of dailyOnlyKeys) {
      expect(keys).not.toContain(k);
    }
  });

  it("bilingual labels — no literal \\uXXXX escape sequences in EN labels", () => {
    const LITERAL_ESCAPE_RE = /\\u[0-9a-fA-F]{4}/;
    for (const a of MONTHLY_ACTIVITIES) {
      expect(a.en).not.toMatch(LITERAL_ESCAPE_RE);
      expect(a.es).not.toMatch(LITERAL_ESCAPE_RE);
    }
  });
});

// ─── Chemical map ────────────────────────────────────────────────────────────

describe("MONTHLY_CHEMICAL_MAP", () => {
  it("items 1,2,3,9 (trays,bread_racks,oven_carts,utensil_racks) are food contact", () => {
    expect(MONTHLY_CHEMICAL_MAP["trays"]).toBe(MONTHLY_CHEM_FOOD_CONTACT);
    expect(MONTHLY_CHEMICAL_MAP["bread_racks"]).toBe(MONTHLY_CHEM_FOOD_CONTACT);
    expect(MONTHLY_CHEMICAL_MAP["oven_carts"]).toBe(MONTHLY_CHEM_FOOD_CONTACT);
    expect(MONTHLY_CHEMICAL_MAP["utensil_racks"]).toBe(MONTHLY_CHEM_FOOD_CONTACT);
  });

  it("non-food surfaces are simple green", () => {
    const simpleGreenKeys = [
      "oven_interiors", "cooling_fans", "zip_tie_machines", "walk_in_cooler",
      "production_ceiling", "ingredient_racks", "warehouse_doors", "warehouse_walls",
      "roll_up_door", "office_space", "warehouse_ceiling", "hawaiian_curtain",
    ];
    for (const k of simpleGreenKeys) {
      expect(MONTHLY_CHEMICAL_MAP[k]).toBe(MONTHLY_CHEM_SIMPLE_GREEN);
    }
  });

  it("freezer_floor is Pine-Sol", () => {
    expect(MONTHLY_CHEMICAL_MAP["freezer_floor"]).toBe(MONTHLY_CHEM_PINE_SOL);
  });

  it("outside_break_area and extinguisher have no chemical entry", () => {
    expect(MONTHLY_CHEMICAL_MAP["outside_break_area"]).toBeUndefined();
    expect(MONTHLY_CHEMICAL_MAP["extinguisher"]).toBeUndefined();
  });
});

// ─── Instructions ────────────────────────────────────────────────────────────

describe("config constants", () => {
  it("INSTRUCTIONS_VER_MONTHLY is v1.0", () => {
    expect(INSTRUCTIONS_VER_MONTHLY).toBe("v1.0");
  });

  it("instructions text does not contain allergen sentence", () => {
    expect(INSTRUCTIONS_TEXT_MONTHLY).not.toContain("allergen");
    expect(INSTRUCTIONS_TEXT_MONTHLY).not.toContain("Allergen");
  });

  it("instructions text does not contain literal \\uXXXX escapes", () => {
    expect(INSTRUCTIONS_TEXT_MONTHLY).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });
});
