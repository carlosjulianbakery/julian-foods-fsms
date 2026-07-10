import { PrismaClient } from "../../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("Removing finished_goods_inventory table...");
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS finished_goods_inventory`);
  console.log("  ✅ finished_goods_inventory dropped");
  console.log("\nMigration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
