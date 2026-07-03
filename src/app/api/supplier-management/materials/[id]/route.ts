import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filterApplicableRequirements } from "@/lib/document-trigger";
import { computeSupplierStatus } from "@/lib/supplier-status";
import { computeProductFields, type RecipeItem, type PresentationItem } from "@/lib/product-compute";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const material = await prisma.material.findUnique({
    where: { id: params.id },
    include: {
      suppliers: {
        include: { supplier: { select: { id: true, name: true, status: true } } },
      },
      sourceProduct: { select: { id: true, name: true } },
    },
  });

  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(material);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, category, unit, isOrganic, isAllergen, allergens, isGlutenFree, hasSpecialRisk, specialRiskTypes, isActive, materialType, sourceProductId, isTemperatureSensitive, coaRequired, minimumStockQuantity, minimumStockUnit } = body;

  // Fetch old material before update to detect toggle changes
  const oldMaterial = await prisma.material.findUnique({ where: { id: params.id } });

  const material = await prisma.material.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(isOrganic !== undefined ? { isOrganic } : {}),
      ...(isAllergen !== undefined ? { isAllergen } : {}),
      ...(allergens !== undefined ? { allergens } : {}),
      ...(isGlutenFree !== undefined ? { isGlutenFree } : {}),
      ...(hasSpecialRisk !== undefined ? { hasSpecialRisk } : {}),
      ...(specialRiskTypes !== undefined ? { specialRiskTypes } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(materialType !== undefined ? { materialType } : {}),
      ...(sourceProductId !== undefined ? { sourceProductId: sourceProductId ?? null } : {}),
      ...(isTemperatureSensitive !== undefined ? { isTemperatureSensitive } : {}),
      ...(coaRequired !== undefined ? { coaRequired } : {}),
      ...(minimumStockQuantity !== undefined ? { minimumStockQuantity: minimumStockQuantity ?? null } : {}),
      ...(minimumStockUnit !== undefined ? { minimumStockUnit: minimumStockUnit ?? null } : {}),
    },
  });

  // If WIP, ensure internal supplier link exists
  if (materialType === "wip") {
    const internalSupplier = await prisma.supplier.findFirst({
      where: { name: "Julian Bakery (Internal Production)", supplierType: "internal" },
    });
    if (internalSupplier) {
      await prisma.supplierMaterial.upsert({
        where: { supplierId_materialId: { supplierId: internalSupplier.id, materialId: params.id } },
        create: { supplierId: internalSupplier.id, materialId: params.id },
        update: {},
      });
    }
  }

  // Detect if any toggle changed
  const toggleChanged =
    oldMaterial &&
    (
      (isOrganic !== undefined && oldMaterial.isOrganic !== isOrganic) ||
      (isAllergen !== undefined && oldMaterial.isAllergen !== isAllergen) ||
      (isGlutenFree !== undefined && (oldMaterial as { isGlutenFree?: boolean }).isGlutenFree !== isGlutenFree) ||
      (hasSpecialRisk !== undefined && (oldMaterial as { hasSpecialRisk?: boolean }).hasSpecialRisk !== hasSpecialRisk) ||
      (specialRiskTypes !== undefined && JSON.stringify((oldMaterial as { specialRiskTypes?: unknown }).specialRiskTypes) !== JSON.stringify(specialRiskTypes))
    );

  let affectedSuppliers = 0;

  if (toggleChanged) {
    // Find all suppliers linked to this material
    const supplierLinks = await prisma.supplierMaterial.findMany({
      where: { materialId: params.id },
      include: {
        supplier: {
          include: {
            materials: {
              include: {
                material: {
                  select: {
                    id: true,
                    name: true,
                    isOrganic: true,
                    isAllergen: true,
                    isGlutenFree: true,
                    hasSpecialRisk: true,
                    specialRiskTypes: true,
                  },
                },
              },
            },
            documents: {
              include: { requirement: { select: { id: true, name: true, requirementType: true, isRequired: true } } },
              orderBy: { uploadedAt: "desc" },
            },
          },
        },
      },
    });

    const allRequirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });

    for (const link of supplierLinks) {
      const sup = link.supplier;
      const matAttrs = sup.materials.map((ml) => ml.material as {
        isOrganic: boolean;
        isAllergen: boolean;
        isGlutenFree: boolean;
        hasSpecialRisk: boolean;
        specialRiskTypes: unknown;
      });
      const applicable = filterApplicableRequirements(allRequirements, matAttrs);
      const computedStatus = computeSupplierStatus(sup.documents, applicable);
      if (computedStatus !== sup.status) {
        await prisma.supplier.update({ where: { id: sup.id }, data: { status: computedStatus } });
        affectedSuppliers++;
      }
    }
  }

  // ── Propagate name change to snapshot fields ────────────────────────────────
  const nameChanged = name !== undefined && oldMaterial && name !== oldMaterial.name;
  if (nameChanged) {
    const newName = name as string;
    const matId = params.id;
    try {
      const prop = await propagateMaterialName(matId, newName);
      console.log(
        `Material renamed: "${oldMaterial!.name}" → "${newName}" | ` +
        `Products: ${prop.products}, Drafts: ${prop.drafts}, ` +
        `Lots: ${prop.lots}, PO items: ${prop.poItems}, ` +
        `Initial stock: ${prop.initialStock}`
      );
    } catch (err) {
      console.error("[material-rename] propagation error (non-blocking):", err);
    }
  }

  return NextResponse.json({ ...material, affectedSuppliers });
}

