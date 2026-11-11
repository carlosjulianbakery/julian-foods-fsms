/**
 * Phase 2 seed: switches Daily Cleaning and Pre-Op to PRODUCTION_DAY trigger,
 * and removes any MANUAL UPCOMING/DUE_TODAY instances for those rules
 * (since they were generated under the old RECURRING logic).
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // Find the rules by title (seeded in Phase 1)
  const dailyCleaning = await prisma.taskRule.findFirst({
    where: { title: "Daily Cleaning" },
  });
  const preOp = await prisma.taskRule.findFirst({
    where: { title: "Pre-Op Inspection" },
  });

  if (!dailyCleaning) {
    console.log("⚠️  'Daily Cleaning' rule not found — skipping");
  } else {
    await prisma.taskRule.update({
      where: { id: dailyCleaning.id },
      data: {
        triggerType: "PRODUCTION_DAY",
        recurrenceUnit: null,
        recurrenceEvery: null,
      },
    });
    // Remove old MANUAL upcoming/due-today instances
    const deleted = await prisma.ruleInstance.deleteMany({
      where: {
        ruleId: dailyCleaning.id,
        source: "MANUAL",
        status: { in: ["UPCOMING", "DUE_TODAY"] },
      },
    });
    console.log(`✅ Daily Cleaning → PRODUCTION_DAY (deleted ${deleted.count} pending MANUAL instances)`);
  }

  if (!preOp) {
    console.log("⚠️  'Pre-Op Inspection' rule not found — skipping");
  } else {
    await prisma.taskRule.update({
      where: { id: preOp.id },
      data: {
        triggerType: "PRODUCTION_DAY",
        recurrenceUnit: null,
        recurrenceEvery: null,
      },
    });
    const deleted = await prisma.ruleInstance.deleteMany({
      where: {
        ruleId: preOp.id,
        source: "MANUAL",
        status: { in: ["UPCOMING", "DUE_TODAY"] },
      },
    });
    console.log(`✅ Pre-Op Inspection → PRODUCTION_DAY (deleted ${deleted.count} pending MANUAL instances)`);
  }

  console.log("✅ Phase 2 seed complete");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
