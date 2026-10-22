import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type IngredientEntry = {
  materialId?: string;
  id?: string;
  lot_number?: string;
  inventory_lots?: Array<{ lot_id?: string; lot_number?: string }>;
  lots?: Array<{ inventory_lot_id?: string; lot_number?: string }>;
};

type MaterialEntry = {
  id?: string;
  food_contact?: boolean;
  lots?: Array<{ inventory_lot_id?: string; lot_number?: string; lot_is_other?: boolean }>;
};

type PresentationEntry = {
  presentation_id?: string;
  selected?: boolean;
  materials?: MaterialEntry[];
};

type Section3 = {
  ingredients?: IngredientEntry[];
  presentations?: PresentationEntry[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: { productId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = params;
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const submission = await prisma.batchSheetSubmission.findFirst({
    where: {
      productId,
      status: { in: ["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"] },
    },
    orderBy: { submittedAt: "desc" },
    select: {
      submittedAt: true,
      section3: true,
    },
  });

  if (!submission) {
    return NextResponse.json(null);
  }

  const s3 = submission.section3 as Section3 | null;
  if (!s3) return NextResponse.json(null);

  // Extract ingredient lot assignments keyed by materialId
  const ingredients = (s3.ingredients ?? []).map((ing) => {
    const materialId = ing.materialId ?? ing.id ?? null;
    // Prefer inventory_lots array; fall back to lots array; fall back to lot_number
    const firstLot = (ing.inventory_lots?.[0] ?? ing.lots?.[0]) as Record<string, string | undefined> | undefined;
    const lotId = firstLot?.lot_id ?? firstLot?.inventory_lot_id ?? null;
    const lotNumber = firstLot?.lot_number ?? ing.lot_number ?? null;
    return { materialId, lotId, lotNumber };
  }).filter((i) => i.materialId && (i.lotId || i.lotNumber));

  // Extract food-contact packaging lot assignments keyed by material id
  const packaging: Array<{ materialId: string; lotId: string | null; lotNumber: string | null; foodContact: boolean }> = [];
  for (const pres of s3.presentations ?? []) {
    for (const mat of pres.materials ?? []) {
      const matId = mat.id;
      if (!matId) continue;
      const firstLot = mat.lots?.[0];
      if (!firstLot) continue;
      const lotId = firstLot.lot_is_other ? null : (firstLot.inventory_lot_id ?? null);
      const lotNumber = firstLot.lot_number ?? null;
      if (lotId || lotNumber) {
        packaging.push({ materialId: matId, lotId, lotNumber, foodContact: mat.food_contact ?? true });
      }
    }
  }

  return NextResponse.json({
    submittedAt: submission.submittedAt,
    ingredients,
    packaging,
  });
}
