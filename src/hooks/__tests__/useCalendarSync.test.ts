import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupCalendarSync } from "../useCalendarSync";

// Minimal browser-API stubs for Node environment
function makeEventTarget(): EventTarget {
  return new EventTarget();
}

async function flushPromises(rounds = 8) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

describe("setupCalendarSync", () => {
  let doc: EventTarget & { hidden: boolean };
  let origDocument: unknown;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    doc = Object.assign(makeEventTarget(), { hidden: false });

    origDocument = globalThis.document;
    // @ts-expect-error stub globals
    globalThis.document = doc;

    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ran: true, created: 0, deleted: 0, flagged: 0 }),
    });
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error restore
    globalThis.document = origDocument;
  });

  // ── Calls POST on mount ───────────────────────────────────────────────────

  it("calls POST /api/task-rules/sync immediately on setup", async () => {
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    // Allow microtasks (the async fetch) to settle
    await flushPromises();
    expect(fetchSpy).toHaveBeenCalledWith("/api/task-rules/sync", { method: "POST" });
    cleanup();
  });

  // ── onChanged called only when data changed ───────────────────────────────

  it("calls onChanged when created > 0", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ ran: true, created: 1, deleted: 0, flagged: 0 }),
    });
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    expect(onChanged).toHaveBeenCalledOnce();
    cleanup();
  });

  it("calls onChanged when deleted > 0", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ ran: true, created: 0, deleted: 2, flagged: 0 }),
    });
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    expect(onChanged).toHaveBeenCalledOnce();
    cleanup();
  });

  it("calls onChanged when flagged > 0", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ ran: true, created: 0, deleted: 0, flagged: 1 }),
    });
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    expect(onChanged).toHaveBeenCalledOnce();
    cleanup();
  });

  it("does NOT call onChanged when ran:true but all counts are zero", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ ran: true, created: 0, deleted: 0, flagged: 0 }),
    });
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    expect(onChanged).not.toHaveBeenCalled();
    cleanup();
  });

  it("does NOT call onChanged when ran:false (throttled)", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ ran: false, reason: "throttled" }),
    });
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    expect(onChanged).not.toHaveBeenCalled();
    cleanup();
  });

  // ── Non-blocking: errors never throw ─────────────────────────────────────

  it("does NOT throw when fetch fails (network error)", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));
    const onChanged = vi.fn();
    let threw = false;
    try {
      const cleanup = setupCalendarSync(onChanged, 60_000);
      await flushPromises();
      cleanup();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("does NOT throw when response is not ok", async () => {
    fetchSpy.mockResolvedValue({ ok: false });
    const onChanged = vi.fn();
    let threw = false;
    try {
      const cleanup = setupCalendarSync(onChanged, 60_000);
      await flushPromises();
      cleanup();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
  });

  // ── Interval ─────────────────────────────────────────────────────────────

  it("calls sync again after interval elapses when page is visible", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ ran: false, reason: "throttled" }) });
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    const callsBefore = fetchSpy.mock.calls.length;

    vi.advanceTimersByTime(60_000);
    await flushPromises();
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    cleanup();
  });

  it("does NOT call sync after interval when page is hidden", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ ran: false }) });
    doc.hidden = true;
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    const callsAfterMount = fetchSpy.mock.calls.length;

    vi.advanceTimersByTime(120_000);
    await flushPromises();
    expect(fetchSpy.mock.calls.length).toBe(callsAfterMount); // no extra calls
    cleanup();
  });

  // ── Visibility change ─────────────────────────────────────────────────────

  it("calls sync when tab becomes visible via visibilitychange", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ ran: false }) });
    doc.hidden = true;
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    const callsAfterMount = fetchSpy.mock.calls.length;

    doc.hidden = false;
    doc.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    cleanup();
  });

  it("does NOT call sync on visibilitychange when page is still hidden", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ ran: false }) });
    doc.hidden = true;
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    const callsAfterMount = fetchSpy.mock.calls.length;

    doc.dispatchEvent(new Event("visibilitychange")); // still hidden
    await flushPromises();
    expect(fetchSpy.mock.calls.length).toBe(callsAfterMount);
    cleanup();
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  it("stops calling sync after cleanup is called", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ ran: false }) });
    const onChanged = vi.fn();
    const cleanup = setupCalendarSync(onChanged, 60_000);
    await flushPromises();
    cleanup();
    const callsAfterCleanup = fetchSpy.mock.calls.length;

    vi.advanceTimersByTime(120_000);
    await flushPromises();
    doc.hidden = false;
    doc.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();

    expect(fetchSpy.mock.calls.length).toBe(callsAfterCleanup);
  });
});
