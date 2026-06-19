/**
 * Migration v22 — Form Templates library
 *
 * Creates the form_templates table, which stores blank reusable forms
 * (e.g. the Supplier Food Safety Agreement) that can be linked to a
 * document requirement and downloaded by admin or supervisors.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS form_templates (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT,
      "filePath"    TEXT NOT NULL,
      "fileUrl"     TEXT NOT NULL,
      "fileName"    TEXT NOT NULL,
      "fileSize"    INTEGER,
      "mimeType"    TEXT,
      "requirementId" TEXT REFERENCES document_requirements(id),
      "uploadedById"  TEXT NOT NULL REFERENCES users(id),
      "uploadedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "isActive"    BOOLEAN NOT NULL DEFAULT true
    )
  `);
  console.log("✓ Created form_templates table");

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_form_templates_requirement
      ON form_templates ("requirementId")
      WHERE "isActive" = true
  `);
  console.log("✓ Created index on form_templates.requirementId (active)");

  console.log("\nMigration v22 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v22 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