// ── Propagation helper ───────────────────────────────────────────────────────

async function propagateMaterialName(
  matId: string,
  newName: string
): Promise<{ products: number; drafts: number; lots: number; poItems: number; initialStock: number }> {
  // 1. Products — update materialName in recipe JSONB array (camelCase keys)
  const productRows = await prisma.$executeRaw`
    UPDATE products
    SET recipe = (
      SELECT jsonb_agg(
        CASE
          WHEN elem->>'materialId' = ${matId}
          THEN elem || jsonb_build_object('materialName', ${newName}::text)
          ELSE elem
        END
      )
      FROM jsonb_array_elements(recipe) AS elem
    )
    WHERE recipe::text LIKE ${'%' + matId + '%'}
  `;

  // 2. Draft batch submissions — update material_name inside section3 JSONB
  const drafts = await prisma.batchSheetSubmission.findMany({
    where: { status: "DRAFT" },
    select: { id: true, section3: true },
  });
  let draftsUpdated = 0;
  for (const draft of drafts) {
    const s3 = draft.section3 as {
      ingredients?: Array<Record<string, unknown>>;
      presentations?: Array<{ materials?: Array<Record<string, unknown>> }>;
    } | null;
    if (!s3) continue;
    let touched = false;
    if (Array.isArray(s3.ingredients)) {
      for (const ing of s3.ingredients) {
        if (ing.materialId === matId) { ing.materialName = newName; touched = true; }
      }
    }
    if (Array.isArray(s3.presentations)) {
      for (const pres of s3.presentations) {
        if (Array.isArray((pres as { materials?: Array<Record<string, unknown>> }).materials)) {
          for (const mat of (pres as { materials: Array<Record<string, unknown>> }).materials) {
            if (mat.materialId === matId) { mat.materialName = newName; touched = true; }
          }
        }
      }
    }
    if (touched) {
      await prisma.batchSheetSubmission.update({
        where: { id: draft.id },
        data: { section3: s3 as object },
      });
      draftsUpdated++;
    }
  }

  // 3. Inventory lots — materialName column
  const lotsResult = await prisma.inventoryLot.updateMany({
    where: { materialId: matId },
    data: { materialName: newName },
  });

  // 4. Open PO items (sent or partially_received only)
  const poResult = await prisma.purchaseOrderItem.updateMany({
    where: {
      materialId: matId,
      po: { status: { in: ["sent", "partially_received"] } },
    },
    data: { materialName: newName },
  });

  // 5. Initial stock entries
  const iseResult = await prisma.initialStockEntry.updateMany({
    where: { materialId: matId },
    data: { materialName: newName },
  });

  // 6. Recompute supplierExposure for affected products so stored snapshot stays current
  const affectedProducts = await prisma.product.findMany({
    where: { recipe: { path: [], string_contains: matId } },
    select: { id: true, recipe: true, presentations: true },
  });
  for (const prod of affectedProducts) {
    const fresh = await computeProductFields(
      (prod.recipe as RecipeItem[]) ?? [],
      (prod.presentations as PresentationItem[]) ?? []
    );
    await prisma.product.update({
      where: { id: prod.id },
      data: { supplierExposure: fresh.supplierExposure },
    });
  }

  return {
    products: productRows,
    drafts: draftsUpdated,
    lots: lotsResult.count,
    poItems: poResult.count,
    initialStock: iseResult.count,
  };
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.material.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
