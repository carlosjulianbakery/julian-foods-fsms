export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const task = await prisma.task.findUnique({ where: { id: params.id } });
    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

    const isSupervisor = session.user.role === "ADMIN" || session.user.role === "SUPERVISOR";
    const isAssignee = task.assignedToId === session.user.id;
    if (!isSupervisor && !isAssignee) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { status } = body;

    const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const updated = await prisma.task.update({
      where: { id: params.id },
      data: {
        ...(status && { status }),
        ...(status === "COMPLETED" && { completedAt: new Date() }),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "TASK_UPDATED",
        entity: "Task",
        entityId: task.id,
        userId: session.user.id,
        userName: session.user.name ?? "Unknown",
        details: { changes: body },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.task.update({ where: { id: params.id }, data: { status: "CANCELLED" } });
  return NextResponse.json({ success: true });
}
