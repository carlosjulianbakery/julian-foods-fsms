export const dynamic = "force-dynamic";

// Temporary debug endpoint — remove after diagnosis is complete.
// Admin only. Returns raw sheet data and env var status.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchViaApiV4, parseCsv } from "../route";

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
  "12MOCA6n7D0LI8S29A13uBfC_mEhtqG0JtlJhFnRcgMo";
const SHEET_NAME =
  process.env.GOOGLE_SHEETS_SHEET_NAME || "Julian Bakery";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Env var status (key names only, never values)
  const envStatus = {
    GOOGLE_SHEETS_API_KEY: process.env.GOOGLE_SHEETS_API_KEY ? "set" : "NOT SET",
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? "set" : "not set (using default)",
    GOOGLE_SHEETS_SHEET_NAME: process.env.GOOGLE_SHEETS_SHEET_NAME ? "set" : "not set (using default)",
    spreadsheet_id_in_use: SPREADSHEET_ID,
    sheet_name_in_use: SHEET_NAME,
  };

  // Try Sheets API v4 and return first 20 rows + rows around current week
  let apiV4Result: object;
  try {
    const rows = await fetchViaApiV4();
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const thisMonth = now.getMonth() + 1;
    const thisDay = now.getDate();

    // Find rows mentioning the current month
    const relevantRows: Array<{ index: number; row: string[] }> = [];
    const monthAbbrs = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthAbbr = monthAbbrs[now.getMonth()];
    for (let i = 0; i < rows.length; i++) {
      const colA = rows[i][0] ?? "";
      if (colA.includes(monthAbbr)) {
        relevantRows.push({ index: i, row: rows[i] });
        if (i + 1 < rows.length) relevantRows.push({ index: i + 1, row: rows[i + 1] });
      }
    }

    apiV4Result = {
      status: "ok",
      total_rows: rows.length,
      first_20_rows: rows.slice(0, 20),
      rows_near_current_month: relevantRows.slice(0, 20),
      looking_for_monday: `${monthAbbr} (${thisMonth}/${thisDay - (now.getDay() === 0 ? 6 : now.getDay() - 1)})`,
    };
  } catch (e) {
    apiV4Result = {
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Try gviz and return first 5 rows
  let gvizResult: object;
  try {
    const url =
      `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
      `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&headers=0`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`gviz HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCsv(text);
    gvizResult = {
      status: "ok",
      total_rows: rows.length,
      first_5_rows: rows.slice(0, 5),
    };
  } catch (e) {
    gvizResult = {
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return NextResponse.json({
    env: envStatus,
    api_v4: apiV4Result,
    gviz: gvizResult,
    node_version: process.version,
    timestamp: new Date().toISOString(),
  });
}
