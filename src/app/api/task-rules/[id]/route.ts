import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const {
      title,
      description,
      facilityId,
      ownerId,
      triggerType,
      recurrenceUnit,
      recurrenceEvery,
      recurrenceStart,
      formKey,
      productName,
      isActive,
    } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (facilityId !== undefined) data.facilityId = facilityId;
    if (ownerId !== undefined) data.ownerId = ownerId;
    if (triggerType !== undefined) data.triggerType = triggerType;
    if (recurrenceUnit !== undefined) data.recurrenceUnit = recurrenceUnit || null;
    if (recurrenceEvery !== undefined) data.recurrenceEvery = parseInt(recurrenceEvery);
    if (recurrenceStart !== undefined) data.recurrenceStart = new Date(recurrenceStart);
    if (formKey !== undefined) data.formKey = formKey || null;
    if (productName !== undefined) data.productName = productName || null;
    if (isActive !== undefined) data.isActive = isActive;

    const rule = await prisma.taskRule.update({
      where: { id: params.id },
      data,
      include: {
        facility: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(rule);
  } catch (err) {
    console.error("PATCH /api/task-rules/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const permanent = new URL(req.url).searchParams.get("permanent") === "true";

  try {
    const rule = await prisma.taskRule.findUnique({
      where: { id: params.id },
      include: { _count: { select: { instances: true } } },
    });
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (rule.formKey === "sop_review") {
      return NextResponse.json(
        { error: "The SOP Review rule is managed by the system and cannot be deleted." },
        { status: 403 }
      );
    }

    // --- Permanent deletion (archived rules only) ---
    if (permanent) {
      if (!rule.isArchived) {
        return NextResponse.json(
          { error: "Only archived rules can be permanently deleted. Archive it first." },
          { status: 400 }
        );
      }

      const instances = await prisma.ruleInstance.findMany({
        where: { ruleId: params.id },
        select: { id: true },
      });
      const instanceIds = instances.map((i) => i.id);

      const [auditCount, notifCount] = await Promise.all([
        prisma.taskInstanceAudit.count({ where: { instanceId: { in: instanceIds } } }),
        prisma.notification.count({ where: { instanceId: { in: instanceIds } } }),
      ]);

      await prisma.$transaction([
        prisma.notification.deleteMany({ where: { instanceId: { in: instanceIds } } }),
        prisma.taskInstanceAudit.deleteMany({ where: { instanceId: { in: instanceIds } } }),
        prisma.ruleInstance.deleteMany({ where: { ruleId: params.id } }),
        prisma.taskRule.delete({ where: { id: params.id } }),
      ]);

      return NextResponse.json({
        permanentlyDeleted: true,
        counts: {
          instances: instanceIds.length,
          auditEntries: auditCount,
          notifications: notifCount,
        },
      });
    }

    // --- Archive (soft-delete) ---
    const instanceCount = rule._count.instances;

    if (instanceCount === 0) {
      await prisma.taskRule.delete({ where: { id: params.id } });
      return NextResponse.json({ deleted: true, archived: false });
    }

    const userId = (session.user as { id: string }).id;
    const now = new Date();

    const openInstances = await prisma.ruleInstance.findMany({
      where: {
        ruleId: params.id,
        status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"] },
      },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.taskRule.update({
        where: { id: params.id },
        data: { isActive: false, isArchived: true, archivedAt: now },
      }),
      ...openInstances.map((inst) =>
        prisma.ruleInstance.update({
          where: { id: inst.id },
          data: { status: "SKIPPED", skippedAt: now, skippedById: userId, skipReason: "Rule archived" },
        })
      ),
      ...openInstances.map((inst) =>
        prisma.taskInstanceAudit.create({
          data: {
            instanceId: inst.id,
            action: "skipped",
            userId,
            note: "Rule archived by admin",
          },
        })
      ),
    ]);

    return NextResponse.json({ deleted: false, archived: true, skipped: openInstances.length });
  } catch (err) {
    console.error("DELETE /api/task-rules/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
