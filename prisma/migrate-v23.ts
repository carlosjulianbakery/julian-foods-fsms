import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("migrate-v23: rename snake_case columns in monthly_cleaning_checklists to camelCase");

  // submitted_at → submittedAt
  await prisma.$executeRaw`
    ALTER TABLE monthly_cleaning_checklists
    RENAME COLUMN submitted_at TO "submittedAt"
  `;
  console.log("  renamed submitted_at → submittedAt");

  // submitted_by_id → submittedById
  await prisma.$executeRaw`
    ALTER TABLE monthly_cleaning_checklists
    RENAME COLUMN submitted_by_id TO "submittedById"
  `;
  console.log("  renamed submitted_by_id → submittedById");

  // Verify
  const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'monthly_cleaning_checklists'
    ORDER BY ordinal_position
  `;
  console.log("  final columns:", cols.map((c) => c.column_name).join(", "));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
