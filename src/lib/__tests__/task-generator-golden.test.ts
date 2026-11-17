/**
 * Golden regression tests for computeDueDates.
 *
 * Purpose: prove that the endOfMonth changes (Jan 2026) are dead code for all
 * existing rule configurations (endOfMonth = false / undefined / null).
 *
 * Method: for every rule type, the expected output is derived from the OLD
 * logic (addMonthsToDateStr / plain alignCursor) and embedded as literals.
 * Any regression in the non-endOfMonth path causes a mismatch.
 *
 * "Production read-only" note: the production comparison is manual — after
 * running the ALTER TABLE and deploy, run:
 *   curl https://<prod>/api/task-instances?dryRun=true
 * and compare with the output of these golden tests to confirm no dates
 * shifted.
 */

import { describe, it, expect } from "vitest";
import { computeDueDates } from "@/lib/task-generator";
import type { TaskRule } from "@/generated/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type PartialRule = Partial<TaskRule> & { recurrenceEndOfMonth?: boolean | null };

function rule(overrides: PartialRule): TaskRule & { recurrenceEndOfMonth?: boolean | null } {
  return {
    id: "r1",
    title: "Test",
    description: null,
    facilityId: "fac-1",
    ownerId: "user-1",
    triggerType: "RECURRING",
    recurrenceUnit: "day",
    recurrenceEvery: 1,
    recurrenceStart: new Date("2026-01-01T12:00:00Z"),
    recurrenceEndOfMonth: false,
    formKey: "test",
    productName: null,
    escalateAfterDays: null,
    isActive: true,
    isArchived: false,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TaskRule & { recurrenceEndOfMonth?: boolean | null };
}

// ─── Daily rules ─────────────────────────────────────────────────────────────

describe("golden — daily rules (endOfMonth irrelevant)", () => {
  it("every 1 day: 7-day window produces 7 consecutive dates", () => {
    const r = rule({ recurrenceUnit: "day", recurrenceEvery: 1, recurrenceStart: new Date("2026-11-10T12:00:00Z") });
    const dates = computeDueDates(r, "2026-11-10", "2026-11-16");
    expect(dates).toEqual([
      "2026-11-10", "2026-11-11", "2026-11-12",
      "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16",
    ]);
  });

  it("every 2 days: start in past aligns correctly", () => {
    // start 2026-01-01, today 2026-11-17 → cursor advances by 2 until >= today
    const r = rule({ recurrenceUnit: "day", recurrenceEvery: 2, recurrenceStart: new Date("2026-01-01T12:00:00Z") });
    const dates = computeDueDates(r, "2026-11-17", "2026-11-21");
    // 2026-01-01 + N*2 days must land on an odd-day offset from Jan 1
    // Jan 1 → Jan 3 → ... → Nov 15 → Nov 17 → Nov 19 → Nov 21
    expect(dates).toContain("2026-11-17");
    expect(dates).toContain("2026-11-19");
    expect(dates).toContain("2026-11-21");
    expect(dates).not.toContain("2026-11-18");
    expect(dates).not.toContain("2026-11-20");
  });

  it("every 3 days", () => {
    const r = rule({ recurrenceUnit: "day", recurrenceEvery: 3, recurrenceStart: new Date("2026-11-01T12:00:00Z") });
    const dates = computeDueDates(r, "2026-11-01", "2026-11-13");
    expect(dates).toEqual(["2026-11-01", "2026-11-04", "2026-11-07", "2026-11-10", "2026-11-13"]);
  });
});

// ─── Weekly rules ─────────────────────────────────────────────────────────────

describe("golden — weekly rules (endOfMonth irrelevant)", () => {
  it("every 1 week: 4 occurrences in 28-day window", () => {
    const r = rule({ recurrenceUnit: "week", recurrenceEvery: 1, recurrenceStart: new Date("2026-11-03T12:00:00Z") });
    const dates = computeDueDates(r, "2026-11-03", "2026-11-30");
    expect(dates).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
  });

  it("every 2 weeks", () => {
    const r = rule({ recurrenceUnit: "week", recurrenceEvery: 2, recurrenceStart: new Date("2026-11-03T12:00:00Z") });
    const dates = computeDueDates(r, "2026-11-03", "2026-12-01");
    expect(dates).toEqual(["2026-11-03", "2026-11-17", "2026-12-01"]);
  });
});

// ─── Monthly rules — standard (day-of-month, endOfMonth = false) ──────────────

describe("golden — monthly rules day-of-month (endOfMonth = false)", () => {
  it("monthly day 11: generates the 11th each month", () => {
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 1,
      recurrenceStart: new Date("2026-11-11T12:00:00Z"),
      recurrenceEndOfMonth: false,
    });
    const dates = computeDueDates(r, "2026-11-01", "2027-04-30");
    expect(dates).toEqual([
      "2026-11-11", "2026-12-11", "2027-01-11", "2027-02-11", "2027-03-11", "2027-04-11",
    ]);
  });

  it("monthly day 28: handles February (addMonthsToDateStr overflow is JS-native)", () => {
    // addMonthsToDateStr uses setUTCMonth — for day 28 it never overflows since
    // every month has at least 28 days.
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 1,
      recurrenceStart: new Date("2026-11-28T12:00:00Z"),
      recurrenceEndOfMonth: false,
    });
    const dates = computeDueDates(r, "2026-11-01", "2027-04-30");
    expect(dates).toEqual([
      "2026-11-28", "2026-12-28", "2027-01-28", "2027-02-28", "2027-03-28", "2027-04-28",
    ]);
  });

  it("monthly day 29: Feb 2027 (non-leap) overflows to Mar 1 via addMonthsToDateStr (known JS behavior, not a regression)", () => {
    // This is the KNOWN behavior of the old code. The endOfMonth fix does NOT
    // change this path — it only applies when recurrenceEndOfMonth=true.
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 1,
      recurrenceStart: new Date("2026-11-29T12:00:00Z"),
      recurrenceEndOfMonth: false,
    });
    const dates = computeDueDates(r, "2026-11-01", "2027-04-30");
    // JS setUTCMonth(1, 29) on a non-leap year → Mar 1 overflow
    expect(dates).toContain("2026-11-29");
    expect(dates).toContain("2026-12-29");
    expect(dates).toContain("2027-01-29");
    // Feb 29 does not exist in 2027; addMonthsToDateStr overflows to Mar 1
    expect(dates).toContain("2027-03-01");
    // After the overflow the cursor is Mar 1, so Apr is Apr 1 not Apr 29
    expect(dates).not.toContain("2027-02-28");
    expect(dates).not.toContain("2027-02-29");
  });

  it("monthly day 31: overflow chain is unchanged from old code (each short month cascades)", () => {
    // addMonthsToDateStr("2026-10-31") + 1 month: setUTCMonth(Oct,+1) → Nov 31 → Dec 1
    // addMonthsToDateStr("2026-12-01") + 1 month: Jan 1
    // Once a day-31 rule overflows it stays on day 1 for the rest of the sequence.
    // This is the KNOWN pre-existing behavior. endOfMonth=false does not change it.
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 1,
      recurrenceStart: new Date("2026-10-31T12:00:00Z"),
      recurrenceEndOfMonth: false,
    });
    const dates = computeDueDates(r, "2026-10-31", "2027-04-30");
    expect(dates[0]).toBe("2026-10-31");
    // Nov 31 doesn't exist → JS overflows to Dec 1
    expect(dates[1]).toBe("2026-12-01");
    // After Dec 1 all subsequent months land on the 1st
    expect(dates[2]).toBe("2027-01-01");
    expect(dates[3]).toBe("2027-02-01");
    expect(dates[4]).toBe("2027-03-01");
    expect(dates[5]).toBe("2027-04-01");
    expect(dates).not.toContain("2026-12-31");
    expect(dates).not.toContain("2026-11-30");
  });

  it("every 2 months", () => {
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 2,
      recurrenceStart: new Date("2026-11-01T12:00:00Z"),
      recurrenceEndOfMonth: false,
    });
    const dates = computeDueDates(r, "2026-11-01", "2027-05-01");
    expect(dates).toEqual(["2026-11-01", "2027-01-01", "2027-03-01", "2027-05-01"]);
  });

  it("every 3 months", () => {
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 3,
      recurrenceStart: new Date("2026-11-15T12:00:00Z"),
      recurrenceEndOfMonth: false,
    });
    const dates = computeDueDates(r, "2026-11-01", "2027-11-30");
    expect(dates).toEqual([
      "2026-11-15", "2027-02-15", "2027-05-15", "2027-08-15", "2027-11-15",
    ]);
  });
});

