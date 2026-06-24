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

// Format date as "Mon, Jun 22" — matches the formatted value in the Google Sheet
function sheetDateString(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

// Format date as "Jun 22"
function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "America/Los_Angeles",
  });
}

// ─── CSV parser (handles quoted multi-line fields) ────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const row: string[] = [];
    while (i < n) {
      if (text[i] === '"') {
        // Quoted field — may contain commas, newlines, escaped quotes
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
        // Unquoted field
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

    // Include empty rows (they are content rows in the sheet pair structure)
    rows.push(row);
  }

  return rows;
}

function isDateHeaderRow(cells: string[]): boolean {
  return /^(Mon),\s/.test((cells[0] ?? "").trim());
}

// ─── Sheets API v4 (requires GOOGLE_SHEETS_API_KEY) ──────────────────────────

async function fetchViaApiV4(): Promise<string[][]> {
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  if (!key) throw new Error("GOOGLE_SHEETS_API_KEY not set");
  // To obtain a key: console.cloud.google.com → Create project → Enable Google Sheets API
  // → Credentials → Create API Key → Restrict to Google Sheets API only
  const range = `'${SHEET_NAME}'!A1:D700`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}` +
    `?key=${key}&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API v4 error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  // API v4 omits trailing empty rows but includes empty rows in the middle
  return (json.values ?? []) as string[][];
}

// ─── gviz CSV fallback (no key needed, but skips blank content rows) ──────────

async function fetchViaGviz(): Promise<string[][]> {
  // NOTE: gviz types columns A-D as "date" and skips empty rows.
  // Content rows with text in date-typed columns may appear as blank here.
  // Use Sheets API v4 for complete data when production content is present.
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&headers=0`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`gviz error: ${res.status}`);
  const text = await res.text();
  const raw = parseCsv(text);
  // gviz only returns non-empty rows; synthesize empty content rows after each header
  const expanded: string[][] = [];
  for (const row of raw) {
    expanded.push(row);
    if (isDateHeaderRow(row)) expanded.push([]); // placeholder content row
  }
  return expanded;
}

// ─── Parse rows → schedule ────────────────────────────────────────────────────

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
    // Extract "Jun 22" from "Mon, Jun 22"
    const dateMatch = fullDate.match(/^[A-Za-z]+,\s+(.+)$/);
    const date = dateMatch ? dateMatch[1] : fullDate || shortDate(new Date(monday.getTime() + idx * 86400000));
    return { day: dayName, date, full_date: fullDate, items };
  });

  return {
    week_label: `${shortDate(monday)} — ${shortDate(thu)}`,
    days,
  };
}

function parseSchedule(rows: string[][], thisMonday: Date, nextMonday: Date): ScheduleResult {
  const thisMondayStr = sheetDateString(thisMonday);
  const nextMondayStr = sheetDateString(nextMonday);

  let thisWeekSchedule: WeekSchedule | null = null;
  let nextWeekSchedule: WeekSchedule | null = null;

  for (let i = 0; i < rows.length; i++) {
    const colA = (rows[i][0] ?? "").trim();

    if (colA === thisMondayStr && !thisWeekSchedule) {
      const contentRow = (i + 1 < rows.length && !isDateHeaderRow(rows[i + 1])) ? rows[i + 1] : [];
      thisWeekSchedule = buildWeekSchedule(thisMonday, rows[i], contentRow);
    }

    if (colA === nextMondayStr && !nextWeekSchedule) {
      const contentRow = (i + 1 < rows.length && !isDateHeaderRow(rows[i + 1])) ? rows[i + 1] : [];
      nextWeekSchedule = buildWeekSchedule(nextMonday, rows[i], contentRow);
    }

    if (thisWeekSchedule && nextWeekSchedule) break;
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
    console.warn("[production-schedule] Sheets API v4 failed, falling back to gviz:", e1);
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

  // Return cache if fresh and not refreshing
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
      // Return stale data rather than an error
      return NextResponse.json({ ...cache.data, is_stale: true });
    }

    return NextResponse.json(
      { error: "Failed to load production schedule", detail: msg },
      { status: 500 }
    );
  }
}
