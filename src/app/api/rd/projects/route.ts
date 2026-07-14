import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (statusParam === "active") {
      where.status = { notIn: ["closed_launched", "closed_discontinued"] };
    } else if (statusParam) {
      where.status = statusParam;
    }

    const projects = await prisma.rdProject.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { iterations: true } },
        createdBy: { select: { name: true } },
      },
    });

    return NextResponse.json(projects);
  } catch {
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
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

    if (!name || !productType || !startedDate) {
      return NextResponse.json({ error: "name, productType, and startedDate are required" }, { status: 400 });
    }

    const project = await prisma.rdProject.create({
      data: {
        name,
        productType,
        startedDate: new Date(startedDate),
        description: description ?? null,
        targetServingSize: targetServingSize ?? null,
        targetLaunchDate: targetLaunchDate ? new Date(targetLaunchDate) : null,
        status: status ?? "concept",
        targetCalories: targetCalories != null ? Number(targetCalories) : null,
        targetCaloriesTolerance: targetCaloriesTolerance ?? null,
        targetFat: targetFat != null ? Number(targetFat) : null,
        targetFatTolerance: targetFatTolerance ?? null,
        targetSaturatedFat: targetSaturatedFat != null ? Number(targetSaturatedFat) : null,
        targetSaturatedFatTolerance: targetSaturatedFatTolerance ?? null,
        targetCarbs: targetCarbs != null ? Number(targetCarbs) : null,
        targetCarbsTolerance: targetCarbsTolerance ?? null,
        targetFiber: targetFiber != null ? Number(targetFiber) : null,
        targetFiberTolerance: targetFiberTolerance ?? null,
        targetSugars: targetSugars != null ? Number(targetSugars) : null,
        targetSugarsTolerance: targetSugarsTolerance ?? null,
        targetAddedSugars: targetAddedSugars != null ? Number(targetAddedSugars) : null,
        targetAddedSugarsTolerance: targetAddedSugarsTolerance ?? null,
        targetProtein: targetProtein != null ? Number(targetProtein) : null,
        targetProteinTolerance: targetProteinTolerance ?? null,
        targetSodium: targetSodium != null ? Number(targetSodium) : null,
        targetSodiumTolerance: targetSodiumTolerance ?? null,
        createdById: userId,
      },
      include: {
        _count: { select: { iterations: true } },
        createdBy: { select: { name: true } },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
