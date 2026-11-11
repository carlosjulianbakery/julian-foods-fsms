import { prisma } from "@/lib/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import { notifyUser } from "@/lib/notify";

export async function sendEscalations({ dryRun = false }: { dryRun?: boolean } = {}): Promise<{
  escalated: number;
}> {
  const today = getPacificToday();

  // Fetch all ADMIN users once
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });

  if (admins.length === 0) {
    console.log("[task-escalation] no ADMIN users found");
    return { escalated: 0 };
  }

  // Find OVERDUE instances; we need to check per-instance escalateAfterDays
  const overdueInstances = await prisma.ruleInstance.findMany({
    where: { status: "OVERDUE" },
    include: {
      rule: { select: { title: true, escalateAfterDays: true } },
    },
  });

  let escalated = 0;

  for (const inst of overdueInstances) {
    const escalateAfterDays = inst.rule.escalateAfterDays ?? 2;
    const escalateThreshold = addDaysToDateStr(today, -escalateAfterDays);
    const dueDateStr = inst.dueDate.toISOString().slice(0, 10);

    // Only escalate if dueDate <= threshold (i.e., N+ days overdue)
    if (dueDateStr > escalateThreshold) continue;

    for (const admin of admins) {
      const dedupeKey = `TASK_ESCALATED:${inst.id}:${admin.id}`;
      if (!dryRun) {
        await notifyUser({
          userId: admin.id,
          type: "TASK_ESCALATED",
          instanceId: inst.id,
          title: "Task escalated",
          body: `"${inst.rule.title}" has been overdue for ${escalateAfterDays}+ days and requires attention.`,
          dedupeKey,
        });
      }
      escalated++;
    }
  }

  console.log(`[task-escalation] dryRun=${dryRun} escalated=${escalated}`);
  return { escalated };
}
