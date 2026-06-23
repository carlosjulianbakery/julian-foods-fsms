export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/tasks";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const today = getPacificToday();
  const todayStr = today.toISOString().split("T")[0];

  const upcoming6Days = new Date(today);
  upcoming6Days.setUTCDate(upcoming6Days.getUTCDate() + 30);

  const all = await prisma.taskInstance.findMany({
    where: {
      status: { in: ["pending", "overdue"] },
      dueDate: { lte: upcoming6Days },
    },
    include: {
      template: { select: { id: true, recurrenceType: true, isActive: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  const mine = all.filter((inst) => {
    const at = inst.assignedTo as Array<{ id: string }>;
    return at.some((u) => u.id === userId);
  });

  const overdue = mine.filter((inst) => inst.status === "overdue");
  const todayItems = mine.filter((inst) => {
    return inst.status === "pending" && inst.dueDate.toISOString().split("T")[0] === todayStr;
  });
  const upcoming = mine
    .filter((inst) => {
      return inst.status === "pending" && inst.dueDate.toISOString().split("T")[0] > todayStr;
    })
    .slice(0, 5);

  return NextResponse.json({ overdue, today: todayItems, upcoming });
}
