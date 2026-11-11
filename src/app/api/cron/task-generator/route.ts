import { NextRequest, NextResponse } from "next/server";
import { generateInstances, updateStatuses, generateCalendarInstances } from "@/lib/task-generator";
import { sendReminders } from "@/lib/task-reminders";
import { sendEscalations } from "@/lib/task-escalation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasBearer = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron && !hasBearer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "true";

  try {
    // Generation and status must run first (sequential); reminders depend on up-to-date statuses
    const [genResult, calResult] = await Promise.all([
      generateInstances(),
      generateCalendarInstances({ dryRun }),
    ]);
    const statusResult = await updateStatuses();

    // Reminders and escalations run after statuses are refreshed
    let reminderResult = { dueSoon: 0, dueToday: 0, overdue: 0 };
    let escalationResult = { escalated: 0 };
    try {
      reminderResult = await sendReminders({ dryRun });
    } catch (e) {
      console.error("[task-generator] reminders error:", e);
    }
    try {
      escalationResult = await sendEscalations({ dryRun });
    } catch (e) {
      console.error("[task-generator] escalation error:", e);
    }

    const summary = {
      ok: true,
      dryRun,
      recurring: { created: genResult.created },
      calendar: {
        totalCreated: calResult.totalCreated,
        totalSkipped: calResult.totalSkipped,
        totalFlagged: calResult.totalFlagged,
        facilities: calResult.results,
      },
      statusUpdates: statusResult.updated,
      reminders: reminderResult,
      escalations: escalationResult,
    };

    console.log("[task-generator]", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[task-generator] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
