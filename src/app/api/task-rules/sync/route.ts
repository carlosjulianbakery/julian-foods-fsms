import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCalendarInstances } from "@/lib/calendar-generator";
import { updateStatuses } from "@/lib/task-generator";
import { reconcileBatchSheetTasks } from "@/lib/batch-sheet-reconcile";

export const dynamic = "force-dynamic";

const SYNC_THROTTLE_MS = 60_000;
// Stable advisory lock key for calendar sync mutual exclusion
const ADVISORY_LOCK_KEY = 1_234_567_890;

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ ran: false, error: "Unauthorized" }, { status: 401 });

  // Keep stored statuses current even if the nightly cron misses a day (Pacific dates; two cheap updates)
  await updateStatuses().catch((e) => console.error("[task-rules/sync] updateStatuses:", e));

  try {
    // Throttle: check most-recent lastCalendarSyncAt across all facilities
    const agg = await prisma.facility.aggregate({ _max: { lastCalendarSyncAt: true } });
    const lastSync = agg._max.lastCalendarSyncAt;
    if (lastSync && Date.now() - lastSync.getTime() < SYNC_THROTTLE_MS) {
      return NextResponse.json({
        ran: false,
        reason: "throttled",
        lastSyncAt: lastSync.toISOString(),
      });
    }

    // Advisory lock + timestamp update in one transaction
    // Returns false if another caller holds the lock right now
    const acquired = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRawUnsafe<[{ acquired: boolean }]>(
        `SELECT pg_try_advisory_xact_lock($1) AS acquired`,
        ADVISORY_LOCK_KEY,
      );
      if (!row.acquired) return false;

      await tx.facility.updateMany({ data: { lastCalendarSyncAt: new Date() } });
      return true;
    });

    if (!acquired) {
      return NextResponse.json({ ran: false, reason: "locked" });
    }

    // Run generator OUTSIDE the transaction (lock already released)
    const result = await generateCalendarInstances({ invalidateCache: false });

    // Link any batch sheet that has no task link yet (self-healing; changes nothing when all are linked)
    const sweep = await reconcileBatchSheetTasks({ prismaClient: prisma, source: "calendar sync" }).catch((e) => {
      console.error("[task-rules/sync] batch sheet sweep:", e);
      return null;
    });

    const lastSyncAt = (
      await prisma.facility.aggregate({ _max: { lastCalendarSyncAt: true } })
    )._max.lastCalendarSyncAt;

    return NextResponse.json({
      ran: true,
      created: result.totalCreated,
      deleted: result.totalDeleted,
      flagged: result.totalFlagged,
      batchSheetsLinked: sweep?.completed.length ?? 0,
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[task-rules/sync]", err);
    return NextResponse.json({ ran: false, error: "Internal server error" }, { status: 500 });
  }
}
