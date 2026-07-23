import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  initializeCleaningItems,
  computeProgress,
  formatMonthLabel,
  currentMonthKey,
  nextMonthKey,
} from "@/lib/monthly-cleaning-items";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET ?? "julian-cron-secret";
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if today is actually the last day of the month
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isLastDay = tomorrow.getDate() === 1;
  if (!isLastDay) {
    return NextResponse.json({ skipped: true, reason: "Not the last day of the month" });
  }

  try {
    const monthKey = currentMonthKey();
    const monthLabel = formatMonthLabel(monthKey);
    let draft = await prisma.monthlyCleaningDraft.findUnique({ where: { monthKey } });
    const now2 = new Date();

    if (!draft) {
      // No draft started — create and immediately submit
      draft = await prisma.monthlyCleaningDraft.create({
        data: {
          monthKey,
          status: "submitted",
          submittedAt: now2,
          submittedBy: "auto",
          items: initializeCleaningItems() as object[],
        },
      });
    } else if (draft.status === "draft") {
      draft = await prisma.monthlyCleaningDraft.update({
        where: { id: draft.id },
        data: { status: "submitted", submittedAt: now2, submittedBy: "auto" },
      });
    }

    const progress = computeProgress(draft.items);
    console.log(
      `[auto-submit] Monthly Cleaning for ${monthLabel} submitted. ` +
        `${progress.overall.checked}/${progress.overall.total} items completed.`
    );

    // Create next month's draft
    const nextKey = nextMonthKey(monthKey);
    const existing = await prisma.monthlyCleaningDraft.findUnique({ where: { monthKey: nextKey } });
    if (!existing) {
      await prisma.monthlyCleaningDraft.create({
        data: { monthKey: nextKey, status: "draft", items: initializeCleaningItems() as object[] },
      });
    }

    return NextResponse.json({
      success: true,
      monthLabel,
      progress,
      message: `Monthly Cleaning form for ${monthLabel} was auto-submitted. ${progress.overall.checked} of ${progress.overall.total} items were completed.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/forms/monthly-cleaning/auto-submit]", msg);
    return NextResponse.json({ error: "Failed to auto-submit" }, { status: 500 });
  }
}
