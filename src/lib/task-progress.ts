import type { PrismaClient } from "@/generated/prisma";
import { VERIFICATION_FACILITY, VERIFICATION_FORM_KEY } from "@/lib/verification-624";

export interface TaskProgress { done: number; total: number }
export interface ProgressTask { id: string; dueDate: Date; rule: { formKey: string | null } }
type Provider = (tasks: ProgressTask[], prismaClient: PrismaClient) => Promise<Map<string, TaskProgress>>;

/**
 * Progress shown on "Open this period" cards. A form that keeps a draft per period registers how its
 * draft maps to a task and how far along it is — nothing here is specific to one form.
 */
export const PROGRESS_PROVIDERS: Record<string, Provider> = {
  monthly_cleaning_624: async (tasks, prismaClient) => {
    const records = await prismaClient.monthlyClean624Record.findMany({
      where: { linkedInstanceId: { in: tasks.map((t) => t.id) } },
      select: { linkedInstanceId: true, doneCount: true, naCount: true, notDoneCount: true },
    });
    const out = new Map<string, TaskProgress>();
    for (const r of records) {
      const total = r.doneCount + r.naCount + r.notDoneCount;
      if (r.linkedInstanceId && total > 0) out.set(r.linkedInstanceId, { done: r.doneCount + r.naCount, total });
    }
    return out;
  },

  [VERIFICATION_FORM_KEY]: async (tasks, prismaClient) => {
    const [records, total] = await Promise.all([
      prismaClient.verification624Record.findMany({
        where: {
          facility: VERIFICATION_FACILITY,
          status: "draft",
          OR: [{ linkedInstanceId: { in: tasks.map((t) => t.id) } }, { periodEnd: { in: tasks.map((t) => t.dueDate) } }],
        },
        select: { linkedInstanceId: true, periodEnd: true, okCount: true, failCount: true },
      }),
      prismaClient.verification624Equipment.count({ where: { facility: VERIFICATION_FACILITY, retiredAt: null, inUse: true } }),
    ]);
    const out = new Map<string, TaskProgress>();
    for (const t of tasks) {
      const due = t.dueDate.toISOString().slice(0, 10);
      // The draft opened from this task, or the draft for the period this task is due in
      const r = records.find((x) => x.linkedInstanceId === t.id) ?? records.find((x) => x.periodEnd.toISOString().slice(0, 10) === due);
      const done = r ? r.okCount + r.failCount : 0;
      if (r && total > 0 && done > 0) out.set(t.id, { done: Math.min(done, total), total });
    }
    return out;
  },
};

export async function fetchTaskProgress(tasks: ProgressTask[], prismaClient: PrismaClient): Promise<Map<string, TaskProgress>> {
  const out = new Map<string, TaskProgress>();
  const byForm = new Map<string, ProgressTask[]>();
  for (const t of tasks) {
    const key = t.rule.formKey;
    if (key && PROGRESS_PROVIDERS[key]) byForm.set(key, [...(byForm.get(key) ?? []), t]);
  }
  for (const [formKey, group] of Array.from(byForm.entries())) {
    try {
      for (const [id, p] of Array.from((await PROGRESS_PROVIDERS[formKey](group, prismaClient)).entries())) out.set(id, p);
    } catch (e) {
      console.error(`[task-progress] ${formKey}:`, e);
    }
  }
  return out;
}
