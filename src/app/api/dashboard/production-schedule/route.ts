export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DaySchedule {
  day: string;
  date: string;
  full_date: string;
  items: string[];
}

interface WeekSchedule {
  week_label: string;
  days: DaySchedule[];
}

interface ScheduleResult {
  this_week: WeekSchedule | null;
  next_week: WeekSchedule | null;
  last_fetched: string;
  is_stale?: boolean;
}

// ─── Module-level cache (5 minutes) ──────────────────────────────────────────

let cache: { data: ScheduleResult; expiresAt: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

// ─── Config ───────────────────────────────────────────────────────────────────

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
  "12MOCA6n7D0LI8S29A13uBfC_mEhtqG0JtlJhFnRcgMo";
const SHEET_NAME =
  process.env.GOOGLE_SHEETS_SHEET_NAME || "Julian Bakery";

// ─── Pacific-time helpers ─────────────────────────────────────────────────────

function getPacificNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
}

function getThisMonday(pt: Date): Date {
  const d = new Date(pt);
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Format "Jun 22" for the week label
function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "America/Los_Angeles",
  });
}

// ─── Robust date matching ─────────────────────────────────────────────────────
// Parse month+day from a sheet header cell like "Mon, Jun 22" or "Mon Jun 22".
// This avoids relying on toLocaleDateString format matching across ICU versions
// (Node 18+ can emit narrow-no-break-space instead of regular space).

const MONTH_ABBR: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseSheetHeaderDate(cell: string): { month: number; day: number } | null {
  // Matches "Mon, Jun 22" or "Mon Jun 22" — any leading day-name then month abbr + day number
  const m = cell.trim().replace(/\s+/g, " ").match(/^[A-Za-z]+,?\s+([A-Za-z]+)\s+(\d+)/);
  if (!m) return null;
  const month = MONTH_ABBR[m[1]];
  const day = parseInt(m[2], 10);
  if (month === undefined || isNaN(day)) return null;
  return { month, day };
}

function isThisMonday(cell: string, monday: Date): boolean {
  const parsed = parseSheetHeaderDate(cell);
  if (!parsed) return false;
  return monday.getMonth() === parsed.month && monday.getDate() === parsed.day;
}

// ─── Date header detection ────────────────────────────────────────────────────

function isDateHeaderRow(cells: string[]): boolean {
  // A date header row has "Mon, [Month] [Day]" in column A
  const colA = (cells[0] ?? "").trim();
  return /^Mon[.,]?\s/i.test(colA);
}

// ─── CSV parser (handles quoted multi-line fields, RFC 4180) ──────────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const row: string[] = [];
    while (i < n) {
      if (text[i] === '"') {
        i++;
        let field = "";
        while (i < n) {
          if (text[i] === '"') {
            if (i + 1 < n && text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else {
            field += text[i++];
          }
        }
        row.push(field);
      } else {
        let field = "";
        while (i < n && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          field += text[i++];
        }
        row.push(field);
      }
      if (i < n && text[i] === ",") { i++; continue; }
      break;
    }
    if (i < n && text[i] === "\r") i++;
    if (i < n && text[i] === "\n") i++;
    rows.push(row);
  }

  return rows;
}

// ─── Sheets API v4 ───────────────────────────────────────────────────────────

export async function fetchViaApiV4(): Promise<string[][]> {
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  if (!key) {
    console.error("[production-schedule] ERROR: GOOGLE_SHEETS_API_KEY environment variable is not set");
    throw new Error("api_key_missing");
  }
  // To obtain a key: console.cloud.google.com → Create project → Enable Google Sheets API
  // → Credentials → Create API Key → Restrict to Google Sheets API only
  const range = `'${SHEET_NAME}'!A1:D700`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}` +
    `?key=${key}&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[production-schedule] Sheets API v4 error ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`fetch_failed:${res.status}`);
  }
  const json = await res.json();
  const rows = (json.values ?? []) as string[][];
  console.log(`[production-schedule] Sheets API v4: fetched ${rows.length} rows`);
  return rows;
}

// ─── gviz CSV fallback ────────────────────────────────────────────────────────
// Note: gviz types date-format columns as "date" and skips fully empty rows.
// When production content exists in those cells the API v4 is required.
// gviz is kept as a fallback that at minimum shows the week dates.

