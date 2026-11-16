import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupAutoRefresh } from "../useAutoRefresh";

// PageTransitionEvent is browser-only; polyfill for Node test environment
class PageTransitionEventPolyfill extends Event {
  persisted: boolean;
  constructor(type: string, init?: { persisted?: boolean }) {
    super(type);
    this.persisted = init?.persisted ?? false;
  }
}

// Minimal browser-API stubs for Node environment (no jsdom needed)
function makeEventTarget(): EventTarget {
  return new EventTarget();
}

describe("setupAutoRefresh", () => {
  let win: EventTarget;
  let doc: EventTarget & { hidden: boolean };
  let origWindow: unknown;
  let origDocument: unknown;

  beforeEach(() => {
    vi.useFakeTimers();

    win = makeEventTarget();
    doc = Object.assign(makeEventTarget(), { hidden: false });

    origWindow = globalThis.window;
    origDocument = globalThis.document;

    // @ts-expect-error stub globals
    globalThis.window = win;
    // @ts-expect-error stub globals
    globalThis.document = doc;
    // @ts-expect-error stub globals
    globalThis.PageTransitionEvent = PageTransitionEventPolyfill;
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error restore
    globalThis.window = origWindow;
    // @ts-expect-error restore
    globalThis.document = origDocument;
    // @ts-expect-error restore
    delete globalThis.PageTransitionEvent;
  });

  it("calls refresh on task-action event", () => {
    const refresh = vi.fn();
    const cleanup = setupAutoRefresh(refresh, 60_000);
    win.dispatchEvent(new CustomEvent("task-action"));
    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("calls refresh when page becomes visible via visibilitychange", () => {
    const refresh = vi.fn();
    doc.hidden = false;
    const cleanup = setupAutoRefresh(refresh, 60_000);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does NOT call refresh on visibilitychange when page is hidden", () => {
    const refresh = vi.fn();
    doc.hidden = true;
    const cleanup = setupAutoRefresh(refresh, 60_000);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
    cleanup();
  });

  it("calls refresh on window focus", () => {
    const refresh = vi.fn();
    const cleanup = setupAutoRefresh(refresh, 60_000);
    win.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("calls refresh on pageshow with persisted=true", () => {
    const refresh = vi.fn();
    const cleanup = setupAutoRefresh(refresh, 60_000);
    win.dispatchEvent(new PageTransitionEventPolyfill("pageshow", { persisted: true }));
    expect(refresh).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does NOT call refresh on pageshow with persisted=false", () => {
    const refresh = vi.fn();
    const cleanup = setupAutoRefresh(refresh, 60_000);
    win.dispatchEvent(new PageTransitionEventPolyfill("pageshow", { persisted: false }));
    expect(refresh).not.toHaveBeenCalled();
    cleanup();
  });

  it("calls refresh after interval elapses when page is visible", () => {
    const refresh = vi.fn();
    doc.hidden = false;
    const cleanup = setupAutoRefresh(refresh, 60_000);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it("does NOT call refresh after interval when page is hidden", () => {
    const refresh = vi.fn();
    doc.hidden = true;
    const cleanup = setupAutoRefresh(refresh, 60_000);
    vi.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();
    cleanup();
  });

  it("stops all listeners after cleanup", () => {
    const refresh = vi.fn();
    doc.hidden = false;
    const cleanup = setupAutoRefresh(refresh, 60_000);
    cleanup();
    win.dispatchEvent(new CustomEvent("task-action"));
    win.dispatchEvent(new Event("focus"));
    doc.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(120_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
