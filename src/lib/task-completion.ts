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
      include: { rule: { select: { formKey: true, ownerId: true, facility: { select: { name: true } } } } },
    });

    if (!instance) {
      console.warn(`[task-completion] taskId ${taskId} not found — skipping`);
      return;
    }
    if (instance.status === "DONE" || instance.status === "SKIPPED" || instance.status === "MISSED") {
      console.log(`[task-completion] taskId ${taskId} already in terminal status ${instance.status} — skipping`);
      return;
    }

    await markDone({ instance, ruleOwnerId: instance.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
    return;
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
    include: {
      rule: { select: { formKey: true, ownerId: true, facility: { select: { name: true } } } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  if (allCandidates.length === 0) {
    console.log(`[task-completion] no open instances for formKey=${formKey} facility=${facilityName}`);
    return;
  }

  // Exact match wins over any fallback, even if the instance is still UPCOMING.
  // dueDate is @db.Date → reads as midnight UTC → .slice(0,10) gives UTC date string,
  // which equals the Pacific date string the form sends when both represent the same calendar day.
  const exact = allCandidates.find(
    (i) => i.dueDate.toISOString().slice(0, 10) === submissionDate
  );

  if (exact) {
    await markDone({ instance: exact, ruleOwnerId: exact.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
    return;
  }

  // No exact match: fall back to open (non-UPCOMING) candidates only
  const openCandidates = allCandidates.filter(
    (i) => (OPEN_STATUSES as readonly string[]).includes(i.status)
  );
  if (openCandidates.length === 0) {
    console.log(`[task-completion] no open/matching instances for formKey=${formKey} facility=${facilityName} date=${submissionDate}`);
    return;
  }

  const target =
    openCandidates.find((i) => i.status === "OVERDUE") ??
    openCandidates[0];

  if (!target) return;

  await markDone({ instance: target, ruleOwnerId: target.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
}

async function markDone(opts: {
  instance: { id: string; dueDate: Date; ownerUserId: string | null };
  ruleOwnerId: string;
  submissionId: string;
  userId: string;
  submissionDate: string;
  today: string;
  prismaClient: PrismaClient;
}): Promise<void> {
  const { instance, ruleOwnerId, submissionId, userId, submissionDate, prismaClient } = opts;

  const dueDateStr = instance.dueDate.toISOString().slice(0, 10);
  const completedLate = submissionDate > dueDateStr;
  const daysLate = completedLate
    ? Math.round(
        (new Date(submissionDate).getTime() - new Date(dueDateStr).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

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
}

/**
 * Batch-sheet-specific completion matching for PRODUCTION_ANY rules.
 *
 * Order:
 *  (a) taskId direct — validate formKey=batch_sheet and user is owner/admin
 *  (b) product+exact date among submitter's own PRODUCTION_ANY instances, then nearest ≤6 days
 *  (c) any facility's open instances with same product/date → needsAdminReview
 *  (d) no match — log warning, save normally
 */
export async function completeBatchSheetInstance(params: {
  submissionId: string;
  userId: string;
  userRole: string;
  submissionDate: string;
  productName: string | null;
  taskId?: string | null;
  prismaClient: PrismaClient;
}): Promise<void> {
  const { submissionId, userId, userRole, submissionDate, productName, taskId, prismaClient } = params;
  const today = getPacificToday();

  // ── (a) direct path via taskId ─────────────────────────────────────────────
  if (taskId) {
    const instance = await prismaClient.ruleInstance.findUnique({
      where: { id: taskId },
      include: { rule: { select: { formKey: true, ownerId: true, facility: { select: { name: true } } } } },
    });
    if (!instance) {
      console.warn(`[batch-sheet-completion] taskId ${taskId} not found — skipping`);
      return;
    }
    if (instance.rule.formKey !== "batch_sheet") {
      console.warn(`[batch-sheet-completion] taskId ${taskId} has formKey=${instance.rule.formKey}, not batch_sheet — skipping`);
      return;
    }
    if (instance.status === "DONE" || instance.status === "SKIPPED" || instance.status === "MISSED") {
      console.log(`[batch-sheet-completion] taskId ${taskId} already ${instance.status} — skipping`);
      return;
    }
    const effectiveOwner = instance.ownerUserId ?? instance.rule.ownerId;
    if (effectiveOwner !== userId && userRole !== "ADMIN") {
      console.warn(`[batch-sheet-completion] user ${userId} is not owner of instance ${taskId} — skipping`);
      return;
    }
    await markDone({ instance, ruleOwnerId: instance.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
    return;
  }

  if (!productName) {
    console.log(`[batch-sheet-completion] no productName and no taskId — skipping instance completion`);
    return;
  }

  // ── (b) submitter's own PRODUCTION_ANY instances ───────────────────────────
  const ownInstances = await prismaClient.ruleInstance.findMany({
    where: {
      status: { in: [...OPEN_STATUSES, "UPCOMING"] },
      rule: {
        formKey: "batch_sheet",
        triggerType: "PRODUCTION_ANY",
        ownerId: userId,
      },
    },
    include: { rule: { select: { formKey: true, ownerId: true } } },
    orderBy: [{ dueDate: "asc" }],
  });

  const ownProductMatches = ownInstances.filter((i) => batchLabelMatchesProduct(i.label, productName));

  // Exact date first
  const ownExact = ownProductMatches.find((i) => i.dueDate.toISOString().slice(0, 10) === submissionDate);
  if (ownExact) {
    await markDone({ instance: ownExact, ruleOwnerId: ownExact.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
    return;
  }

  // Nearest ≤6 days
  const ownNearest = findNearestWithinDays(ownProductMatches.filter(
    (i) => (OPEN_STATUSES as readonly string[]).includes(i.status)
  ), submissionDate, 6);
  if (ownNearest) {
    await markDone({ instance: ownNearest, ruleOwnerId: ownNearest.rule.ownerId, submissionId, userId, submissionDate, today, prismaClient });
    return;
  }

  // ── (c) cross-facility — same product/date, any facility ──────────────────
  const anyInstances = await prismaClient.ruleInstance.findMany({
    where: {
      status: { in: [...OPEN_STATUSES, "UPCOMING"] },
      rule: { formKey: "batch_sheet", triggerType: "PRODUCTION_ANY" },
    },
    include: { rule: { select: { formKey: true, ownerId: true } } },
    orderBy: [{ dueDate: "asc" }],
  });

  const anyProductMatches = anyInstances.filter((i) => batchLabelMatchesProduct(i.label, productName));
  const anyExact = anyProductMatches.find((i) => i.dueDate.toISOString().slice(0, 10) === submissionDate);
  const crossTarget = anyExact ?? findNearestWithinDays(
    anyProductMatches.filter((i) => (OPEN_STATUSES as readonly string[]).includes(i.status)),
    submissionDate, 6
  );

  if (crossTarget) {
    console.warn(`[batch-sheet-completion] cross-facility match: user ${userId} completing instance ${crossTarget.id} owned by ${crossTarget.rule.ownerId}`);
    await markDoneWithReview({
      instance: crossTarget,
      ruleOwnerId: crossTarget.rule.ownerId,
      submissionId,
      userId,
      submissionDate,
      today,
      reviewReason: "Completed by non-owner",
      prismaClient,
    });
    return;
  }

  // ── (d) no match ───────────────────────────────────────────────────────────
  console.warn(`[batch-sheet-completion] no PRODUCTION_ANY instance matched product="${productName}" date=${submissionDate} for user ${userId} — submission saved without consuming an instance`);
}

function batchLabelMatchesProduct(label: string | null, productName: string): boolean {
  if (!label) return false;
  // Label format: "${item.product_name} (N unit)" — strip the qty suffix for matching
  const labelBase = label.replace(/\s*\(\d+.*?\)\s*$/, "").toLowerCase().trim();
  const pn = productName.toLowerCase().trim();
  return labelBase === pn || labelBase.includes(pn) || pn.includes(labelBase);
}

function findNearestWithinDays(
  candidates: Array<{ dueDate: Date }>,
  submissionDate: string,
  maxDays: number
): (typeof candidates)[number] | undefined {
  const subMs = new Date(submissionDate + "T00:00:00Z").getTime();
  let best: (typeof candidates)[number] | undefined;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = Math.abs(c.dueDate.getTime() - subMs) / (1000 * 60 * 60 * 24);
    if (diff <= maxDays && diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best;
}

async function markDoneWithReview(opts: {
  instance: { id: string; dueDate: Date; ownerUserId: string | null };
  ruleOwnerId: string;
  submissionId: string;
  userId: string;
  submissionDate: string;
  today: string;
  reviewReason: string;
  prismaClient: PrismaClient;
}): Promise<void> {
  const { instance, ruleOwnerId, submissionId, userId, submissionDate, reviewReason, prismaClient } = opts;

  const dueDateStr = instance.dueDate.toISOString().slice(0, 10);
  const completedLate = submissionDate > dueDateStr;
  const daysLate = completedLate
    ? Math.round((new Date(submissionDate).getTime() - new Date(dueDateStr).getTime()) / (1000 * 60 * 60 * 24))
    : null;
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
        needsAdminReview: true,
        reviewReason,
      },
    }),
    prismaClient.taskInstanceAudit.create({
      data: {
        instanceId: instance.id,
        action: "completed",
        userId,
        note: `Auto-completed by form submission ${submissionId} — ${reviewReason}${completedLate ? ` (${daysLate}d late)` : ""}`,
      },
    }),
  ]);
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
