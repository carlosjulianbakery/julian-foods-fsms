import { PrismaClient } from "../src/generated/prisma";
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "TaskTemplateCategory" AS ENUM (
        'sanitation','inspection','production','receiving_inventory',
        'documentation_compliance','facility_maintenance','administrative'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "TaskTemplatePriority" AS ENUM ('high','normal','low');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "TaskTemplateType" AS ENUM ('manual','form_linked');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "TaskRecurrenceType" AS ENUM (
        'one_time','daily','weekly','biweekly','monthly',
        'every_2_months','quarterly','every_6_months','annual','custom'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "TaskInstanceStatus" AS ENUM ('pending','complete','overdue','skipped');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "TaskHistoryAction" AS ENUM (
        'created','completed','skipped','overdue','next_instance_generated'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS task_templates (
      id               TEXT        PRIMARY KEY,
      title            TEXT        NOT NULL,
      description      TEXT,
      category         "TaskTemplateCategory" NOT NULL,
      priority         "TaskTemplatePriority" NOT NULL DEFAULT 'normal',
      "assignedTo"     JSONB       NOT NULL DEFAULT '[]',
      "taskType"       "TaskTemplateType" NOT NULL DEFAULT 'manual',
      "formLink"       JSONB,
      "recurrenceType" "TaskRecurrenceType" NOT NULL,
      "recurrenceConfig" JSONB,
      "firstDueDate"   DATE        NOT NULL,
      "isActive"       BOOLEAN     NOT NULL DEFAULT true,
      "createdById"    TEXT        NOT NULL REFERENCES users(id),
      "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS task_instances (
      id               TEXT        PRIMARY KEY,
      "templateId"     TEXT        NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
      title            TEXT        NOT NULL,
      description      TEXT,
      category         TEXT        NOT NULL,
      priority         TEXT        NOT NULL,
      "assignedTo"     JSONB       NOT NULL DEFAULT '[]',
      "taskType"       TEXT        NOT NULL,
      "formLink"       JSONB,
      "dueDate"        DATE        NOT NULL,
      status           "TaskInstanceStatus" NOT NULL DEFAULT 'pending',
      "completedById"  TEXT        REFERENCES users(id),
      "completedAt"    TIMESTAMPTZ,
      "completionNote" TEXT,
      "skippedById"    TEXT        REFERENCES users(id),
      "skippedAt"      TIMESTAMPTZ,
      "skipReason"     TEXT,
      "formSubmissionId" TEXT,
      "instanceNumber" INTEGER     NOT NULL DEFAULT 1,
      "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS task_history (
      id               TEXT        PRIMARY KEY,
      "instanceId"     TEXT        NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
      action           "TaskHistoryAction" NOT NULL,
      "performedById"  TEXT        REFERENCES users(id),
      "performedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
      note             TEXT
    )
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_task_instances_template ON task_instances("templateId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_task_instances_status ON task_instances(status)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_task_instances_due_date ON task_instances("dueDate")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_task_history_instance ON task_history("instanceId")`);

  console.log("Migration v26 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("Migration v26 failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
