export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/tasks";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const today = getPacificToday();
  const todayStr = today.toISOString().split("T")[0];
  const weekEnd = new Date(today);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const [overdueCount, todayCount, thisWeekCount, activeInstances] = await Promise.all([
    prisma.taskInstance.count({ where: { status: "overdue" } }),
    prisma.taskInstance.count({
      where: { status: "pending", dueDate: today },
    }),
    prisma.taskInstance.count({
      where: {
        status: { in: ["pending", "overdue"] },
        dueDate: { gte: today, lte: weekEnd },
      },
    }),
    prisma.taskInstance.findMany({
      where: {
        status: { in: ["pending", "overdue"] },
        dueDate: { lte: weekEnd },
      },
      select: { assignedTo: true, status: true, dueDate: true },
    }),
  ]);

  const byAssigneeMap = new Map<string, { userId: string; name: string; overdue: number; today: number }>();

  for (const inst of activeInstances) {
    const at = inst.assignedTo as Array<{ id: string; name: string }>;
    const instDueDateStr = inst.dueDate.toISOString().split("T")[0];

    for (const user of at) {
      if (!byAssigneeMap.has(user.id)) {
        byAssigneeMap.set(user.id, { userId: user.id, name: user.name, overdue: 0, today: 0 });
      }
      const entry = byAssigneeMap.get(user.id)!;
      if (inst.status === "overdue") entry.overdue++;
      if (inst.status === "pending" && instDueDateStr === todayStr) entry.today++;
    }
  }

  const byAssignee = Array.from(byAssigneeMap.values()).sort((a, b) => b.overdue - a.overdue);

  return NextResponse.json({
    overdue: overdueCount,
    today: todayCount,
    this_week: thisWeekCount,
    by_assignee: byAssignee,
  });
}
