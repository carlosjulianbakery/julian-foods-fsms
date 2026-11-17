"use client";
import { useEffect, useRef, useCallback } from "react";

interface SyncResult {
  ran: boolean;
  created?: number;
  deleted?: number;
  flagged?: number;
  reason?: string;
  error?: string;
  lastSyncAt?: string | null;
}

export type CalendarSyncCleanup = () => void;

/**
 * Pure event-listener setup, decoupled from React.
 * Exported for unit-testing without a renderer.
 */
export function setupCalendarSync(
  onChanged: () => void,
  intervalMs = 60_000,
): CalendarSyncCleanup {
  let running = false;

  async function runSync() {
    if (running) return;
    running = true;
    try {
      const res = await fetch("/api/task-rules/sync", { method: "POST" });
      if (!res.ok) return;
      const data: SyncResult = await res.json();
      if (
        data.ran &&
        ((data.created ?? 0) > 0 || (data.deleted ?? 0) > 0 || (data.flagged ?? 0) > 0)
      ) {
        onChanged();
      }
    } catch {
      // Non-blocking — never surface to the user
    } finally {
      running = false;
    }
  }

  const handleVisibility = () => {
    if (!document.hidden) runSync();
  };

  document.addEventListener("visibilitychange", handleVisibility);
  const id = setInterval(() => {
    if (!document.hidden) runSync();
  }, intervalMs);

  // Run immediately on setup
  runSync();

  return () => {
    document.removeEventListener("visibilitychange", handleVisibility);
    clearInterval(id);
  };
}

/**
 * Calls POST /api/task-rules/sync on mount, on tab visibility, and every
 * intervalMs ms while visible. Calls onChanged() only when the sync reports
 * created > 0 || deleted > 0 || flagged > 0. Never throws or shows a spinner.
 */
export function useCalendarSync(onChanged: () => void, intervalMs = 60_000): void {
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const stable = useCallback(() => onChangedRef.current(), []);

  useEffect(
    () => setupCalendarSync(stable, intervalMs),
    [stable, intervalMs],
  );
}
