import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const original = await prisma.batchSheetTemplate.findUnique({
      where: { id: params.id },
    });
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const copy = await prisma.batchSheetTemplate.create({
      data: {
        name: `Copy of ${original.name}`,
        description: original.description,
        isActive: false,
        ingredients: original.ingredients ?? [],
        packaging: original.packaging ?? [],
        ovensAvailable: original.ovensAvailable ?? [],
        calibrationWeights: original.calibrationWeights ?? [],
        ccpSettings: original.ccpSettings ?? {},
        releaseChecklistItems: original.releaseChecklistItems ?? [],
        createdById: session.user.id,
      },
    });

    return NextResponse.json(copy, { status: 201 });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal server error", detail }, { status: 500 });
  }
}
