import { describe, it, expect, vi, afterEach } from "vitest";
import { getPacificIsoWeek, isoWeekOf, parseIsoWeekKey } from "@/lib/pacific-time";

afterEach(() => vi.useRealTimers());

describe("ISO week of a calendar date", () => {
  it("every day of a week, Monday to Sunday, is the same week", () => {
    const days = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
    for (const d of days) expect(isoWeekOf(d), d).toEqual({ key: "2026-W48", start: "2026-11-23", end: "2026-11-29", year: 2026, week: 48 });
    expect(isoWeekOf("2026-11-22").key).toBe("2026-W47"); // the Sunday before
    expect(isoWeekOf("2026-11-30").key).toBe("2026-W49"); // the Monday after
  });

  it("a week that straddles two months is one week: Mon 2026-11-30 to Sun 2026-12-06 is 2026-W49", () => {
    for (const d of ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"])
      expect(isoWeekOf(d), d).toMatchObject({ key: "2026-W49", start: "2026-11-30", end: "2026-12-06" });
  });

  it("the year boundary: Mon 2026-12-28 to Sun 2027-01-03 is 2026-W53, and 2027-W01 starts Mon 2027-01-04", () => {
    for (const d of ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"])
      expect(isoWeekOf(d), d).toEqual({ key: "2026-W53", start: "2026-12-28", end: "2027-01-03", year: 2026, week: 53 });
    expect(isoWeekOf("2027-01-01").key).toBe("2026-W53"); // a Friday in 2027 that belongs to 2026's last week
    expect(isoWeekOf("2027-01-04")).toEqual({ key: "2027-W01", start: "2027-01-04", end: "2027-01-10", year: 2027, week: 1 });
    expect(isoWeekOf("2026-12-27").key).toBe("2026-W52");
  });

  it("other year boundaries: week 1 can start in December, and most years have 52 weeks", () => {
    expect(isoWeekOf("2025-12-29")).toMatchObject({ key: "2026-W01", start: "2025-12-29", end: "2026-01-04" }); // Monday in 2025, week 1 of 2026
    expect(isoWeekOf("2026-01-01").key).toBe("2026-W01");
    expect(isoWeekOf("2027-12-31").key).toBe("2027-W52");
    expect(isoWeekOf("2028-01-02").key).toBe("2027-W52"); // Sunday
    expect(isoWeekOf("2028-01-03").key).toBe("2028-W01");
    expect(isoWeekOf("2024-12-30").key).toBe("2025-W01");
  });

  it("leap day and consecutive weeks follow on without gaps", () => {
    expect(isoWeekOf("2028-02-29").key).toBe("2028-W09");
    let day = new Date("2026-01-05T12:00:00Z"); // Monday of 2026-W02
    for (let w = 2; w <= 53; w++) {
      const iso = day.toISOString().slice(0, 10);
      expect(isoWeekOf(iso), iso).toMatchObject({ key: `2026-W${String(w).padStart(2, "0")}`, start: iso });
      day = new Date(day.getTime() + 7 * 864e5);
    }
  });
});

describe("parsing a week key", () => {
  it("returns the week's Monday and Sunday", () => {
    expect(parseIsoWeekKey("2026-W48")).toEqual({ key: "2026-W48", start: "2026-11-23", end: "2026-11-29", year: 2026, week: 48 });
    expect(parseIsoWeekKey("2026-W53")).toMatchObject({ start: "2026-12-28", end: "2027-01-03" });
    expect(parseIsoWeekKey("2027-W01")).toMatchObject({ start: "2027-01-04" });
  });
  it("rejects anything that is not a real ISO week", () => {
    for (const bad of ["2026-W00", "2027-W53", "2026-W54", "2026-48", "2026-W4", "2026-11-B", "", "W48"]) expect(parseIsoWeekKey(bad), bad).toBeNull();
  });
});

describe("the current Pacific week", () => {
  it("is decided by the Pacific date, not the UTC date", () => {
    vi.useFakeTimers();
    // Monday 2026-11-30 06:30 UTC is still Sunday 10:30 PM in California: week 48, not 49
    vi.setSystemTime(new Date("2026-11-30T06:30:00Z"));
    expect(getPacificIsoWeek().key).toBe("2026-W48");
    // Two hours later it is Monday 12:30 AM Pacific: week 49
    vi.setSystemTime(new Date("2026-11-30T08:30:00Z"));
    expect(getPacificIsoWeek()).toMatchObject({ key: "2026-W49", start: "2026-11-30", end: "2026-12-06" });
    // New Year's Day 2027, any time of day in California, is still 2026-W53
    vi.setSystemTime(new Date("2027-01-01T20:00:00Z"));
    expect(getPacificIsoWeek().key).toBe("2026-W53");
  });
});
