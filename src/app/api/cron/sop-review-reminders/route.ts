import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { getPacificToday, toPacificDateStr } from "@/lib/pacific-time";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  if (!isVercelCron) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const isProduction = process.env.VERCEL_ENV === "production";
  if (!dryRun && !isProduction) {
    return NextResponse.json({ skipped: true, reason: "not production" });
  }

  try {
    const sopRule = await prisma.taskRule.findFirst({
      where: { formKey: "sop_review" },
      select: { id: true, facilityId: true },
    });
    if (!sopRule) {
      return NextResponse.json({ error: "SOP Review TaskRule not found" }, { status: 500 });
    }

    const today = new Date(getPacificToday() + "T12:00:00Z");
    const msPerDay = 86400000;

    const sops = await prisma.sopDocument.findMany({
      where: { isArchived: false },
      include: { reminders: true },
      orderBy: { title: "asc" },
    });

    const rows: object[] = [];
    let instancesCreated = 0;
    let notificationsSent = 0;

    for (const sop of sops) {
      const daysUntilDue = Math.round(
        (sop.nextReviewAt.getTime() - today.getTime()) / msPerDay
      );
      const stage =
        daysUntilDue <= 0 ? "due" : daysUntilDue <= 30 ? "30d" : daysUntilDue <= 60 ? "60d" : null;

      const instanceLabel = `${sop.title} - Review due`;

      // Find existing open instance for this SOP cycle (by calendarKey = sopId)
      const existingInstance = await prisma.ruleInstance.findFirst({
        where: {
          ruleId: sopRule.id,
          calendarKey: sop.id,
          status: { notIn: ["DONE", "MISSED", "SKIPPED"] },
        },
      });

      // Check existing reminders for active stages
      const existingReminders = sop.reminders.filter(
        (r) => r.cycleStartAt.getTime() === sop.lastReviewedAt.getTime()
      );
      const remindedStages = new Set(existingReminders.map((r) => r.stage));

      rows.push({
        title: sop.title,
        nextReviewAt: toPacificDateStr(sop.nextReviewAt),
        daysUntilDue,
        stage: stage ?? "none (>60d)",
        instanceExists: !!existingInstance,
        remindedStages: Array.from(remindedStages),
      });

      if (!stage) continue;

      // --- Create RuleInstance if not yet created for this cycle ---
      let instanceId = existingInstance?.id ?? null;
      if (!existingInstance) {
        if (!dryRun) {
          const inst = await prisma.ruleInstance.create({
            data: {
              ruleId: sopRule.id,
              dueDate: sop.nextReviewAt,
              label: instanceLabel,
              calendarKey: sop.id,
              ownerUserId: sop.ownerId,
              source: "CRON",
              status: daysUntilDue <= 0 ? "OVERDUE" : daysUntilDue === 0 ? "DUE_TODAY" : "UPCOMING",
            },
          });
          instanceId = inst.id;
          instancesCreated++;
        } else {
          instancesCreated++;
        }
      }

      // --- Send stage notification if not already sent this cycle ---
      if (!remindedStages.has(stage)) {
        const stageLabel =
          stage === "due"
            ? "is due for review"
            : stage === "30d"
            ? "is due for review in ~30 days"
            : "is due for review in ~60 days";
        const notifType =
          stage === "due" ? ("TASK_DUE_TODAY" as const) : ("TASK_DUE_SOON" as const);
        const dedupeKey = `SOP_REVIEW:${sop.id}:${stage}:${toPacificDateStr(sop.lastReviewedAt)}`;

        if (!dryRun) {
          await notifyUser({
            userId: sop.ownerId,
            type: notifType,
            instanceId: instanceId ?? undefined,
            title: "SOP Review Reminder",
            body: `"${sop.title}" ${stageLabel} (due ${toPacificDateStr(sop.nextReviewAt)}).`,
            dedupeKey,
          });
          await prisma.sopReminder.create({
            data: {
              sopId: sop.id,
              stage,
              cycleStartAt: sop.lastReviewedAt,
            },
          });
        }
        notificationsSent++;
      }
    }

    console.log(
      `[sop-review-reminders] dryRun=${dryRun} instancesCreated=${instancesCreated} notificationsSent=${notificationsSent}`
    );

    return NextResponse.json({
      dryRun,
      checked: sops.length,
      instancesCreated,
      notificationsSent,
      rows,
    });
  } catch (err) {
    console.error("GET /api/cron/sop-review-reminders:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
