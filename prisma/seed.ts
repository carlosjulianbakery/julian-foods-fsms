import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Julian's Foods FSMS...");

  // Clear existing data
  await prisma.auditLog.deleteMany();
  await prisma.formSubmission.deleteMany();
  await prisma.task.deleteMany();
  await prisma.record.deleteMany();
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const adminPassword = await hash("admin123!", 12);
  const supervisorPassword = await hash("supervisor123!", 12);
  const operatorPassword = await hash("operator123!", 12);

  const admin = await prisma.user.create({
    data: {
      name: "Julian Martinez",
      email: "julian@julianfoods.com",
      password: adminPassword,
      role: "ADMIN",
      department: "Management",
    },
  });

  const supervisor = await prisma.user.create({
    data: {
      name: "Sarah Chen",
      email: "sarah@julianfoods.com",
      password: supervisorPassword,
      role: "SUPERVISOR",
      department: "Quality Assurance",
    },
  });

  const operator1 = await prisma.user.create({
    data: {
      name: "Mike Johnson",
      email: "mike@julianfoods.com",
      password: operatorPassword,
      role: "OPERATOR",
      department: "Production",
    },
  });

  const operator2 = await prisma.user.create({
    data: {
      name: "Ana Lopez",
      email: "ana@julianfoods.com",
      password: operatorPassword,
      role: "OPERATOR",
      department: "Warehouse",
    },
  });

  console.log("✅ Users created");

  // Create forms
  const tempForm = await prisma.form.create({
    data: {
      title: "Daily Refrigeration Temperature Log",
      description: "Record temperatures for all refrigeration units at the start of each shift.",
      category: "Temperature Control",
      createdById: supervisor.id,
      fields: [
        { id: "f1", type: "text", label: "Unit / Location", required: true, placeholder: "e.g. Walk-in Cooler A" },
        { id: "f2", type: "temperature", label: "Temperature Reading", required: true, min: -30, max: 60, unit: "°C" },
        { id: "f3", type: "select", label: "Temperature Status", required: true, options: ["Within Range (0–4°C)", "Slightly Above (4–7°C)", "Out of Range (>7°C)", "Frozen (<0°C)"] },
        { id: "f4", type: "time", label: "Time of Reading", required: true },
        { id: "f5", type: "checkbox", label: "Corrective action taken if out of range", required: false },
        { id: "f6", type: "textarea", label: "Notes / Corrective Action Taken", required: false, placeholder: "Describe any corrective actions taken" },
      ],
    },
  });

  const sanitationForm = await prisma.form.create({
    data: {
      title: "Pre-Shift Sanitation Checklist",
      description: "Complete before each production shift to verify all sanitation standards are met.",
      category: "Sanitation",
      createdById: supervisor.id,
      fields: [
        { id: "f1", type: "checkbox", label: "All food contact surfaces cleaned and sanitized", required: true },
        { id: "f2", type: "checkbox", label: "Hand washing stations stocked and operational", required: true },
        { id: "f3", type: "checkbox", label: "Floors cleaned and dry", required: true },
        { id: "f4", type: "checkbox", label: "Equipment in good repair (no damaged parts)", required: true },
        { id: "f5", type: "select", label: "Sanitizer concentration verified", required: true, options: ["Pass (200–400 ppm)", "Fail — corrective action taken", "N/A"] },
        { id: "f6", type: "text", label: "Completed by (signature)", required: true, placeholder: "Print name" },
        { id: "f7", type: "date", label: "Date", required: true },
      ],
    },
  });

  const receivingForm = await prisma.form.create({
    data: {
      title: "Receiving Inspection Log",
      description: "Complete for each delivery to verify supplier food safety standards.",
      category: "Receiving",
      createdById: admin.id,
      fields: [
        { id: "f1", type: "text", label: "Supplier / Vendor Name", required: true },
        { id: "f2", type: "text", label: "Product Description", required: true },
        { id: "f3", type: "number", label: "Quantity Received", required: true, min: 0 },
        { id: "f4", type: "temperature", label: "Product Temperature at Arrival", required: true, unit: "°C" },
        { id: "f5", type: "select", label: "Packaging Integrity", required: true, options: ["Intact", "Damaged — accepted", "Damaged — rejected"] },
        { id: "f6", type: "select", label: "Overall Acceptance", required: true, options: ["Accepted", "Conditionally Accepted", "Rejected"] },
        { id: "f7", type: "textarea", label: "Notes", required: false },
      ],
    },
  });

  console.log("✅ Forms created");

  // Create tasks
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  await prisma.task.createMany({
    data: [
      {
        title: "Morning Temperature Check — Walk-in Coolers",
        description: "Check and record all walk-in cooler temperatures before production begins.",
        status: "PENDING",
        priority: "HIGH",
        dueDate: new Date(now.setHours(8, 0, 0, 0)),
        recurrence: "DAILY",
        location: "Cooler Room",
        formId: tempForm.id,
        assignedToId: operator1.id,
        createdById: supervisor.id,
      },
      {
        title: "Pre-Shift Sanitation Verification",
        description: "Complete the pre-shift sanitation checklist before production starts.",
        status: "IN_PROGRESS",
        priority: "CRITICAL",
        dueDate: new Date(now.setHours(6, 30, 0, 0)),
        recurrence: "DAILY",
        location: "Production Floor",
        formId: sanitationForm.id,
        assignedToId: operator2.id,
        createdById: supervisor.id,
      },
      {
        title: "Supplier Delivery Inspection",
        description: "Inspect and log today's vegetable delivery from Green Valley Farms.",
        status: "PENDING",
        priority: "HIGH",
        dueDate: tomorrow,
        recurrence: "NONE",
        location: "Receiving Dock",
        formId: receivingForm.id,
        assignedToId: operator1.id,
        createdById: admin.id,
      },
      {
        title: "Monthly Pest Control Inspection",
        description: "Conduct full facility pest inspection and log findings.",
        status: "PENDING",
        priority: "MEDIUM",
        dueDate: nextWeek,
        recurrence: "MONTHLY",
        location: "Entire Facility",
        assignedToId: supervisor.id,
        createdById: admin.id,
      },
      {
        title: "Afternoon Temperature Log",
        description: "Mid-afternoon temperature verification for all cold storage units.",
        status: "OVERDUE",
        priority: "HIGH",
        dueDate: yesterday,
        recurrence: "DAILY",
        location: "Cooler Room",
        formId: tempForm.id,
        assignedToId: operator2.id,
        createdById: supervisor.id,
      },
    ],
  });

  console.log("✅ Tasks created");

  // Create records
  await prisma.record.createMany({
    data: [
      {
        title: "Walk-in Cooler A — Temperature Log — May 14, 2026",
        type: "Temperature Log",
        description: "Morning temperature reading for Walk-in Cooler A",
        data: {
          "Unit": "Walk-in Cooler A",
          "Temperature": "3.2°C",
          "Status": "Within Range",
          "Time": "06:15",
          "Operator": "Mike Johnson",
        },
        tags: ["cooler", "temperature", "morning"],
        createdById: operator1.id,
      },
      {
        title: "Pre-Shift Sanitation — Production Floor — May 14, 2026",
        type: "Sanitation Report",
        description: "Pre-shift sanitation verification for production floor",
        data: {
          "Food Contact Surfaces": "Clean",
          "Hand Washing Stations": "Stocked",
          "Floors": "Clean & Dry",
          "Equipment": "Good Repair",
          "Sanitizer Concentration": "Pass (200–400 ppm)",
        },
        tags: ["sanitation", "pre-shift", "production"],
        createdById: operator2.id,
      },
      {
        title: "Corrective Action — Temperature Deviation — Freezer B — May 10, 2026",
        type: "Corrective Action",
        description: "Freezer B temperature rose to -12°C. Thermostat adjusted and monitoring increased.",
        data: {
          "Unit": "Freezer B",
          "Issue": "Temperature above acceptable range",
          "Temperature Recorded": "-12°C",
          "Acceptable Range": "-18°C or below",
          "Corrective Action": "Thermostat recalibrated, product integrity verified",
          "Follow-up Date": "2026-05-11",
        },
        tags: ["corrective-action", "freezer", "temperature", "deviation"],
        createdById: supervisor.id,
      },
    ],
  });

  console.log("✅ Records created");

  console.log("\n🎉 Seed complete!\n");
  console.log("─────────────────────────────────────────");
  console.log("Demo accounts:");
  console.log("  Admin:      julian@julianfoods.com / admin123!");
  console.log("  Supervisor: sarah@julianfoods.com  / supervisor123!");
  console.log("  Operator:   mike@julianfoods.com   / operator123!");
  console.log("─────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
