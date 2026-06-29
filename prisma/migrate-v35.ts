/**
 * migrate-v35: Create inventory_audit_exclusions table.
 *
 * Stores admin-approved exclusions for NFC packaging gaps found during the
 * inventory audit. When a gap has been manually corrected (e.g. via cycle
 * count or initial stock entry) the combination of submissionId + materialId
 * can be excluded so the automated audit does not flag it as an open gap.
 *
 * Columns:
 *   id              – CUID primary key
 *   submissionId    – FK to batch_sheet_submissions.id
 *   materialId      – FK to materials.id
 *   exclusionReason – free-text reason
 *   excludedById    – FK to users.id (nullable in case user is deleted)
 *   excludedAt      – timestamp, default now()
 *
 * A unique constraint on (submissionId, materialId) prevents duplicate
 * exclusions for the same pair.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("migrate-v35: creating inventory_audit_exclusions table…");

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS inventory_audit_exclusions (
      id               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
      "submissionId"   TEXT        NOT NULL,
      "materialId"     TEXT        NOT NULL,
      "exclusionReason" TEXT       NOT NULL DEFAULT '',
      "excludedById"   TEXT,
      "excludedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT inventory_audit_exclusions_pkey PRIMARY KEY (id),
      CONSTRAINT inventory_audit_exclusions_unique UNIQUE ("submissionId", "materialId"),
      CONSTRAINT inventory_audit_exclusions_submission_fk
        FOREIGN KEY ("submissionId") REFERENCES batch_sheet_submissions(id) ON DELETE CASCADE,
      CONSTRAINT inventory_audit_exclusions_material_fk
        FOREIGN KEY ("materialId") REFERENCES materials(id) ON DELETE CASCADE,
      CONSTRAINT inventory_audit_exclusions_user_fk
        FOREIGN KEY ("excludedById") REFERENCES users(id) ON DELETE SET NULL
    )
  `;

  console.log("Done. inventory_audit_exclusions created.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
