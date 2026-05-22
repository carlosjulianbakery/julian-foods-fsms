/**
 * migrate-v2.ts — Idempotent migration to new batch sheet template data structures.
 *
 * Run with:
 *   cd /Users/Carlos/Desktop/julian-foods-fsms
 *   DATABASE_URL="..." npx tsx .claude/worktrees/modest-johnson-1d1fa8/prisma/migrate-v2.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_EOP_FIELDS = [
  "total_boxes",
  "extra_bags",
  "yield_per_bowl",
  "waste",
  "bake_date",
  "prod_hours",
  "packaging_review",
  "quality_check",
];

async function main() {
  console.log("Starting migrate-v2…");

  const templates = await prisma.batchSheetTemplate.findMany();
  console.log(`Found ${templates.length} template(s).`);

  let updated = 0;

  for (const t of templates) {
    const patches: Record<string, unknown> = {};

    // ── 1. ccpSettings → new array format ──────────────────────────────────────
    const ccp = t.ccpSettings as unknown;
    if (!Array.isArray(ccp)) {
      // Old flat object format: { min_temp_f, min_weight_oz, max_weight_oz }
      const old = ccp as { min_temp_f?: number; min_weight_oz?: number; max_weight_oz?: number };
      const minTemp = old.min_temp_f ?? 190;
      const minWt   = old.min_weight_oz ?? 3.5;
      const maxWt   = old.max_weight_oz ?? 4.2;

      patches.ccpSettings = [
        {
          id:           uid(),
          type:         "temperature",
          label:        "Internal Temperature",
          num_readings: 2,
          min_value:    minTemp,
          max_value:    null,
          unit:         "°F",
        },
        {
          id:           uid(),
          type:         "weight",
          label:        "Finished Weight",
          num_readings: 2,
          min_value:    minWt,
          max_value:    maxWt,
          unit:         "oz",
        },
        {
          id:           uid(),
          type:         "visual",
          label:        "Visual Inspection",
          num_readings: 1,
          min_value:    null,
          max_value:    null,
          unit:         null,
        },
      ];
      console.log(`  [${t.id}] ccpSettings: converted old flat → array`);
    } else {
      console.log(`  [${t.id}] ccpSettings: already array, skipping`);
    }

    // ── 2. packaging → presentations format ────────────────────────────────────
    const pkg = t.packaging as unknown;
    if (Array.isArray(pkg) && pkg.length > 0) {
      const firstItem = pkg[0] as Record<string, unknown>;
      if (!firstItem.presentation_id) {
        // Old flat array format — wrap in a single presentation
        patches.packaging = [
          {
            presentation_id:   uid(),
            presentation_name: "Standard Presentation",
            materials:         pkg.map((m: Record<string, unknown>) => ({
              id:           m.id ?? uid(),
              name:         m.name ?? "",
              qty_per_bowl: (m.qty_per_bowl ?? m.units_per_n_flatbreads ?? 1) as number,
              food_contact: (m.food_contact ?? true) as boolean,
            })),
          },
        ];
        console.log(`  [${t.id}] packaging: wrapped ${pkg.length} item(s) into presentation`);
      } else {
        console.log(`  [${t.id}] packaging: already presentation format, skipping`);
      }
    } else if (Array.isArray(pkg) && pkg.length === 0) {
      // Empty array is fine — leave as-is (will be empty presentations list)
      console.log(`  [${t.id}] packaging: empty, skipping`);
    }

    // ── 3. ccpNumSessions → set to 3 if 0 (default may not have back-filled) ──
    if ((t.ccpNumSessions as number) === 0) {
      patches.ccpNumSessions = 3;
      console.log(`  [${t.id}] ccpNumSessions: 0 → 3`);
    }

    // ── 4. endOfProductionFields → set default if empty / null ─────────────────
    const eopRaw = t.endOfProductionFields as unknown;
    const eop = Array.isArray(eopRaw) ? eopRaw : [];
    if (eop.length === 0) {
      patches.endOfProductionFields = DEFAULT_EOP_FIELDS;
      console.log(`  [${t.id}] endOfProductionFields: set default`);
    }

    if (Object.keys(patches).length > 0) {
      await prisma.batchSheetTemplate.update({
        where: { id: t.id },
        data:  patches as Parameters<typeof prisma.batchSheetTemplate.update>[0]["data"],
      });
      updated++;
    } else {
      console.log(`  [${t.id}] no changes needed`);
    }
  }

  console.log(`\nMigration complete. Updated ${updated} / ${templates.length} template(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
