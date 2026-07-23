import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeProgress, formatMonthLabel } from "@/lib/monthly-cleaning-items";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN" && role !== "SUPERVISOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const records = await prisma.monthlyCleaningDraft.findMany({
      orderBy: { monthKey: "desc" },
    });
    return NextResponse.json(
      records.map((r) => ({
        id: r.id,
        monthKey: r.monthKey,
        monthLabel: formatMonthLabel(r.monthKey),
        status: r.status,
        submittedAt: r.submittedAt,
        submittedBy: r.submittedBy,
        progress: computeProgress(r.items),
      }))
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/forms/monthly-cleaning/history]", msg);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
