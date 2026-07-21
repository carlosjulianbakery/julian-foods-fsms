import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { servingSizeG, servingSizeLabel, servingsPerContainer, calculatedAddedSugars } = body as {
      servingSizeG: number | null;
      servingSizeLabel: string | null;
      servingsPerContainer: number | null;
      calculatedAddedSugars: number | null;
    };

    const iter = await prisma.rdIteration.update({
      where: { id: params.id },
      data: {
        servingSizeG: servingSizeG != null ? servingSizeG : null,
        servingSizeLabel: servingSizeLabel ?? null,
        servingsPerContainer: servingsPerContainer != null ? servingsPerContainer : null,
        calculatedAddedSugars: calculatedAddedSugars != null ? calculatedAddedSugars : null,
      },
    });
    return NextResponse.json(iter);
  } catch {
    return NextResponse.json({ error: "Failed to update serving settings" }, { status: 500 });
  }
}
