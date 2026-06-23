export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const instance = await prisma.taskInstance.findUnique({
    where: { id: params.id },
    include: {
      template: true,
      completedBy: { select: { id: true, name: true } },
      skippedBy: { select: { id: true, name: true } },
      history: {
        orderBy: { performedAt: "asc" },
        include: { performedBy: { select: { id: true, name: true } } },
      },
    },
  });

  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(instance);
}
