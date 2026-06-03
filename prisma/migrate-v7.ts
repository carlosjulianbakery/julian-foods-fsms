/**
 * Migration v7 — Cleaning Checklist Overhaul
 *
 * 1. Adds `items` JSONB column to daily_cleaning_checklists (nullable, backward compat)
 * 2. Creates monthly_cleaning_checklists table
 *
 * Run:
 *   DATABASE_URL="postgresql://..." npx tsx prisma/migrate-v7.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // ── 1. Add items column to daily_cleaning_checklists ──────────────────────
  await prisma.$executeRawUnsafe(`
    ALTER TABLE daily_cleaning_checklists
    ADD COLUMN IF NOT EXISTS items JSONB
  `);
  console.log("✓ Added items column to daily_cleaning_checklists");

  // ── 2. Create monthly_cleaning_checklists table ────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS monthly_cleaning_checklists (
      id              TEXT        NOT NULL,
      date            DATE        NOT NULL,
      items           JSONB       NOT NULL DEFAULT '[]'::jsonb,
      checked_by      TEXT        NOT NULL,
      notes           TEXT,
      status          TEXT        NOT NULL,
      submitted_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_by_id TEXT        NOT NULL,
      CONSTRAINT monthly_cleaning_checklists_pkey PRIMARY KEY (id),
      CONSTRAINT monthly_cleaning_checklists_submitted_by_id_fkey
        FOREIGN KEY (submitted_by_id)
        REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  console.log("✓ Created monthly_cleaning_checklists table");
}

main()
  .then(() => {
    console.log("Migration v7 complete ✓");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migration v7 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
