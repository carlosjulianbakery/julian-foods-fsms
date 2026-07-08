import { NextResponse } from "next/server";
import { runShipstationSync } from "@/lib/shipstationSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runShipstationSync({ daysBack: 7 });
  return NextResponse.json(result, { status: result.status === "success" ? 200 : 500 });
}
