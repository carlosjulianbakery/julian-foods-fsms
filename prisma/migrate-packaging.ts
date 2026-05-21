/**
 * One-time migration: add food_contact and qty_per_bowl to existing packaging items.
 * Safe to re-run — skips items that already have both fields.
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄  Migrating packaging schema…\n");

  const templates = await prisma.batchSheetTemplate.findMany({
    select: { id: true, name: true, packaging: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const t of templates) {
    const pkgs = t.packaging as Record<string, unknown>[];
    if (!Array.isArray(pkgs) || pkgs.length === 0) { skipped++; continue; }

    let needsUpdate = false;
    const newPkgs = pkgs.map((p) => {
      const alreadyMigrated = p.food_contact !== undefined && p.qty_per_bowl !== undefined;
      if (alreadyMigrated) return p;
      needsUpdate = true;
      return {
        ...p,
        qty_per_bowl: (p.qty_per_bowl ?? p.units_per_n_flatbreads ?? 1) as number,
        food_contact: true,
      };
    });

    if (!needsUpdate) { skipped++; continue; }

    // JSON.parse(JSON.stringify(...)) produces a plain object Prisma's JSON type accepts
    await prisma.batchSheetTemplate.update({
      where: { id: t.id },
      data: { packaging: JSON.parse(JSON.stringify(newPkgs)) },
    });
    updated++;
    console.log(`  ✔  ${t.name}`);
  }

  const LINE = "─".repeat(50);
  console.log(`\n${LINE}`);
  console.log(`✅  Done — ${updated} migrated, ${skipped} skipped`);
  console.log(LINE);
}

main()
  .catch((e) => { console.error("❌  Migration failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
