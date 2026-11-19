import { PrismaClient } from "@/generated/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import { computeWindowStart, isInWindow } from "@/lib/window-tasks";

// TODO: once forms carry a facilityId field, derive this from the submission instead of defaulting.
export const DEFAULT_FACILITY_NAME = "Julian Bakery";

/** Open statuses eligible for auto-completion. */
const OPEN_STATUSES = ["DUE_TODAY", "IN_PROGRESS", "OVERDUE"] as const;

/** How far back (from the day of submission) a late form may still close its task. */
export const GENERIC_LOOKBACK_DAYS = 3;

const RULE_MATCH_SELECT = {
  formKey: true,
  ownerId: true,
  facility: { select: { name: true } },
  windowMode: true,
  windowDaysBefore: true,
  recurrenceUnit: true,
} as const;

export interface CompletionCandidate {
  dueDate: Date;
  status: string;
  rule: { windowMode: string; windowDaysBefore: number | null; recurrenceUnit: string | null };
}

/**
 * Whether an instance can be closed by a submission that did not name it.
 * Judged by due date, not only by stored status — the stored status can lag behind the calendar.
 * An UPCOMING instance counts when it is due today or earlier, or when its rule's window is open.
 */
export function isOpenForCompletion(inst: CompletionCandidate, today: string): boolean {
  if ((OPEN_STATUSES as readonly string[]).includes(inst.status)) return true;
  if (inst.status !== "UPCOMING") return false;
  const due = inst.dueDate.toISOString().slice(0, 10);
  if (due <= today) return true;
  return isInWindow(computeWindowStart(inst.rule, due), due, today);
}

/** Oldest open instance due no earlier than `lookbackDays` before the day of submission. */
export function pickFallbackInstance<T extends CompletionCandidate>(
  candidates: T[],
  today: string,
  lookbackDays: number,
): T | undefined {
  const earliest = addDaysToDateStr(today, -lookbackDays);
  return candidates
    .filter((i) => isOpenForCompletion(i, today) && i.dueDate.toISOString().slice(0, 10) >= earliest)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
}

/** A submission closes at most one instance, even if it is submitted again. */
async function instanceAlreadyClosedBy(submissionId: string, prismaClient: PrismaClient): Promise<string | null> {
  const existing = await prismaClient.ruleInstance.findFirst({
    where: { completedBySubmissionId: submissionId },
    select: { id: true },
  });
  if (existing) console.log(`[task-completion] submission ${submissionId} already closed instance ${existing.id} — not closing another`);
  return existing?.id ?? null;
}

function lateness(dueDate: Date, today: string): { completedLate: boolean; daysLate: number | null } {
  const dueDateStr = dueDate.toISOString().slice(0, 10);
  const completedLate = today > dueDateStr;
  const daysLate = completedLate
    ? Math.round((new Date(today).getTime() - new Date(dueDateStr).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  return { completedLate, daysLate };
}

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
}): Promise<string | null> {
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

  const alreadyClosed = await instanceAlreadyClosedBy(submissionId, prismaClient);
  if (alreadyClosed) return alreadyClosed;

  if (taskId) {
    // Direct path: a specific instance was targeted (user clicked Start from task widget)
    const instance = await prismaClient.ruleInstance.findUnique({
      where: { id: taskId },
      include: { rule: { select: RULE_MATCH_SELECT } },
    });

    if (!instance) {
      console.warn(`[task-completion] taskId ${taskId} not found — falling through to best-match`);
      // fall through to best-match path below
    } else {
      if (instance.status === "DONE" || instance.status === "SKIPPED" || instance.status === "MISSED") {
        console.log(`[task-completion] taskId ${taskId} already in terminal status ${instance.status} — skipping`);
        return null;
      }

      return await markDone({ instance, ruleOwnerId: instance.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
    }
  }

  // Best-match path: find open + upcoming instances for this facility + formKey.
  // UPCOMING is included so a submission for today (or a past date) can still match
  // an instance that wasn't promoted by the cron yet.
  const allCandidates = await prismaClient.ruleInstance.findMany({
    where: {
      status: { in: [...OPEN_STATUSES, "UPCOMING"] },
      rule: {
        formKey,
        facility: { name: facilityName },
      },
    },
    include: { rule: { select: RULE_MATCH_SELECT } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  if (allCandidates.length === 0) {
    console.log(`[task-completion] no open instances for formKey=${formKey} facility=${facilityName}`);
    return null;
  }

  // Exact match wins over any fallback, even if the instance is still UPCOMING.
  // dueDate is @db.Date → reads as midnight UTC → .slice(0,10) gives UTC date string,
  // which equals the Pacific date string the form sends when both represent the same calendar day.
  const exact = allCandidates.find(
    (i) => i.dueDate.toISOString().slice(0, 10) === submissionDate
  );

  if (exact) {
    return await markDone({ instance: exact, ruleOwnerId: exact.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
  }

  // No exact match: oldest instance that is open by due date (or by an open window), recent enough
  const target = pickFallbackInstance(allCandidates, today, GENERIC_LOOKBACK_DAYS);
  if (!target) {
    console.log(`[task-completion] no open/matching instances for formKey=${formKey} facility=${facilityName} date=${submissionDate}`);
    return null;
  }

  return await markDone({ instance: target, ruleOwnerId: target.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
}

async function markDone(opts: {
  instance: { id: string; dueDate: Date; ownerUserId: string | null };
  ruleOwnerId: string;
  submissionId: string;
  userId: string;
  submissionDate: string;
  today: string;
  prismaClient: PrismaClient;
}): Promise<string> {
  const { instance, ruleOwnerId, submissionId, userId, today, prismaClient } = opts;

  // Late = completed after the due date, whatever date the form itself carries
  const { completedLate, daysLate } = lateness(instance.dueDate, today);

  const effectiveOwner = instance.ownerUserId ?? ruleOwnerId;

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
        ownerUserId: effectiveOwner,
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
  return instance.id;
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
        ownerUserId: null, // cleared so instance follows live rule owner again
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
