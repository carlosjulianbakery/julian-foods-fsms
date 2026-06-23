export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/tasks";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.taskTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      instances: {
        where: { status: { in: ["pending", "overdue"] } },
        orderBy: { dueDate: "asc" },
        take: 1,
        select: { dueDate: true, status: true },
      },
    },
  });

  const result = templates.map((t) => ({
    ...t,
    nextDue: t.instances[0]?.dueDate ?? null,
    instances: undefined,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const {
      title,
      description,
      category,
      priority,
      assignedTo,
      taskType,
      formLink,
      recurrenceType,
      recurrenceConfig,
      firstDueDate,
    } = body;

    if (!title || !category || !recurrenceType || !firstDueDate || !assignedTo) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const userIds: string[] = Array.isArray(assignedTo) ? assignedTo : [];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];

    const assignedToSnapshot = users.map((u) => ({ id: u.id, name: u.name }));

    const dueDateUTC = new Date(firstDueDate + "T00:00:00Z");

    const template = await prisma.taskTemplate.create({
      data: {
        title,
        description: description ?? null,
        category,
        priority: priority ?? "normal",
        assignedTo: userIds,
        taskType: taskType ?? "manual",
        formLink: formLink ?? null,
        recurrenceType,
        recurrenceConfig: recurrenceConfig ?? null,
        firstDueDate: dueDateUTC,
        isActive: true,
        createdById: session.user.id,
      },
    });

    const instance = await prisma.taskInstance.create({
      data: {
        templateId: template.id,
        title,
        description: description ?? null,
        category,
        priority: priority ?? "normal",
        assignedTo: assignedToSnapshot,
        taskType: taskType ?? "manual",
        formLink: formLink ?? null,
        dueDate: dueDateUTC,
        status: "pending",
        instanceNumber: 1,
      },
    });

    await prisma.taskHistory.create({
      data: {
        instanceId: instance.id,
        action: "created",
        performedById: session.user.id,
        note: "Task created",
      },
    });

    return NextResponse.json({ template, instance }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create task template" }, { status: 500 });
  }
}
