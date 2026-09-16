export const dynamic = "force-dynamic";

// Admin-only debug endpoint — returns raw row data from both sheet tabs.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchViaApiV4, parseCsv } from "../route";
import { SPREADSHEET_ID } from "@/lib/sheet-parser";

const SHEET_NAMES = ["Julian Bakery", "624"] as const;

async function fetchTabDebug(sheetName: string) {
  const envStatus = {
    GOOGLE_SHEETS_API_KEY: process.env.GOOGLE_SHEETS_API_KEY ? "set" : "NOT SET",
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? "set" : "not set (using default)",
    spreadsheet_id_in_use: SPREADSHEET_ID,
    sheet_name_in_use: sheetName,
  };

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const monthAbbrs = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthAbbr = monthAbbrs[now.getMonth()];

  let apiV4Result: object;
  try {
    const rows = await fetchViaApiV4(sheetName);
    const relevantRows: Array<{ index: number; row: string[] }> = [];
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
    };
  } catch (e) {
    apiV4Result = {
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let gvizResult: object;
  try {
    const url =
      `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
      `?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&headers=0`;
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

  return { env: envStatus, api_v4: apiV4Result, gviz: gvizResult };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [julianBakery, tab624] = await Promise.all(
    SHEET_NAMES.map((name) => fetchTabDebug(name))
  );

  return NextResponse.json({
    julian_bakery: julianBakery,
    tab_624: tab624,
    node_version: process.version,
    timestamp: new Date().toISOString(),
  });
}
