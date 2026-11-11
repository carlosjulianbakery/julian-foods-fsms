import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ count: 0 });

  const today = getPacificToday();
  const sevenDaysAgo = addDaysToDateStr(today, -7);

  const count = await prisma.ruleInstance.count({
    where: {
      status: "MISSED",
      markedMissedAt: { gte: new Date(`${sevenDaysAgo}T00:00:00Z`) },
    },
  });

  return NextResponse.json({ count });
}
