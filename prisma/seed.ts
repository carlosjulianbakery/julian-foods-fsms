import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const USERS = [
  {
    name: "Admin One",
    email: "admin@julianbakery.com",
    password: "Admin1234!",
    role: "ADMIN" as const,
    department: "Management",
  },
  {
    name: "Supervisor One",
    email: "supervisor@julianbakery.com",
    password: "Super1234!",
    role: "SUPERVISOR" as const,
    department: "Production",
  },
  {
    name: "Operator One",
    email: "operator@julianbakery.com",
    password: "Oper1234!",
    role: "OPERATOR" as const,
    department: "Production",
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
  {
    title: "Pre-Operation Inspection",
    category: "Pre-Procedure",
    description: "Daily inspection before production begins",
  },
  {
    title: "Batch Sheet",
    category: "In-Process",
    description: "Production batch record including CCP monitoring",
  },
  {
    title: "Scale and Thermometer Calibration",
    category: "Pre-Procedure",
    description: "Equipment calibration log",
  },
  {
    title: "Daily Cleaning Log",
    category: "Cleaning",
    description: "End of day cleaning verification",
  },
  {
    title: "Temperature Check Log",
    category: "Monitoring",
    description: "Walk-in cooler and freezer temperature monitoring",
  },
  {
    title: "Allergen Changeover Procedure",
    category: "Pre-Procedure",
    description: "Allergen line changeover verification",
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱  Seeding Julian's Foods FSMS…\n");

  // ── Users ────────────────────────────────────────────────────────────────
  type UserResult = {
    name: string;
    email: string;
    role: string;
    action: "created" | "updated";
  };

  const userResults: UserResult[] = [];

  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    const hashed = await hash(u.password, 12);

    await prisma.user.upsert({
      where: { email: u.email },
      // On subsequent runs keep the profile current but don't re-hash the
      // password — admins may have changed it via the UI.
      update: { name: u.name, role: u.role, department: u.department },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        role: u.role,
        department: u.department,
        active: true,
      },
    });

    userResults.push({
      name: u.name,
      email: u.email,
      role: u.role,
      action: existing ? "updated" : "created",
    });
  }

  // ── Forms ─────────────────────────────────────────────────────────────────
  // Forms don't have a unique constraint on title, so we look up by title
  // first and upsert by id (using a sentinel that never matches for creates).
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@julianbakery.com" },
  });

  type FormResult = {
    title: string;
    category: string;
    action: "created" | "updated";
  };

  const formResults: FormResult[] = [];

  for (const f of FORMS) {
    const existing = await prisma.form.findFirst({ where: { title: f.title } });

    await prisma.form.upsert({
      where: { id: existing?.id ?? "does-not-exist" },
      update: { category: f.category, description: f.description },
      create: {
        title: f.title,
        category: f.category,
        description: f.description,
        fields: [],
        active: true,
        version: 1,
        createdById: admin.id,
      },
    });

    formResults.push({
      title: f.title,
      category: f.category,
      action: existing ? "updated" : "created",
    });
  }

  // ── Batch Sheet Template ──────────────────────────────────────────────────
  const existingTemplate = await prisma.batchSheetTemplate.findFirst({
    where: { name: BATCH_TEMPLATE.name },
  });

  if (!existingTemplate) {
    await prisma.batchSheetTemplate.create({
      data: {
        name: BATCH_TEMPLATE.name,
        ingredients: BATCH_TEMPLATE.ingredients,
      },
    });
  }

  const templateAction = existingTemplate ? "updated" : "created";

  // ── Summary ───────────────────────────────────────────────────────────────
  const LINE = "─".repeat(62);

  console.log(`${LINE}`);
  console.log("👤  Users");
  console.log(LINE);

  for (const u of userResults) {
    const marker = u.action === "created" ? "✔" : "~";
    console.log(
      `  ${marker}  [${u.role.padEnd(10)}]  ${u.name.padEnd(16)}  <${u.email}>  (${u.action})`
    );
  }

  console.log(`\n${LINE}`);
  console.log("📋  Forms");
  console.log(LINE);

  for (const f of formResults) {
    const marker = f.action === "created" ? "✔" : "~";
    console.log(
      `  ${marker}  [${f.category.padEnd(14)}]  ${f.title}  (${f.action})`
    );
  }

  console.log(`\n${LINE}`);
  console.log("🥣  Batch Sheet Templates");
  console.log(LINE);
  const marker = templateAction === "created" ? "✔" : "~";
  console.log(`  ${marker}  ${BATCH_TEMPLATE.name}  (${templateAction})`);

  const allResults = [...userResults, ...formResults];
  const created = allResults.filter((r) => r.action === "created").length + (templateAction === "created" ? 1 : 0);
  const updated = allResults.filter((r) => r.action === "updated").length + (templateAction === "updated" ? 1 : 0);

  console.log(`\n${LINE}`);
  console.log(
    `✅  Done — ${userResults.length} users · ${formResults.length} forms · 1 template` +
      `  (${created} created, ${updated} updated)`
  );
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
