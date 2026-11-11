import { NextRequest, NextResponse } from "next/server";
import { generateInstances, updateStatuses } from "@/lib/task-generator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasBearer = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron && !hasBearer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [genResult, statusResult] = await Promise.all([
      generateInstances(),
      updateStatuses(),
    ]);

    console.log(
      "[task-generator] created:",
      genResult.created,
      "status updates:",
      statusResult.updated
    );

    return NextResponse.json({
      ok: true,
      created: genResult.created,
      updated: statusResult.updated,
    });
  } catch (err) {
    console.error("[task-generator] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
