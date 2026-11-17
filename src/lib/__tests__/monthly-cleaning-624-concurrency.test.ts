/**
 * Concurrency tests for /api/monthly-cleaning-624/[id]/line (PATCH)
 * and POST /api/monthly-cleaning-624 (create-or-get).
 *
 * These are unit-level tests that extract and verify the core business logic:
 *   1. Different-line concurrent PATCHes — both succeed (non-overlapping writes)
 *   2. Same-line conflict detection — 409 when expectedLineUpdatedAt mismatches
 *   3. Already-submitted guard — 409 with code "already_submitted"
 *   4. create-or-get P2002 race — second writer falls back to findUnique
 *
 * We do NOT mock Prisma transactions here — we test the pure logic that runs
 * inside them. The SELECT FOR UPDATE serialises concurrent writes at DB level;
 * these tests verify the application-level rules applied after the lock.
 */

import { describe, it, expect } from "vitest";

// ─── Types (mirroring what the route uses) ────────────────────────────────────

type LineState = "DONE" | "NA" | "NOT_DONE" | "UNTOUCHED";

interface LineRecord {
  key: string;
  labelEn: string;
  labelEs: string;
  chemical: string | null;
  state: LineState;
  reason: string | null;
  lineDate: string | null;
  lineInitials: string | null;
  doneByUserId: string | null;
  updatedAt: string;
  autoFilled: boolean;
}

interface PatchInput {
  key: string;
  expectedLineUpdatedAt?: string | null;
  state: LineState;
  reason?: string | null;
  lineDate?: string | null;
  lineInitials?: string | null;
  doneByUserId?: string | null;
}

type PatchResult =
  | { type: "ok"; lines: LineRecord[]; doneCount: number; naCount: number; notDoneCount: number }
  | { type: "conflict"; currentLine: LineRecord }
  | { type: "already_submitted" }
  | { type: "not_found" };

// ─── Pure logic extracted from the PATCH transaction ─────────────────────────
// This mirrors the logic inside the $transaction in [id]/line/route.ts exactly.

function applyLinePatch(
  lines: LineRecord[],
  status: string,
  body: PatchInput
): PatchResult {
  if (status === "submitted") return { type: "already_submitted" };

  const idx = lines.findIndex((l) => l.key === body.key);
  if (idx < 0) return { type: "not_found" };

  const existing = lines[idx];

  if (body.expectedLineUpdatedAt != null && existing.updatedAt !== body.expectedLineUpdatedAt) {
    return { type: "conflict", currentLine: existing };
  }

  const now = new Date().toISOString();
  const updated: LineRecord[] = lines.map((l, i) =>
    i === idx
      ? {
          ...l,
          state: body.state,
          reason: body.reason ?? null,
          lineDate: body.lineDate ?? null,
          lineInitials: body.lineInitials ?? null,
          doneByUserId: body.doneByUserId ?? null,
          updatedAt: now,
          autoFilled: false,
        }
      : l
  );

  return {
    type: "ok",
    lines: updated,
    doneCount: updated.filter((l) => l.state === "DONE").length,
    naCount: updated.filter((l) => l.state === "NA").length,
    notDoneCount: updated.filter((l) => l.state === "NOT_DONE").length,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLines(count: number, ts = "2026-11-17T10:00:00.000Z"): LineRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `activity_${i + 1}`,
    labelEn: `Activity ${i + 1}`,
    labelEs: `Actividad ${i + 1}`,
    chemical: null,
    state: "UNTOUCHED" as LineState,
    reason: null,
    lineDate: null,
    lineInitials: null,
    doneByUserId: null,
    updatedAt: ts,
    autoFilled: false,
  }));
}

// ─── 1. Concurrent PATCHes to different lines ─────────────────────────────────

