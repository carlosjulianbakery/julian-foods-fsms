import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filterApplicableRequirements } from "@/lib/document-trigger";
import { computeSupplierStatus } from "@/lib/supplier-status";

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

  return NextResponse.json({ ...material, affectedSuppliers });
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
