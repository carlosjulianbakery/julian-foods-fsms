import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating R&D tables...");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rd_ingredients (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name            TEXT NOT NULL,
      category        TEXT NOT NULL DEFAULT 'ingredient',
      unit            TEXT NOT NULL,
      "supplierSource" TEXT,
      notes           TEXT,
      "costPerUnit"   DECIMAL(10,4),
      "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "createdById"   TEXT NOT NULL REFERENCES users(id)
    )
  `);
  console.log("✓ rd_ingredients");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rd_projects (
      id                             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name                           TEXT NOT NULL,
      description                    TEXT,
      "productType"                  TEXT NOT NULL,
      "targetServingSize"            TEXT,
      "startedDate"                  TIMESTAMP WITH TIME ZONE NOT NULL,
      "targetLaunchDate"             TIMESTAMP WITH TIME ZONE,
      status                         TEXT NOT NULL DEFAULT 'concept',
      "targetCalories"               DECIMAL(10,2),
      "targetCaloriesTolerance"      TEXT,
      "targetFat"                    DECIMAL(10,2),
      "targetFatTolerance"           TEXT,
      "targetSaturatedFat"           DECIMAL(10,2),
      "targetSaturatedFatTolerance"  TEXT,
      "targetCarbs"                  DECIMAL(10,2),
      "targetCarbsTolerance"         TEXT,
      "targetFiber"                  DECIMAL(10,2),
      "targetFiberTolerance"         TEXT,
      "targetSugars"                 DECIMAL(10,2),
      "targetSugarsTolerance"        TEXT,
      "targetAddedSugars"            DECIMAL(10,2),
      "targetAddedSugarsTolerance"   TEXT,
      "targetProtein"                DECIMAL(10,2),
      "targetProteinTolerance"       TEXT,
      "targetSodium"                 DECIMAL(10,2),
      "targetSodiumTolerance"        TEXT,
      "createdAt"                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt"                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "createdById"                  TEXT NOT NULL REFERENCES users(id)
    )
  `);
  console.log("✓ rd_projects");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rd_iterations (
      id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "projectId"        TEXT NOT NULL REFERENCES rd_projects(id) ON DELETE CASCADE,
      "iterationNumber"  INTEGER NOT NULL,
      "datePerformed"    TIMESTAMP WITH TIME ZONE NOT NULL,
      "performedBy"      TEXT NOT NULL,
      "batchSize"        TEXT,
      recipe             JSONB NOT NULL DEFAULT '[]',
      "changesFromPrior" TEXT,
      "processNotes"     TEXT,
      outcome            TEXT,
      "nextSteps"        TEXT,
      status             TEXT NOT NULL DEFAULT 'in_progress',
      "actualCalories"     DECIMAL(10,2),
      "actualFat"          DECIMAL(10,2),
      "actualSaturatedFat" DECIMAL(10,2),
      "actualCarbs"        DECIMAL(10,2),
      "actualFiber"        DECIMAL(10,2),
      "actualSugars"       DECIMAL(10,2),
      "actualAddedSugars"  DECIMAL(10,2),
      "actualProtein"      DECIMAL(10,2),
      "actualSodium"       DECIMAL(10,2),
      "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE ("projectId", "iterationNumber")
    )
  `);
  console.log("✓ rd_iterations");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rd_sensory_evaluations (
      id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "iterationId"           TEXT NOT NULL REFERENCES rd_iterations(id) ON DELETE CASCADE,
      "evaluatorName"         TEXT NOT NULL,
      "evaluationDate"        TIMESTAMP WITH TIME ZONE NOT NULL,
      "ratingAppearance"      INTEGER,
      "ratingAroma"           INTEGER,
      "ratingTexture"         INTEGER,
      "ratingSweetness"       INTEGER,
      "ratingFlavorIntensity" INTEGER,
      "ratingOverall"         INTEGER,
      notes                   TEXT,
      recommendation          TEXT NOT NULL,
      "createdAt"             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt"             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  console.log("✓ rd_sensory_evaluations");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS rd_attachments (
      id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "iterationId"  TEXT NOT NULL REFERENCES rd_iterations(id) ON DELETE CASCADE,
      "fileName"     TEXT NOT NULL,
      "fileUrl"      TEXT NOT NULL,
      "fileSize"     INTEGER NOT NULL,
      "fileType"     TEXT NOT NULL,
      description    TEXT,
      "uploadedById" TEXT NOT NULL REFERENCES users(id),
      "uploadedAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  console.log("✓ rd_attachments");

  console.log("All R&D tables created.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
