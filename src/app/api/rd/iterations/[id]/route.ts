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

    const data: Record<string, unknown> = {};
    if (datePerformed !== undefined) data.datePerformed = new Date(datePerformed);
    if (performedBy !== undefined) data.performedBy = performedBy;
    if (batchSize !== undefined) data.batchSize = batchSize;
    if (recipe !== undefined) data.recipe = recipe;
    if (changesFromPrior !== undefined) data.changesFromPrior = changesFromPrior;
    if (processNotes !== undefined) data.processNotes = processNotes;
    if (outcome !== undefined) data.outcome = outcome;
    if (nextSteps !== undefined) data.nextSteps = nextSteps;
    if (status !== undefined) data.status = status;
    if (actualCalories !== undefined) data.actualCalories = actualCalories != null ? Number(actualCalories) : null;
    if (actualFat !== undefined) data.actualFat = actualFat != null ? Number(actualFat) : null;
    if (actualSaturatedFat !== undefined) data.actualSaturatedFat = actualSaturatedFat != null ? Number(actualSaturatedFat) : null;
    if (actualCarbs !== undefined) data.actualCarbs = actualCarbs != null ? Number(actualCarbs) : null;
    if (actualFiber !== undefined) data.actualFiber = actualFiber != null ? Number(actualFiber) : null;
    if (actualSugars !== undefined) data.actualSugars = actualSugars != null ? Number(actualSugars) : null;
    if (actualAddedSugars !== undefined) data.actualAddedSugars = actualAddedSugars != null ? Number(actualAddedSugars) : null;
    if (actualProtein !== undefined) data.actualProtein = actualProtein != null ? Number(actualProtein) : null;
    if (actualSodium !== undefined) data.actualSodium = actualSodium != null ? Number(actualSodium) : null;

    const iteration = await prisma.rdIteration.update({
      where: { id: params.id },
      data,
      include: {
        evaluations: true,
        attachments: true,
      },
    });

    return NextResponse.json(iteration);
  } catch {
    return NextResponse.json({ error: "Failed to update iteration" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const iteration = await prisma.rdIteration.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { evaluations: true, attachments: true } },
      },
    });

    if (!iteration) return NextResponse.json({ error: "Iteration not found" }, { status: 404 });

    if (iteration._count.evaluations > 0 || iteration._count.attachments > 0) {
      return NextResponse.json(
        { error: "Cannot delete iteration with existing evaluations or attachments" },
        { status: 409 }
      );
    }

    await prisma.rdIteration.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete iteration" }, { status: 500 });
  }
}
