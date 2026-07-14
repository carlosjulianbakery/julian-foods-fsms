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
      datePerformed,
      performedBy,
      batchSize,
      recipe,
      changesFromPrior,
      processNotes,
      outcome,
      nextSteps,
      status,
      actualCalories,
      actualFat,
      actualSaturatedFat,
      actualCarbs,
      actualFiber,
      actualSugars,
      actualAddedSugars,
      actualProtein,
      actualSodium,
    } = body;

    if (!datePerformed || !performedBy || !recipe) {
      return NextResponse.json({ error: "datePerformed, performedBy, and recipe are required" }, { status: 400 });
    }

    const aggregate = await prisma.rdIteration.aggregate({
      where: { projectId: params.id },
      _max: { iterationNumber: true },
    });
    const nextNumber = (aggregate._max.iterationNumber ?? 0) + 1;

    const iteration = await prisma.rdIteration.create({
      data: {
        projectId: params.id,
        iterationNumber: nextNumber,
        datePerformed: new Date(datePerformed),
        performedBy,
        batchSize: batchSize ?? null,
        recipe,
        changesFromPrior: changesFromPrior ?? null,
        processNotes: processNotes ?? null,
        outcome: outcome ?? null,
        nextSteps: nextSteps ?? null,
        status: status ?? "draft",
        actualCalories: actualCalories != null ? Number(actualCalories) : null,
        actualFat: actualFat != null ? Number(actualFat) : null,
        actualSaturatedFat: actualSaturatedFat != null ? Number(actualSaturatedFat) : null,
        actualCarbs: actualCarbs != null ? Number(actualCarbs) : null,
        actualFiber: actualFiber != null ? Number(actualFiber) : null,
        actualSugars: actualSugars != null ? Number(actualSugars) : null,
        actualAddedSugars: actualAddedSugars != null ? Number(actualAddedSugars) : null,
        actualProtein: actualProtein != null ? Number(actualProtein) : null,
        actualSodium: actualSodium != null ? Number(actualSodium) : null,
      },
      include: {
        evaluations: true,
        attachments: true,
      },
    });

    return NextResponse.json(iteration, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create iteration" }, { status: 500 });
  }
}
