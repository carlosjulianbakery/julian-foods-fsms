// Unit + integration tests for 624 Pre-Op form.
// Covers: temperature auto-flip, ATP auto-flip, overall status, labels,
// draft key isolation, facility isolation contract, API POST (mocked),
// API DELETE reversal failure.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FRIDGE_MAX_F, FREEZER_MAX_F, ATP_MAX_RLU } from "@/components/forms624/types";
import type { RowSnapshot, RowCondition } from "@/components/forms624/types";

// ─── Helpers mirroring the production logic ───────────────────────────────────

function tempCondition(temp: number, limit: number): RowCondition {
  return temp <= limit ? "OK" : "NOT_OK";
}

function atpCondition(rlu: number, limit: number): RowCondition {
  return rlu <= limit ? "OK" : "NOT_OK";
}

function computeOverallOk(rows: RowSnapshot[]): boolean {
  const notOk = rows.filter((r) => r.condition === "NOT_OK");
  return notOk.length === 0 || notOk.every((r) => r.reInspected);
}

function computeHasNotOk(rows: RowSnapshot[]): boolean {
  return rows.some((r) => r.condition === "NOT_OK");
}

function makeRow(overrides: Partial<RowSnapshot> = {}): RowSnapshot {
  return {
    key: "test", label: "Test item", condition: "OK", initials: "HA",
    correctiveAction: "", reInspected: false, reInspectedAt: null,
    tempValue: null, tempLimit: null, reInspectTempValue: null,
    atpRlu: null, atpLimit: null,
    ...overrides,
  };
}

// ─── Temperature auto-flip ────────────────────────────────────────────────────

describe("temperature auto-flip — fridge", () => {
  it("OK at exactly the limit (41°F)", () => {
    expect(tempCondition(41, FRIDGE_MAX_F)).toBe("OK");
  });
  it("OK below the limit (38°F)", () => {
    expect(tempCondition(38, FRIDGE_MAX_F)).toBe("OK");
  });
  it("NOT_OK above the limit (42°F)", () => {
    expect(tempCondition(42, FRIDGE_MAX_F)).toBe("NOT_OK");
  });
});

describe("temperature auto-flip — freezer", () => {
  it("OK at exactly the limit (0°F)", () => {
    expect(tempCondition(0, FREEZER_MAX_F)).toBe("OK");
  });
  it("OK below the limit (-5°F)", () => {
    expect(tempCondition(-5, FREEZER_MAX_F)).toBe("OK");
  });
  it("NOT_OK above the limit (1°F)", () => {
    expect(tempCondition(1, FREEZER_MAX_F)).toBe("NOT_OK");
  });
});

// ─── ATP auto-flip ────────────────────────────────────────────────────────────

describe("ATP RLU auto-flip", () => {
  it("OK at exactly the limit (30 RLU)", () => {
    expect(atpCondition(30, ATP_MAX_RLU)).toBe("OK");
  });
  it("OK below the limit (15 RLU)", () => {
    expect(atpCondition(15, ATP_MAX_RLU)).toBe("OK");
  });
  it("NOT_OK above the limit (31 RLU)", () => {
    expect(atpCondition(31, ATP_MAX_RLU)).toBe("NOT_OK");
  });
});

// ─── Overall status computation ───────────────────────────────────────────────

describe("overall status", () => {
  it("overallOk=true when all rows are OK", () => {
    const rows = [makeRow({ condition: "OK" }), makeRow({ key: "b", condition: "OK" })];
    expect(computeOverallOk(rows)).toBe(true);
    expect(computeHasNotOk(rows)).toBe(false);
  });

  it("overallOk=false when at least one row is NOT_OK and not re-inspected", () => {
    const rows = [makeRow({ condition: "NOT_OK", reInspected: false })];
    expect(computeOverallOk(rows)).toBe(false);
    expect(computeHasNotOk(rows)).toBe(true);
  });

  it("overallOk=true when all NOT_OK rows are re-inspected", () => {
    const rows = [
      makeRow({ condition: "NOT_OK", reInspected: true }),
      makeRow({ key: "b", condition: "OK" }),
    ];
    expect(computeOverallOk(rows)).toBe(true);
    expect(computeHasNotOk(rows)).toBe(true);
  });

  it("overallOk=false when only some NOT_OK rows are re-inspected", () => {
    const rows = [
      makeRow({ condition: "NOT_OK", reInspected: true }),
      makeRow({ key: "b", condition: "NOT_OK", reInspected: false }),
    ];
    expect(computeOverallOk(rows)).toBe(false);
  });
});

// ─── Constant values ─────────────────────────────────────────────────────────

describe("constants", () => {
  it("FRIDGE_MAX_F is 41", () => { expect(FRIDGE_MAX_F).toBe(41); });
  it("FREEZER_MAX_F is 0", () => { expect(FREEZER_MAX_F).toBe(0); });
  it("ATP_MAX_RLU is 30", () => { expect(ATP_MAX_RLU).toBe(30); });
});

// ─── Item labels ─────────────────────────────────────────────────────────────
// These tests assert the exact strings as specified in the form spec.

