import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const certs = ["NSF Supplier Assurance", "Gluten Free", "Organic"];
  for (const name of certs) {
    await prisma.certification.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`✓ ${name}`);
  }
  console.log("Certifications seeded successfully.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
