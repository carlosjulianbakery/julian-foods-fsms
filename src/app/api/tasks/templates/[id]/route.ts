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

    const recurrenceChanged =
      (recurrenceType !== undefined && recurrenceType !== template.recurrenceType) ||
      (recurrenceConfig !== undefined &&
        JSON.stringify(recurrenceConfig) !== JSON.stringify(template.recurrenceConfig));

    // Resolve assignedTo IDs → {id, name} objects for instance snapshots.
    // Template stores raw ID strings; instances need {id, name} objects
    // (same pattern as POST /api/tasks/templates).
    let assignedToSnapshot: Array<{ id: string; name: string }> | undefined;
    if (assignedTo !== undefined) {
      const userIds: string[] = Array.isArray(assignedTo) ? assignedTo : [];
      if (userIds.length > 0) {
        const resolved = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        });
        assignedToSnapshot = resolved.map((u) => ({ id: u.id, name: u.name ?? "" }));
      } else {
        assignedToSnapshot = [];
      }
    }

    const [updated, syncedCount] = await prisma.$transaction(async (tx) => {
      const tmpl = await tx.taskTemplate.update({
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

      // Sync snapshot fields to all pending/overdue instances.
      // Use assignedToSnapshot ({id,name} objects) instead of raw IDs.
      const snapshotUpdate: Record<string, unknown> = {};
      if (title !== undefined) snapshotUpdate.title = title;
      if (description !== undefined) snapshotUpdate.description = description;
      if (category !== undefined) snapshotUpdate.category = category;
      if (priority !== undefined) snapshotUpdate.priority = priority;
      if (assignedToSnapshot !== undefined) snapshotUpdate.assignedTo = assignedToSnapshot;
      if (taskType !== undefined) snapshotUpdate.taskType = taskType;
      if (formLink !== undefined) snapshotUpdate.formLink = formLink;

      let synced = 0;
      if (Object.keys(snapshotUpdate).length > 0) {
        const result = await tx.taskInstance.updateMany({
          where: { templateId: params.id, status: { in: ["pending", "overdue"] } },
          data: snapshotUpdate,
        });
        synced = result.count;
      }

      // If recurrence changed, update the next future pending instance's dueDate only
      if (recurrenceChanged) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const nextInstance = await tx.taskInstance.findFirst({
          where: { templateId: params.id, status: "pending", dueDate: { gte: today } },
          orderBy: { dueDate: "asc" },
        });

        if (nextInstance) {
          const { calcNextDueDate } = await import("@/lib/tasks");
          const newDue = calcNextDueDate(
            today,
            tmpl.recurrenceType as string,
            tmpl.recurrenceConfig
          );
          if (newDue) {
            await tx.taskInstance.update({
              where: { id: nextInstance.id },
              data: { dueDate: newDue },
            });
          }
        }
      }

      return [tmpl, synced];
    });

    console.log(`[tasks] template ${params.id} updated, synced ${syncedCount} pending/overdue instance(s)`);
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
