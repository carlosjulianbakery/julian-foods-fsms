import { PrismaClient } from "../src/generated/prisma";
const prisma = new PrismaClient();

const LOT_NUMBERS = [
  '210124-FG','2001496','BB10/14/2027','1ADB 0055625692',
  '11221999000385','AIFSBF02401-9','3700/11165250428',
];

async function main() {
  const summary = await prisma.$queryRaw<Array<{
    material: string; lot_number: string;
    quantity_remaining: number; quantity_received: number; unit: string;
    total_batch_deducted: number; total_corrections: number; total_received_movements: number;
  }>>`
    SELECT 
      m.name as material,
      il."lotNumber" as lot_number,
      il."quantityRemaining" as quantity_remaining,
      il."quantityReceived" as quantity_received,
      il.unit,
      SUM(CASE WHEN im."movementType" = 'out_batch_sheet' THEN ABS(im.quantity) ELSE 0 END) as total_batch_deducted,
      SUM(CASE WHEN im."movementType" IN ('in_correction','out_correction') THEN im.quantity ELSE 0 END) as total_corrections,
      SUM(CASE WHEN im."movementType" IN ('in_initial_stock','in_receiving') THEN im.quantity ELSE 0 END) as total_received_movements
    FROM inventory_lots il
    JOIN materials m ON il."materialId" = m.id
    JOIN inventory_movements im ON im."inventoryLotId" = il.id
    WHERE il."lotNumber" IN (${LOT_NUMBERS[0]}, ${LOT_NUMBERS[1]}, ${LOT_NUMBERS[2]}, ${LOT_NUMBERS[3]}, ${LOT_NUMBERS[4]}, ${LOT_NUMBERS[5]}, ${LOT_NUMBERS[6]})
    GROUP BY m.name, il."lotNumber", il."quantityRemaining", il."quantityReceived", il.unit
    ORDER BY m.name
  `;

  console.log("\n=== SUMMARY PER LOT ===");
  for (const row of summary) {
    const received = Number(row.total_received_movements);
    const batch = Number(row.total_batch_deducted);
    const corr = Number(row.total_corrections);
    const correct = received - batch;
    const delta = correct - Number(row.quantity_remaining);
    console.log(`\n${row.material}`);
    console.log(`  Lot:                     ${row.lot_number}`);
    console.log(`  Unit:                    ${row.unit}`);
    console.log(`  quantity_received(field): ${row.quantity_received}`);
    console.log(`  quantity_remaining(curr): ${row.quantity_remaining}`);
    console.log(`  total_received_movements: ${received.toFixed(4)}`);
    console.log(`  total_batch_deducted:     ${batch.toFixed(4)}`);
    console.log(`  total_corrections(net):   ${corr.toFixed(4)}`);
    console.log(`  CORRECT_remaining:        ${correct.toFixed(4)}  (received - batch)`);
    console.log(`  DELTA_needed:             ${delta.toFixed(4)}  (correct - current)`);
  }

  const movements = await prisma.$queryRaw<Array<{
    material: string; lot_number: string; movement_type: string;
    quantity: number; quantity_before: number; quantity_after: number;
    reference_number: string | null; performed_at: Date;
  }>>`
    SELECT 
      m.name as material,
      il."lotNumber" as lot_number,
      im."movementType" as movement_type,
      im.quantity,
      im."quantityBefore" as quantity_before,
      im."quantityAfter" as quantity_after,
      im."referenceNumber" as reference_number,
      im."performedAt" as performed_at
    FROM inventory_movements im
    JOIN inventory_lots il ON im."inventoryLotId" = il.id
    JOIN materials m ON il."materialId" = m.id
    WHERE il."lotNumber" IN (${LOT_NUMBERS[0]}, ${LOT_NUMBERS[1]}, ${LOT_NUMBERS[2]}, ${LOT_NUMBERS[3]}, ${LOT_NUMBERS[4]}, ${LOT_NUMBERS[5]}, ${LOT_NUMBERS[6]})
    ORDER BY m.name, im."performedAt" ASC
  `;

  console.log("\n\n=== ALL MOVEMENTS (chronological) ===");
  let cur = "";
  for (const m of movements) {
    if (m.material !== cur) {
      console.log(`\n--- ${m.material} | ${m.lot_number} ---`);
      cur = m.material;
    }
    const before = Number(m.quantity_before);
    const qty = Number(m.quantity);
    const after = Number(m.quantity_after);
    const ok = Math.abs(before + qty - after) < 0.001 ? "✓" : `✗ MISMATCH(expected_after=${(before+qty).toFixed(4)})`;
    console.log(`  ${m.performed_at.toISOString().slice(0,16)} | ${m.movement_type.padEnd(20)} | qty=${qty.toFixed(4).padStart(12)} | bef=${before.toFixed(4).padStart(10)} | aft=${after.toFixed(4).padStart(10)} | ${ok} | ${m.reference_number ?? ""}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
