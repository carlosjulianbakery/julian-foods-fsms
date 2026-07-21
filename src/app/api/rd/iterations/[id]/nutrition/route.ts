import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const {
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
    if (actualCalories !== undefined) data.actualCalories = actualCalories != null ? Number(actualCalories) : null;
    if (actualFat !== undefined) data.actualFat = actualFat != null ? Number(actualFat) : null;
    if (actualSaturatedFat !== undefined) data.actualSaturatedFat = actualSaturatedFat != null ? Number(actualSaturatedFat) : null;
    if (actualCarbs !== undefined) data.actualCarbs = actualCarbs != null ? Number(actualCarbs) : null;
    if (actualFiber !== undefined) data.actualFiber = actualFiber != null ? Number(actualFiber) : null;
    if (actualSugars !== undefined) data.actualSugars = actualSugars != null ? Number(actualSugars) : null;
    if (actualAddedSugars !== undefined) data.actualAddedSugars = actualAddedSugars != null ? Number(actualAddedSugars) : null;
    if (actualProtein !== undefined) data.actualProtein = actualProtein != null ? Number(actualProtein) : null;
    if (actualSodium !== undefined) data.actualSodium = actualSodium != null ? Number(actualSodium) : null;

    const iter = await prisma.rdIteration.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(iter);
  } catch {
    return NextResponse.json({ error: "Failed to update nutritional actuals" }, { status: 500 });
  }
}
