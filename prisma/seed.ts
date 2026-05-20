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
  name: 'Flatbread 18"',
  description: "Standard 18-inch flatbread production template",
  isActive: true,
  ingredients: [
    { id: "1", name: "Oil Canola Salad",              quantity_per_bowl: 2.4,  unit: "kg" },
    { id: "2", name: "Rice Flour Brown Stabilized",   quantity_per_bowl: 13.2, unit: "kg" },
    { id: "3", name: "Flour Tapioca Starch",          quantity_per_bowl: 16.8, unit: "kg" },
    { id: "4", name: "Sea Salt #1120 Non Cake",       quantity_per_bowl: 0.6,  unit: "kg" },
    { id: "5", name: "Gum Xanthan 200 Mesh",          quantity_per_bowl: 0.6,  unit: "kg" },
    { id: "6", name: "Evaporated Cane Juice",         quantity_per_bowl: 4.8,  unit: "kg" },
    { id: "7", name: "Yeast",                         quantity_per_bowl: 1.8,  unit: "kg" },
  ],
  packaging: [
    { id: "1", name: "Parchment Paper", units_per_n_flatbreads: 4  },
    { id: "2", name: "S-16567 Bag",     units_per_n_flatbreads: 12 },
    { id: "3", name: "20x8x4 Box",      units_per_n_flatbreads: 48 },
  ],
  ovensAvailable: ["Oven 06", "Oven 07", "Oven 08"],
  calibrationWeights: [{ label: "10g" }, { label: "100g" }, { label: "500g" }],
  ccpSettings: { min_temp_f: 190, min_weight_oz: 3.5, max_weight_oz: 4.2 },
  releaseChecklistItems: [
    "Calibration Verification completed",
    "CCP Temperature Verification completed",
    "Net Weight Compliance completed",
    "Visual Inspection completed",
    "Batch Sheet completed",
    "Final Visual Inspection from Production Manager completed",
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
  await prisma.batchSheetTemplate.deleteMany({});
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
      name:                  BATCH_TEMPLATE.name,
      description:           BATCH_TEMPLATE.description,
      isActive:              BATCH_TEMPLATE.isActive,
      ingredients:           BATCH_TEMPLATE.ingredients,
      packaging:             BATCH_TEMPLATE.packaging,
      ovensAvailable:        BATCH_TEMPLATE.ovensAvailable,
      calibrationWeights:    BATCH_TEMPLATE.calibrationWeights,
      ccpSettings:           BATCH_TEMPLATE.ccpSettings,
      releaseChecklistItems: BATCH_TEMPLATE.releaseChecklistItems,
      createdById:           admin.id,
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
