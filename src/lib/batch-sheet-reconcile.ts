import type { PrismaClient } from "@/generated/prisma";
import { matchSubmissionsConsume, FINISHED_STATUSES } from "@/lib/submission-matcher";
import { getPacificToday, addDaysToDateStr, toPacificDateStr } from "@/lib/pacific-time";

/**
 * Batch sheet ↔ task linking.
 *
 * One rule decides which sheet belongs to which scheduled production: matchSubmissionsConsume, the same
 * function the Production Schedule uses. Here the batch-sheet tasks play the scheduled productions.
 * Explicit links (a sheet opened from a task's Start button) are honoured before the rule runs.
 */

export type LinkMethod = "task link" | "exact date" | "schedule rule";
export type SweepSource = "on submit" | "calendar sync" | "nightly cron" | "manual run";

export interface ReconTask {
  id: string;
  ruleId: string;
  ruleOwnerId: string;
  /** YYYY-MM-DD */
  dueDate: string;
  status: string;
  label: string;
  ownerUserId: string | null;
  completedBySubmissionId: string | null;
  createdAt: Date;
}

export interface ReconSubmission {
  id: string;
  templateName: string;
  productId: string | null;
  productionDate: Date;
  status: string;
  submittedById: string;
  submittedAt: Date;
  taskInstanceId: string | null;
}

export interface PlannedLink {
  instanceId: string;
  submissionId: string;
  how: LinkMethod;
}

const NEVER_TOUCHED = ["DONE", "SKIPPED", "MISSED"];
export const NON_OWNER_REVIEW_REASON = "Completed by non-owner";

