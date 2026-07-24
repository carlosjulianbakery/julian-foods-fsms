import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, name } = session.user as { role: string; name: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const source = await prisma.rdIteration.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        projectId: true,
        iterationNumber: true,
        batchSize: true,
        recipe: true,
        servingSizeG: true,
        servingSizeLabel: true,
        servingsPerContainer: true,
        calculatedAddedSugars: true,
      },
    });

    if (!source) return NextResponse.json({ error: "Iteration not found" }, { status: 404 });

    // Calculate next iteration number for this project
    const agg = await prisma.rdIteration.aggregate({
      where: { projectId: source.projectId },
      _max: { iterationNumber: true },
    });
    const nextNumber = (agg._max.iterationNumber ?? 0) + 1;

    // Today in Pacific time as a DateTime (midnight UTC equivalent close enough for date field)
    const todayPacific = new Date(
      new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })
    );

    const newIteration = await prisma.rdIteration.create({
      data: {
        projectId: source.projectId,
        iterationNumber: nextNumber,
        datePerformed: todayPacific,
        performedBy: name ?? "",
        batchSize: null,
        recipe: JSON.parse(JSON.stringify(source.recipe)), // deep copy
        changesFromPrior: `Based on Iteration ${String(source.iterationNumber).padStart(2, "0")}. Changes from prior iteration:`,
        processNotes: null,
        outcome: null,
        nextSteps: null,
        status: "in_progress",
        servingSizeG: source.servingSizeG,
        servingSizeLabel: source.servingSizeLabel,
        servingsPerContainer: source.servingsPerContainer,
        calculatedAddedSugars: source.calculatedAddedSugars,
      },
      include: {
        evaluations: true,
        attachments: true,
      },
    });

    return NextResponse.json({ success: true, iteration: newIteration });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/rd/iterations/[id]/duplicate]", msg);
    return NextResponse.json({ error: "Failed to duplicate" }, { status: 500 });
  }
}
