/**
 * Supplier seed script — reads Supplier_Tracker_3.xlsx and populates:
 *   - suppliers table (Sheet 1 "Supplier Approval")
 *   - materials table  (Sheet 2 "Ingredient Specifications", Product Description column)
 *   - supplier_materials links (Sheet 2 rows)
 *
 * Safe to run multiple times — fully idempotent.
 * Usage:  npx tsx prisma/seed-suppliers.ts
 */

import * as XLSX from "xlsx";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────────────────

const EXCEL_PATH = path.resolve(
  process.env.EXCEL_PATH ?? "/Users/Carlos/Downloads/Supplier_Tracker_3.xlsx"
);

const EXCLUDED_NAMES = new Set([
  "carlos jaime gomory",
  "mauricio jaime gomory",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function nullable(v: unknown): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

/** Build the notes string for a supplier row. */
function buildNotes(row: Record<string, unknown>, emails: string[]): string {
  const parts: string[] = ["Country of Origin: US"];

  if (emails.length > 1) {
    parts.push(`All contacts: ${str(row["Email"])}`);
  }

  const cert = nullable(row["Certifications"]);
  if (cert) parts.push(`Certifications: ${cert}`);

  const lead = nullable(row["Lead Time (days)"]);
  if (lead) parts.push(`Lead Time: ${lead} days`);

  const moq = nullable(row["MOQ / Notes"]);
  if (moq) parts.push(`MOQ/Notes: ${moq}`);

  const internal = nullable(row["Internal Notes"]);
  if (internal) parts.push(`Internal Notes: ${internal}`);

  return parts.join("\n");
}

/** Map "Supplier Type" text → MaterialCategory enum value. */
function typeToCategory(supplierType: string): "INGREDIENT" | "PACKAGING" | "OTHER" {
  const t = supplierType.toLowerCase();
  if (t === "ingredient") return "INGREDIENT";
  if (t === "packaging") return "PACKAGING";
  return "OTHER";
}

// ── Counters ──────────────────────────────────────────────────────────────────

const counts = {
  suppliersInserted: 0,
  suppliersSkipped: 0,
  suppliersExcluded: 0,
  materialsMatched: 0,
  materialsCreated: 0,
  linksCreated: 0,
  linksSkipped: 0,
  errors: [] as string[],
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading Excel file: ${EXCEL_PATH}`);
  const wb = XLSX.readFile(EXCEL_PATH);

  // ── SHEET 1 — Suppliers ──────────────────────────────────────────────────

  const ws1 = wb.Sheets[wb.SheetNames[0]];
  // Real header is on row 7 (1-indexed), i.e. index 6 (0-indexed). SheetJS rows
  // are 1-indexed so we use range override — easiest to just convert to JSON
  // with defval="" and manually skip the title rows.
  const raw1: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws1, {
    range: 6,      // start from row index 6 (0-based) = row 7 in Excel = header row
    defval: "",
  });

  console.log(`\nSheet 1 rows read: ${raw1.length}`);

  // Build a map of supplier name (lowercase) → DB id for use in Sheet 2
  const supplierIdByName = new Map<string, string>();

  // Pre-load existing suppliers to avoid duplicates and populate the map
  const existingSuppliers = await prisma.supplier.findMany({
    select: { id: true, name: true },
  });
  for (const s of existingSuppliers) {
    supplierIdByName.set(s.name.toLowerCase(), s.id);
  }

  for (const row of raw1) {
    const supplierName = str(row["Supplier Name"]);
    if (!supplierName) continue; // skip blank rows

    const nameLower = supplierName.toLowerCase();

    // Skip excluded personal names
    if (EXCLUDED_NAMES.has(nameLower)) {
      counts.suppliersExcluded++;
      continue;
    }

    // Skip if already exists
    if (supplierIdByName.has(nameLower)) {
      counts.suppliersSkipped++;
      continue;
    }

    // Parse emails
    const emailRaw = str(row["Email"]);
    const emails = emailRaw
      ? emailRaw.split(";").map((e) => e.trim()).filter(Boolean)
      : [];
    const primaryEmail = emails[0] ?? null;

    // Supplier type
    const supplierType = str(row["Supplier Type"]);

    // Notes
    const notes = buildNotes(row, emails);

    try {
      const created = await prisma.supplier.create({
        data: {
          name:        supplierName,
          contactName: nullable(row["Contact Person"]),
          email:       primaryEmail,
          phone:       null,
          notes,
          status:      "PENDING",
          isActive:    true,
        },
      });
      supplierIdByName.set(nameLower, created.id);
      counts.suppliersInserted++;
      console.log(`  ✓ Supplier inserted: ${supplierName}`);
    } catch (err) {
      const msg = `Supplier "${supplierName}": ${err instanceof Error ? err.message : String(err)}`;
      counts.errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }

    // Store the supplier type for category inference in Sheet 2
    // (We'll re-build this from Sheet 1 data below — store as metadata)
    void supplierType; // used below via supplierTypeByName
  }

  // Build supplier type map for category inference in Sheet 2
  const supplierTypeByName = new Map<string, string>();
  for (const row of raw1) {
    const name = str(row["Supplier Name"]);
    if (name) supplierTypeByName.set(name.toLowerCase(), str(row["Supplier Type"]));
  }

  // ── SHEET 2 — Supplier-Material Links ───────────────────────────────────

  const ws2 = wb.Sheets[wb.SheetNames[1]];
  const raw2: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws2, {
    range: 6,
    defval: "",
  });

  console.log(`\nSheet 2 rows read: ${raw2.length}`);

  // Pre-load all existing materials for dedup / matching
  const existingMaterials = await prisma.material.findMany({
    select: { id: true, name: true },
  });
  // Map: normalized name → id (for matching)
  const materialIdByName = new Map<string, string>();
  for (const m of existingMaterials) {
    materialIdByName.set(m.name.toLowerCase(), m.id);
  }

  // Pre-load all existing links for dedup
  const existingLinks = await prisma.supplierMaterial.findMany({
    select: { supplierId: true, materialId: true },
  });
  const linkSet = new Set(existingLinks.map((l) => `${l.supplierId}|${l.materialId}`));

  for (let i = 0; i < raw2.length; i++) {
    const row = raw2[i];
    const supplierName = str(row["Supplier"]);
    const productDesc  = str(row["Product Description"]);

    if (!supplierName || !productDesc) continue;

    const supplierNameLower = supplierName.toLowerCase();

    // Skip excluded suppliers' rows in Sheet 2 — materials still created
    // (so other supplier links work), but the link itself is skipped below.
    const isExcluded = EXCLUDED_NAMES.has(supplierNameLower);

    // ── Find or create material ─────────────────────────────────────────────

    // Truncate name to 200 chars
    const matName = productDesc.slice(0, 200);
    const matNameLower = matName.toLowerCase();

    let materialId: string | null = null;

    // 1) Exact case-insensitive match
    if (materialIdByName.has(matNameLower)) {
      materialId = materialIdByName.get(matNameLower)!;
      counts.materialsMatched++;
    } else {
      // 2) Partial match — check if product desc is a substring of any existing name or vice versa
      for (const [existingName, existingId] of materialIdByName) {
        if (
          existingName.includes(matNameLower) ||
          matNameLower.includes(existingName)
        ) {
          materialId = existingId;
          counts.materialsMatched++;
          break;
        }
      }
    }

    // 3) No match — create new material
    if (!materialId) {
      // Infer category from supplier type
      const sType = supplierTypeByName.get(supplierNameLower) ?? "";
      const category = typeToCategory(sType);

      try {
        const created = await prisma.material.create({
          data: {
            name:     matName,
            category,
            isActive: true,
          },
        });
        materialId = created.id;
        materialIdByName.set(matNameLower, materialId);
        counts.materialsCreated++;
        console.log(`  + Material created: ${matName.slice(0, 60)}${matName.length > 60 ? "…" : ""}`);
      } catch (err) {
        const msg = `Material "${matName.slice(0, 60)}…" (row ${i + 1}): ${err instanceof Error ? err.message : String(err)}`;
        counts.errors.push(msg);
        console.error(`  ✗ ${msg}`);
        continue;
      }
    }

    // ── Create supplier-material link ───────────────────────────────────────

    if (isExcluded) continue; // supplier not in DB — nothing to link

    const supplierId = supplierIdByName.get(supplierNameLower);
    if (!supplierId) {
      // Supplier not found (wasn't in Sheet 1 or failed to insert)
      const msg = `Row ${i + 1}: Supplier "${supplierName}" not found in database — skipping link`;
      counts.errors.push(msg);
      console.warn(`  ⚠ ${msg}`);
      continue;
    }

    const linkKey = `${supplierId}|${materialId}`;
    if (linkSet.has(linkKey)) {
      counts.linksSkipped++;
      continue;
    }

    try {
      await prisma.supplierMaterial.create({
        data: { supplierId, materialId },
      });
      linkSet.add(linkKey);
      counts.linksCreated++;
    } catch (err) {
      const msg = `Link "${supplierName}" ↔ "${matName.slice(0, 40)}…" (row ${i + 1}): ${err instanceof Error ? err.message : String(err)}`;
      counts.errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n=== SUPPLIER SEED SUMMARY ===");
  console.log(`Suppliers inserted:             ${counts.suppliersInserted}`);
  console.log(`Suppliers skipped (exist):      ${counts.suppliersSkipped}`);
  console.log(`Suppliers skipped (excluded):   ${counts.suppliersExcluded}`);

  console.log("\n=== MATERIAL SEED SUMMARY ===");
  console.log(`Materials matched (existing):   ${counts.materialsMatched}`);
  console.log(`Materials created (new):        ${counts.materialsCreated}`);

  console.log("\n=== SUPPLIER-MATERIAL LINKS ===");
  console.log(`Links created:                  ${counts.linksCreated}`);
  console.log(`Links skipped (already exist):  ${counts.linksSkipped}`);

  console.log("\n=== ERRORS ===");
  if (counts.errors.length === 0) {
    console.log("None");
  } else {
    counts.errors.forEach((e) => console.log(`  - ${e}`));
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