/** Same expression as normalizeName in the production-schedule route (kept identical by a test). */
export function normalizeProductName(s: string): string {
  return s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Task labels are written by the calendar generator as the sheet's product name plus an optional
 * " (<count> <unit>…)" quantity, or " #<n>" when a product-specific rule has several runs in a day.
 */
export function productNameFromTaskLabel(label: string): string {
  return label.replace(/\s*\(\d[^()]*\)\s*$/, "").replace(/\s+#\d+$/, "");
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function mondayOf(dateStr: string): string {
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return addDaysToDateStr(dateStr, dow === 0 ? -6 : 1 - dow);
}

/** Tasks due in the current and the previous Monday–Sunday week (Pacific). */
export function sweepRange(today: string): { from: string; to: string } {
  const thisMonday = mondayOf(today);
  return { from: addDaysToDateStr(thisMonday, -7), to: addDaysToDateStr(thisMonday, 6) };
}

/**
 * Pure planner: which open tasks should be completed by which sheet.
 * - A sheet already linked to a task is out of the pool, and so is that task.
 * - Explicit task links first, then the schedule rule on what remains.
 * - DONE / SKIPPED / MISSED tasks still consume the sheet the rule gives them, so it cannot spill
 *   onto another task — but they are never returned as something to change.
 * - Each sheet is used at most once.
 */
export function planBatchSheetLinks(input: {
  tasks: ReconTask[];
  submissions: ReconSubmission[];
  products: { id: string; name: string }[];
  /** Sheets already linked to some task, including tasks outside `tasks`. */
  linkedSubmissionIds?: Iterable<string>;
}): PlannedLink[] {
  const productIdByName = new Map(input.products.map((p) => [normalizeProductName(p.name), p.id]));
  const submissionProductId = (s: ReconSubmission) =>
    s.productId ?? productIdByName.get(normalizeProductName(s.templateName)) ?? null;
  const taskProductId = (t: ReconTask) =>
    productIdByName.get(normalizeProductName(productNameFromTaskLabel(t.label))) ?? null;

  const linked = new Set<string>(input.linkedSubmissionIds ?? []);
  for (const t of input.tasks) if (t.completedBySubmissionId) linked.add(t.completedBySubmissionId);

  let subPool = input.submissions
    .filter((s) => FINISHED_STATUSES.has(s.status.toLowerCase()) && !linked.has(s.id))
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  let taskPool = input.tasks.filter((t) => !t.completedBySubmissionId);

  const plan: PlannedLink[] = [];
  const pair = (task: ReconTask, sub: ReconSubmission, how: LinkMethod) => {
    taskPool = taskPool.filter((t) => t.id !== task.id);
    subPool = subPool.filter((s) => s.id !== sub.id);
    if (!NEVER_TOUCHED.includes(task.status)) plan.push({ instanceId: task.id, submissionId: sub.id, how });
  };

  // 1. Explicit links
  for (const sub of [...subPool]) {
    if (!sub.taskInstanceId) continue;
    const task = taskPool.find((t) => t.id === sub.taskInstanceId);
    if (task) pair(task, sub, "task link");
  }

  // 2. Schedule rule. Tasks sharing product + date (two runs in a day, or two facilities) are fed to the
  //    matcher one layer at a time, because it keys its result by product + date.
  const runRule = (tasks: ReconTask[], subs: ReconSubmission[]) => {
    const byKey = new Map<string, ReconTask[]>();
    for (const t of [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.getTime() - b.createdAt.getTime())) {
      const productId = taskProductId(t);
      if (!productId) continue;
      const key = `${productId}:${t.dueDate}`;
      byKey.set(key, [...(byKey.get(key) ?? []), t]);
    }
    const layers = Math.max(0, ...Array.from(byKey.values()).map((g) => g.length));
    let available = subs;
    for (let layer = 0; layer < layers; layer++) {
      const scheduled = Array.from(byKey.entries())
        .filter(([, group]) => group[layer])
        .map(([key, group]) => ({ key, task: group[layer], productId: key.slice(0, key.lastIndexOf(":")) }));
      const matches = matchSubmissionsConsume(
        scheduled.map((s) => ({ productId: s.productId, isoDate: s.task.dueDate })),
        available,
        submissionProductId,
        FINISHED_STATUSES,
      );
      for (const s of scheduled) {
        const sub = matches.get(s.key);
        if (!sub) continue;
        available = available.filter((x) => x.id !== sub.id);
        pair(s.task, sub, isoDay(sub.productionDate) === s.task.dueDate ? "exact date" : "schedule rule");
      }
    }
  };

  // 2a. Each rule's own sheets first (submitted by the rule owner)…
  for (const ruleId of Array.from(new Set(taskPool.map((t) => t.ruleId)))) {
    const ruleTasks = taskPool.filter((t) => t.ruleId === ruleId);
    if (ruleTasks.length === 0) continue;
    const ownerId = ruleTasks[0].ruleOwnerId;
    runRule(ruleTasks, subPool.filter((s) => s.submittedById === ownerId));
  }
  // 2b. …then whatever is left, regardless of who submitted it.
  runRule(taskPool, subPool);

  return plan;
}

/** Returns the task id if it exists and belongs to a batch-sheet rule, otherwise null. */
export async function resolveBatchSheetTaskLink(
  taskId: unknown,
  prismaClient: PrismaClient,
): Promise<string | null> {
  if (typeof taskId !== "string" || !taskId) return null;
  const inst = await prismaClient.ruleInstance.findUnique({
    where: { id: taskId },
    select: { id: true, rule: { select: { formKey: true } } },
  });
  return inst && inst.rule.formKey === "batch_sheet" ? inst.id : null;
}

export interface SweepResult {
  range: { from: string; to: string };
  examinedTasks: number;
  examinedSubmissions: number;
  completed: Array<PlannedLink & { nonOwner: boolean; daysLate: number | null }>;
}

/**
 * Self-healing sweep: completes every open batch-sheet task that has a sheet, by the rules above.
 * Idempotent — a second run finds everything linked and changes nothing.
 */
export async function reconcileBatchSheetTasks(params: {
  prismaClient: PrismaClient;
  source: SweepSource;
  /** Always consider this sheet, even if its production date is outside the two-week window. */
  includeSubmissionId?: string;
}): Promise<SweepResult> {
  const { prismaClient, source, includeSubmissionId } = params;
  const range = sweepRange(getPacificToday());
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T23:59:59Z`);

  const submissionSelect = {
    id: true, templateName: true, productId: true, productionDate: true, status: true,
    submittedById: true, submittedAt: true, taskInstanceId: true,
  } as const;
  const taskSelect = {
    id: true, ruleId: true, dueDate: true, status: true, label: true, ownerUserId: true,
    completedBySubmissionId: true, createdAt: true, rule: { select: { ownerId: true } },
  } as const;

  const [submissions, products] = await Promise.all([
    prismaClient.batchSheetSubmission.findMany({
      where: {
        OR: [
          { productionDate: { gte: from, lte: to } },
          ...(includeSubmissionId ? [{ id: includeSubmissionId }] : []),
        ],
      },
      select: submissionSelect,
    }),
    prismaClient.product.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);

  const explicitTaskIds = submissions.map((s) => s.taskInstanceId).filter((id): id is string => !!id);
  const [taskRows, alreadyLinked] = await Promise.all([
    prismaClient.ruleInstance.findMany({
      where: {
        rule: { formKey: "batch_sheet" },
        OR: [{ dueDate: { gte: from, lte: to } }, ...(explicitTaskIds.length ? [{ id: { in: explicitTaskIds } }] : [])],
      },
      select: taskSelect,
    }),
    prismaClient.ruleInstance.findMany({
      where: { completedBySubmissionId: { in: submissions.map((s) => s.id) } },
      select: { completedBySubmissionId: true },
    }),
  ]);

  const tasks: ReconTask[] = taskRows.map((t) => ({
    id: t.id,
    ruleId: t.ruleId,
    ruleOwnerId: t.rule.ownerId,
    dueDate: isoDay(t.dueDate),
    status: t.status as string,
    label: t.label,
    ownerUserId: t.ownerUserId,
    completedBySubmissionId: t.completedBySubmissionId,
    createdAt: t.createdAt,
  }));
  const subs: ReconSubmission[] = submissions.map((s) => ({ ...s, status: String(s.status) }));

  const plan = planBatchSheetLinks({
    tasks,
    submissions: subs,
    products,
    linkedSubmissionIds: alreadyLinked.map((r) => r.completedBySubmissionId).filter((id): id is string => !!id),
  });

  const result: SweepResult = { range, examinedTasks: tasks.length, examinedSubmissions: subs.length, completed: [] };

  for (const link of plan) {
    const task = tasks.find((t) => t.id === link.instanceId)!;
    const sub = subs.find((s) => s.id === link.submissionId)!;
    const effectiveOwner = task.ownerUserId ?? task.ruleOwnerId;
    const nonOwner = effectiveOwner !== sub.submittedById;
    // The work was finished when the sheet was submitted; lateness is that day against the due date
    const completionDay = toPacificDateStr(sub.submittedAt);
    const completedLate = completionDay > task.dueDate;
    const daysLate = completedLate
      ? Math.round((new Date(completionDay).getTime() - new Date(task.dueDate).getTime()) / 86_400_000)
      : null;

    const applied = await prismaClient.$transaction(async (tx) => {
      const upd = await tx.ruleInstance.updateMany({
        where: { id: task.id, status: { notIn: ["DONE", "SKIPPED", "MISSED"] }, completedBySubmissionId: null },
        data: {
          status: "DONE",
          doneAt: sub.submittedAt,
          doneById: sub.submittedById,
          completedLate,
          daysLate,
          completedBySubmissionId: sub.id,
          ownerUserId: effectiveOwner,
          ...(nonOwner ? { needsAdminReview: true, reviewReason: NON_OWNER_REVIEW_REASON } : {}),
        },
      });
      if (upd.count !== 1) return false; // someone else changed it in the meantime
      await tx.taskInstanceAudit.create({
        data: {
          instanceId: task.id,
          action: "completed",
          userId: sub.submittedById,
          note:
            `Auto-completed by form submission ${sub.id} — linked by ${link.how} (reconciliation sweep, ${source})` +
            (nonOwner ? ` — ${NON_OWNER_REVIEW_REASON}` : "") +
            (completedLate ? ` (${daysLate} day(s) late)` : ""),
        },
      });
      return true;
    });

    if (applied) {
      result.completed.push({ ...link, nonOwner, daysLate });
      console.log(`[batch-sheet-reconcile] ${source}: task ${task.id} ← sheet ${sub.id} (${link.how})${nonOwner ? " non-owner" : ""}`);
    }
  }

  return result;
}
