"use client";

const KEY = "fsm:completedTasks";
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface Entry { id: string; ts: number }

export function markTaskCompleted(instanceId: string): void {
  try {
    const raw = sessionStorage.getItem(KEY);
    const entries: Entry[] = raw ? (JSON.parse(raw) as Entry[]) : [];
    const now = Date.now();
    const fresh = entries.filter((e) => now - e.ts < TTL_MS);
    fresh.push({ id: instanceId, ts: now });
    sessionStorage.setItem(KEY, JSON.stringify(fresh));
  } catch { /* private window / blocked */ }
}

export function getCompletedTaskIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return new Set();
    const entries: Entry[] = JSON.parse(raw) as Entry[];
    const now = Date.now();
    return new Set(entries.filter((e) => now - e.ts < TTL_MS).map((e) => e.id));
  } catch {
    return new Set();
  }
}