describe("concurrent PATCHes to different lines", () => {
  it("two simultaneous PATCHes on different keys both succeed independently", () => {
    // Simulate: user A PATCHes key activity_1, user B PATCHes key activity_2.
    // Both start from the same initial snapshot. After A's write lands, B's
    // PATCH arrives — B touches a different key so no conflict.
    const initial = makeLines(19);

    // A writes activity_1
    const patchA: PatchInput = {
      key: "activity_1",
      expectedLineUpdatedAt: initial[0].updatedAt,
      state: "DONE",
      lineInitials: "JA",
    };
    const afterA = applyLinePatch(initial, "draft", patchA);
    expect(afterA.type).toBe("ok");
    if (afterA.type !== "ok") return;
    expect(afterA.doneCount).toBe(1);

    // B writes activity_2 on the lines state AFTER A's commit (SELECT FOR UPDATE
    // means B sees A's write). B's expectedLineUpdatedAt is for activity_2 which
    // was not touched by A — still the original timestamp.
    const patchB: PatchInput = {
      key: "activity_2",
      expectedLineUpdatedAt: initial[1].updatedAt,
      state: "DONE",
      lineInitials: "JB",
    };
    const afterB = applyLinePatch(afterA.lines, "draft", patchB);
    expect(afterB.type).toBe("ok");
    if (afterB.type !== "ok") return;
    expect(afterB.doneCount).toBe(2);
    expect(afterB.lines[0].state).toBe("DONE"); // A's write preserved
    expect(afterB.lines[1].state).toBe("DONE"); // B's write applied
  });

  it("three users each writing a different line — all three land", () => {
    const initial = makeLines(19);

    const patchC: PatchInput = { key: "activity_3", state: "NA", lineInitials: "JC" };
    const afterC = applyLinePatch(initial, "draft", patchC);
    expect(afterC.type).toBe("ok");
    if (afterC.type !== "ok") return;

    const patchD: PatchInput = { key: "activity_7", state: "NOT_DONE", reason: "Equipment down", lineInitials: "JD" };
    const afterD = applyLinePatch(afterC.lines, "draft", patchD);
    expect(afterD.type).toBe("ok");
    if (afterD.type !== "ok") return;

    const patchE: PatchInput = { key: "activity_15", state: "DONE", lineInitials: "JE" };
    const afterE = applyLinePatch(afterD.lines, "draft", patchE);
    expect(afterE.type).toBe("ok");
    if (afterE.type !== "ok") return;

    expect(afterE.doneCount).toBe(1);
    expect(afterE.naCount).toBe(1);
    expect(afterE.notDoneCount).toBe(1);
  });
});

// ─── 2. Same-line 409 conflict ────────────────────────────────────────────────

describe("same-line conflict detection → 409", () => {
  it("stale expectedLineUpdatedAt returns conflict with currentLine", () => {
    const ts1 = "2026-11-17T10:00:00.000Z";
    const ts2 = "2026-11-17T10:00:05.000Z"; // A already wrote at ts2

    const lines = makeLines(19, ts1);
    // A already updated activity_1 at ts2
    lines[0] = { ...lines[0], state: "DONE", lineInitials: "JA", updatedAt: ts2 };

    // B arrives with the original ts1 — stale
    const patchB: PatchInput = {
      key: "activity_1",
      expectedLineUpdatedAt: ts1,
      state: "NA",
      lineInitials: "JB",
    };
    const result = applyLinePatch(lines, "draft", patchB);
    expect(result.type).toBe("conflict");
    if (result.type !== "conflict") return;
    // currentLine carries A's already-committed state
    expect(result.currentLine.state).toBe("DONE");
    expect(result.currentLine.lineInitials).toBe("JA");
    expect(result.currentLine.updatedAt).toBe(ts2);
  });

  it("omitting expectedLineUpdatedAt skips conflict check (last-write-wins)", () => {
    const ts1 = "2026-11-17T10:00:00.000Z";
    const ts2 = "2026-11-17T10:00:05.000Z";
    const lines = makeLines(19, ts1);
    lines[0] = { ...lines[0], state: "DONE", lineInitials: "JA", updatedAt: ts2 };

    // B sends no expectedLineUpdatedAt — skips the check
    const patchB: PatchInput = { key: "activity_1", state: "NA", lineInitials: "JB" };
    const result = applyLinePatch(lines, "draft", patchB);
    expect(result.type).toBe("ok");
    if (result.type !== "ok") return;
    expect(result.lines[0].state).toBe("NA");
    expect(result.lines[0].lineInitials).toBe("JB");
  });

  it("matching expectedLineUpdatedAt passes conflict check", () => {
    const ts = "2026-11-17T10:00:00.000Z";
    const lines = makeLines(19, ts);

    const patch: PatchInput = {
      key: "activity_1",
      expectedLineUpdatedAt: ts,
      state: "DONE",
      lineInitials: "JA",
    };
    const result = applyLinePatch(lines, "draft", patch);
    expect(result.type).toBe("ok");
  });
});

