import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const rule = await prisma.taskRule.findUnique({ where: { id: params.id } });
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!rule.isArchived) return NextResponse.json({ error: "Rule is not archived" }, { status: 400 });

    const updated = await prisma.taskRule.update({
      where: { id: params.id },
      data: { isArchived: false, archivedAt: null, isActive: false },
      include: {
        facility: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("POST /api/task-rules/[id]/restore:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
