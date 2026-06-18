import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sourceProductId = searchParams.get("source_product_id");
  const currentSubmissionId = searchParams.get("current_submission_id") ?? undefined;

  if (!sourceProductId) {
    return NextResponse.json([]);
  }

  const submissions = await prisma.batchSheetSubmission.findMany({
    where: {
      productId: sourceProductId,
      status: { in: ["COMPLETE", "PASS", "PASS_WITH_ISSUES"] },
      ...(currentSubmissionId ? { id: { not: currentSubmissionId } } : {}),
    },
    orderBy: { submittedAt: "desc" },
    take: 20,
    select: {
      id: true,
      productionLot: true,
      productionDate: true,
      section3: true,
    },
  });

  const options = submissions
    .filter((s) => s.productionLot)
    .map((s) => {
      const productionDate = s.productionDate
        ? new Date(s.productionDate).toLocaleDateString("en-US", {
            month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC",
          })
        : null;
      const s3 = s.section3 as { bowls_produced?: number } | null;
      const produced = s3?.bowls_produced ?? null;
      return {
        submission_id: s.id,
        production_lot: s.productionLot as string,
        production_date: productionDate,
        bowls_produced: produced,
      };
    });

  return NextResponse.json(options);
}
