import { NextRequest, NextResponse } from "next/server";
import { generateInstances, updateStatuses, generateCalendarInstances } from "@/lib/task-generator";
import { sendReminders } from "@/lib/task-reminders";
import { sendEscalations } from "@/lib/task-escalation";
import { cronGate } from "@/lib/cron-auth";
import { reconcileBatchSheetTasks } from "@/lib/batch-sheet-reconcile";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// The calendar generator fetches the production sheet; leave room for a slow fetch.
export const maxDuration = 300;

// Scheduled for 07:00 and 08:00 UTC; only the call that lands in Pacific hour 0 does the work.
export async function GET(req: NextRequest) {
  const denied = cronGate(req, { pacificHour: 0 });
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "true";

  const isProduction = process.env.VERCEL_ENV === "production";
  if (!isProduction && !dryRun) {
    return NextResponse.json(
      { error: "Writes disabled outside production. Use ?dryRun=true to preview." },
      { status: 403 }
    );
  }

  try {
    const errors: string[] = [];

    // 1. Status promotion first — a generation failure must never block it
    const statusResult = dryRun ? { updated: 0 } : await updateStatuses();

    // 2. Generation, each part on its own so one failure does not hide the other
    let recurringCreated = 0;
    if (!dryRun) {
      try {
        recurringCreated = (await generateInstances()).created;
      } catch (e) {
        console.error("[task-generator] recurring generation error:", e);
        errors.push("recurring generation failed");
      }
    }
    let calResult: Awaited<ReturnType<typeof generateCalendarInstances>> | null = null;
    try {
      calResult = await generateCalendarInstances({ dryRun });
    } catch (e) {
      console.error("[task-generator] calendar generation error:", e);
      errors.push("calendar generation failed");
    }

    // 3. Batch sheets that never got linked to their task — before reminders, so nobody is nagged about done work
    let batchSheetsLinked = 0;
    if (!dryRun) {
      try {
        batchSheetsLinked = (await reconcileBatchSheetTasks({ prismaClient: prisma, source: "nightly cron" })).completed.length;
      } catch (e) {
        console.error("[task-generator] batch sheet sweep error:", e);
        errors.push("batch sheet sweep failed");
      }
    }

    // 4. Reminders and escalations run on the refreshed statuses
    let reminderResult = { dueSoon: 0, dueToday: 0, overdue: 0 };
    let escalationResult = { escalated: 0 };
    try {
      reminderResult = await sendReminders({ dryRun });
    } catch (e) {
      console.error("[task-generator] reminders error:", e);
      errors.push("reminders failed");
    }
    try {
      escalationResult = await sendEscalations({ dryRun });
    } catch (e) {
      console.error("[task-generator] escalation error:", e);
      errors.push("escalations failed");
    }

    const summary = {
      ok: errors.length === 0,
      dryRun,
      statusUpdates: statusResult.updated,
      recurring: { created: recurringCreated },
      calendar: calResult
        ? {
            totalCreated: calResult.totalCreated,
            totalDeleted: calResult.totalDeleted,
            totalFlagged: calResult.totalFlagged,
            facilities: calResult.results,
          }
        : null,
      batchSheetsLinked,
      reminders: reminderResult,
      escalations: escalationResult,
      errors,
    };

    console.log("[task-generator]", JSON.stringify(summary));
    return NextResponse.json(summary, { status: errors.length === 0 ? 200 : 207 });
  } catch (err) {
    console.error("[task-generator] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