// ─── endOfMonth = null (DB NULL before migration applied) ─────────────────────

describe("golden — recurrenceEndOfMonth = null (pre-migration rows)", () => {
  it("null is treated as false — monthly day 11 unchanged", () => {
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 1,
      recurrenceStart: new Date("2026-11-11T12:00:00Z"),
      recurrenceEndOfMonth: null,
    });
    const dates = computeDueDates(r, "2026-11-01", "2027-02-28");
    expect(dates).toEqual(["2026-11-11", "2026-12-11", "2027-01-11", "2027-02-11"]);
  });

  it("null is treated as false — weekly unchanged", () => {
    const r = rule({
      recurrenceUnit: "week",
      recurrenceEvery: 1,
      recurrenceStart: new Date("2026-11-10T12:00:00Z"),
      recurrenceEndOfMonth: null,
    });
    const dates = computeDueDates(r, "2026-11-10", "2026-11-24");
    expect(dates).toEqual(["2026-11-10", "2026-11-17", "2026-11-24"]);
  });
});

// ─── ONE_OFF rules ────────────────────────────────────────────────────────────

describe("golden — ONE_OFF rules (endOfMonth field not consulted)", () => {
  it("ONE_OFF in range is returned", () => {
    const r = rule({
      triggerType: "ONE_OFF",
      recurrenceStart: new Date("2026-11-20T12:00:00Z"),
    });
    const dates = computeDueDates(r, "2026-11-17", "2026-11-30");
    expect(dates).toEqual(["2026-11-20"]);
  });

  it("ONE_OFF before today is not returned", () => {
    const r = rule({
      triggerType: "ONE_OFF",
      recurrenceStart: new Date("2026-11-10T12:00:00Z"),
    });
    const dates = computeDueDates(r, "2026-11-17", "2026-11-30");
    expect(dates).toEqual([]);
  });

  it("ONE_OFF beyond horizon is not returned", () => {
    const r = rule({
      triggerType: "ONE_OFF",
      recurrenceStart: new Date("2026-12-15T12:00:00Z"),
    });
    const dates = computeDueDates(r, "2026-11-17", "2026-11-30");
    expect(dates).toEqual([]);
  });
});

// ─── endOfMonth = true: separate from golden, confirms new path works ────────

describe("golden — endOfMonth = true produces month-end dates (new path)", () => {
  it("monthly endOfMonth: Nov 30, Dec 31, Jan 31, Feb 28 (non-leap 2027)", () => {
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 1,
      recurrenceStart: new Date("2026-11-01T12:00:00Z"),
      recurrenceEndOfMonth: true,
    });
    const dates = computeDueDates(r, "2026-11-01", "2027-02-28");
    expect(dates).toEqual(["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("every 2 months endOfMonth: Nov 30, Jan 31, Mar 31", () => {
    const r = rule({
      recurrenceUnit: "month",
      recurrenceEvery: 2,
      recurrenceStart: new Date("2026-11-01T12:00:00Z"),
      recurrenceEndOfMonth: true,
    });
    const dates = computeDueDates(r, "2026-11-01", "2027-04-30");
    expect(dates).toEqual(["2026-11-30", "2027-01-31", "2027-03-31"]);
  });
});
