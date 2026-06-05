/**
 * Migration v12 — Products registry (master recipe system)
 *
 * 1. CREATE products table
 * 2. ADD productId + legacyRecipe to batch_sheet_templates
 * 3. ADD productId + recipeSnapshot to batch_sheet_submissions
 * 4. Backfill legacyRecipe from existing template ingredients
 * 5. Backfill recipeSnapshot from existing submission section3.ingredients
 *
 * Run:
 *   npx tsx prisma/migrate-v12.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // 1. products table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      "productCode" TEXT,
      description TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      recipe JSONB NOT NULL DEFAULT '[]'::jsonb,
      "allergenProfile" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "isOrganic" BOOLEAN NOT NULL DEFAULT false,
      "isGlutenFree" BOOLEAN NOT NULL DEFAULT false,
      "supplierExposure" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("✓ Created products table");

  // FK to users — Postgres does not support ADD CONSTRAINT IF NOT EXISTS, so use a DO block
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_createdById_fkey'
      ) THEN
        ALTER TABLE products
          ADD CONSTRAINT "products_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES users(id);
      END IF;
    END$$;
  `);
  console.log("✓ Ensured products.createdById FK");

  // 2. batch_sheet_templates additions
  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_templates ADD COLUMN IF NOT EXISTS "productId" TEXT
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_templates ADD COLUMN IF NOT EXISTS "legacyRecipe" JSONB
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'batch_sheet_templates_productId_fkey'
      ) THEN
        ALTER TABLE batch_sheet_templates
          ADD CONSTRAINT "batch_sheet_templates_productId_fkey"
          FOREIGN KEY ("productId") REFERENCES products(id);
      END IF;
    END$$;
  `);
  console.log("✓ Added productId + legacyRecipe to batch_sheet_templates");

  // 3. batch_sheet_submissions additions
  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_submissions ADD COLUMN IF NOT EXISTS "productId" TEXT
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_submissions ADD COLUMN IF NOT EXISTS "recipeSnapshot" JSONB
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'batch_sheet_submissions_productId_fkey'
      ) THEN
        ALTER TABLE batch_sheet_submissions
          ADD CONSTRAINT "batch_sheet_submissions_productId_fkey"
          FOREIGN KEY ("productId") REFERENCES products(id);
      END IF;
    END$$;
  `);
  console.log("✓ Added productId + recipeSnapshot to batch_sheet_submissions");

  // 4. Backfill legacyRecipe on existing templates (only where currently NULL)
  const tplBackfill = await prisma.$executeRawUnsafe(`
    UPDATE batch_sheet_templates
    SET "legacyRecipe" = ingredients
    WHERE "legacyRecipe" IS NULL
      AND ingredients IS NOT NULL
      AND jsonb_typeof(ingredients) = 'array'
      AND jsonb_array_length(ingredients) > 0
  `);
  console.log(`✓ Backfilled legacyRecipe on ${tplBackfill} template(s)`);

  // 5. Backfill recipeSnapshot on existing submissions from section3.ingredients
  const subBackfill = await prisma.$executeRawUnsafe(`
    UPDATE batch_sheet_submissions
    SET "recipeSnapshot" = section3->'ingredients'
    WHERE "recipeSnapshot" IS NULL
      AND section3 IS NOT NULL
      AND jsonb_typeof(section3) = 'object'
      AND section3 ? 'ingredients'
      AND jsonb_typeof(section3->'ingredients') = 'array'
  `);
  console.log(`✓ Backfilled recipeSnapshot on ${subBackfill} submission(s)`);

  console.log("\nMigration v12 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v12 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
