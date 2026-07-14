import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const project = await prisma.rdProject.findUnique({
      where: { id: params.id },
      include: {
        createdBy: { select: { name: true } },
        iterations: {
          orderBy: { iterationNumber: "desc" },
          include: {
            evaluations: true,
            attachments: true,
          },
        },
      },
    });

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const {
      name,
      productType,
      startedDate,
      description,
      targetServingSize,
      targetLaunchDate,
      status,
      targetCalories,
      targetCaloriesTolerance,
      targetFat,
      targetFatTolerance,
      targetSaturatedFat,
      targetSaturatedFatTolerance,
      targetCarbs,
      targetCarbsTolerance,
      targetFiber,
      targetFiberTolerance,
      targetSugars,
      targetSugarsTolerance,
      targetAddedSugars,
      targetAddedSugarsTolerance,
      targetProtein,
      targetProteinTolerance,
      targetSodium,
      targetSodiumTolerance,
    } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (productType !== undefined) data.productType = productType;
    if (startedDate !== undefined) data.startedDate = new Date(startedDate);
    if (description !== undefined) data.description = description;
    if (targetServingSize !== undefined) data.targetServingSize = targetServingSize;
    if (targetLaunchDate !== undefined) data.targetLaunchDate = targetLaunchDate ? new Date(targetLaunchDate) : null;
    if (status !== undefined) data.status = status;
    if (targetCalories !== undefined) data.targetCalories = targetCalories != null ? Number(targetCalories) : null;
    if (targetCaloriesTolerance !== undefined) data.targetCaloriesTolerance = targetCaloriesTolerance || null;
    if (targetFat !== undefined) data.targetFat = targetFat != null ? Number(targetFat) : null;
    if (targetFatTolerance !== undefined) data.targetFatTolerance = targetFatTolerance || null;
    if (targetSaturatedFat !== undefined) data.targetSaturatedFat = targetSaturatedFat != null ? Number(targetSaturatedFat) : null;
    if (targetSaturatedFatTolerance !== undefined) data.targetSaturatedFatTolerance = targetSaturatedFatTolerance || null;
    if (targetCarbs !== undefined) data.targetCarbs = targetCarbs != null ? Number(targetCarbs) : null;
    if (targetCarbsTolerance !== undefined) data.targetCarbsTolerance = targetCarbsTolerance || null;
    if (targetFiber !== undefined) data.targetFiber = targetFiber != null ? Number(targetFiber) : null;
    if (targetFiberTolerance !== undefined) data.targetFiberTolerance = targetFiberTolerance || null;
    if (targetSugars !== undefined) data.targetSugars = targetSugars != null ? Number(targetSugars) : null;
    if (targetSugarsTolerance !== undefined) data.targetSugarsTolerance = targetSugarsTolerance || null;
    if (targetAddedSugars !== undefined) data.targetAddedSugars = targetAddedSugars != null ? Number(targetAddedSugars) : null;
    if (targetAddedSugarsTolerance !== undefined) data.targetAddedSugarsTolerance = targetAddedSugarsTolerance || null;
    if (targetProtein !== undefined) data.targetProtein = targetProtein != null ? Number(targetProtein) : null;
    if (targetProteinTolerance !== undefined) data.targetProteinTolerance = targetProteinTolerance || null;
    if (targetSodium !== undefined) data.targetSodium = targetSodium != null ? Number(targetSodium) : null;
    if (targetSodiumTolerance !== undefined) data.targetSodiumTolerance = targetSodiumTolerance || null;

    const project = await prisma.rdProject.update({
      where: { id: params.id },
      data,
      include: {
        _count: { select: { iterations: true } },
        createdBy: { select: { name: true } },
      },
    });

    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}
