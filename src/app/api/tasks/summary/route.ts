export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayCount, overdueCount] = await Promise.all([
    prisma.task.count({
      where: {
        assignedToId: userId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        dueDate: { gte: today, lt: tomorrow },
      },
    }),
    prisma.task.count({
      where: {
        assignedToId: userId,
        dueDate: { lt: today },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    }),
  ]);

  return NextResponse.json({ todayCount, overdueCount });
}
