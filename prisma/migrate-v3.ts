/**
 * migrate-v3.ts — Idempotent migration: convert endOfProductionFields from
 * old EopFieldKey string arrays to new EopField object arrays.
 *
 * Run with:
 *   cd /Users/Carlos/Desktop/julian-foods-fsms
 *   DATABASE_URL="$(grep DATABASE_URL .env.local | cut -d= -f2-)" npx tsx .claude/worktrees/modest-johnson-1d1fa8/prisma/migrate-v3.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

type EopFieldType = "text" | "number" | "yes_no" | "checkbox" | "date" | "textarea";

interface EopField {
  id: string;
  label: string;
  field_type: EopFieldType;
  required: boolean;
  order: number;
}

type EopFieldKey =
  | "total_boxes"
  | "extra_bags"
  | "yield_per_bowl"
  | "waste"
  | "bake_date"
  | "prod_hours"
  | "packaging_review"
  | "quality_check";

const SIMPLE_MAP: Partial<Record<EopFieldKey, { label: string; field_type: EopFieldType; required: boolean }>> = {
  total_boxes:    { label: "Total Boxes Made",          field_type: "number", required: true },
  extra_bags:     { label: "Extra Bags / Pouches Made", field_type: "number", required: false },
  yield_per_bowl: { label: "Yield per Bowl",            field_type: "number", required: false },
  waste:          { label: "Waste",                     field_type: "text",   required: false },
  bake_date:      { label: "Bake Date",                 field_type: "date",   required: false },
  prod_hours:     { label: "Production Hours",          field_type: "number", required: false },
};

function convertOldEopToNew(oldKeys: EopFieldKey[]): EopField[] {
  const result: EopField[] = [];
  let order = 0;

  for (const key of oldKeys) {
    if (key === "packaging_review") {
      const pkgFields: Array<{ label: string; field_type: EopFieldType; required: boolean }> = [
        { label: "Product Labeled As",         field_type: "text",     required: true },
        { label: "Lot on Package",             field_type: "text",     required: true },
        { label: "Expiration Date on Package", field_type: "date",     required: true },
        { label: "Packaging Reviewer",         field_type: "text",     required: true },
        { label: "Packaging Comments",         field_type: "textarea", required: false },
      ];
      for (const f of pkgFields) {
        result.push({ id: uid(), order: order++, ...f });
      }
    } else if (key === "quality_check") {
      const qualFields: Array<{ label: string; field_type: EopFieldType; required: boolean }> = [
        { label: "Color",            field_type: "text",     required: false },
        { label: "Shape",            field_type: "text",     required: false },
        { label: "Smell",            field_type: "text",     required: false },
        { label: "Taste",            field_type: "text",     required: false },
        { label: "Overall Quality",  field_type: "text",     required: false },
        { label: "Quality Comments", field_type: "textarea", required: false },
      ];
      for (const f of qualFields) {
        result.push({ id: uid(), order: order++, ...f });
      }
    } else if (SIMPLE_MAP[key]) {
      const def = SIMPLE_MAP[key]!;
      result.push({ id: uid(), order: order++, ...def });
    }
  }

  return result;
}

function makeDefaultEopFields(): EopField[] {
  const defs: Array<{ label: string; field_type: EopFieldType; required: boolean }> = [
    { label: "Total Boxes Made",            field_type: "number",   required: true },
    { label: "Extra Bags / Pouches Made",   field_type: "number",   required: false },
    { label: "Yield per Bowl",              field_type: "number",   required: false },
    { label: "Waste",                       field_type: "text",     required: false },
    { label: "Bake Date",                   field_type: "date",     required: false },
    { label: "Production Hours",            field_type: "number",   required: false },
    { label: "Product Labeled As",          field_type: "text",     required: true },
    { label: "Lot on Package",              field_type: "text",     required: true },
    { label: "Expiration Date on Package",  field_type: "date",     required: true },
    { label: "Packaging Reviewer",          field_type: "text",     required: true },
    { label: "Packaging Comments",          field_type: "textarea", required: false },
    { label: "Color",                       field_type: "text",     required: false },
    { label: "Shape",                       field_type: "text",     required: false },
    { label: "Smell",                       field_type: "text",     required: false },
    { label: "Taste",                       field_type: "text",     required: false },
    { label: "Overall Quality",             field_type: "text",     required: false },
    { label: "Quality Comments",            field_type: "textarea", required: false },
  ];
  return defs.map((d, i) => ({ id: uid(), order: i, ...d }));
}

async function main() {
  console.log("Starting migrate-v3 (EopField string→object conversion)…");

  const templates = await prisma.batchSheetTemplate.findMany();
  console.log(`Found ${templates.length} template(s).`);

  let updated = 0;
  let skipped = 0;

  for (const t of templates) {
    const rawEop = t.endOfProductionFields as unknown;

    if (!Array.isArray(rawEop) || rawEop.length === 0) {
      // Empty or null — set defaults
      const newFields = makeDefaultEopFields();
      await prisma.batchSheetTemplate.update({
        where: { id: t.id },
        data: { endOfProductionFields: newFields as unknown as Parameters<typeof prisma.batchSheetTemplate.update>[0]["data"]["endOfProductionFields"] },
      });
      console.log(`  [${t.id}] empty → set default ${newFields.length} fields`);
      updated++;
      continue;
    }

    const first = rawEop[0] as unknown;

    if (typeof first === "object" && first !== null && "field_type" in (first as object)) {
      // Already new format — skip
      console.log(`  [${t.id}] already new format (${rawEop.length} fields), skipping`);
      skipped++;
      continue;
    }

    if (typeof first === "string") {
      // Old string array format — convert
      const newFields = convertOldEopToNew(rawEop as EopFieldKey[]);
      await prisma.batchSheetTemplate.update({
        where: { id: t.id },
        data: { endOfProductionFields: newFields as unknown as Parameters<typeof prisma.batchSheetTemplate.update>[0]["data"]["endOfProductionFields"] },
      });
      console.log(`  [${t.id}] converted ${rawEop.length} old keys → ${newFields.length} EopField objects`);
      updated++;
      continue;
    }

    console.log(`  [${t.id}] unrecognized format, skipping`);
    skipped++;
  }

  console.log(`\nMigration complete. Updated ${updated}, skipped ${skipped} of ${templates.length} template(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
