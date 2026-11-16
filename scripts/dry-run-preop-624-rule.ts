/**
 * Dry-run: show what PRODUCTION_DAY instances would be generated for the 624
 * facility's Pre-Op Inspection rule over the next 14 days.
 *
 * Uses Sheets API v4 ONLY — no gviz fallback. Fails loudly if the API key is missing.
 * Does NOT create or modify any database records.
 *
 * Run: npx tsx --env-file=.env.local scripts/dry-run-preop-624-rule.ts
 */

import { PrismaClient } from "../src/generated/prisma";
import { fetchViaApiV4, parseDaysInRange } from "../src/lib/sheet-parser";
import { getPacificToday, addDaysToDateStr } from "../src/lib/pacific-time";

const FACILITY_ID_624 = "cmwcjg6ya0001f6x5n9yu2cjh";
const HORIZON_DAYS = 14;

const prisma = new PrismaClient();

async function main() {
  // Fail loudly if API key is missing — no fallback
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GOOGLE_SHEETS_API_KEY is not set in environment. Cannot proceed.");
    process.exit(1);
  }

  // Load the 624 facility record to get calendarTabName
  const facility = await prisma.facility.findUnique({
    where: { id: FACILITY_ID_624 },
    select: { id: true, name: true, calendarTabName: true },
  });
  if (!facility) {
    console.error(`ERROR: Facility with id=${FACILITY_ID_624} not found in DB.`);
    process.exit(1);
  }
  console.log(`Facility: "${facility.name}" (id: ${facility.id})`);
  console.log(`Calendar tab: "${facility.calendarTabName}"`);

  // Fetch sheet data via API v4 — throw on failure, no gviz fallback
  console.log("\nFetching production schedule via Sheets API v4…");
  let rows: string[][];
  try {
    rows = await fetchViaApiV4(facility.calendarTabName);
  } catch (err) {
    console.error(`ERROR: Failed to fetch sheet tab "${facility.calendarTabName}":`, err);
    process.exit(1);
  }
  console.log(`Fetched ${rows.length} rows from tab "${facility.calendarTabName}".`);

  // Compute date range: today … today + 14 days
  const todayStr = getPacificToday();
  const horizonStr = addDaysToDateStr(todayStr, HORIZON_DAYS);
  const [sy, sm, sd] = todayStr.split("-").map(Number);
  const [ey, em, ed] = horizonStr.split("-").map(Number);
  const startDate = new Date(Date.UTC(sy, sm - 1, sd));
  const endDate   = new Date(Date.UTC(ey, em - 1, ed));

  console.log(`\nDate range: ${todayStr} → ${horizonStr} (${HORIZON_DAYS} days)\n`);

  // Parse production days in range
  const productionDays = parseDaysInRange(rows, startDate, endDate);
  const productionDayDates = productionDays.filter((d) => d.is_production_day).map((d) => d.iso_date);

  console.log(`Production days found: ${productionDayDates.length}`);
  console.log("─".repeat(50));

  if (productionDayDates.length === 0) {
    console.log("  (none — no production days in this range)");
  } else {
    for (const date of productionDayDates) {
      const dow = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
        weekday: "long", timeZone: "UTC",
      });
      console.log(`  ${date}  (${dow})`);
    }
  }

  console.log("─".repeat(50));
  console.log(`\nDRY RUN SUMMARY`);
  console.log(`  Rule that WOULD be created:`);
  console.log(`    title:       Pre-Op Inspection — 624`);
  console.log(`    facilityId:  ${FACILITY_ID_624}`);
  console.log(`    formKey:     preop_624`);
  console.log(`    triggerType: PRODUCTION_DAY`);
  console.log(`    ownerId:     cmwcj3v4l0000gnmh6zvw3jf9  (Hugo Ayala)`);
  console.log(`\n  Instances that WOULD be generated for the next ${HORIZON_DAYS} days:`);
  console.log(`    ${productionDayDates.length} instance(s) — one per production day listed above`);
  console.log(`\n  NO records were created or modified. Apply migration first, then`);
  console.log(`  approve rule creation to proceed.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Dry-run script failed:", err);
  process.exit(1);
});
