import { describe, it, expect, vi, afterEach } from "vitest";
import { getPacificMonthKey, toPacificMonthKey, lastDayOfMonth, formatMonthKeyLabel } from "@/lib/pacific-time";

afterEach(() => { vi.useRealTimers(); });

// ─── getPacificMonthKey ───────────────────────────────────────────────────────

describe("getPacificMonthKey", () => {
  it("returns YYYY-MM for a given Pacific moment (Nov 30 23:30 PT = Dec 1 07:30 UTC)", () => {
    // 2026-11-30T23:30 PT = 2026-12-01T07:30 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T07:30:00Z"));
    expect(getPacificMonthKey()).toBe("2026-11");
    vi.useRealTimers();
  });

  it("returns next month when UTC crosses midnight but PT is still the same month", () => {
    // 2026-12-01T00:30 PT = 2026-12-01T08:30 UTC (PST is UTC-8 in winter)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T08:30:00Z"));
    expect(getPacificMonthKey()).toBe("2026-12");
    vi.useRealTimers();
  });
});

// ─── toPacificMonthKey ───────────────────────────────────────────────────────

describe("toPacificMonthKey", () => {
  it("maps 2026-11-30T23:30 PT (2026-12-01T07:30 UTC) to 2026-11", () => {
    expect(toPacificMonthKey(new Date("2026-12-01T07:30:00Z"))).toBe("2026-11");
  });

  it("maps 2026-12-01T00:30 PT (2026-12-01T08:30 UTC) to 2026-12", () => {
    expect(toPacificMonthKey(new Date("2026-12-01T08:30:00Z"))).toBe("2026-12");
  });

  it("maps mid-day UTC November to 2026-11", () => {
    expect(toPacificMonthKey(new Date("2026-11-15T18:00:00Z"))).toBe("2026-11");
  });
});

// ─── lastDayOfMonth ───────────────────────────────────────────────────────────

describe("lastDayOfMonth", () => {
  it("returns 2026-11-30 for 2026-11", () => {
    expect(lastDayOfMonth("2026-11")).toBe("2026-11-30");
  });

  it("returns 2026-12-31 for 2026-12", () => {
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
  });

  it("returns 2027-02-28 for 2027-02 (non-leap)", () => {
    expect(lastDayOfMonth("2027-02")).toBe("2027-02-28");
  });

  it("returns 2028-02-29 for 2028-02 (leap year)", () => {
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
  });

  it("returns 2026-04-30 for 2026-04 (30-day month)", () => {
    expect(lastDayOfMonth("2026-04")).toBe("2026-04-30");
  });

  it("returns 2026-01-31 for 2026-01 (31-day month)", () => {
    expect(lastDayOfMonth("2026-01")).toBe("2026-01-31");
  });
});

// ─── formatMonthKeyLabel ──────────────────────────────────────────────────────

describe("formatMonthKeyLabel", () => {
  it("formats 2026-11 as November 2026", () => {
    expect(formatMonthKeyLabel("2026-11")).toBe("November 2026");
  });

  it("formats 2027-02 as February 2027", () => {
    expect(formatMonthKeyLabel("2027-02")).toBe("February 2027");
  });
});
