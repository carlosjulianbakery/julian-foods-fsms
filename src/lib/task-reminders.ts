import { prisma } from "@/lib/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import { notifyUser } from "@/lib/notify";

// Daily Cleaning and Pre-Op only get DUE_TODAY reminders, not day-before.
// sop_review reminders are handled by the sop-review-reminders cron; skip here.
const DUE_SOON_EXCLUDED_FORM_KEYS = new Set(["daily_cleaning", "preop", "sop_review"]);

export async function sendReminders({ dryRun = false }: { dryRun?: boolean } = {}): Promise<{
  dueSoon: number;
  dueToday: number;
  overdue: number;
}> {
  const today = getPacificToday();
  const tomorrow = addDaysToDateStr(today, 1);

  let dueSoon = 0;
  let dueToday = 0;
  let overdue = 0;

  // ── 1. DUE_SOON: due tomorrow, not in excluded form keys ──────────────────
  const dueSoonInstances = await prisma.ruleInstance.findMany({
    where: {
      status: { in: ["UPCOMING", "DUE_TODAY", "IN_PROGRESS"] },
      dueDate: new Date(`${tomorrow}T12:00:00Z`),
      rule: {
        formKey: { notIn: Array.from(DUE_SOON_EXCLUDED_FORM_KEYS) },
      },
    },
    include: {
      rule: { select: { title: true, ownerId: true, formKey: true } },
    },
  });

  for (const inst of dueSoonInstances) {
    const ownerId = inst.ownerUserId ?? inst.rule.ownerId;
    const dedupeKey = `TASK_DUE_SOON:${inst.id}:${today}`;
    if (!dryRun) {
      await notifyUser({
        userId: ownerId,
        type: "TASK_DUE_SOON",
        instanceId: inst.id,
        title: "Task due tomorrow",
        body: `"${inst.rule.title}" is due tomorrow (${tomorrow}).`,
        dedupeKey,
      });
    }
    dueSoon++;
  }

  // ── 2. DUE_TODAY ──────────────────────────────────────────────────────────
  const dueTodayInstances = await prisma.ruleInstance.findMany({
    where: {
      status: { in: ["DUE_TODAY", "IN_PROGRESS", "UPCOMING"] },
      dueDate: new Date(`${today}T12:00:00Z`),
    },
    include: {
      rule: { select: { title: true, ownerId: true } },
    },
  });

  for (const inst of dueTodayInstances) {
    const ownerId = inst.ownerUserId ?? inst.rule.ownerId;
    const dedupeKey = `TASK_DUE_TODAY:${inst.id}:${today}`;
    if (!dryRun) {
      await notifyUser({
        userId: ownerId,
        type: "TASK_DUE_TODAY",
        instanceId: inst.id,
        title: "Task due today",
        body: `"${inst.rule.title}" is due today.`,
        dedupeKey,
      });
    }
    dueToday++;
  }

  // ── 3. OVERDUE: each day overdue ──────────────────────────────────────────
  const overdueInstances = await prisma.ruleInstance.findMany({
    where: {
      status: "OVERDUE",
    },
    include: {
      rule: { select: { title: true, ownerId: true } },
    },
  });

  for (const inst of overdueInstances) {
    const ownerId = inst.ownerUserId ?? inst.rule.ownerId;
    const dedupeKey = `TASK_OVERDUE:${inst.id}:${today}`;
    if (!dryRun) {
      await notifyUser({
        userId: ownerId,
        type: "TASK_OVERDUE",
        instanceId: inst.id,
        title: "Task overdue",
        body: `"${inst.rule.title}" is overdue.`,
        dedupeKey,
      });
    }
    overdue++;
  }

  console.log(`[task-reminders] dryRun=${dryRun} dueSoon=${dueSoon} dueToday=${dueToday} overdue=${overdue}`);
  return { dueSoon, dueToday, overdue };
}
