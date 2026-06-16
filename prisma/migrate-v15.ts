/**
 * Migration v15 — Presentation unit configuration moves to Products
 *
 * Products are now the single source of truth for presentation unit
 * tracking config (primary_unit_name, has_internal_units, internal_unit_name,
 * internal_units_per_primary). Previously this lived on the batch sheet
 * template's presentations JSONB (Section G).
 *
 * This migration backfills the new keys onto every existing product
 * presentation so the shape is consistent. No assumption is made about
 * what the unit config should be — admins fill it in manually afterward.
 *
 * Idempotent: presentations that already have a "primary_unit_name" key
 * (even if null) are left untouched.
 *
 * Run:
 *   npx tsx prisma/migrate-v15.ts
 */

import { PrismaClient, Prisma } from "../src/generated/prisma";

const prisma = new PrismaClient();

type LegacyPresentation = {
  id: string;
  name: string;
  upc?: string;
  primary_unit_name?: string | null;
  has_internal_units?: boolean;
  internal_unit_name?: string | null;
  internal_units_per_primary?: number | null;
  packaging_materials?: unknown[];
};

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, presentations: true },
  });

  let updatedCount = 0;
  for (const p of products) {
    const presentations = Array.isArray(p.presentations) ? (p.presentations as LegacyPresentation[]) : [];
    if (presentations.length === 0) continue;

    let needsUpdate = false;
    const next = presentations.map((pres) => {
      if (Object.prototype.hasOwnProperty.call(pres, "primary_unit_name")) {
        return pres;
      }
      needsUpdate = true;
      return {
        ...pres,
        primary_unit_name: null,
        has_internal_units: false,
        internal_unit_name: null,
        internal_units_per_primary: null,
      };
    });

    if (needsUpdate) {
      await prisma.product.update({
        where: { id: p.id },
        data: { presentations: next as object as Prisma.InputJsonValue },
      });
      updatedCount++;
      console.log(`✓ Backfilled unit config keys for product: ${p.name}`);
    }
  }

  console.log(`\nMigration v15 complete — ${updatedCount} product(s) updated ✓`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v15 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
