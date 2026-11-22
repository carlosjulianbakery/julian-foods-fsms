/**
 * Quality — the monthly review. One review per month (Pacific), recorded by the admin who did it, with
 * the counts as they were when it was saved. Saving it completes that month's review task.
 */
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import {
  QUALITY_REVIEW_FORM_KEY, QUALITY_RULE_FACILITY, diffFields, isPeriod, parseFields, periodBounds, periodLabel, periodOfDay, reviewCounts, reviewProblems,
  reviewReference, type ReviewCounts, type ReviewRow,
} from "@/lib/quality";
import { day, eventsOf, invalid, recordEvent, refuse, write, type Actor, type Tx } from "@/lib/quality-server";

/** The counts as of now, for a month: what a review saved at this moment would record. */
export async function currentCounts(tx: Tx, period: string): Promise<ReviewCounts> {
  const [incidents, capas] = await Promise.all([tx.qualityIncident.findMany(), tx.qualityCapa.findMany()]);
  return reviewCounts(
    incidents.map((i) => ({ status: i.status, dateReceived: day(i.dateReceived)! })),
    capas.map((c) => ({ status: c.status, dueDate: day(c.dueDate) })),
    period, getPacificToday(),
  );
}

const toRow = (r: { id: string; period: string; reviewDate: Date; reviewedByName: string; whatWasReviewed: string; notes: string; counts: unknown; updatedAt: Date }): ReviewRow => ({
  id: r.id, period: r.period, reviewDate: day(r.reviewDate)!, reviewedByName: r.reviewedByName, whatWasReviewed: r.whatWasReviewed, notes: r.notes,
  counts: r.counts as ReviewCounts, updatedAt: r.updatedAt.toISOString(),
});

export async function listReviews() {
  const rows = await prisma.qualityReview.findMany();
  const today = getPacificToday();
  const period = periodOfDay(today);
  return {
    reviews: rows.sort((a, b) => b.period.localeCompare(a.period)).map(toRow),
    today, currentPeriod: period, currentCounts: await currentCounts(prisma, period),
  };
}

export async function getReview(id: string) {
  const row = await prisma.qualityReview.findUnique({ where: { id } });
  if (!row) throw refuse(404, "Review not found.");
  return { review: toRow(row), events: await eventsOf(prisma, "review", id) };
}

/** Completes the month's review task (due on the month's last day) through the shared helper. Never fails the save. */
async function completeReviewTask(actor: Actor, reviewId: string, period: string, taskId: unknown): Promise<string | null> {
  try {
    return await completeRuleInstanceForSubmission({
      formKey: QUALITY_REVIEW_FORM_KEY, facilityName: QUALITY_RULE_FACILITY, submissionId: reviewId, userId: actor.id,
      // The task of a month is the one due on its last day; lateness is worked out from today
      submissionDate: periodBounds(period).end, taskId: typeof taskId === "string" && taskId ? taskId : null, prismaClient: prisma as never,
    });
  } catch (e) {
    console.error("[quality] review task completion failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Saves the review of a month. One per month: a second one is refused. */
export async function createReview(actor: Actor, body: Record<string, unknown> | null) {
  const made = await write(async (tx) => {
    const { data, problems } = parseFields("review", body);
    const period = body?.period;
    problems.push(...reviewProblems(data, period));
    if (problems.length) throw invalid(problems);
    if (!isPeriod(period)) throw invalid([{ field: "period", message: "Month: choose the month being reviewed." }]);
    if (period > periodOfDay(getPacificToday())) throw invalid([{ field: "period", message: "Month: a month that has not started cannot be reviewed yet." }]);
    const existing = await tx.qualityReview.findUnique({ where: { period } });
    if (existing) throw refuse(409, `${periodLabel(period)} already has a review. Open it to make changes.`, { code: "already_reviewed", review: { id: existing.id } });
    // The counts are taken now, at the moment of saving, and stay as they were
    const counts = await currentCounts(tx, period);
    const row = await tx.qualityReview.create({
      data: {
        period, reviewDate: new Date(`${data.reviewDate}T00:00:00Z`), reviewedById: actor.id, reviewedByName: actor.name,
        whatWasReviewed: String(data.whatWasReviewed ?? ""), notes: String(data.notes ?? ""), counts: counts as never,
      },
    });
    await recordEvent(tx, { type: "review", id: row.id, reference: reviewReference(period), action: "created", actor, changes: diffFields({}, data) });
    return { id: row.id, period, counts };
  });
  const completedInstanceId = await completeReviewTask(actor, made.id, made.period, body?.taskId);
  if (completedInstanceId) await prisma.qualityReview.update({ where: { id: made.id }, data: { linkedInstanceId: completedInstanceId } }).catch(() => {});
  return { ...made, completedInstanceId };
}

/** Edits an existing review. The month, the reviewer and the counts taken at the first save do not change. */
export function updateReview(actor: Actor, id: string, body: Record<string, unknown> | null) {
  return write(async (tx) => {
    const current = await tx.qualityReview.findUnique({ where: { id } });
    if (!current) throw refuse(404, "Review not found.");
    if (typeof body?.expectedUpdatedAt !== "string") throw refuse(400, "expectedUpdatedAt is required.");
    const conflict = () => refuse(409, "Someone else changed this review. Reload to see the latest version.", { code: "conflict" });
    if (body.expectedUpdatedAt !== current.updatedAt.toISOString()) throw conflict();
    const { data, problems } = parseFields("review", body);
    for (const required of ["reviewDate", "whatWasReviewed"]) if (required in data && !data[required]) problems.push({ field: required, message: `${required === "reviewDate" ? "Review date" : "What was reviewed"}: this cannot be emptied.` });
    if (problems.length) throw invalid(problems);
    const changes = diffFields(current, data);
    if (changes.length === 0) return { updatedAt: current.updatedAt.toISOString(), changed: 0 };
    const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const patch = Object.fromEntries(changes.map((c) => [c.field, c.field === "reviewDate" ? new Date(`${data.reviewDate}T00:00:00Z`) : data[c.field] ?? ""]));
    const res = await tx.qualityReview.updateMany({ where: { id, updatedAt: current.updatedAt }, data: { ...patch, updatedAt: now } });
    if (res.count !== 1) throw conflict();
    await recordEvent(tx, { type: "review", id, reference: reviewReference(current.period), action: "updated", actor, changes });
    return { updatedAt: now.toISOString(), changed: changes.length };
  });
}

/** For "Start" on a review task: the month that task is for (the month of its due date). Null if it is not a review task. */
export async function periodOfReviewTask(taskId: string | null | undefined): Promise<string | null> {
  if (!taskId) return null;
  const inst = await prisma.ruleInstance.findUnique({ where: { id: taskId }, select: { dueDate: true, rule: { select: { formKey: true } } } });
  return inst && inst.rule.formKey === QUALITY_REVIEW_FORM_KEY ? day(inst.dueDate)!.slice(0, 7) : null;
}

/** For "Start" on a CAPA task: the CAPA that holds this task. Null if none does. */
export async function capaOfTask(taskId: string | null | undefined): Promise<{ id: string; reference: string } | null> {
  if (!taskId) return null;
  const rows = await prisma.qualityCapa.findMany({ where: { taskInstanceId: taskId }, select: { id: true, reference: true } });
  return rows[0] ? { id: rows[0].id, reference: rows[0].reference } : null;
}
