/**
 * Shared Google Sheets row fetcher with per-tab module-level cache.
 * Cache key: `${spreadsheetId}:${sheetName}` — tabs cached independently.
 * TTL: 5 minutes.
 */

import { fetchViaApiV4, fetchViaGviz, SPREADSHEET_ID } from "./sheet-parser";

const CACHE_DURATION = 5 * 60 * 1000;
const rowsCache = new Map<string, { rows: string[][]; fetchedAt: number; expiresAt: number }>();

export async function fetchSheetRows(sheetName: string): Promise<{ rows: string[][]; fetchedAt: number }> {
  const key = `${SPREADSHEET_ID}:${sheetName}`;
  const now = Date.now();
  const cached = rowsCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { rows: cached.rows, fetchedAt: cached.fetchedAt };
  }

  let rows: string[][];
  try {
    rows = await fetchViaApiV4(sheetName);
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : String(e1);
    console.warn(`[google-sheets-fetcher] API v4 failed for "${sheetName}" (${msg}), falling back to gviz`);
    rows = await fetchViaGviz(sheetName);
  }

  rowsCache.set(key, { rows, fetchedAt: now, expiresAt: now + CACHE_DURATION });
  return { rows, fetchedAt: now };
}

export function invalidateSheetCache(sheetName: string): void {
  rowsCache.delete(`${SPREADSHEET_ID}:${sheetName}`);
}
