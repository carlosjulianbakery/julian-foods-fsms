export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await prisma.taskTemplate.findUnique({
    where: { id: params.id },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { instances: true } },
    },
  });

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(template);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const template = await prisma.taskTemplate.findUnique({ where: { id: params.id } });
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
      isActive,
    } = body;

    const updated = await prisma.taskTemplate.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(priority !== undefined && { priority }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(taskType !== undefined && { taskType }),
        ...(formLink !== undefined && { formLink }),
        ...(recurrenceType !== undefined && { recurrenceType }),
        ...(recurrenceConfig !== undefined && { recurrenceConfig }),
        ...(firstDueDate !== undefined && { firstDueDate: new Date(firstDueDate + "T00:00:00Z") }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const template = await prisma.taskTemplate.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { instances: true } },
      },
    });
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";
    const deactivate = searchParams.get("deactivate") === "true";

    const [completedCount, skippedCount] = await Promise.all([
      prisma.taskInstance.count({ where: { templateId: params.id, status: "complete" } }),
      prisma.taskInstance.count({ where: { templateId: params.id, status: "skipped" } }),
    ]);

    const hasHistory = completedCount > 0 || skippedCount > 0;

    if (hasHistory && !force && !deactivate) {
      return NextResponse.json(
        { conflict: true, completedCount, skippedCount },
        { status: 409 }
      );
    }

    if (deactivate) {
      const updated = await prisma.taskTemplate.update({
        where: { id: params.id },
        data: { isActive: false },
      });
      return NextResponse.json(updated);
    }

    await prisma.taskTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