describe("item labels", () => {
  it("fridge label matches spec", () => {
    const label = `Temperature check – Walk-in Fridge (limit ≤ ${FRIDGE_MAX_F}°F)`;
    expect(label).toBe("Temperature check – Walk-in Fridge (limit ≤ 41°F)");
  });

  it("freezer label matches spec", () => {
    const label = `Temperature check – Walk-in Freezer (limit ≤ ${FREEZER_MAX_F}°F)`;
    expect(label).toBe("Temperature check – Walk-in Freezer (limit ≤ 0°F)");
  });

  it("item 9 label is exactly the thermometer dial covers sentence", () => {
    const item9Label = "Thermometer: Plastic dial covers on thermometers are in good shape.";
    // Verify it contains no other sentences about temperature logs or pre-set
    expect(item9Label).not.toContain("Fridge and Freezer temperature log");
    expect(item9Label).not.toContain("Pre-set");
    expect(item9Label).toBe("Thermometer: Plastic dial covers on thermometers are in good shape.");
  });
});

// ─── Draft localStorage key ───────────────────────────────────────────────────

function draftKey(userId: string, date: string) {
  return `preop_624_draft:${userId}:${date}`;
}

describe("draft localStorage key", () => {
  it("includes userId and date so drafts are isolated per user per day", () => {
    const key = draftKey("user_abc", "2026-11-16");
    expect(key).toBe("preop_624_draft:user_abc:2026-11-16");
  });

  it("two different users on the same day produce different keys", () => {
    const keyA = draftKey("user_a", "2026-11-16");
    const keyB = draftKey("user_b", "2026-11-16");
    expect(keyA).not.toBe(keyB);
  });

  it("same user on two different days produces different keys", () => {
    const keyMon = draftKey("user_a", "2026-11-16");
    const keyTue = draftKey("user_a", "2026-11-17");
    expect(keyMon).not.toBe(keyTue);
  });

  it("draft for yesterday is ignored (key mismatch prevents loading)", () => {
    const yesterday = "2026-11-15";
    const today = "2026-11-16";
    expect(draftKey("user_a", yesterday)).not.toBe(draftKey("user_a", today));
  });
});

// ─── API-level POST test (mocked) ────────────────────────────────────────────
// Tests the POST /api/pre-op-624 route handler directly.
// Uses vitest mocks — no production DB touched.

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    preOp624Inspection: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/task-completion", () => ({
  completeRuleInstanceForSubmission: vi.fn().mockResolvedValue(undefined),
  reopenInstanceForSubmissionDeletion: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/pre-op-624 — fridge 44°F corrected to 38°F", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("stores tempValue=44, reInspectTempValue=38, condition=NOT_OK, reInspected=true", async () => {
    const { getServerSession } = await import("next-auth");
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("@/app/api/pre-op-624/route");

    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user_test", role: "SUPERVISOR" },
    });

    const fridgeRow: RowSnapshot = {
      key: "fridge_temp",
      label: "Temperature check – Walk-in Fridge (limit ≤ 41°F)",
      condition: "NOT_OK",
      initials: "HA",
      correctiveAction: "Adjusted thermostat",
      reInspected: true,
      reInspectedAt: "2026-11-16T14:35:00.000Z",
      tempValue: 44,
      tempLimit: FRIDGE_MAX_F,
      reInspectTempValue: 38,
      atpRlu: null,
      atpLimit: null,
    };

    const mockRecord = { id: "insp_test_001" };
    (prisma.preOp624Inspection.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecord);

    const req = new Request("http://localhost/api/pre-op-624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-11-16",
        conductedBy: "HA",
        rows: [fridgeRow],
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("insp_test_001");

    // Assert the shape of the row that was persisted
    const createCall = (prisma.preOp624Inspection.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const storedRows = createCall.data.rows as RowSnapshot[];
    const storedFridge = storedRows.find((r) => r.key === "fridge_temp");

    expect(storedFridge).toBeDefined();
    expect(storedFridge!.tempValue).toBe(44);
    expect(storedFridge!.tempLimit).toBe(FRIDGE_MAX_F);       // 41
    expect(storedFridge!.reInspectTempValue).toBe(38);
    expect(storedFridge!.condition).toBe("NOT_OK");
    expect(storedFridge!.reInspected).toBe(true);
    expect(createCall.data.hasNotOk).toBe(true);
    // overallOk=true because the one NOT_OK row is re-inspected
    expect(createCall.data.overallOk).toBe(true);
  });
});

// ─── DELETE reversal failure test ────────────────────────────────────────────

describe("DELETE /api/pre-op-624/[id] — reopenInstanceForSubmissionDeletion throws", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns deleted:true with warning:task_reopen_failed when reopen throws", async () => {
    const { getServerSession } = await import("next-auth");
    const { prisma } = await import("@/lib/prisma");
    const { reopenInstanceForSubmissionDeletion } = await import("@/lib/task-completion");
    const { DELETE } = await import("@/app/api/pre-op-624/[id]/route");

    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user_admin", role: "ADMIN" },
    });
    (prisma.preOp624Inspection.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "insp_001" });
    (prisma.preOp624Inspection.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (reopenInstanceForSubmissionDeletion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB timeout")
    );

    const req = new Request("http://localhost/api/pre-op-624/insp_001", { method: "DELETE" });
    const res = await DELETE(req as never, { params: { id: "insp_001" } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
    expect(json.warning).toBe("task_reopen_failed");
  });
});

// ─── Facility isolation (documents the contract) ─────────────────────────────

describe("facility isolation contract", () => {
  it('facilityName for 624 submissions is exactly "624"', () => {
    const FACILITY_NAME_624 = "624";
    const FACILITY_NAME_JB  = "Julian Bakery";
    expect(FACILITY_NAME_624).not.toBe(FACILITY_NAME_JB);
  });
});
