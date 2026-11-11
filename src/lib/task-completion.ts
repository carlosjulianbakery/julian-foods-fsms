import { PrismaClient } from "@/generated/prisma";
import { getPacificToday } from "@/lib/pacific-time";

// TODO: once forms carry a facilityId field, derive this from the submission instead of defaulting.
export const DEFAULT_FACILITY_NAME = "Julian Bakery";

/** Open statuses eligible for auto-completion. */
const OPEN_STATUSES = ["DUE_TODAY", "IN_PROGRESS", "OVERDUE"] as const;

export async function completeRuleInstanceForSubmission(params: {
  formKey: string;
  facilityName?: string;
  submissionId: string;
  userId: string;
  /** ISO date string (YYYY-MM-DD) of the actual submission date, used to compute lateness. */
  submissionDate: string;
  /** If provided, complete this specific instance directly (skips best-match search). */
  taskId?: string | null;
  prismaClient: PrismaClient;
}): Promise<void> {
  const {
    formKey,
    facilityName = DEFAULT_FACILITY_NAME,
    submissionId,
    userId,
    submissionDate,
    taskId,
    prismaClient,
  } = params;

  const today = getPacificToday();

  if (taskId) {
    // Direct path: a specific instance was targeted (user clicked Start from task widget)
    const instance = await prismaClient.ruleInstance.findUnique({
      where: { id: taskId },
      include: { rule: { select: { formKey: true, facility: { select: { name: true } } } } },
    });

    if (!instance) {
      console.warn(`[task-completion] taskId ${taskId} not found — skipping`);
      return;
    }
    if (instance.status === "DONE" || instance.status === "SKIPPED" || instance.status === "MISSED") {
      console.log(`[task-completion] taskId ${taskId} already in terminal status ${instance.status} — skipping`);
      return;
    }

    await markDone({ instance, submissionId, userId, submissionDate, today, prismaClient });
    return;
  }

  // Best-match path: find open instances for this facility + formKey
  const candidates = await prismaClient.ruleInstance.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      rule: {
        formKey,
        facility: { name: facilityName },
      },
    },
    include: {
      rule: { select: { formKey: true, facility: { select: { name: true } } } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  if (candidates.length === 0) {
    console.log(`[task-completion] no open instances for formKey=${formKey} facility=${facilityName}`);
    return;
  }

  // Prefer exact due-date match; fall back to oldest OVERDUE
  const exact = candidates.find(
    (i) => i.dueDate.toISOString().slice(0, 10) === submissionDate
  );

  const target =
    exact ??
    candidates.find((i) => i.status === "OVERDUE") ??
    candidates[0];

  if (!target) return;

  await markDone({ instance: target, submissionId, userId, submissionDate, today, prismaClient });
}

async function markDone(opts: {
  instance: { id: string; dueDate: Date };
  submissionId: string;
  userId: string;
  submissionDate: string;
  today: string;
  prismaClient: PrismaClient;
}): Promise<void> {
  const { instance, submissionId, userId, submissionDate, prismaClient } = opts;

  const dueDateStr = instance.dueDate.toISOString().slice(0, 10);
  const completedLate = submissionDate > dueDateStr;
  const daysLate = completedLate
    ? Math.round(
        (new Date(submissionDate).getTime() - new Date(dueDateStr).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  await prismaClient.$transaction([
    prismaClient.ruleInstance.update({
      where: { id: instance.id },
      data: {
        status: "DONE",
        doneAt: new Date(),
        doneById: userId,
        completedLate,
        daysLate,
        completedBySubmissionId: submissionId,
      },
    }),
    prismaClient.taskInstanceAudit.create({
      data: {
        instanceId: instance.id,
        action: "completed",
        userId,
        note: completedLate
          ? `Auto-completed by form submission ${submissionId} (${daysLate} day(s) late)`
          : `Auto-completed by form submission ${submissionId}`,
      },
    }),
  ]);

  console.log(
    `[task-completion] completed instance ${instance.id} via submission ${submissionId}` +
      (completedLate ? ` — ${daysLate}d late` : "")
  );
}

/**
 * When a submission is deleted, reopen the linked RuleInstance to its computed open status.
 * Never deletes the instance. Idempotent if already open.
 */
export async function reopenInstanceForSubmissionDeletion(params: {
  submissionId: string;
  userId: string;
  note?: string;
  prismaClient: PrismaClient;
}): Promise<void> {
  const { submissionId, userId, note, prismaClient } = params;

  const instance = await prismaClient.ruleInstance.findFirst({
    where: { completedBySubmissionId: submissionId },
  });

  if (!instance) return;
  if (instance.status !== "DONE") return; // already reopened or in another terminal state

  const today = getPacificToday();
  const dueDateStr = instance.dueDate.toISOString().slice(0, 10);

  let reopenedStatus: "OVERDUE" | "DUE_TODAY" | "UPCOMING";
  if (dueDateStr < today) reopenedStatus = "OVERDUE";
  else if (dueDateStr === today) reopenedStatus = "DUE_TODAY";
  else reopenedStatus = "UPCOMING";

  await prismaClient.$transaction([
    prismaClient.ruleInstance.update({
      where: { id: instance.id },
      data: {
        status: reopenedStatus,
        doneAt: null,
        doneById: null,
        completedLate: false,
        daysLate: null,
        completedBySubmissionId: null,
      },
    }),
    prismaClient.taskInstanceAudit.create({
      data: {
        instanceId: instance.id,
        action: "reopened",
        userId,
        note: note ?? `Submission ${submissionId} deleted — instance reopened to ${reopenedStatus}`,
      },
    }),
  ]);

  console.log(`[task-completion] reopened instance ${instance.id} to ${reopenedStatus} after deletion of ${submissionId}`);
}
