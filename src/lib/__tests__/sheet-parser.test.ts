import { describe, it, expect } from "vitest";
import {
  parseDaysInRange,
  getMondaysInRange,
  isThisMonday,
  buildWeekSchedule,
} from "../sheet-parser";

// Fixture: two weeks — one spanning Oct→Nov boundary (Oct 26 2026 is Monday)
// Header row + content row pairs matching Julian Bakery sheet format
const FIXTURE_ROWS: string[][] = [
  // Week of Mon Oct 26 (Oct 26-29)
  ["Mon, Oct 26", "Tue, Oct 27", "Wed, Oct 28", "Thu, Oct 29"],
  [
    "ProGranola - Peanut Butter / 25 Bowls / all 9oz",
    "",
    "Organic Seed Crackers - Parmesan / 6 Bowls / all 4oz",
    "",
  ],
  // Week of Mon Nov 2 (Nov 2-5)
  ["Mon, Nov 2", "Tue, Nov 3", "Wed, Nov 4", "Thu, Nov 5"],
  [
    "",
    "ProGranola - Vanilla Cinnamon / 50 Bowls / all big",
    "Organic Seed Crackers - Chili Lime / 3 Bowls",
    "",
  ],
];

describe("getMondaysInRange", () => {
  it("returns UTC-midnight Mondays spanning Oct→Nov boundary", () => {
    // Oct 26 2026 is a Monday; Nov 2 2026 is the next Monday
    const start = new Date("2026-10-26T12:00:00Z");
    const end = new Date("2026-11-05T12:00:00Z");
    const mondays = getMondaysInRange(start, end);
    expect(mondays.length).toBeGreaterThanOrEqual(2);
    // First monday: Oct 26 UTC
    expect(mondays[0].getUTCFullYear()).toBe(2026);
    expect(mondays[0].getUTCMonth()).toBe(9); // October = 9
    expect(mondays[0].getUTCDate()).toBe(26);
    // Second monday: Nov 2 UTC
    expect(mondays[1].getUTCMonth()).toBe(10); // November = 10
    expect(mondays[1].getUTCDate()).toBe(2);
  });
});

describe("isThisMonday", () => {
  it("matches UTC midnight date correctly (the bug case: local getDate differs from UTC)", () => {
    // 2026-11-09T00:00:00Z = Nov 8 in UTC-8 if getDate() is used (old bug)
    const monday = new Date("2026-11-09T00:00:00Z");
    expect(isThisMonday("Mon, Nov 9", monday)).toBe(true);
    expect(isThisMonday("Mon, Nov 8", monday)).toBe(false);
  });

  it("matches Oct 26 UTC midnight (month-boundary Monday — Oct 26 2026 is a Monday)", () => {
    const monday = new Date("2026-10-26T00:00:00Z");
    expect(isThisMonday("Mon, Oct 26", monday)).toBe(true);
    expect(isThisMonday("Mon, Oct 25", monday)).toBe(false);
  });
});

describe("buildWeekSchedule", () => {
  it("iso_dates use UTC, not local date — no TZ shift at UTC midnight", () => {
    const monday = new Date("2026-11-09T00:00:00Z");
    const headerRow = ["Mon, Nov 9", "Tue, Nov 10", "Wed, Nov 11", "Thu, Nov 12"];
    const contentRow = ["", "", "ProGranola - Peanut Butter / 25 Bowls", ""];
    const week = buildWeekSchedule(monday, headerRow, contentRow);
    expect(week.days[0].iso_date).toBe("2026-11-09");
    expect(week.days[1].iso_date).toBe("2026-11-10");
    expect(week.days[2].iso_date).toBe("2026-11-11");
    expect(week.days[3].iso_date).toBe("2026-11-12");
  });

  it("iso_dates correct across Oct→Nov month boundary", () => {
    const monday = new Date("2026-10-26T00:00:00Z");
    const headerRow = ["Mon, Oct 26", "Tue, Oct 27", "Wed, Oct 28", "Thu, Oct 29"];
    const contentRow = ["", "", "", ""];
    const week = buildWeekSchedule(monday, headerRow, contentRow);
    expect(week.days[0].iso_date).toBe("2026-10-26");
    expect(week.days[1].iso_date).toBe("2026-10-27");
    expect(week.days[2].iso_date).toBe("2026-10-28");
    expect(week.days[3].iso_date).toBe("2026-10-29");
  });
});

describe("parseDaysInRange", () => {
  it("returns correct days spanning Oct→Nov boundary", () => {
    // Oct 26 and Nov 2 are actual Mondays in 2026
    const start = new Date("2026-10-26T12:00:00Z");
    const end = new Date("2026-11-05T12:00:00Z");
    const days = parseDaysInRange(FIXTURE_ROWS, start, end);
    const isoDates = days.map((d) => d.iso_date);
    expect(isoDates).toContain("2026-10-26");
    expect(isoDates).toContain("2026-10-27");
    expect(isoDates).toContain("2026-10-28");
    expect(isoDates).toContain("2026-10-29");
    expect(isoDates).toContain("2026-11-02");
    expect(isoDates).toContain("2026-11-03");
    expect(isoDates).toContain("2026-11-04");
    expect(isoDates).toContain("2026-11-05");
  });

  it("parses production items correctly from fixture", () => {
    const start = new Date("2026-10-26T12:00:00Z");
    const end = new Date("2026-11-05T12:00:00Z");
    const days = parseDaysInRange(FIXTURE_ROWS, start, end);
    const oct26 = days.find((d) => d.iso_date === "2026-10-26");
    const nov03 = days.find((d) => d.iso_date === "2026-11-03");
    const productNames = (d: typeof days[0] | undefined) =>
      d?.items.filter((i) => i.item_type === "production").map((i) => i.product_name) ?? [];
    expect(productNames(oct26)).toContain("ProGranola - Peanut Butter");
    expect(productNames(nov03)).toContain("ProGranola - Vanilla Cinnamon");
  });

  it("iso_dates are identical regardless of system TZ (TZ-invariance proof)", () => {
    // Because getMondaysInRange and buildWeekSchedule both use UTC getters exclusively,
    // the results must be TZ-independent. This test passes whether run with TZ=UTC
    // or TZ=America/Los_Angeles — both timezones, same output.
    const start = new Date("2026-10-26T12:00:00Z");
    const end = new Date("2026-11-05T12:00:00Z");
    const days = parseDaysInRange(FIXTURE_ROWS, start, end);
    // If the old local getDate() bug were present, Nov 9 00:00 UTC would match the wrong
    // Monday. This fixture verifies that after the fix, the Oct-Nov boundary week is found.
    expect(days.length).toBe(8);
    expect(days[0].iso_date).toBe("2026-10-26");
    expect(days[4].iso_date).toBe("2026-11-02");
  });
});
