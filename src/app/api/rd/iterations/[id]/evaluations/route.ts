import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const {
      evaluatorName,
      evaluationDate,
      ratingAppearance,
      ratingAroma,
      ratingTexture,
      ratingSweetness,
      ratingFlavorIntensity,
      ratingOverall,
      notes,
      recommendation,
    } = body;

    if (!evaluatorName || !evaluationDate || !recommendation) {
      return NextResponse.json(
        { error: "evaluatorName, evaluationDate, and recommendation are required" },
        { status: 400 }
      );
    }

    const evaluation = await prisma.rdSensoryEvaluation.create({
      data: {
        iterationId: params.id,
        evaluatorName,
        evaluationDate: new Date(evaluationDate),
        ratingAppearance: ratingAppearance != null ? Number(ratingAppearance) : null,
        ratingAroma: ratingAroma != null ? Number(ratingAroma) : null,
        ratingTexture: ratingTexture != null ? Number(ratingTexture) : null,
        ratingSweetness: ratingSweetness != null ? Number(ratingSweetness) : null,
        ratingFlavorIntensity: ratingFlavorIntensity != null ? Number(ratingFlavorIntensity) : null,
        ratingOverall: ratingOverall != null ? Number(ratingOverall) : null,
        notes: notes ?? null,
        recommendation,
      },
    });

    return NextResponse.json(evaluation, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create evaluation" }, { status: 500 });
  }
}
