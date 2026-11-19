import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPacificMonthKey, lastDayOfMonth } from "@/lib/pacific-time";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { cronGate } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// Schedule: "10 8 1-3 * *"  (08:10 UTC on days 1–3 of every month)
// In Pacific time: 00:10 or 01:10 on the 1st — after midnight, DST-safe.
// Idempotent: re-running on days 2 or 3 changes nothing.
// Processes every unsubmitted, STARTED 624 draft whose month < current Pacific month.
// "Started" = at least one line is not UNTOUCHED.
// A draft where ALL lines are UNTOUCHED is NOT auto-submitted.

type LineRecord = {
  key: string;
  labelEn: string;
  labelEs: string;
  chemical: string | null;
  state: string;
  reason: string | null;
  lineDate: string | null;
  lineInitials: string | null;
  doneByUserId: string | null;
  updatedAt: string;
  autoFilled: boolean;
};

export async function POST(req: NextRequest) {
  const denied = cronGate(req);
  if (denied) return denied;

  const currentMonth = getPacificMonthKey();
  const now = new Date();

  try {
    // Find all draft 624 records for months before the current Pacific month
    const drafts = await prisma.monthlyClean624Record.findMany({
      where: {
        facility: "624",
        status: "draft",
        month: { lt: currentMonth },
      },
    });

    const results: { month: string; action: string; completedInstanceId: string | null }[] = [];

    for (const draft of drafts) {
      const lines = draft.lines as LineRecord[];

      // Skip entirely if no lines have been started
      const hasStarted = lines.some((l) => l.state !== "UNTOUCHED");
      if (!hasStarted) {
        results.push({ month: draft.month, action: "skipped_not_started", completedInstanceId: null });
        continue;
      }

      // Fill UNTOUCHED lines with NOT_DONE + autoFilled
      const autoFilledCount = lines.filter((l) => l.state === "UNTOUCHED").length;
      const filledLines: LineRecord[] = lines.map((l) => {
        if (l.state !== "UNTOUCHED") return l;
        return {
          ...l,
          state: "NOT_DONE",
          reason: "Not completed by month end (auto-submitted)",
          lineDate: null,
          lineInitials: null,
          updatedAt: now.toISOString(),
          autoFilled: true,
        };
      });

      const doneCount     = filledLines.filter((l) => l.state === "DONE").length;
      const naCount       = filledLines.filter((l) => l.state === "NA").length;
      const notDoneCount  = filledLines.filter((l) => l.state === "NOT_DONE").length;

      const updated = await prisma.monthlyClean624Record.update({
        where: { id: draft.id },
        data: {
          status:       "submitted",
          conductedBy:  "Auto-submitted",
          submittedAt:  now,
          submittedById: null,
          autoSubmitted: true,
          lines:        filledLines as never,
          doneCount,
          naCount,
          notDoneCount,
        },
      });

      // Complete the task instance for this month
      let completedInstanceId: string | null = null;
      try {
        const lastDay = lastDayOfMonth(draft.month);
        completedInstanceId = await completeRuleInstanceForSubmission({
          formKey:        "monthly_cleaning_624",
          facilityName:   "624",
          submissionId:   updated.id,
          userId:         "auto",
          submissionDate: lastDay,
          prismaClient:   prisma as never,
        });

        // If any lines were auto-filled, flag the instance for admin review
        if (autoFilledCount > 0 && completedInstanceId) {
          await prisma.ruleInstance.update({
            where: { id: completedInstanceId },
            data: {
              needsAdminReview: true,
              reviewReason: `Auto-submitted: ${autoFilledCount} line(s) filled as NOT_DONE`,
            },
          });
        }
      } catch (e) {
        console.error(`[monthly-624-auto-submit] task completion error for ${draft.month}:`, e);
      }

      console.log(`[monthly-624-auto-submit] auto-submitted ${draft.month}: ${doneCount}D/${naCount}N/${notDoneCount}X, ${autoFilledCount} auto-filled`);
      results.push({ month: draft.month, action: "auto_submitted", completedInstanceId });
    }

    return NextResponse.json({ success: true, currentMonth, processed: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[monthly-624-auto-submit] error:", msg);
    return NextResponse.json({ error: "Auto-submit failed", detail: msg }, { status: 500 });
  }
}

// Vercel cron invokes routes with GET; the handler was POST-only and so was never reached.
export const GET = POST;