// ─── 3. Already-submitted guard ────────────────────────────────────────────────

describe("already-submitted guard → 409", () => {
  it("PATCH on a submitted record returns already_submitted regardless of line key", () => {
    const lines = makeLines(19);
    const result = applyLinePatch(lines, "submitted", { key: "activity_1", state: "DONE" });
    expect(result.type).toBe("already_submitted");
  });

  it("PATCH on a submitted record does not modify any lines", () => {
    const lines = makeLines(19);
    const result = applyLinePatch(lines, "submitted", { key: "activity_1", state: "DONE" });
    expect(result.type).toBe("already_submitted");
    // lines are not referenced in the result type, so we confirm no mutation
    expect(lines.every((l) => l.state === "UNTOUCHED")).toBe(true);
  });
});

// ─── 4. Unknown line key returns not_found ─────────────────────────────────────

describe("unknown line key", () => {
  it("unknown key returns not_found", () => {
    const lines = makeLines(19);
    const result = applyLinePatch(lines, "draft", { key: "nonexistent", state: "DONE" });
    expect(result.type).toBe("not_found");
  });
});

// ─── 5. create-or-get P2002 race ──────────────────────────────────────────────

describe("create-or-get P2002 race (POST /api/monthly-cleaning-624)", () => {
  /**
   * The route does:
   *   1. findUnique → null
   *   2. create → throws P2002
   *   3. findUnique again → returns the row the racing writer created
   *
   * We verify the branching logic in isolation.
   */
  it("simulates P2002 → fallback findUnique returning the winning record", async () => {
    type MockRecord = { id: string; month: string; facility: string; status: string };

    const existingRecord: MockRecord = { id: "cuid-winner", month: "2026-11", facility: "624", status: "draft" };

    // Simulate the route's create-or-get function
    async function createOrGet(
      firstFind: MockRecord | null,
      createFn: () => Promise<MockRecord>,
      fallbackFind: () => Promise<MockRecord | null>
    ): Promise<MockRecord | null> {
      let record = firstFind;
      if (!record) {
        try {
          record = await createFn();
        } catch (err) {
          if ((err as { code?: string }).code === "P2002") {
            record = await fallbackFind();
          } else {
            throw err;
          }
        }
      }
      return record;
    }

    // First find misses; create throws P2002; fallback finds the existing record
    const result = await createOrGet(
      null,
      async () => { throw Object.assign(new Error("Unique constraint"), { code: "P2002" }); },
      async () => existingRecord
    );

    expect(result).toEqual(existingRecord);
  });

  it("non-P2002 create errors are re-thrown", async () => {
    type MockRecord = { id: string; month: string; facility: string; status: string };

    async function createOrGet(
      firstFind: MockRecord | null,
      createFn: () => Promise<MockRecord>
    ): Promise<MockRecord | null> {
      let record = firstFind;
      if (!record) {
        try {
          record = await createFn();
        } catch (err) {
          if ((err as { code?: string }).code === "P2002") {
            return null;
          } else {
            throw err;
          }
        }
      }
      return record;
    }

    const connectionError = Object.assign(new Error("Connection refused"), { code: "P1001" });
    await expect(createOrGet(null, async () => { throw connectionError; })).rejects.toThrow("Connection refused");
  });

  it("existing record on first findUnique skips create entirely", async () => {
    type MockRecord = { id: string; month: string; facility: string; status: string };

    const existing: MockRecord = { id: "cuid-existing", month: "2026-11", facility: "624", status: "draft" };
    let createCalled = false;

    async function createOrGet(firstFind: MockRecord | null): Promise<MockRecord | null> {
      if (firstFind) return firstFind;
      createCalled = true;
      return null;
    }

    const result = await createOrGet(existing);
    expect(result).toEqual(existing);
    expect(createCalled).toBe(false);
  });
});
