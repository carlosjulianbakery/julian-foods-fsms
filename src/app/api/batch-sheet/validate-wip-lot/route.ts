import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id");
  const lotNumber = searchParams.get("lot_number");

  if (!productId || !lotNumber) {
    return NextResponse.json({ found: false, submission_id: null, production_date: null, bowls_produced: null });
  }

  const submission = await prisma.batchSheetSubmission.findFirst({
    where: {
      productId,
      productionLot: lotNumber.trim(),
      status: "COMPLETE",
    },
    select: {
      id: true,
      productionDate: true,
      section3: true,
    },
  });

  if (!submission) {
    return NextResponse.json({ found: false, submission_id: null, production_date: null, bowls_produced: null });
  }

  const s3 = submission.section3 as { bowls_produced?: number } | null;
  const bowlsProduced = s3?.bowls_produced ?? null;
  const productionDate = submission.productionDate
    ? new Date(submission.productionDate).toISOString().slice(0, 10)
    : null;

  return NextResponse.json({
    found: true,
    submission_id: submission.id,
    production_date: productionDate,
    bowls_produced: bowlsProduced,
  });
}
