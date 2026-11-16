/**
 * Dry-run + diagnostic: show what PRODUCTION_DAY instances would be generated
 * for the 624 facility's Pre-Op Inspection rule.
 *
 * Uses Sheets API v4 ONLY — no gviz fallback. Fails loudly if the API key is missing.
 * Does NOT create or modify any database records.
 *
 * Run: npx tsx --env-file=.env.local scripts/dry-run-preop-624-rule.ts
 */

import { PrismaClient } from "../src/generated/prisma";
import {
  fetchViaApiV4,
  parseDaysInRange,
  getMondaysInRange,
  buildWeekSchedule,
  isThisMonday,
  isDateHeaderRow,
  toIsoDate,
} from "../src/lib/sheet-parser";
import { getPacificToday, addDaysToDateStr } from "../src/lib/pacific-time";

const FACILITY_ID_624 = "cmwcjg6ya0001f6x5n9yu2cjh";
const HORIZON_DAYS    = 14;

const prisma = new PrismaClient();

function sep(c = "─", n = 60) { return c.repeat(n); }

async function main() {
  // Fail loudly if API key is missing — no fallback
  if (!process.env.GOOGLE_SHEETS_API_KEY) {
    console.error("ERROR: GOOGLE_SHEETS_API_KEY is not set. Cannot proceed.");
    process.exit(1);
  }

  const facility = await prisma.facility.findUnique({
    where: { id: FACILITY_ID_624 },
    select: { id: true, name: true, calendarTabName: true },
  });
  if (!facility) {
    console.error(`ERROR: Facility id=${FACILITY_ID_624} not found in DB.`);
    process.exit(1);
  }
  console.log(`Facility: "${facility.name}" (id: ${facility.id})`);
  console.log(`Calendar tab: "${facility.calendarTabName}"`);
  console.log();

  console.log("Fetching via Sheets API v4…");
  let rows: string[][];
  try {
    rows = await fetchViaApiV4(facility.calendarTabName);
  } catch (err) {
    console.error(`ERROR fetching tab "${facility.calendarTabName}":`, err);
    process.exit(1);
  }
  console.log(`Fetched ${rows.length} raw rows.\n`);

  // ── Column layout check ────────────────────────────────────────────────────
  console.log("COLUMN LAYOUT (first 5 non-empty rows):");
  console.log(sep());
  let shown = 0;
  for (let i = 0; i < rows.length && shown < 5; i++) {
    const r = rows[i];
    if (r.some((c) => c.trim())) {
      console.log(`Row ${String(i).padStart(3)}: [${r.map((c) => JSON.stringify(c)).join(", ")}]`);
      shown++;
    }
  }
  console.log(`Expected layout: same 4-column format as Julian Bakery tab`);
  console.log(`  col A = Mon date header / content, B = Tue, C = Wed, D = Thu\n`);

  // ── First 25 parsed days (whole tab) ──────────────────────────────────────
  // Parse every Monday found in the entire sheet
  const FAR_BACK = new Date(Date.UTC(2026, 0, 1));   // Jan 1 2026
  const FAR_FWD  = new Date(Date.UTC(2027, 11, 31));  // Dec 31 2027
  const allDays  = parseDaysInRange(rows, FAR_BACK, FAR_FWD);

  const prodDays = allDays.filter((d) => d.items.some((i) => i.item_type === "production"));
  const allDates = allDays.map((d) => d.iso_date);

  console.log(`TOTAL days parsed from whole tab: ${allDays.length}`);
  console.log(`Production days (items.some type=production): ${prodDays.length}`);
  if (prodDays.length > 0) {
    const sorted = [...prodDays].sort((a, b) => a.iso_date.localeCompare(b.iso_date));
    console.log(`Min production date: ${sorted[0].iso_date}`);
    console.log(`Max production date: ${sorted[sorted.length - 1].iso_date}`);
  }
  console.log();

  console.log("FIRST 25 PARSED DAYS (raw date cell → ISO date → production flag):");
  console.log(sep());
  for (const d of allDays.slice(0, 25)) {
    const isProd = d.items.some((i) => i.item_type === "production");
    const items  = d.items.map((i) => i.raw_text || "(empty)").join(" | ") || "(none)";
    console.log(`${d.iso_date}  ${d.full_date.padEnd(22)}  ${isProd ? "PRODUCTION" : "non-prod  "}  ${items}`);
  }
  console.log();

  // ── Nov 9 – Dec 4 window ──────────────────────────────────────────────────
  const WIN_START = new Date(Date.UTC(2026, 10,  9));  // Nov  9 2026
  const WIN_END   = new Date(Date.UTC(2026, 11,  4));  // Dec  4 2026
  const winDays   = parseDaysInRange(rows, WIN_START, WIN_END);

  console.log(`DAYS IN Nov 9 – Dec 4 2026 WINDOW (${winDays.length} days found):`);
  console.log(sep());
  if (winDays.length === 0) {
    console.log("  (no days parsed in this range — Mondays may not be in sheet)");
    // Show which Mondays are expected vs found
    const mondays = getMondaysInRange(WIN_START, WIN_END);
    console.log(`  Expected ${mondays.length} Monday(s): ${mondays.map((m) => toIsoDate(m)).join(", ")}`);
    // Try to find those Mondays in the raw rows
    for (const monday of mondays) {
      let found = false;
      for (let i = 0; i < rows.length; i++) {
        if (isThisMonday(rows[i][0] ?? "", monday)) {
          found = true;
          const nextRow = rows[i + 1] ?? [];
          const contentRow = !isDateHeaderRow(nextRow) ? nextRow : [];
          const week = buildWeekSchedule(monday, rows[i], contentRow);
          console.log(`  Monday ${toIsoDate(monday)} FOUND at row ${i}: header=[${rows[i].join(", ")}]`);
          for (const d of week.days) {
            const isProd = d.items.some((i2) => i2.item_type === "production");
            console.log(`    ${d.iso_date}  ${isProd ? "PRODUCTION" : "non-prod"}  ${d.items.map((i2) => i2.raw_text).join(" | ") || "(none)"}`);
          }
          break;
        }
      }
      if (!found) {
        console.log(`  Monday ${toIsoDate(monday)} NOT FOUND in sheet rows`);
      }
    }
  } else {
    for (const d of winDays) {
      const isProd = d.items.some((i) => i.item_type === "production");
      const reason = isProd ? "has production item(s)" : "no production items";
      const items  = d.items.map((i) => `[${i.item_type}] ${i.raw_text}`).join(" | ") || "(empty)";
      console.log(`${d.iso_date}  ${isProd ? "PRODUCTION" : "non-prod  "}  ${reason}`);
      if (d.items.length > 0) console.log(`  items: ${items}`);
    }
  }
  console.log();

  // ── Scheduled dry-run (same 14-day window as generator) ───────────────────
  const todayStr  = getPacificToday();
  const horizonStr = addDaysToDateStr(todayStr, HORIZON_DAYS);
  const [sy, sm, sd] = todayStr.split("-").map(Number);
  const [ey, em, ed] = horizonStr.split("-").map(Number);
  const startDate = new Date(Date.UTC(sy, sm - 1, sd));
  const endDate   = new Date(Date.UTC(ey, em - 1, ed));
  const nextDays  = parseDaysInRange(rows, startDate, endDate);
  const nextProd  = nextDays.filter((d) => d.items.some((i) => i.item_type === "production"));

  console.log(`NEXT ${HORIZON_DAYS} DAYS (${todayStr} → ${horizonStr}):`);
  console.log(sep());
  console.log(`Total days in range: ${nextDays.length}  |  Production days: ${nextProd.length}`);
  for (const d of nextProd) {
    const dow = new Date(d.iso_date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    console.log(`  ${d.iso_date}  (${dow})`);
  }
  console.log();

  console.log("DRY RUN SUMMARY");
  console.log(sep("="));
  console.log(`  Rule that WOULD be created:`);
  console.log(`    title:       Pre-Op Inspection — 624`);
  console.log(`    facilityId:  ${FACILITY_ID_624}`);
  console.log(`    formKey:     preop_624`);
  console.log(`    triggerType: PRODUCTION_DAY`);
  console.log(`    ownerId:     cmwcj3v4l0000gnmh6zvw3jf9  (Hugo Ayala)`);
  console.log(`  Instances for next ${HORIZON_DAYS} days: ${nextProd.length}`);
  console.log(`  NO records created. Apply migration first, then approve rule creation.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Dry-run failed:", err);
  process.exit(1);
});
