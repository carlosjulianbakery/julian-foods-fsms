import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filterApplicableRequirements, getTriggerLabel, type MaterialAttrs, type DocumentReqBase } from "@/lib/document-trigger";

const EXPIRING_SOON_DAYS = 30;

type MaterialWithAttrs = {
  id: string;
  name: string;
  isOrganic: boolean;
  isAllergen: boolean;
  isGlutenFree: boolean;
  hasSpecialRisk: boolean;
  specialRiskTypes: unknown;
  coaRequired: boolean;
  materialType: string;
};

type SupplierMaterialLink = {
  material: MaterialWithAttrs;
};

function getTriggeringMaterialName(
  req: DocumentReqBase,
  matAttrs: MaterialAttrs[],
  materialLinks: SupplierMaterialLink[]
): string | null {
  if (!req.triggerType || req.triggerType === "supplier_level") return null;
  if (!req.triggerCondition) return null;

  const cond = req.triggerCondition;
  for (let i = 0; i < matAttrs.length; i++) {
    const m = matAttrs[i];
    let matches = false;
    if (cond === "all_materials") {
      matches = true;
    } else if (cond === "is_allergen") {
      matches = m.isAllergen;
    } else if (cond === "is_organic") {
      matches = m.isOrganic;
    } else if (cond === "is_gluten_free") {
      matches = m.isGlutenFree;
    } else if (cond === "has_special_risk") {
      matches = m.hasSpecialRisk;
    } else if (cond === "coa_required") {
      matches = m.coaRequired === true;
    } else if (cond === "raw_ingredient") {
      matches = m.materialType === "raw";
    } else if (cond.startsWith("special_risk:")) {
      const riskType = cond.slice("special_risk:".length);
      if (m.hasSpecialRisk && Array.isArray(m.specialRiskTypes)) {
        const types = m.specialRiskTypes as string[];
        matches = riskType === "Other"
          ? types.some((t) => t.startsWith("Other:") || t === "Other")
          : types.includes(riskType);
      }
    }
    if (matches && materialLinks[i]) {
      return materialLinks[i].material.name;
    }
  }
  return null;
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const soonThreshold = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  // Expired documents (from active suppliers)
  const expired = await prisma.supplierDocument.findMany({
    where: {
      expiresAt: { lt: now },
      supplier: { isActive: true },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      requirement: { select: { id: true, name: true } },
    },
    orderBy: { expiresAt: "asc" },
  });

  // Expiring-soon documents
  const expiringSoon = await prisma.supplierDocument.findMany({
    where: {
      expiresAt: { gte: now, lte: soonThreshold },
      supplier: { isActive: true },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      requirement: { select: { id: true, name: true } },
    },
    orderBy: { expiresAt: "asc" },
  });

  // Suppliers missing required documents (smart engine)
  const activeSuppliers = await prisma.supplier.findMany({
    where: { isActive: true },
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
              coaRequired: true,
              materialType: true,
            },
          },
        },
      },
      documents: { select: { requirementId: true } },
    },
  });

  const allRequirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });

  const missingDocs: {
    supplier: { id: string; name: string };
    requirement: { id: string; name: string };
    triggerLabel: string;
    triggeringMaterial: string | null;
  }[] = [];

  for (const sup of activeSuppliers) {
    const matAttrs: MaterialAttrs[] = sup.materials.map((link) => link.material as MaterialAttrs);
    const applicable = filterApplicableRequirements(allRequirements, matAttrs);
    const uploadedReqIds = new Set(sup.documents.map((d) => d.requirementId).filter(Boolean));

    for (const req of applicable) {
      // Skip per-delivery requirements — they use the obligation system
      if ((req.requirementType as string) === "PER_DELIVERY") continue;

      if (req.isRequired && !uploadedReqIds.has(req.id)) {
        missingDocs.push({
          supplier: { id: sup.id, name: sup.name },
          requirement: { id: req.id, name: req.name },
          triggerLabel: getTriggerLabel(req.triggerType, req.triggerCondition),
          triggeringMaterial: getTriggeringMaterialName(req, matAttrs, sup.materials as SupplierMaterialLink[]),
        });
      }
    }
  }

  // Per-delivery obligations that are pending
  const pendingObligations = await prisma.perDeliveryObligation.findMany({
    where: {
      status: "pending",
      supplier: { isActive: true },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      material: { select: { id: true, name: true } },
      receivingRecord: { select: { id: true, recordNumber: true, date: true } },
      requirement: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ expired, expiringSoon, missingDocs, pendingObligations });
}
