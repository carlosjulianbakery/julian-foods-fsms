/**
 * Shared Google Sheets parsing utilities for production schedule data.
 * Used by both the dashboard production-schedule route and the
 * ingredient-forecast planning API.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleItemStatus =
  | "complete"
  | "in_progress"
  | "not_started"
  | "issues";

export type ScheduleItemType = "production" | "unmatched_production" | "note";

export interface ScheduleItem {
  raw_text: string;
  item_type: ScheduleItemType;
  product_name: string;
  base_unit_count: number | null;
  base_unit_label: string | null;
  comments: string | null;
  status: ScheduleItemStatus;
  template_id: string | null;
  product_id: string | null;
  submission_id: string | null;
}

export interface DaySchedule {
  day: string;
  date: string;
  full_date: string;
  iso_date: string;
  items: ScheduleItem[];
}

export interface WeekSchedule {
  week_label: string;
  days: DaySchedule[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
  "12MOCA6n7D0LI8S29A13uBfC_mEhtqG0JtlJhFnRcgMo";

export const SHEET_NAME =
  process.env.GOOGLE_SHEETS_SHEET_NAME || "Julian Bakery";

// ─── Date utilities ───────────────────────────────────────────────────────────

export function getPacificNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
}

export function getThisMonday(pt: Date): Date {
  const d = new Date(pt);
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

// Always use UTC to avoid timezone shifts when comparing against @db.Date fields
export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Returns all Mondays (UTC midnight) from startDate's week through endDate's week */
export function getMondaysInRange(startDate: Date, endDate: Date): Date[] {
  const mondays: Date[] = [];
  const first = getThisMonday(startDate);
  // Normalize to UTC midnight using local date components (works on UTC server = Vercel)
  const current = new Date(Date.UTC(first.getFullYear(), first.getMonth(), first.getDate()));
  const endUtc = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()));

  while (current <= endUtc) {
    mondays.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 7);
  }
  return mondays;
}

// ─── Sheet header parsing ─────────────────────────────────────────────────────
// Parse month+day from a sheet header cell like "Mon, Jun 22" or "Mon Jun 22".
// Avoids relying on toLocaleDateString formatting across ICU versions.

export const MONTH_ABBR: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export function parseSheetHeaderDate(
  cell: string
): { month: number; day: number } | null {
  const m = cell
    .trim()
    .replace(/\s+/g, " ")
    .match(/^[A-Za-z]+,?\s+([A-Za-z]+)\s+(\d+)/);
  if (!m) return null;
  const month = MONTH_ABBR[m[1]];
  const day = parseInt(m[2], 10);
  if (month === undefined || isNaN(day)) return null;
  return { month, day };
}

export function isThisMonday(cell: string, monday: Date): boolean {
  const parsed = parseSheetHeaderDate(cell);
  if (!parsed) return false;
  return monday.getMonth() === parsed.month && monday.getDate() === parsed.day;
}

export function isDateHeaderRow(cells: string[]): boolean {
  const colA = (cells[0] ?? "").trim();
  return /^Mon[.,]?\s/i.test(colA);
}

// ─── Cell content parsing ─────────────────────────────────────────────────────
// New format: "Product Name / Base Units / Comments"
// e.g. "ProGranola — PB / 67 Bowls / do 1,400 9oz"
// Backward compatible: cells without " / " are treated as plain product name.

export function parseCellItem(firstLine: string): {
  product_name: string;
  base_unit_count: number | null;
  base_unit_label: string | null;
  comments: string | null;
} {
  const segments = firstLine.split(" / ");
  const product_name = (segments[0] ?? "").trim() || firstLine.trim();

  if (segments.length < 2) {
    return { product_name, base_unit_count: null, base_unit_label: null, comments: null };
  }

  const base_unit_raw = segments[1].trim();
  const numMatch = base_unit_raw.match(/(\d+)/);
  const base_unit_count = numMatch ? parseInt(numMatch[1], 10) : null;
  const base_unit_label = base_unit_raw.replace(/\d+/, "").trim() || null;

  const comments =
    segments.length >= 3 ? segments.slice(2).join(" / ").trim() || null : null;

  return { product_name, base_unit_count, base_unit_label, comments };
}

