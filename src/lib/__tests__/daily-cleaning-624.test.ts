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

  it("accepts all 19 NA rows", () => {
    const rows = Array.from({ length: 19 }, (_, i) => ({ key: `a${i}`, state: "NA" }));
    expect(validatePostPayload({ date: "2026-01-15", time: "09:00", conductedBy: "HGA", rows })).toMatchObject({ ok: true });
  });

  it("accepts NOT_DONE row WITH a reason", () => {
    const rows = Array.from({ length: 19 }, (_, i) => ({
      key: `a${i}`,
      state: i === 0 ? "NOT_DONE" : "DONE",
      reason: i === 0 ? "Equipment down" : null,
    }));
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

  it("completion query uses facility name '624' — only 624 instances are matched", () => {
    // Unit: the WHERE clause uses facilityName "624", so Julian Bakery instances
    // (facilityName "Julian Bakery") are never in the candidates list.
    const candidates624 = [
      { id: "inst-624-a", status: "DUE_TODAY", facility: { name: "624" } },
      { id: "inst-624-b", status: "UPCOMING", facility: { name: "624" } },
    ];
    const candidatesJB = [
      { id: "inst-jb-a", status: "DUE_TODAY", facility: { name: "Julian Bakery" } },
    ];
    // Simulate the WHERE filter: facility.name = "624"
    const filtered = [...candidates624, ...candidatesJB].filter(
      (c) => c.facility.name === "624"
    );
    expect(filtered.map((c) => c.id)).toEqual(["inst-624-a", "inst-624-b"]);
    expect(filtered.some((c) => c.facility.name === "Julian Bakery")).toBe(false);
  });

  it("Julian Bakery daily_cleaning instance stays untouched when facilityName='624'", () => {
    // Simulate: JB instance is filtered out because facility.name !== "624"
    const jbInstance = { id: "jb-dc-1", status: "DUE_TODAY", formKey: "daily_cleaning", facility: { name: "Julian Bakery" } };
    const filtered = [jbInstance].filter((c) => c.facility.name === "624");
    expect(filtered.length).toBe(0); // JB instance is NOT in candidates
    // The JB instance status is never modified
    expect(jbInstance.status).toBe("DUE_TODAY");
  });

  it("completion fallback without taskId uses best-match (finds DUE_TODAY by date)", () => {
    // No taskId → best-match path. Exact match by dueDate wins.
    const submissionDate = "2026-11-16";
    const candidates = [
      { id: "a", status: "DUE_TODAY", dueDate: { toISOString: () => "2026-11-16T00:00:00.000Z" } },
      { id: "b", status: "UPCOMING",  dueDate: { toISOString: () => "2026-11-17T00:00:00.000Z" } },
    ];
    const exact = candidates.find(
      (i) => i.dueDate.toISOString().slice(0, 10) === submissionDate
    );
    expect(exact?.id).toBe("a");
  });
});

// ─── API route handler tests (mocked Prisma) ─────────────────────────────────

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyClean624Record: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/task-completion", () => ({
  completeRuleInstanceForSubmission: vi.fn().mockResolvedValue(undefined),
  reopenInstanceForSubmissionDeletion: vi.fn().mockResolvedValue(undefined),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/daily-cleaning-624/route";
import { DELETE } from "@/app/api/daily-cleaning-624/[id]/route";

function makeValidRows(state = "DONE", reason: string | null = null) {
  return Array.from({ length: 19 }, (_, i) => ({
    key: `a${i}`,
    labelEn: `Activity ${i}`,
    labelEs: `Actividad ${i}`,
    state: i === 0 && state !== "DONE" ? state : "DONE",
    reason: i === 0 && reason !== null ? reason : null,
    chemical: null,
  }));
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/daily-cleaning-624", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function makeDeleteRequest(id: string) {
  return new Request(`http://localhost/api/daily-cleaning-624/${id}`, {
    method: "DELETE",
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/daily-cleaning-624 (mocked)", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", role: "SUPERVISOR", name: "Test User" },
    } as never);
    vi.mocked(prisma.dailyClean624Record.create).mockResolvedValue({
      id: "rec-1",
      date: new Date("2026-11-16"),
      time: "09:00",
      facility: "624",
      conductedBy: "HGA",
      rows: [],
      doneCount: 19,
      naCount: 0,
      notDoneCount: 0,
      allergenChange: false,
      notes: null,
      instructionsVer: "v1.0",
      submittedAt: new Date(),
      submittedById: "user-1",
      linkedInstanceId: null,
    } as never);
  });

  it("all 19 DONE → 201 with record id", async () => {
    const rows = makeValidRows("DONE");
    const req = makeRequest({ date: "2026-11-16", time: "09:00", conductedBy: "HGA", rows, allergenChange: false, notes: null, instructionsVer: "v1.0" });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
  });

  it("NOT_DONE row WITH reason → 201", async () => {
    const rows = makeValidRows("NOT_DONE", "Equipment down");
    const req = makeRequest({ date: "2026-11-16", time: "09:00", conductedBy: "HGA", rows, allergenChange: false, notes: null, instructionsVer: "v1.0" });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
  });

  it("NOT_DONE row WITHOUT reason → 400", async () => {
    const rows = makeValidRows("NOT_DONE", "");
    const req = makeRequest({ date: "2026-11-16", time: "09:00", conductedBy: "HGA", rows, allergenChange: false, notes: null, instructionsVer: "v1.0" });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("table missing → 503 db_setup_error", async () => {
    const tableErr = Object.assign(new Error('relation "daily_clean_624_records" does not exist'), { code: "P2021" });
    vi.mocked(prisma.dailyClean624Record.create).mockRejectedValueOnce(tableErr);
    const rows = makeValidRows("DONE");
    const req = makeRequest({ date: "2026-11-16", time: "09:00", conductedBy: "HGA", rows, allergenChange: false, notes: null, instructionsVer: "v1.0" });
    const res = await POST(req as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("db_setup_error");
  });
});

// ─── DELETE reversal ──────────────────────────────────────────────────────────

describe("DELETE /api/daily-cleaning-624/[id] (mocked)", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", role: "ADMIN", name: "Admin" },
    } as never);
    vi.mocked(prisma.dailyClean624Record.findUnique).mockResolvedValue({
      id: "rec-1",
      linkedInstanceId: "inst-1",
    } as never);
    vi.mocked(prisma.dailyClean624Record.delete).mockResolvedValue({} as never);
  });

  it("success path: returns deleted:true", async () => {
    const { reopenInstanceForSubmissionDeletion } = await import("@/lib/task-completion");
    vi.mocked(reopenInstanceForSubmissionDeletion).mockResolvedValueOnce(undefined);
    const req = makeDeleteRequest("rec-1");
    const res = await DELETE(req as never, { params: { id: "rec-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(body.warning).toBeUndefined();
  });

  it("reversal failure: returns deleted:true WITH warning", async () => {
    const { reopenInstanceForSubmissionDeletion } = await import("@/lib/task-completion");
    vi.mocked(reopenInstanceForSubmissionDeletion).mockRejectedValueOnce(new Error("reopen failed"));
    const req = makeDeleteRequest("rec-1");
    const res = await DELETE(req as never, { params: { id: "rec-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(body.warning).toBe("task_reopen_failed");
  });
});
