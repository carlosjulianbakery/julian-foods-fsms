"use client";
import { useEffect, useRef } from "react";

export type AutoRefreshCleanup = () => void;

/**
 * Pure event-listener setup, decoupled from React.
 * Exported for unit-testing without a renderer.
 */
export function setupAutoRefresh(
  refresh: () => void,
  intervalMs = 60_000,
): AutoRefreshCleanup {
  const handleTaskAction = () => refresh();
  const handleVisibility = () => { if (!document.hidden) refresh(); };
  const handleFocus = () => refresh();
  const handlePageShow = (e: PageTransitionEvent) => { if (e.persisted) refresh(); };

  window.addEventListener("task-action", handleTaskAction);
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("pageshow", handlePageShow as EventListener);

  const id = setInterval(() => { if (!document.hidden) refresh(); }, intervalMs);

  return () => {
    window.removeEventListener("task-action", handleTaskAction);
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("pageshow", handlePageShow as EventListener);
    clearInterval(id);
  };
}

/**
 * Triggers refresh on:
 *  - "task-action" CustomEvent (dispatched by any task form or action)
 *  - visibilitychange → page becomes visible
 *  - window focus
 *  - pageshow with persisted (bfcache restore)
 *  - Every intervalMs ms while visible, paused when hidden
 */
export function useAutoRefresh(refresh: () => void, intervalMs = 60_000): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(
    () => setupAutoRefresh(() => refreshRef.current(), intervalMs),
    [intervalMs],
  );
}
