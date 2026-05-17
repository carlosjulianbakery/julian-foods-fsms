export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "1" || session.user.role === "OPERATOR";
  const status = searchParams.get("status");

  const tasks = await prisma.task.findMany({
    where: {
      ...(mine && { assignedToId: session.user.id }),
      ...(status && status !== "ALL" && { status }),
    },
    orderBy: { dueDate: "asc" },
    include: {
      assignedTo: { select: { name: true } },
      form: { select: { title: true } },
    },
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const {
      title, description, assignedToId, priority, dueDate,
      recurrence, formId, location,
    } = await req.json();

    if (!title || !assignedToId || !dueDate) {
      return NextResponse.json({ error: "Title, assignee, and due date are required." }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        assignedToId,
        priority: priority ?? "MEDIUM",
        dueDate: new Date(dueDate),
        recurrence: recurrence ?? "NONE",
        formId: formId || null,
        location: location || null,
        createdById: session.user.id,
        status: "PENDING",
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "TASK_CREATED",
        entity: "Task",
        entityId: task.id,
        userId: session.user.id,
        userName: session.user.name ?? "Unknown",
        details: { title, assignedToId },
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create task." }, { status: 500 });
  }
}
