import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ count: 0, hasOverdue: false });

  const userId = session.user.id;
  // Count for current user's own rules only (admins see only their own badge, per spec)
  const instances = await prisma.ruleInstance.findMany({
    where: {
      rule: { ownerId: userId },
      status: { in: ["DUE_TODAY", "OVERDUE", "IN_PROGRESS", "MISSED"] },
    },
    select: { status: true },
  });

  const hasOverdue = instances.some((i) => i.status === "OVERDUE" || i.status === "MISSED");
  return NextResponse.json({ count: instances.length, hasOverdue });
}
