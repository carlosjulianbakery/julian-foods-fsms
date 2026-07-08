import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runShipstationSync } from "@/lib/shipstationSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { daysBack?: number };
  const daysBack = typeof body.daysBack === "number" ? Math.min(body.daysBack, 365) : 90;

  const result = await runShipstationSync({ daysBack });

  return NextResponse.json(result, { status: result.status === "success" ? 200 : 500 });
}
