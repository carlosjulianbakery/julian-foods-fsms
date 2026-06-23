export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateNextInstance, formatTaskDate } from "@/lib/tasks";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const instance = await prisma.taskInstance.findUnique({
      where: { id: params.id },
      include: { template: true },
    });

    if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const assignedTo = instance.assignedTo as Array<{ id: string }>;
    const isAssigned = assignedTo.some((u) => u.id === session.user.id);
    const isAdmin = session.user.role === "ADMIN";

    if (!isAssigned && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (instance.status === "complete" || instance.status === "skipped") {
      return NextResponse.json({ error: "Instance already resolved" }, { status: 400 });
    }

    const body = await req.json();
    const reason: string | undefined = body.reason;

    if (!reason) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const now = new Date();

    const updated = await prisma.taskInstance.update({
      where: { id: params.id },
      data: {
        status: "skipped",
        skippedById: session.user.id,
        skippedAt: now,
        skipReason: reason,
      },
    });

    await prisma.taskHistory.create({
      data: {
        instanceId: params.id,
        action: "skipped",
        performedById: session.user.id,
        note: reason,
      },
    });

    const tmpl = instance.template;
    const nextInstance = await generateNextInstance(
      {
        id: tmpl.id,
        title: tmpl.title,
        description: tmpl.description,
        category: tmpl.category as string,
        priority: tmpl.priority as string,
        assignedTo: tmpl.assignedTo,
        taskType: tmpl.taskType as string,
        formLink: tmpl.formLink,
        recurrenceType: tmpl.recurrenceType as string,
        recurrenceConfig: tmpl.recurrenceConfig,
      },
      { dueDate: new Date(instance.dueDate), instanceNumber: instance.instanceNumber },
      prisma as any,
      session.user.id
    );

    return NextResponse.json({
      instance: updated,
      nextDueDate: nextInstance ? formatTaskDate(new Date(nextInstance.dueDate)) : null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to skip task" }, { status: 500 });
  }
}
