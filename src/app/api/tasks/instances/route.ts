export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const myTasks = searchParams.get("my_tasks") === "true";
  const status = searchParams.get("status");
  const dueDateFrom = searchParams.get("due_date_from");
  const dueDateTo = searchParams.get("due_date_to");
  const category = searchParams.get("category");
  const assignedToFilter = searchParams.get("assigned_to");

  const instances = await prisma.taskInstance.findMany({
    where: {
      ...(status && { status: status as any }),
      ...(dueDateFrom && { dueDate: { gte: new Date(dueDateFrom + "T00:00:00Z") } }),
      ...(dueDateTo && { dueDate: { lte: new Date(dueDateTo + "T00:00:00Z") } }),
      ...(category && { category }),
    },
    include: {
      template: { select: { id: true, title: true, recurrenceType: true, isActive: true } },
      completedBy: { select: { id: true, name: true } },
      skippedBy: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  let filtered = instances;

  if (myTasks) {
    filtered = filtered.filter((inst) => {
      const at = inst.assignedTo as Array<{ id: string }>;
      return at.some((u) => u.id === session.user.id);
    });
  }

  if (assignedToFilter) {
    filtered = filtered.filter((inst) => {
      const at = inst.assignedTo as Array<{ id: string }>;
      return at.some((u) => u.id === assignedToFilter);
    });
  }

  return NextResponse.json(filtered);
}
