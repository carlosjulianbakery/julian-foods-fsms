import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id") ?? "";
  if (!productId) return NextResponse.json({ lotNumber: null, productionDate: null });

  const submission = await prisma.batchSheetSubmission.findFirst({
    where: {
      productId,
      status: { in: ["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"] },
    },
    orderBy: { submittedAt: "desc" },
    select: { productionLot: true, productionDate: true },
  });

  if (!submission) {
    return NextResponse.json({ lotNumber: null, productionDate: null });
  }

  const date = submission.productionDate
    ? new Date(submission.productionDate).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  return NextResponse.json({
    lotNumber: submission.productionLot ?? null,
    productionDate: date,
  });
}
