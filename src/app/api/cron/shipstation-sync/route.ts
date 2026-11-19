import { NextResponse } from "next/server";
import { runShipstationSync } from "@/lib/shipstationSync";
import { cronGate } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = cronGate(request, { pacificHour: 0 });
  if (denied) return denied;

  const result = await runShipstationSync({ daysBack: 7 });
  return NextResponse.json(result, { status: result.status === "success" ? 200 : 500 });
}
