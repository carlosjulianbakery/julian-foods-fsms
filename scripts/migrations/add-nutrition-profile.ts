import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating rd_nutrition_profiles table...");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rd_nutrition_profiles (
      id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "materialId"          TEXT UNIQUE,
      "rdIngredientId"      TEXT UNIQUE,
      "ingredientName"      TEXT NOT NULL,
      "caloriesPer100g"     DECIMAL(10,4),
      "fatPer100g"          DECIMAL(10,4),
      "saturatedFatPer100g" DECIMAL(10,4),
      "transFatPer100g"     DECIMAL(10,4),
      "cholesterolPer100g"  DECIMAL(10,4),
      "sodiumPer100g"       DECIMAL(10,4),
      "carbsPer100g"        DECIMAL(10,4),
      "fiberPer100g"        DECIMAL(10,4),
      "sugarsPer100g"       DECIMAL(10,4),
      "proteinPer100g"      DECIMAL(10,4),
      "usdaFdcId"           TEXT,
      "usdaFoodDescription" TEXT,
      "dataSource"          TEXT NOT NULL DEFAULT 'manual',
      "containsAddedSugars" BOOLEAN NOT NULL DEFAULT false,
      "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "createdById"         TEXT NOT NULL REFERENCES users(id)
    )
  `);

  console.log("✓ rd_nutrition_profiles");
  console.log("Migration complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
