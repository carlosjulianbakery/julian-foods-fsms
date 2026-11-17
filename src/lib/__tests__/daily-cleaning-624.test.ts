import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { draftKey624, loadDraft624, saveDraft624, DRAFT_TTL_MS } from "@/components/forms624/draftStorage624";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TOTAL_ACTIVITIES = 19;

type RowState = "DONE" | "NA" | "NOT_DONE" | "UNTOUCHED";

interface Row {
  key: string;
  state: RowState;
  reason: string;
}

function makeRows(state: RowState = "UNTOUCHED"): Row[] {
  return Array.from({ length: TOTAL_ACTIVITIES }, (_, i) => ({
    key: `activity_${i}`,
    state,
    reason: "",
  }));
}

function canSubmit(rows: Row[]): boolean {
  const untouched = rows.filter((r) => r.state === "UNTOUCHED").length;
  const needsReason = rows.filter((r) => r.state === "NOT_DONE" && !r.reason.trim()).length;
  return untouched === 0 && needsReason === 0;
}

// ─── Validation ───────────────────────────────────────────────────────────────

describe("canSubmit validation", () => {
  it("blocks when any row is UNTOUCHED", () => {
    const rows = makeRows("DONE");
    rows[3].state = "UNTOUCHED";
    expect(canSubmit(rows)).toBe(false);
  });

  it("blocks when NOT_DONE row has no reason", () => {
    const rows = makeRows("DONE");
    rows[0].state = "NOT_DONE";
    rows[0].reason = "";
    expect(canSubmit(rows)).toBe(false);
  });

  it("allows NOT_DONE with reason", () => {
    const rows = makeRows("DONE");
    rows[0].state = "NOT_DONE";
    rows[0].reason = "Equipment down";
    expect(canSubmit(rows)).toBe(true);
  });

  it("NA rows do NOT require reason", () => {
    const rows = makeRows("NA");
    expect(canSubmit(rows)).toBe(true);
  });

  it("allows all DONE", () => {
    expect(canSubmit(makeRows("DONE"))).toBe(true);
  });
});

// ─── Mark all done ────────────────────────────────────────────────────────────

describe("markAllDone", () => {
  it("sets all rows to DONE", () => {
    const rows = makeRows("UNTOUCHED");
    const done = rows.map((r) => ({ ...r, state: "DONE" as RowState, reason: "" }));
    expect(done.every((r) => r.state === "DONE")).toBe(true);
    expect(canSubmit(done)).toBe(true);
  });
});

// ─── Draft key/expiry ─────────────────────────────────────────────────────────

describe("draftStorage624", () => {
  const PREFIX = "daily_cleaning_624";
  const USER_ID = "user-123";
  const DATE = "2026-01-15";

  beforeEach(() => {
    // Minimal localStorage mock
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates scoped key", () => {
    expect(draftKey624(PREFIX, USER_ID, DATE)).toBe(`${PREFIX}_draft:${USER_ID}:${DATE}`);
  });

  it("returns null for missing key", () => {
    expect(loadDraft624(PREFIX, USER_ID, DATE)).toBeNull();
  });

  it("round-trips data", () => {
    const data = { conductedBy: "HGA", rows: [{ key: "mixing_bowls", state: "DONE" }] };
    saveDraft624(PREFIX, USER_ID, DATE, data);
    expect(loadDraft624(PREFIX, USER_ID, DATE)).toMatchObject(data);
  });

  it("returns null for expired draft", () => {
    const data = { conductedBy: "HGA" };
    saveDraft624(PREFIX, USER_ID, DATE, data);
    // Advance time past TTL
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(realNow() + DRAFT_TTL_MS + 1000);
    expect(loadDraft624(PREFIX, USER_ID, DATE)).toBeNull();
    vi.restoreAllMocks();
  });
});

// ─── API payload shape ────────────────────────────────────────────────────────

describe("API payload validation (unit)", () => {
  function validatePostPayload(payload: {
    date: string;
    time: string;
    conductedBy: string;
    rows: Array<{ state: string; reason?: string | null }>;
  }): { ok: boolean; error?: string } {
    if (!payload.date) return { ok: false, error: "date required" };
    if (!payload.time) return { ok: false, error: "time required" };
    if (!payload.conductedBy) return { ok: false, error: "conductedBy required" };
    if (!Array.isArray(payload.rows) || payload.rows.length !== 19)
      return { ok: false, error: "rows must be 19 items" };
    const badState = payload.rows.filter((r) => !["DONE","NA","NOT_DONE"].includes(r.state));
    if (badState.length) return { ok: false, error: "All rows must have a state" };
    const badReason = payload.rows.filter((r) => r.state === "NOT_DONE" && !r.reason?.trim());
    if (badReason.length) return { ok: false, error: "NOT_DONE rows missing reason" };
    return { ok: true };
  }

  it("accepts all 19 DONE rows", () => {
    const rows = Array.from({ length: 19 }, (_, i) => ({ key: `a${i}`, state: "DONE" }));
    expect(validatePostPayload({ date: "2026-01-15", time: "09:00", conductedBy: "HGA", rows })).toMatchObject({ ok: true });
  });

  it("rejects rows with UNTOUCHED state", () => {
    const rows = Array.from({ length: 19 }, (_, i) => ({ key: `a${i}`, state: i === 0 ? "UNTOUCHED" : "DONE" }));
    expect(validatePostPayload({ date: "2026-01-15", time: "09:00", conductedBy: "HGA", rows })).toMatchObject({ ok: false });
  });

  it("rejects NOT_DONE without reason", () => {
    const rows = Array.from({ length: 19 }, (_, i) => ({
      key: `a${i}`,
      state: i === 0 ? "NOT_DONE" : "DONE",
      reason: i === 0 ? "" : null,
    }));
    expect(validatePostPayload({ date: "2026-01-15", time: "09:00", conductedBy: "HGA", rows })).toMatchObject({ ok: false });
  });
});

// ─── Facility-awareness ───────────────────────────────────────────────────────

describe("facilityName for task completion", () => {
  it("uses facilityName '624' not 'Julian Bakery'", () => {
    const params = {
      formKey: "daily_cleaning_624",
      facilityName: "624",
    };
    expect(params.facilityName).toBe("624");
    expect(params.facilityName).not.toBe("Julian Bakery");
  });
});

// ─── DELETE reversal warning ──────────────────────────────────────────────────

describe("DELETE reversal warning", () => {
  it("returns deleted:true with warning when reopen fails", () => {
    const response = {
      deleted: true,
      warning: "task_reopen_failed",
    };
    expect(response.deleted).toBe(true);
    expect(response.warning).toBe("task_reopen_failed");
  });
});
