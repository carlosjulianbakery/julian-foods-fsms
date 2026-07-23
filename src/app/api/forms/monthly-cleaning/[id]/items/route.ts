import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeProgress } from "@/lib/monthly-cleaning-items";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN" && role !== "SUPERVISOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const existing = await prisma.monthlyCleaningDraft.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "draft") return NextResponse.json({ error: "Form already submitted" }, { status: 409 });

    const body = await req.json();
    const { items } = body as { items: unknown[] };

    const updated = await prisma.monthlyCleaningDraft.update({
      where: { id: params.id },
      data: { items: items as object[], lastEditedBy: userId, lastEditedAt: new Date() },
    });
    return NextResponse.json({ progress: computeProgress(updated.items), updatedAt: updated.updatedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /api/forms/monthly-cleaning/[id]/items]", msg);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
