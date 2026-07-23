import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeProgress, formatMonthLabel } from "@/lib/monthly-cleaning-items";

export const dynamic = "force-dynamic";

// GET /api/forms/monthly-cleaning/[id]
// [id] is a monthKey (YYYY-MM format) — fetches a specific month's record for history viewing.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN" && role !== "SUPERVISOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const draft = await prisma.monthlyCleaningDraft.findUnique({ where: { monthKey: params.id } });
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...draft,
      monthLabel: formatMonthLabel(draft.monthKey),
      progress: computeProgress(draft.items),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/forms/monthly-cleaning/[id]]", msg);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
