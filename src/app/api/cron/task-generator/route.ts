import { NextRequest, NextResponse } from "next/server";
import { generateInstances, updateStatuses, generateCalendarInstances } from "@/lib/task-generator";

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
    const [genResult, calResult, statusResult] = await Promise.all([
      generateInstances(),
      generateCalendarInstances({ dryRun }),
      updateStatuses(),
    ]);

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
    };

    console.log("[task-generator]", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[task-generator] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
