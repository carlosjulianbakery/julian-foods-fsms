import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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

    const data: Record<string, unknown> = {};
    if (evaluatorName !== undefined) data.evaluatorName = evaluatorName;
    if (evaluationDate !== undefined) data.evaluationDate = new Date(evaluationDate);
    if (ratingAppearance !== undefined) data.ratingAppearance = ratingAppearance != null ? Number(ratingAppearance) : null;
    if (ratingAroma !== undefined) data.ratingAroma = ratingAroma != null ? Number(ratingAroma) : null;
    if (ratingTexture !== undefined) data.ratingTexture = ratingTexture != null ? Number(ratingTexture) : null;
    if (ratingSweetness !== undefined) data.ratingSweetness = ratingSweetness != null ? Number(ratingSweetness) : null;
    if (ratingFlavorIntensity !== undefined) data.ratingFlavorIntensity = ratingFlavorIntensity != null ? Number(ratingFlavorIntensity) : null;
    if (ratingOverall !== undefined) data.ratingOverall = ratingOverall != null ? Number(ratingOverall) : null;
    if (notes !== undefined) data.notes = notes;
    if (recommendation !== undefined) data.recommendation = recommendation;

    const evaluation = await prisma.rdSensoryEvaluation.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(evaluation);
  } catch {
    return NextResponse.json({ error: "Failed to update evaluation" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.rdSensoryEvaluation.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete evaluation" }, { status: 500 });
  }
}
