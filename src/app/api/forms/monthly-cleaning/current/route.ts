import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  initializeCleaningItems,
  computeProgress,
  formatMonthLabel,
  currentMonthKey,
} from "@/lib/monthly-cleaning-items";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN" && role !== "SUPERVISOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const monthKey = currentMonthKey();
    let draft = await prisma.monthlyCleaningDraft.findUnique({ where: { monthKey } });
    if (!draft) {
      draft = await prisma.monthlyCleaningDraft.create({
        data: { monthKey, status: "draft", items: initializeCleaningItems() as object[] },
      });
    }
    return NextResponse.json({
      ...draft,
      monthLabel: formatMonthLabel(draft.monthKey),
      progress: computeProgress(draft.items),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/forms/monthly-cleaning/current]", msg);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
