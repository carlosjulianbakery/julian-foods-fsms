import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeDueDates, generateInstances } from "@/lib/task-generator";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import { generateCalendarInstances } from "@/lib/calendar-generator";

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

    // Block facility change if rule has any instances (would rewrite all history)
    if (facilityId !== undefined) {
      const instanceCount = await prisma.ruleInstance.count({ where: { ruleId: params.id } });
      if (instanceCount > 0) {
        return NextResponse.json(
          { error: "Cannot change the facility on a rule that already has task instances. Archive this rule and create a new one for the new facility." },
          { status: 400 }
        );
      }
    }

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

    // ── Deactivation: skip scheduled, flag active work for admin review ─────
    if (isActive === false) {
      const [toSkip, toFlag] = await Promise.all([
        prisma.ruleInstance.findMany({
          where: { ruleId: params.id, status: { in: ["UPCOMING", "DUE_TODAY"] } },
          select: { id: true },
        }),
        prisma.ruleInstance.findMany({
          where: { ruleId: params.id, status: { in: ["OVERDUE", "IN_PROGRESS"] } },
          select: { id: true },
        }),
      ]);
      const ops = [];
      const now = new Date();
      const userId = (session.user as { id: string }).id;
      if (toSkip.length > 0) {
        ops.push(
          prisma.ruleInstance.updateMany({
            where: { id: { in: toSkip.map((i) => i.id) } },
            data: { status: "SKIPPED", skippedAt: now, skippedById: userId, skipReason: "Rule deactivated" },
          }),
          // Freeze owner on instances that haven't had it set yet
          prisma.ruleInstance.updateMany({
            where: { id: { in: toSkip.map((i) => i.id) }, ownerUserId: null },
            data: { ownerUserId: rule.ownerId },
          }),
          ...toSkip.map((i) =>
            prisma.taskInstanceAudit.create({
              data: { instanceId: i.id, action: "auto_skipped", note: "Rule deactivated by admin" },
            })
          )
        );
      }
      if (toFlag.length > 0) {
        ops.push(
          prisma.ruleInstance.updateMany({
            where: { id: { in: toFlag.map((i) => i.id) } },
            data: { needsAdminReview: true, reviewReason: "Rule deactivated while open" },
          }),
          ...toFlag.map((i) =>
            prisma.taskInstanceAudit.create({
              data: { instanceId: i.id, action: "flagged_for_review", note: "Rule deactivated while instance was open" },
            })
          )
        );
      }
      if (ops.length > 0) await prisma.$transaction(ops);
    }

    // ── Recurrence change: skip orphaned open instances, generate new ones ─
    if (
      rule.triggerType === "RECURRING" &&
      rule.isActive &&
      (recurrenceStart !== undefined || recurrenceUnit !== undefined || recurrenceEvery !== undefined)
    ) {
      const today = getPacificToday();
      const horizon = addDaysToDateStr(today, 30);
      const expectedDates = new Set(computeDueDates(rule, today, horizon));

      const openInstances = await prisma.ruleInstance.findMany({
        where: {
          ruleId: params.id,
          status: { in: ["UPCOMING", "DUE_TODAY"] },
        },
        select: { id: true, dueDate: true },
      });

      const toSkip = openInstances.filter(
        (i) => !expectedDates.has(i.dueDate.toISOString().slice(0, 10))
      );

      if (toSkip.length > 0) {
        const now = new Date();
        const userId = (session.user as { id: string }).id;
        await prisma.$transaction([
          prisma.ruleInstance.updateMany({
            where: { id: { in: toSkip.map((i) => i.id) } },
            data: { status: "SKIPPED", skippedAt: now, skippedById: userId, skipReason: "Rule changed" },
          }),
          prisma.ruleInstance.updateMany({
            where: { id: { in: toSkip.map((i) => i.id) }, ownerUserId: null },
            data: { ownerUserId: rule.ownerId },
          }),
          ...toSkip.map((i) =>
            prisma.taskInstanceAudit.create({
              data: { instanceId: i.id, action: "auto_skipped", note: "Rule recurrence changed by admin" },
            })
          ),
        ]);
      }

      // Generate new instances for the updated schedule (idempotent — skipDuplicates)
      await generateInstances();
    }

    let generatorResult: { created: number; facilityName: string } | null = null;
    if (
      rule.isActive &&
      (rule.triggerType === "PRODUCTION_DAY" || rule.triggerType === "PRODUCTION_PRODUCT")
    ) {
      try {
        const genResult = await generateCalendarInstances({ facilityId: rule.facilityId });
        const fac = genResult.results.find((r) => r.facilityId === rule.facilityId);
        generatorResult = { created: fac?.created ?? 0, facilityName: fac?.facilityName ?? "" };
      } catch (genErr) {
        console.error("[task-rules PATCH] calendar generator error:", genErr);
      }
    }

    return NextResponse.json({ ...rule, generatorResult });
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

    const [toSkip, toFlag] = await Promise.all([
      prisma.ruleInstance.findMany({
        where: { ruleId: params.id, status: { in: ["UPCOMING", "DUE_TODAY"] } },
        select: { id: true },
      }),
      prisma.ruleInstance.findMany({
        where: { ruleId: params.id, status: { in: ["OVERDUE", "IN_PROGRESS"] } },
        select: { id: true },
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops: any[] = [
      prisma.taskRule.update({
        where: { id: params.id },
        data: { isActive: false, isArchived: true, archivedAt: now },
      }),
      ...toSkip.map((inst) =>
        prisma.ruleInstance.update({
          where: { id: inst.id },
          data: { status: "SKIPPED", skippedAt: now, skippedById: userId, skipReason: "Rule archived", ownerUserId: rule.ownerId },
        })
      ),
      ...toSkip.map((inst) =>
        prisma.taskInstanceAudit.create({
          data: { instanceId: inst.id, action: "auto_skipped", userId, note: "Rule archived by admin" },
        })
      ),
      ...toFlag.map((inst) =>
        prisma.ruleInstance.update({
          where: { id: inst.id },
          data: { needsAdminReview: true, reviewReason: "Rule deactivated while open" },
        })
      ),
      ...toFlag.map((inst) =>
        prisma.taskInstanceAudit.create({
          data: { instanceId: inst.id, action: "flagged_for_review", userId, note: "Rule archived while instance was open" },
        })
      ),
    ];

    await prisma.$transaction(ops);

    return NextResponse.json({ deleted: false, archived: true, skipped: toSkip.length, flagged: toFlag.length });
  } catch (err) {
    console.error("DELETE /api/task-rules/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
