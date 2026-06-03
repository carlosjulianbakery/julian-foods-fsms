import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const existing = await prisma.monthlyCleaningChecklist.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    await prisma.monthlyCleaningChecklist.delete({ where: { id: params.id } });

    console.log(`[DELETE /api/cleaning/monthly/${params.id}] Deleted by admin ${session.user.email}`);
    return NextResponse.json({ success: true, deleted_id: params.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DELETE /api/cleaning/monthly/${params.id}]`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
