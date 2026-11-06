import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function formatDatePacific(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (!isVercelCron) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const sops = await prisma.sopDocument.findMany({
      where: { isArchived: false },
      include: { reminders: true },
    });

    let created = 0;

    for (const sop of sops) {
      const stages: { stage: string; applies: boolean }[] = [
        { stage: "60d", applies: sop.nextReviewAt <= sixtyDaysFromNow },
        { stage: "30d", applies: sop.nextReviewAt <= thirtyDaysFromNow },
        { stage: "due", applies: sop.nextReviewAt <= now },
      ];

      for (const { stage, applies } of stages) {
        if (!applies) continue;

        // Check if reminder already exists for this cycle
        const existing = sop.reminders.find(
          (r) =>
            r.stage === stage &&
            r.cycleStartAt.getTime() === sop.lastReviewedAt.getTime()
        );
        if (existing) continue;

        // Build task title
        const stageLabel =
          stage === "60d"
            ? "due in 60 days"
            : stage === "30d"
            ? "due in 30 days"
            : "OVERDUE";
        const taskTitle = `Review SOP: ${sop.title} (${stageLabel}, due ${formatDatePacific(sop.nextReviewAt)})`;

        // Create the task assigned to SOP owner
        let taskId: string | null = null;
        try {
          const task = await prisma.task.create({
            data: {
              title: taskTitle,
              description: `Annual SOP review required. View SOP at /dashboard/compliance/sops`,
              assignedToId: sop.ownerId,
              createdById: sop.ownerId,
              priority: stage === "due" ? "HIGH" : "MEDIUM",
              dueDate: sop.nextReviewAt,
              recurrence: "NONE",
              status: "PENDING",
            },
          });
          taskId = task.id;
        } catch (taskErr) {
          console.error("Failed to create task for SOP reminder:", taskErr);
        }

        // Create reminder record
        await prisma.sopReminder.create({
          data: {
            sopId: sop.id,
            stage,
            cycleStartAt: sop.lastReviewedAt,
            taskId,
          },
        });

        created++;
      }
    }

    return NextResponse.json({ created, checked: sops.length });
  } catch (err) {
    console.error("GET /api/cron/sop-review-reminders:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
