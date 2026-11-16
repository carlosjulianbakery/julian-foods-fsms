import { describe, it, expect } from "vitest";
import { computeBannerState, type BannerInput } from "../banner-state";

const TODAY = "2026-11-16";
const YESTERDAY = "2026-11-15";
const TOMORROW = "2026-11-17";

function mk(overrides: Partial<BannerInput> = {}): BannerInput {
  return {
    today: TODAY,
    instances: [],
    skippedInstances: [],
    nextUpcoming: null,
    syncStale: false,
    ...overrides,
  };
}

describe("computeBannerState", () => {
  // ── 0 tasks ──────────────────────────────────────────────────────────────────

  it("0 tasks → noTasks with no nextTask", () => {
    expect(computeBannerState(mk())).toEqual({ kind: "noTasks", nextTask: undefined });
  });

  it("0 tasks but upcoming → noTasks with nextTask", () => {
    const next = { dueDate: TOMORROW, ruleTitle: "Morning clean" };
    expect(computeBannerState(mk({ nextUpcoming: next }))).toEqual({ kind: "noTasks", nextTask: next });
  });

  it("0 today tasks but stale sync → still noTasks (staleSync only replaces success)", () => {
    expect(computeBannerState(mk({ syncStale: true }))).toEqual({ kind: "noTasks", nextTask: undefined });
  });

  // ── All done ─────────────────────────────────────────────────────────────────

  it("1 task DONE today, no overdue → success", () => {
    const input = mk({ instances: [{ status: "DONE", dueDate: TODAY }] });
    expect(computeBannerState(input)).toEqual({ kind: "success" });
  });

  it("3 tasks DONE today, no overdue → success", () => {
    const input = mk({
      instances: [
        { status: "DONE", dueDate: TODAY },
        { status: "DONE", dueDate: TODAY },
        { status: "DONE", dueDate: TODAY },
      ],
    });
    expect(computeBannerState(input)).toEqual({ kind: "success" });
  });

  // ── One open ─────────────────────────────────────────────────────────────────

  it("1 DUE_TODAY → inProgress (0/1 done, 1 remaining)", () => {
    const input = mk({ instances: [{ status: "DUE_TODAY", dueDate: TODAY }] });
    expect(computeBannerState(input)).toEqual({ kind: "inProgress", done: 0, total: 1, remaining: 1 });
  });

  it("1 done + 1 DUE_TODAY → inProgress (1/2 done, 1 remaining)", () => {
    const input = mk({
      instances: [
        { status: "DONE", dueDate: TODAY },
        { status: "DUE_TODAY", dueDate: TODAY },
      ],
    });
    expect(computeBannerState(input)).toEqual({ kind: "inProgress", done: 1, total: 2, remaining: 1 });
  });

  it("IN_PROGRESS task counts as open", () => {
    const input = mk({ instances: [{ status: "IN_PROGRESS", dueDate: TODAY }] });
    expect(computeBannerState(input).kind).toBe("inProgress");
  });

  // ── Overdue ───────────────────────────────────────────────────────────────────

  it("1 OVERDUE (yesterday) + all today done → overdue (highest priority)", () => {
    const input = mk({
      instances: [
        { status: "OVERDUE", dueDate: YESTERDAY },
        { status: "DONE", dueDate: TODAY },
        { status: "DONE", dueDate: TODAY },
      ],
    });
    expect(computeBannerState(input)).toEqual({ kind: "overdue", count: 1 });
  });

  it("MISSED with past dueDate counts as overdue", () => {
    const input = mk({ instances: [{ status: "MISSED", dueDate: YESTERDAY }] });
    const result = computeBannerState(input);
    expect(result.kind).toBe("overdue");
    expect((result as { kind: "overdue"; count: number }).count).toBe(1);
  });

  it("MISSED with today dueDate counts as missed today, not overdue", () => {
    const input = mk({
      instances: [
        { status: "DONE", dueDate: TODAY },
        { status: "MISSED", dueDate: TODAY },
      ],
    });
    expect(computeBannerState(input)).toEqual({ kind: "closed", done: 1, missed: 1, skipped: 0 });
  });

  it("overdue takes priority over open tasks today", () => {
    const input = mk({
      instances: [
        { status: "OVERDUE", dueDate: YESTERDAY },
        { status: "DUE_TODAY", dueDate: TODAY },
      ],
    });
    expect(computeBannerState(input).kind).toBe("overdue");
  });

  // ── Missed/skipped mix ────────────────────────────────────────────────────────

  it("1 done + 1 missed today → closed", () => {
    const input = mk({
      instances: [
        { status: "DONE", dueDate: TODAY },
        { status: "MISSED", dueDate: TODAY },
      ],
    });
    expect(computeBannerState(input)).toEqual({ kind: "closed", done: 1, missed: 1, skipped: 0 });
  });

  it("1 done + 1 skipped today → closed", () => {
    const input = mk({
      instances: [{ status: "DONE", dueDate: TODAY }],
      skippedInstances: [{ dueDate: TODAY }],
    });
    expect(computeBannerState(input)).toEqual({ kind: "closed", done: 1, missed: 0, skipped: 1 });
  });

  it("0 done + 1 skipped today (all skipped) → closed", () => {
    const input = mk({ skippedInstances: [{ dueDate: TODAY }] });
    expect(computeBannerState(input)).toEqual({ kind: "closed", done: 0, missed: 0, skipped: 1 });
  });

  // ── Stale sync ────────────────────────────────────────────────────────────────

  it("stale sync replaces success", () => {
    const input = mk({
      instances: [{ status: "DONE", dueDate: TODAY }],
      syncStale: true,
    });
    expect(computeBannerState(input)).toEqual({ kind: "staleSync" });
  });

  it("stale sync does NOT replace overdue", () => {
    const input = mk({
      instances: [{ status: "OVERDUE", dueDate: YESTERDAY }],
      syncStale: true,
    });
    expect(computeBannerState(input).kind).toBe("overdue");
  });

  it("stale sync does NOT replace inProgress", () => {
    const input = mk({
      instances: [{ status: "DUE_TODAY", dueDate: TODAY }],
      syncStale: true,
    });
    expect(computeBannerState(input).kind).toBe("inProgress");
  });

  it("stale sync does NOT replace closed", () => {
    const input = mk({
      instances: [
        { status: "DONE", dueDate: TODAY },
        { status: "MISSED", dueDate: TODAY },
      ],
      syncStale: true,
    });
    expect(computeBannerState(input).kind).toBe("closed");
  });
});
