// Shared draft key/expiry helper for 624 forms.
// Keys are scoped to form prefix + userId + date.
// Drafts expire after 48 hours (checked by stored timestamp).

export const DRAFT_TTL_MS = 48 * 60 * 60 * 1000;

export function draftKey624(prefix: string, userId: string, date: string): string {
  return `${prefix}_draft:${userId}:${date}`;
}

export function saveDraft624(prefix: string, userId: string, date: string, data: unknown): void {
  try {
    const key = draftKey624(prefix, userId, date);
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {}
}

export function loadDraft624<T>(prefix: string, userId: string, date: string): T | null {
  try {
    const key = draftKey624(prefix, userId, date);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { savedAt, data } = JSON.parse(raw) as { savedAt: number; data: T };
    if (Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

export function clearDraft624(prefix: string, userId: string, date: string): void {
  try {
    localStorage.removeItem(draftKey624(prefix, userId, date));
  } catch {}
}