// ─── Schedule building ────────────────────────────────────────────────────────

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday"];

export function buildWeekSchedule(
  monday: Date,
  headerRow: string[],
  contentRow: string[]
): WeekSchedule {
  const thu = new Date(monday);
  thu.setDate(monday.getDate() + 3);

  const days: DaySchedule[] = DAY_NAMES.map((dayName, idx) => {
    const fullDate = (headerRow[idx] ?? "").trim();
    const cellText = (contentRow[idx] ?? "").trim();

    const lines = cellText.split("\n").map((l) => l.trim()).filter(Boolean);
    const items: ScheduleItem[] = [];

    for (const line of lines) {
      if (line.includes(" / ")) {
        const parsed = parseCellItem(line);
        items.push({
          raw_text: line,
          item_type: "production",
          ...parsed,
          status: "not_started",
          template_id: null,
          product_id: null,
          submission_id: null,
        });
      } else {
        items.push({
          raw_text: line,
          item_type: "note",
          product_name: "",
          base_unit_count: null,
          base_unit_label: null,
          comments: null,
          status: "not_started",
          template_id: null,
          product_id: null,
          submission_id: null,
        });
      }
    }

    const dateMatch = fullDate.match(/^[A-Za-z]+,?\s+(.+)$/);
    const date = dateMatch
      ? dateMatch[1].trim()
      : shortDate(new Date(monday.getTime() + idx * 86400000));

    // UTC-based iso_date for consistent @db.Date comparison
    const dayDate = new Date(
      Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate() + idx)
    );

    return {
      day: dayName,
      date,
      full_date: fullDate,
      iso_date: toIsoDate(dayDate),
      items,
    };
  });

  return {
    week_label: `${shortDate(monday)} — ${shortDate(thu)}`,
    days,
  };
}

// ─── CSV parser (RFC 4180) ────────────────────────────────────────────────────

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

// ─── Sheets API v4 fetch ──────────────────────────────────────────────────────

export async function fetchViaApiV4(): Promise<string[][]> {
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  if (!key) {
    console.error("[sheet-parser] ERROR: GOOGLE_SHEETS_API_KEY not set");
    throw new Error("api_key_missing");
  }
  const range = `'${SHEET_NAME}'!A1:D700`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/` +
    `${encodeURIComponent(range)}?key=${key}&valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[sheet-parser] Sheets API v4 error ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`fetch_failed:${res.status}`);
  }
  const json = await res.json();
  const rows = (json.values ?? []) as string[][];
  console.log(`[sheet-parser] Sheets API v4: fetched ${rows.length} rows`);
  return rows;
}

export async function fetchViaGviz(): Promise<string[][]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&headers=0`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`gviz_error:${res.status}`);
  const text = await res.text();
  const raw = parseCsv(text);
  const expanded: string[][] = [];
  for (const row of raw) {
    expanded.push(row);
    if (isDateHeaderRow(row)) expanded.push([]);
  }
  console.log(`[sheet-parser] gviz fallback: ${raw.length} → ${expanded.length} rows`);
  return expanded;
}

// ─── Multi-week range parser ──────────────────────────────────────────────────

/**
 * Find and parse all production days within [startIso, endIso] (inclusive).
 * Looks up each Monday in the range within the sheet rows.
 */
export function parseDaysInRange(
  rows: string[][],
  startDate: Date,
  endDate: Date
): DaySchedule[] {
  const mondays = getMondaysInRange(startDate, endDate);
  const startIso = toIsoDate(
    new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()))
  );
  const endIso = toIsoDate(
    new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()))
  );

  const result: DaySchedule[] = [];

  for (const monday of mondays) {
    // Search sheet rows for this Monday's header
    for (let i = 0; i < rows.length; i++) {
      const colA = (rows[i][0] ?? "").trim();
      if (!colA) continue;
      if (isThisMonday(colA, monday)) {
        const nextRow = rows[i + 1] ?? [];
        const contentRow = !isDateHeaderRow(nextRow) ? nextRow : [];
        const week = buildWeekSchedule(monday, rows[i], contentRow);
        for (const day of week.days) {
          if (day.iso_date >= startIso && day.iso_date <= endIso) {
            result.push(day);
          }
        }
        break;
      }
    }
  }

  return result;
}
