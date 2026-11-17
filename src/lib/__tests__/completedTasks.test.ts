import { describe, it, expect, beforeEach, vi } from "vitest";
import { markTaskCompleted, getCompletedTaskIds } from "../completedTasks";

const KEY = "fsm:completedTasks";
const TTL_MS = 5 * 60 * 1000;

// Mock sessionStorage
const store: Record<string, string> = {};
const sessionStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};

beforeEach(() => {
  sessionStorageMock.clear();
  vi.stubGlobal("sessionStorage", sessionStorageMock);
});

describe("markTaskCompleted", () => {
  it("stores an id in sessionStorage", () => {
    markTaskCompleted("inst-1");
    const raw = sessionStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    const entries = JSON.parse(raw!);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("inst-1");
  });

  it("appends to existing entries", () => {
    markTaskCompleted("inst-1");
    markTaskCompleted("inst-2");
    const entries = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(entries).toHaveLength(2);
    expect(entries.map((e: { id: string }) => e.id)).toContain("inst-1");
    expect(entries.map((e: { id: string }) => e.id)).toContain("inst-2");
  });

  it("prunes expired entries", () => {
    const oldTs = Date.now() - TTL_MS - 1000;
    sessionStorage.setItem(KEY, JSON.stringify([{ id: "old-id", ts: oldTs }]));
    markTaskCompleted("new-id");
    const entries = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(entries.map((e: { id: string }) => e.id)).not.toContain("old-id");
    expect(entries.map((e: { id: string }) => e.id)).toContain("new-id");
  });

  it("does not throw on sessionStorage error", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => {} });
    expect(() => markTaskCompleted("x")).not.toThrow();
  });
});

describe("getCompletedTaskIds", () => {
  it("returns empty set when storage is empty", () => {
    expect(getCompletedTaskIds().size).toBe(0);
  });

  it("returns stored ids", () => {
    markTaskCompleted("inst-a");
    markTaskCompleted("inst-b");
    const ids = getCompletedTaskIds();
    expect(ids.has("inst-a")).toBe(true);
    expect(ids.has("inst-b")).toBe(true);
  });

  it("excludes expired entries", () => {
    const oldTs = Date.now() - TTL_MS - 1000;
    sessionStorage.setItem(KEY, JSON.stringify([{ id: "expired", ts: oldTs }]));
    expect(getCompletedTaskIds().has("expired")).toBe(false);
  });

  it("includes fresh entries", () => {
    const freshTs = Date.now() - 1000;
    sessionStorage.setItem(KEY, JSON.stringify([{ id: "fresh", ts: freshTs }]));
    expect(getCompletedTaskIds().has("fresh")).toBe(true);
  });

  it("returns empty set on parse error", () => {
    sessionStorage.setItem(KEY, "not-json");
    expect(getCompletedTaskIds().size).toBe(0);
  });
});
