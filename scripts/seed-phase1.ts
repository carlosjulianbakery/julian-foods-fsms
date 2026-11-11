import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const julian = await prisma.facility.upsert({
    where: { name: "Julian Bakery" },
    update: { calendarTabName: "Julian Bakery" },
    create: { name: "Julian Bakery", calendarTabName: "Julian Bakery" },
  });
  const facility624 = await prisma.facility.upsert({
    where: { name: "624" },
    update: { calendarTabName: "624" },
    create: { name: "624", calendarTabName: "624" },
  });
  console.log("Facilities:", julian.id, facility624.id);

  const ownerId = "cmpepw2ny00016o652dsphjmo"; // Ivan Torres
  const today = new Date().toISOString().slice(0, 10);

  const rules = [
    {
      title: "Daily Cleaning",
      description: "Daily cleaning checklist for Julian Bakery",
      facilityId: julian.id,
      ownerId,
      triggerType: "RECURRING" as const,
      recurrenceUnit: "day",
      recurrenceEvery: 1,
      recurrenceStart: new Date(`${today}T12:00:00Z`),
      formKey: "daily_cleaning",
    },
    {
      title: "Pre-Op Inspection",
      description: "Pre-operation inspection for Julian Bakery",
      facilityId: julian.id,
      ownerId,
      triggerType: "RECURRING" as const,
      recurrenceUnit: "day",
      recurrenceEvery: 1,
      recurrenceStart: new Date(`${today}T12:00:00Z`),
      formKey: "preop",
    },
    {
      title: "Monthly Cleaning",
      description: "Monthly deep cleaning for Julian Bakery",
      facilityId: julian.id,
      ownerId,
      triggerType: "RECURRING" as const,
      recurrenceUnit: "month",
      recurrenceEvery: 1,
      recurrenceStart: new Date(`${today}T12:00:00Z`),
      formKey: "monthly_cleaning",
    },
  ];

  for (const rule of rules) {
    const existing = await prisma.taskRule.findFirst({
      where: { title: rule.title, facilityId: rule.facilityId },
    });
    if (!existing) {
      const created = await prisma.taskRule.create({ data: rule });
      console.log("Created rule:", created.title);
    } else {
      console.log("Rule already exists:", rule.title);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
