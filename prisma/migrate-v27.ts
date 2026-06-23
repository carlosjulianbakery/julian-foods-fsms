import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // 1. Log templates that will be affected
  const templates = await prisma.batchSheetTemplate.findMany({
    select: { id: true, name: true, productId: true },
  });

  console.log(`Found ${templates.length} templates to clear.`);
  for (const t of templates) {
    console.log(`Clearing: ${t.name} (product_id: ${t.productId ?? "null"})`);
  }

  // 2. Clear ingredients, legacyRecipe, and packaging from ALL templates
  const result = await prisma.$executeRaw`
    UPDATE batch_sheet_templates
    SET
      ingredients    = '[]'::jsonb,
      "legacyRecipe" = NULL,
      packaging      = '[]'::jsonb
  `;

  console.log(`\n${result} templates cleared successfully.`);

  // 3. Verify — sample first 3 to confirm
  const samples = await prisma.batchSheetTemplate.findMany({
    take: 3,
    select: { id: true, name: true, ingredients: true, legacyRecipe: true, packaging: true },
  });

  console.log("\nVerification sample:");
  for (const s of samples) {
    const ing   = JSON.stringify(s.ingredients);
    const pkg   = JSON.stringify(s.packaging);
    const legacy = s.legacyRecipe === null ? "null" : "SET";
    console.log(`  ${s.name}: ingredients=${ing}, packaging=${pkg}, legacyRecipe=${legacy}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