async function fetchViaGviz(): Promise<string[][]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&headers=0`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`gviz_error:${res.status}`);
  const text = await res.text();
  const raw = parseCsv(text);
  // gviz skips empty rows — synthesize a blank content row after each date header
  const expanded: string[][] = [];
  for (const row of raw) {
    expanded.push(row);
    if (isDateHeaderRow(row)) expanded.push([]);
  }
  console.log(`[production-schedule] gviz fallback: ${raw.length} header rows → ${expanded.length} expanded rows`);
  return expanded;
}

// ─── Parse rows → week schedules ─────────────────────────────────────────────

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday"];

function buildWeekSchedule(monday: Date, headerRow: string[], contentRow: string[]): WeekSchedule {
  const thu = new Date(monday);
  thu.setDate(monday.getDate() + 3);

  const days: DaySchedule[] = DAY_NAMES.map((dayName, idx) => {
    const fullDate = (headerRow[idx] ?? "").trim();
    const cellText = (contentRow[idx] ?? "").trim();
    const items = cellText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Extract "Jun 22" from "Mon, Jun 22" (or "Mon Jun 22")
    const dateMatch = fullDate.match(/^[A-Za-z]+,?\s+(.+)$/);
    const date = dateMatch
      ? dateMatch[1].trim()
      : shortDate(new Date(monday.getTime() + idx * 86400000));
    return { day: dayName, date, full_date: fullDate, items };
  });

  return {
    week_label: `${shortDate(monday)} — ${shortDate(thu)}`,
    days,
  };
}

function parseSchedule(rows: string[][], thisMonday: Date, nextMonday: Date): ScheduleResult {
  let thisWeekSchedule: WeekSchedule | null = null;
  let nextWeekSchedule: WeekSchedule | null = null;

  for (let i = 0; i < rows.length; i++) {
    const colA = (rows[i][0] ?? "").trim();
    if (!colA) continue;

    if (!thisWeekSchedule && isThisMonday(colA, thisMonday)) {
      const nextRow = rows[i + 1] ?? [];
      const contentRow = !isDateHeaderRow(nextRow) ? nextRow : [];
      console.log(`[production-schedule] Found this week at row ${i}: "${colA}"`);
      console.log(`[production-schedule] Content row (${i + 1}): cols = [${contentRow.map(c => JSON.stringify(c.slice(0, 30))).join(", ")}]`);
      thisWeekSchedule = buildWeekSchedule(thisMonday, rows[i], contentRow);
    }

    if (!nextWeekSchedule && isThisMonday(colA, nextMonday)) {
      const nextRow = rows[i + 1] ?? [];
      const contentRow = !isDateHeaderRow(nextRow) ? nextRow : [];
      console.log(`[production-schedule] Found next week at row ${i}: "${colA}"`);
      nextWeekSchedule = buildWeekSchedule(nextMonday, rows[i], contentRow);
    }

    if (thisWeekSchedule && nextWeekSchedule) break;
  }

  if (!thisWeekSchedule) {
    const thisMon = `${thisMonday.getMonth() + 1}/${thisMonday.getDate()}`;
    console.warn(`[production-schedule] This week not found. Total rows: ${rows.length}. Looking for Monday: ${thisMon}`);
  }

  return {
    this_week: thisWeekSchedule,
    next_week: nextWeekSchedule,
    last_fetched: new Date().toISOString(),
  };
}

// ─── Fetch with fallback ──────────────────────────────────────────────────────

async function fetchSchedule(): Promise<ScheduleResult> {
  const pt = getPacificNow();
  const thisMonday = getThisMonday(pt);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);

  let rows: string[][];
  try {
    rows = await fetchViaApiV4();
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : String(e1);
    console.warn(`[production-schedule] Sheets API v4 failed (${msg}), falling back to gviz`);
    rows = await fetchViaGviz();
  }

  return parseSchedule(rows, thisMonday, nextMonday);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  const now = Date.now();

  if (!refresh && cache && cache.expiresAt > now) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchSchedule();
    cache = { data, expiresAt: now + CACHE_DURATION };
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/dashboard/production-schedule]", msg);

    if (cache) {
      return NextResponse.json({ ...cache.data, is_stale: true });
    }

    return NextResponse.json(
      { error: "Failed to load production schedule", detail: msg },
      { status: 500 }
    );
  }
}
