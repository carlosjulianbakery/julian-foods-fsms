import { PrismaClient } from "../src/generated/prisma";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

// ── Seed users ────────────────────────────────────────────────────────────────
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

// ── Seed forms ────────────────────────────────────────────────────────────────
const FORMS = [
  { title: "Pre-Operation Inspection",          category: "Pre-Procedure", description: "Daily inspection before production begins" },
  { title: "Batch Sheet",                       category: "In-Process",    description: "Production batch record including CCP monitoring" },
  { title: "Scale and Thermometer Calibration", category: "Pre-Procedure", description: "Equipment calibration log" },
  { title: "Daily Cleaning Log",                category: "Cleaning",      description: "End of day cleaning verification" },
  { title: "Temperature Check Log",             category: "Monitoring",    description: "Walk-in cooler and freezer temperature monitoring" },
  { title: "Allergen Changeover Procedure",     category: "Pre-Procedure", description: "Allergen line changeover verification" },
];

// ── Shared defaults ───────────────────────────────────────────────────────────
const DEFAULT_CCP          = { min_temp_f: 190, min_weight_oz: 3.5, max_weight_oz: 4.2 };
const DEFAULT_OVENS        = ["Oven 06", "Oven 07", "Oven 08"];
const DEFAULT_CALIBRATION  = [{ label: "10g" }, { label: "100g" }, { label: "500g" }];
const DEFAULT_CHECKLIST    = [
  "Calibration Verification completed",
  "CCP Temperature Verification completed",
  "Net Weight Compliance completed",
  "Visual Inspection completed",
  "Batch Sheet completed",
  "Final Visual Inspection from Production Manager completed",
];

type Ing = { name: string; quantity: number; unit?: string };
type Pkg = { name: string; qty?: number; foodContact?: boolean };

function makeTpl(
  name: string,
  category: string,
  description: string | null,
  ings: Ing[],
  pkgs: Pkg[],
) {
  return {
    name,
    category,
    description,
    isActive: true,
    ingredients: ings.map((i, idx) => ({
      id: String(idx + 1),
      name: i.name,
      quantity_per_bowl: i.quantity,
      unit: i.unit ?? "lb",
    })),
    packaging: pkgs.map((p, idx) => ({
      id: String(idx + 1),
      name: p.name,
      qty_per_bowl: p.qty ?? 1,
      food_contact: p.foodContact ?? true,
    })),
    ovensAvailable:        DEFAULT_OVENS,
    calibrationWeights:    DEFAULT_CALIBRATION,
    ccpSettings:           DEFAULT_CCP,
    releaseChecklistItems: DEFAULT_CHECKLIST,
  };
}

