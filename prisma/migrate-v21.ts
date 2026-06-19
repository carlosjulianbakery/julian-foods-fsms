/**
 * Migration v21 — Clean up duplicate/wrong document requirement rules
 *
 * 1. Delete "Allergen Declaration" (old duplicate — "Allergen Statement" is correct)
 * 2. Delete "Gluten Free Statement / Declaration" (duplicate — "Gluten Free Statement" is correct)
 * 3. Update "Certificate of Analysis (COA)": ANNUAL/all_materials → PER_DELIVERY/coa_required
 * 4. Fix sort orders so the 9 remaining locked rules are numbered 1–9
 *
 * Safe to re-run — all operations are idempotent.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function deleteRule(name: string) {
  const rule = await prisma.documentRequirement.findFirst({
    where: { name, isSystemLocked: true },
    select: { id: true },
  });
  if (!rule) {
    console.log(`  "${name}" not found — skipping`);
    return;
  }
  // Orphan supplier documents that point to this rule
  await prisma.$executeRawUnsafe(
    `UPDATE supplier_documents SET "requirementId" = NULL WHERE "requirementId" = $1`,
    rule.id
  );
  // Orphan per-delivery obligations that point to this rule (set requirementId to a sentinel)
  const oblCount = await prisma.$executeRawUnsafe(
    `UPDATE per_delivery_obligations SET "requirementId" = '' WHERE "requirementId" = $1`,
    rule.id
  );
  await prisma.documentRequirement.delete({ where: { id: rule.id } });
  console.log(`✓ Deleted "${name}" (docs + obligations orphaned)`);
}

async function main() {
  // 1. Delete "Allergen Declaration"
  await deleteRule("Allergen Declaration");

  // 2. Delete "Gluten Free Statement / Declaration"
  await deleteRule("Gluten Free Statement / Declaration");

  // 3. Update COA → PER_DELIVERY / coa_required
  const coa = await prisma.documentRequirement.findFirst({
    where: { name: "Certificate of Analysis (COA)", isSystemLocked: true },
    select: { id: true, requirementType: true, triggerCondition: true },
  });
  if (!coa) {
    console.log('  "Certificate of Analysis (COA)" not found — skipping');
  } else if (coa.requirementType === "PER_DELIVERY" && coa.triggerCondition === "coa_required") {
    console.log('  COA already correct — skipping');
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE document_requirements
       SET "requirementType"  = 'PER_DELIVERY',
           "triggerType"      = 'material_level',
           "triggerCondition" = 'coa_required',
           "updatedAt"        = NOW()
       WHERE id = $1`,
      coa.id
    );
    console.log('✓ Updated "Certificate of Analysis (COA)" → PER_DELIVERY / coa_required');
  }

  // 4. Fix sort orders
  //    1 Signed Supplier Agreement  (already 1)
  //    2 W-9                        (already 2)
  //    3 Third Party Audit          (already 3)
  //    4 Certificate of Analysis    (already 4)
  //    5 Gluten Free Statement      (was 4 — bump to 5)
  //    6 Nutritional Information    (was 5 — bump to 6)
  //    7 Organic Certificate        (already 7)
  //    8 Allergen Statement         (already 8)
  //    9 Special Risk Document      (already 9)

  const sortFixes: Array<{ name: string; sortOrder: number }> = [
    { name: "Gluten Free Statement", sortOrder: 5 },
    { name: "Nutritional Information", sortOrder: 6 },
  ];

  for (const { name, sortOrder } of sortFixes) {
    const rule = await prisma.documentRequirement.findFirst({
      where: { name, isSystemLocked: true },
      select: { id: true, sortOrder: true },
    });
    if (!rule) {
      console.log(`  "${name}" not found — skipping sort fix`);
    } else if (rule.sortOrder === sortOrder) {
      console.log(`  "${name}" sortOrder already ${sortOrder} — no change`);
    } else {
      await prisma.documentRequirement.update({
        where: { id: rule.id },
        data: { sortOrder },
      });
      console.log(`✓ "${name}" sortOrder → ${sortOrder}`);
    }
  }

  // 5. Verify final state
  const final = await prisma.documentRequirement.findMany({
    where: { isSystemLocked: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, requirementType: true, triggerCondition: true, sortOrder: true },
  });

  console.log("\nFinal locked rules:");
  final.forEach((r) =>
    console.log(`  [${r.sortOrder}] ${r.name} — ${r.requirementType} / ${r.triggerCondition}`)
  );

  if (final.length !== 9) {
    throw new Error(`Expected 9 locked rules after migration, found ${final.length}`);
  }
  console.log("\n✓ Exactly 9 locked rules confirmed");
}

main()
  .then(() => {
    console.log("Migration v21 complete ✓");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migration v21 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
