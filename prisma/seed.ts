import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const USERS = [
  {
    name: "Carlos Gomory",
    email: "carlos@julianbakery.com",
    password: "carlos123!",
    role: "ADMIN" as const,
    department: "COO",
  },
  {
    name: "Ivan Torres",
    email: "ivan@julianbakery.com",
    password: "ivan123!",
    role: "SUPERVISOR" as const,
    department: "Production Manager",
  },
];

const BATCH_TEMPLATE = {
  name: "Generic Batch Sheet",
  ingredients: [
    { id: "1", name: "Flour",  quantity_per_bowl: 10,  unit: "lbs" },
    { id: "2", name: "Water",  quantity_per_bowl: 5,   unit: "lbs" },
    { id: "3", name: "Salt",   quantity_per_bowl: 0.5, unit: "oz"  },
    { id: "4", name: "Yeast",  quantity_per_bowl: 1,   unit: "oz"  },
    { id: "5", name: "Oil",    quantity_per_bowl: 2,   unit: "oz"  },
    { id: "6", name: "Sugar",  quantity_per_bowl: 3,   unit: "oz"  },
    { id: "7", name: "Eggs",   quantity_per_bowl: 4,   unit: "oz"  },
    { id: "8", name: "Butter", quantity_per_bowl: 2,   unit: "oz"  },
  ],
};

const FORMS = [
  { title: "Pre-Operation Inspection",       category: "Pre-Procedure", description: "Daily inspection before production begins" },
  { title: "Batch Sheet",                    category: "In-Process",    description: "Production batch record including CCP monitoring" },
  { title: "Scale and Thermometer Calibration", category: "Pre-Procedure", description: "Equipment calibration log" },
  { title: "Daily Cleaning Log",             category: "Cleaning",      description: "End of day cleaning verification" },
  { title: "Temperature Check Log",          category: "Monitoring",    description: "Walk-in cooler and freezer temperature monitoring" },
  { title: "Allergen Changeover Procedure",  category: "Pre-Procedure", description: "Allergen line changeover verification" },
];

async function main() {
  console.log("🌱  Seeding Julian's Foods FSMS…\n");

  // ── 1. Pre-migration: update any lingering OPERATOR users to SUPERVISOR ───
  try {
    await prisma.$executeRaw`UPDATE users SET role = 'SUPERVISOR' WHERE role::text = 'OPERATOR'`;
  } catch {
    // OPERATOR enum value already removed — nothing to do
  }

  // ── 2. Clear all dependent records in FK order ───────────────────────────
  await prisma.batchSheetSubmission.deleteMany({});
  await prisma.preOpInspection.deleteMany({});
  await prisma.formSubmission.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.record.deleteMany({});
  await prisma.form.deleteMany({});
  await prisma.user.deleteMany({});

  console.log("🗑   Cleared all existing data\n");

  // ── 3. Create users ───────────────────────────────────────────────────────
  const createdUsers: { name: string; email: string; role: string }[] = [];

  for (const u of USERS) {
    const hashed = await hash(u.password, 12);
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        password: hashed,
        role: u.role,
        department: u.department,
        active: true,
      },
    });
    createdUsers.push({ name: u.name, email: u.email, role: u.role });
  }

  // ── 4. Create forms (owned by admin) ─────────────────────────────────────
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "carlos@julianbakery.com" },
  });

  for (const f of FORMS) {
    await prisma.form.create({
      data: {
        title: f.title,
        category: f.category,
        description: f.description,
        fields: [],
        active: true,
        version: 1,
        createdById: admin.id,
      },
    });
  }

  // ── 5. Create batch sheet template ───────────────────────────────────────
  await prisma.batchSheetTemplate.create({
    data: {
      name: BATCH_TEMPLATE.name,
      ingredients: BATCH_TEMPLATE.ingredients,
    },
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const LINE = "─".repeat(62);

  console.log(LINE);
  console.log("👤  Users");
  console.log(LINE);
  for (const u of createdUsers) {
    console.log(`  ✔  [${u.role.padEnd(10)}]  ${u.name.padEnd(18)}  <${u.email}>`);
  }

  console.log(`\n${LINE}`);
  console.log("📋  Forms");
  console.log(LINE);
  for (const f of FORMS) {
    console.log(`  ✔  [${f.category.padEnd(14)}]  ${f.title}`);
  }

  console.log(`\n${LINE}`);
  console.log("🥣  Batch Sheet Templates");
  console.log(LINE);
  console.log(`  ✔  ${BATCH_TEMPLATE.name}`);

  console.log(`\n${LINE}`);
  console.log(`✅  Done — ${USERS.length} users · ${FORMS.length} forms · 1 template`);
  console.log(LINE);

  console.log("\n🔑  Login credentials:");
  for (const u of USERS) {
    console.log(`     ${u.role.padEnd(10)}  ${u.email.padEnd(32)}  ${u.password}`);
  }
  console.log();
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