// ── All templates ─────────────────────────────────────────────────────────────
const TEMPLATES = [
  // ── Legacy ──
  {
    name:        'Flatbread 18"',
    category:    null,
    description: "Standard 18-inch flatbread production template",
    isActive:    true,
    ingredients: [
      { id: "1", name: "Oil Canola Salad",             quantity_per_bowl: 2.4,  unit: "kg" },
      { id: "2", name: "Rice Flour Brown Stabilized",  quantity_per_bowl: 13.2, unit: "kg" },
      { id: "3", name: "Flour Tapioca Starch",         quantity_per_bowl: 16.8, unit: "kg" },
      { id: "4", name: "Sea Salt #1120 Non Cake",      quantity_per_bowl: 0.6,  unit: "kg" },
      { id: "5", name: "Gum Xanthan 200 Mesh",         quantity_per_bowl: 0.6,  unit: "kg" },
      { id: "6", name: "Evaporated Cane Juice",        quantity_per_bowl: 4.8,  unit: "kg" },
      { id: "7", name: "Yeast",                        quantity_per_bowl: 1.8,  unit: "kg" },
    ],
    packaging: [
      { id: "1", name: "Parchment Paper", qty_per_bowl: 1, food_contact: false },
      { id: "2", name: "S-16567 Bag",     qty_per_bowl: 1, food_contact: false },
      { id: "3", name: "20x8x4 Box",      qty_per_bowl: 1, food_contact: false },
    ],
    ovensAvailable:        DEFAULT_OVENS,
    calibrationWeights:    DEFAULT_CALIBRATION,
    ccpSettings:           DEFAULT_CCP,
    releaseChecklistItems: DEFAULT_CHECKLIST,
  },

  // ── PreMix Powder ──
  makeTpl("PreMix Powder — Egg Vanilla", "PreMix Powder", null, [
    { name: "Egg protein powder p1nf",                    quantity: 37.37  },
    { name: "Monk fruit extract",                         quantity: 0.38   },
    { name: "Natural vanilla flavor for egg 201899",      quantity: 2.25   },
  ], []),

  makeTpl("PreMix Powder — Pea Vanilla", "PreMix Powder", null, [
    { name: "Natural vanilla flavor for pea 201803",      quantity: 3.76   },
    { name: "Unflavored pea protein powder",              quantity: 36.24  },
  ], []),

  makeTpl("PreMix Powder — Egg Chocolate", "PreMix Powder", null, [
    { name: "Egg protein powder p1nf",                    quantity: 30.45  },
    { name: "Monk fruit extract",                         quantity: 0.38   },
    { name: "Natural chocolate flavor for egg 201959",    quantity: 9.17   },
  ], []),

  makeTpl("PreMix Powder — Egg Espresso", "PreMix Powder", null, [
    { name: "Egg protein powder p1nf",                    quantity: 32.54     },
    { name: "Monk fruit extract",                         quantity: 0.370377  },
    { name: "Instant coffee",                             quantity: 7.09      },
  ], []),

  // ── Bread ──
  makeTpl("Bread — KetoThin", "Bread", null, [
    { name: "Almond flour",                   quantity: 25.0         },
    { name: "Baking powder",                  quantity: 2.2          },
    { name: "Cream cheese",                   quantity: 50.0         },
    { name: "Hi-whip egg white powder cd16p1",quantity: 5.0          },
    { name: "Unsalted butter",                quantity: 6.6          },
    { name: "Vanilla extract",                quantity: 5.5          },
    { name: "Whole egg",                      quantity: 600, unit: "units" },
  ], [
    { name: "KetoThin Bread bag",             qty: 1 },
    { name: "Sealable bread package bottom",  qty: 1 },
    { name: "Sealable bread package top",     qty: 1 },
  ]),

  makeTpl("Bread — PaleoThin Almond", "Bread", null, [
    { name: "Almond flour",                   quantity: 25.0          },
    { name: "Organic coconut flour",          quantity: 30.0          },
    { name: "Egg white",                      quantity: 60.0          },
    { name: "Hi-whip egg white powder cd16p1",quantity: 12.0          },
    { name: "Lemon juice",                    quantity: 2.2           },
    { name: "Potassium bicarbonate",          quantity: 2.599         },
    { name: "Sea salt",                       quantity: 0.289         },
    { name: "Whole egg",                      quantity: 60, unit: "units" },
  ], [
    { name: "PaleoThin Almond Bread bag",     qty: 1 },
    { name: "Sealable bread package bottom",  qty: 1 },
    { name: "Sealable bread package top",     qty: 1 },
  ]),

  makeTpl("Bread — PaleoThin Coconut", "Bread", null, [
    { name: "Organic coconut flour",          quantity: 36.0          },
    { name: "Egg white",                      quantity: 60.0          },
    { name: "Hi-whip egg white powder cd16p1",quantity: 12.0          },
    { name: "Lemon juice",                    quantity: 2.2           },
    { name: "Potassium bicarbonate",          quantity: 2.599         },
    { name: "Sea salt",                       quantity: 0.289         },
    { name: "Whole egg",                      quantity: 60, unit: "units" },
  ], [
    { name: "PaleoThin Coconut Bread bag",    qty: 1 },
    { name: "Sealable bread package bottom",  qty: 1 },
    { name: "Sealable bread package top",     qty: 1 },
  ]),

  // ── ProGranola ──
  makeTpl("ProGranola — Peanut Butter", "ProGranola", null, [
    { name: "Cinnamon powder",              quantity: 0.440924       },
    { name: "Egg protein powder p1nf",      quantity: 9.0            },
    { name: "Fibersmart tapioca syrup",     quantity: 25.0           },
    { name: "Monk fruit extract",           quantity: 0.0661386      },
    { name: "Organic chia seed",            quantity: 3.0            },
    { name: "Organic peanut butter",        quantity: 5.0            },
    { name: "Organic peanut flour",         quantity: 6.0            },
    { name: "Organic peanut halves",        quantity: 3.0            },
    { name: "Organic sesame seed",          quantity: 5.0            },
  ], [
    { name: "ProGranola Peanut Butter pouch", qty: 1 },
  ]),

  makeTpl("ProGranola — Vanilla Cinnamon", "ProGranola", null, [
    { name: "Cinnamon powder",              quantity: 0.551155       },
    { name: "Egg protein powder p1nf",      quantity: 9.0            },
    { name: "Fibersmart tapioca syrup",     quantity: 15.0           },
    { name: "Monk fruit extract",           quantity: 0.0551155      },
    { name: "Organic flax seed",            quantity: 3.0            },
    { name: "Organic pumpkin seed",         quantity: 3.0            },
    { name: "Organic sesame seed",          quantity: 3.0            },
    { name: "PreMix Powder - Egg Vanilla",  quantity: 3.0            },
  ], [
    { name: "ProGranola Vanilla Cinnamon pouch", qty: 1 },
  ]),

  makeTpl("ProGranola — Vegan Vanilla", "ProGranola", null, [
    { name: "Cinnamon powder",              quantity: 0.440924       },
    { name: "Fibersmart tapioca syrup",     quantity: 17.0           },
    { name: "Organic chia seed",            quantity: 4.0            },
    { name: "Organic pumpkin seed",         quantity: 4.0            },
    { name: "Organic sesame seed",          quantity: 4.0            },
    { name: "PreMix Powder - Pea Vanilla",  quantity: 14.0           },
  ], [
    { name: "ProGranola Vegan Vanilla pouch", qty: 1 },
  ]),

  makeTpl("ProGranola — Chocolate", "ProGranola", null, [
    { name: "Cocoa powder",                   quantity: 2.0          },
    { name: "Egg protein powder p1nf",        quantity: 8.0          },
    { name: "Fibersmart tapioca syrup",       quantity: 15.0         },
    { name: "Monk fruit extract",             quantity: 0.0551155    },
    { name: "Organic chia seed",              quantity: 4.0          },
    { name: "Organic pumpkin seed",           quantity: 4.0          },
    { name: "PreMix Powder - Egg Chocolate",  quantity: 2.0          },
  ], [
    { name: "ProGranola Chocolate pouch", qty: 1 },
  ]),

  makeTpl("ProGranola — Espresso", "ProGranola", null, [
    { name: "Egg protein powder p1nf",        quantity: 7.0          },
    { name: "Fibersmart tapioca syrup",       quantity: 16.0         },
    { name: "Monk fruit extract",             quantity: 0.03968316   },
    { name: "Organic chia seed",              quantity: 4.0          },
    { name: "Organic pumpkin seed",           quantity: 4.0          },
    { name: "Organic sesame seed",            quantity: 4.0          },
    { name: "PreMix Powder - Egg Espresso",   quantity: 5.0          },
  ], [
    { name: "ProGranola Espresso pouch", qty: 1 },
  ]),

  // ── Protein Bar (EW) ──
  makeTpl("Protein Bar EW — Peanut Butter", "Protein Bar (EW)", null, [
    { name: "Egg protein powder cd06p1",    quantity: 16.9         },
    { name: "Fibersmart tapioca syrup",     quantity: 23.0         },
    { name: "Monk fruit extract",           quantity: 0.0551155    },
    { name: "Organic peanut butter",        quantity: 11.0         },
    { name: "Organic peanut halves",        quantity: 3.0          },
  ], [
    { name: "EW Protein Bar PB sleeve",  qty: 1  },
    { name: "EW Protein Bar PB caddie",  qty: 12 },
  ]),

  makeTpl("Protein Bar EW — Almond Butter", "Protein Bar (EW)", null, [
    { name: "Almonds",                      quantity: 3.0          },
    { name: "Almond butter",                quantity: 12.0         },
    { name: "Cinnamon powder",              quantity: 0.551156     },
    { name: "Egg protein powder cd06p1",    quantity: 17.0         },
    { name: "Fibersmart tapioca syrup",     quantity: 20.5         },
    { name: "Monk fruit extract",           quantity: 0.0551156    },
  ], []),

  // ── Protein Bar (Other) ──
  makeTpl("Protein Bar — Pea Dark Chocolate", "Protein Bar (Other)", null, [
    { name: "Cocoa powder",                  quantity: 4.0  },
    { name: "Fibersmart tapioca syrup",      quantity: 23.0 },
    { name: "Monk fruit extract",            quantity: 0.11 },
    { name: "Organic sunflower butter",      quantity: 8.0  },
    { name: "Unflavored pea protein powder", quantity: 19.0 },
  ], []),

  makeTpl("Protein Bar — Whey Sweet Cream", "Protein Bar (Other)", null, [
    { name: "Fibersmart tapioca syrup",      quantity: 24.0  },
    { name: "Monk fruit extract",            quantity: 0.088 },
    { name: "Organic sunflower butter",      quantity: 11.0  },
    { name: "Organic whey protein",          quantity: 20.5  },
  ], []),

  // ── Crackers ──
  makeTpl("Crackers — Organic Salt & Pepper", "Crackers", null, [
    { name: "Organic almond flour",          quantity: 7.125       },
    { name: "Organic black pepper powder",   quantity: 0.24912206  },
    { name: "Organic chia seed",             quantity: 4.0         },
    { name: "Organic flax seed",             quantity: 7.5         },
    { name: "Organic garlic powder",         quantity: 0.5621781   },
    { name: "Organic paprika powder",        quantity: 0.2755775   },
    { name: "Organic sesame seed",           quantity: 15.0        },
    { name: "Organic tapioca flour",         quantity: 13.78       },
    { name: "Sea salt",                      quantity: 1.1243562   },
  ], [
    { name: "Salt & Pepper box",      qty: 1 },
    { name: "Resealable clear pouch", qty: 1 },
  ]),

  makeTpl("Crackers — Organic Parmesan", "Crackers", null, [
    { name: "Organic chia seed",                   quantity: 3.75      },
    { name: "Organic flax seed",                   quantity: 13.5      },
    { name: "Organic parmesan cheese grated",      quantity: 15.0      },
    { name: "Organic sesame seed",                 quantity: 7.5       },
    { name: "Organic tapioca flour",               quantity: 13.78     },
    { name: "Sea salt",                            quantity: 1.1243562 },
  ], [
    { name: "Parmesan box",           qty: 1 },
    { name: "Resealable clear pouch", qty: 1 },
  ]),

  makeTpl("Crackers — Chili Lime", "Crackers", null, [
    { name: "Cayenne powder",                quantity: 0.17747191   },
    { name: "Dehydrated lime",               quantity: 1.7747191    },
    { name: "Organic almond flour",          quantity: 7.125        },
    { name: "Organic chia seed",             quantity: 4.0          },
    { name: "Organic flax seed",             quantity: 7.5          },
    { name: "Organic paprika powder",        quantity: 3.20110824   },
    { name: "Organic sesame seed",           quantity: 15.0         },
    { name: "Organic tapioca flour",         quantity: 13.78        },
    { name: "Red chili powder",              quantity: 0.17747191   },
    { name: "Sea salt",                      quantity: 1.5542571    },
  ], []),

  // ── Protein Powder ──
  makeTpl("Protein Powder — Egg Unflavored", "Protein Powder", null, [
    { name: "Egg protein powder p1nf",       quantity: 1.99959034   },
  ], [
    { name: "Unflavored Egg Protein pouch",  qty: 1 },
    { name: "90cc scoop",                    qty: 1 },
  ]),

  makeTpl("Protein Powder — Egg Vanilla", "Protein Powder", null, [
    { name: "PreMix Powder - Egg Vanilla",   quantity: 1.9180194    },
  ], [
    { name: "Vanilla Egg Protein pouch",     qty: 1 },
    { name: "70cc scoop",                    qty: 1 },
  ]),

  makeTpl("Protein Powder — Pea Vanilla", "Protein Powder", null, [
    { name: "PreMix Powder - Pea Vanilla",   quantity: 1.984158     },
  ], [
    { name: "Vanilla Pea Protein pouch",     qty: 1 },
    { name: "70cc scoop",                    qty: 1 },
  ]),

  makeTpl("Protein Powder — Egg Chocolate", "Protein Powder", null, [
    { name: "PreMix Powder - Egg Chocolate", quantity: 2.1825738    },
  ], [
    { name: "Chocolate Egg Protein pouch",   qty: 1 },
    { name: "70cc scoop",                    qty: 1 },
  ]),

  makeTpl("Protein Powder — Egg Espresso", "Protein Powder", null, [
    { name: "PreMix Powder - Egg Espresso",  quantity: 2.314851     },
  ], [
    { name: "Espresso Egg Protein pouch",    qty: 1 },
    { name: "90cc scoop",                    qty: 1 },
  ]),

  // ── Sweetener ──
  makeTpl("Sweetener — PureMonk", "Sweetener", null, [
    { name: "Monk fruit extract",            quantity: 0.220462     },
  ], [
    { name: "mf jar",           qty: 1 },
    { name: "mf lid",           qty: 1 },
    { name: "mf seal",          qty: 1 },
    { name: "2cc scoop",        qty: 1 },
    { name: "PureMonk label",   qty: 1 },
  ]),

  makeTpl("Sweetener — Organic PureMonk Ultra", "Sweetener", null, [
    { name: "Organic monk fruit extract mv50", quantity: 0.1653465  },
  ], [
    { name: "mf jar",                qty: 1 },
    { name: "mf lid",                qty: 1 },
    { name: "mf seal",               qty: 1 },
    { name: "2cc scoop",             qty: 1 },
    { name: "PureMonk Ultra label",  qty: 1 },
  ]),
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Seeding Julian's Foods FSMS…\n");

  // ── 1. Pre-migration: update any lingering OPERATOR users to SUPERVISOR ─────
  try {
    await prisma.$executeRaw`UPDATE users SET role = 'SUPERVISOR' WHERE role::text = 'OPERATOR'`;
  } catch {
    // OPERATOR enum value already removed — nothing to do
  }

  // ── 2. Clear dependent records (NOT templates or users — see upsert below) ──
  await prisma.batchSheetSubmission.deleteMany({});
  await prisma.preOpInspection.deleteMany({});
  await prisma.formSubmission.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.record.deleteMany({});
  await prisma.form.deleteMany({});
  console.log("🗑   Cleared submissions, inspections, forms, tasks, records\n");

  // ── 3. Upsert users (preserves existing IDs so template FKs stay valid) ─────
  for (const u of USERS) {
    const hashed = await hash(u.password, 12);
    await prisma.user.upsert({
      where: { email: u.email },
      create: { name: u.name, email: u.email, password: hashed, role: u.role, department: u.department, active: true },
      update: { name: u.name, password: hashed, role: u.role, department: u.department, active: true },
    });
  }

  // ── 4. Create forms ────────────────────────────────────────────────────────
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "carlos@julianbakery.com" } });

  for (const f of FORMS) {
    await prisma.form.create({
      data: { title: f.title, category: f.category, description: f.description, fields: [], active: true, version: 1, createdById: admin.id },
    });
  }

  // ── 5. Upsert templates by name (idempotent) ───────────────────────────────
  let created = 0;
  let skipped = 0;

  for (const tpl of TEMPLATES) {
    const existing = await prisma.batchSheetTemplate.findFirst({ where: { name: tpl.name } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.batchSheetTemplate.create({
      data: { ...tpl, createdById: admin.id },
    });
    created++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const LINE = "─".repeat(62);

  console.log(LINE);
  console.log("👤  Users");
  console.log(LINE);
  for (const u of USERS) {
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
  console.log(`  ✔  Created: ${created}   Skipped (already exist): ${skipped}`);

  console.log(`\n${LINE}`);
  console.log(`✅  Done — ${USERS.length} users · ${FORMS.length} forms · ${created} new templates (${skipped} skipped)`);
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
