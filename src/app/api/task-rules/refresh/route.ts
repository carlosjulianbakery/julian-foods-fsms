import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateCalendarInstances } from "@/lib/calendar-generator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "true";

  const isProduction = process.env.VERCEL_ENV === "production";
  if (!isProduction && !dryRun) {
    return NextResponse.json(
      { error: "Writes disabled outside production. Use ?dryRun=true to preview." },
      { status: 403 }
    );
  }

  let facilityId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    facilityId = (body as { facilityId?: string }).facilityId ?? undefined;
  } catch {
    // no body — run all facilities
  }

  try {
    const result = await generateCalendarInstances({
      dryRun,
      facilityId,
      invalidateCache: true,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[task-rules/refresh]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
