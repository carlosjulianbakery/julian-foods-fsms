import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

  try {
    const existing = await prisma.monthlyCleaningDraft.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "draft") return NextResponse.json({ error: "Already submitted" }, { status: 409 });

    const updated = await prisma.monthlyCleaningDraft.update({
      where: { id: params.id },
      data: { status: "submitted", submittedAt: new Date(), submittedBy: userId },
    });
    return NextResponse.json({ success: true, submittedAt: updated.submittedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/forms/monthly-cleaning/[id]/submit]", msg);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}
