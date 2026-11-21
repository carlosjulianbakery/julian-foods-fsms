import type { Prisma, PrismaClient } from "@/generated/prisma";
import { FOREIGN_MATTER_FACILITY, FOREIGN_MATTER_FORM_KEY, isSection, sortItems, type FmItem, type Period } from "@/lib/foreign-matter-624";

type Db = PrismaClient | Prisma.TransactionClient;

/** The live list: everything that has not been retired, in form order. */
export async function loadLiveItems(db: Db): Promise<FmItem[]> {
  const rows = await db.foreignMatterItem.findMany({
    where: { facility: FOREIGN_MATTER_FACILITY, retiredAt: null },
    select: { id: true, section: true, areaName: true, name: true, expectedQuantity: true, sortOrder: true },
  });
  return sortItems(rows.filter((r) => isSection(r.section)) as FmItem[]);
}

export async function loadListVersion(db: Db): Promise<number> {
  return (await db.foreignMatterList.findUnique({ where: { facility: FOREIGN_MATTER_FACILITY }, select: { version: true } }))?.version ?? 1;
}

/** Every change to the list goes through here. */
export function bumpListVersion(db: Db, userId: string) {
  return db.foreignMatterList.upsert({
    where: { facility: FOREIGN_MATTER_FACILITY },
    create: { facility: FOREIGN_MATTER_FACILITY, version: 2, updatedById: userId },
    update: { version: { increment: 1 }, updatedById: userId },
    select: { version: true },
  });
}

export const canUseForeignMatter = (role: string | undefined) => role === "SUPERVISOR" || role === "ADMIN";

export interface PeriodTask { id: string; dueDate: string; status: string }

/** The inspection task of a period: the rule's instance due on the period's last day (the 15th or the month's last day). */
export async function findTaskForPeriod(db: Db, period: Pick<Period, "end">): Promise<PeriodTask | null> {
  const instances = await db.ruleInstance.findMany({
    where: {
      rule: { formKey: FOREIGN_MATTER_FORM_KEY, facility: { name: FOREIGN_MATTER_FACILITY } },
      dueDate: { gte: new Date(`${period.end}T00:00:00Z`), lte: new Date(`${period.end}T00:00:00Z`) },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, dueDate: true, status: true },
  });
  const closed = ["DONE", "SKIPPED", "MISSED"];
  const task = instances.find((i) => !closed.includes(i.status)) ?? instances[0];
  return task ? { id: task.id, dueDate: task.dueDate.toISOString().slice(0, 10), status: task.status } : null;
}

/** A task id only counts if it really is this form's task; returns its due date. */
export async function foreignMatterTaskById(db: Db, taskId: string | null | undefined): Promise<PeriodTask | null> {
  if (!taskId) return null;
  const inst = await db.ruleInstance.findUnique({
    where: { id: taskId },
    select: { id: true, dueDate: true, status: true, rule: { select: { formKey: true, facility: { select: { name: true } } } } },
  });
  if (!inst || inst.rule.formKey !== FOREIGN_MATTER_FORM_KEY || inst.rule.facility?.name !== FOREIGN_MATTER_FACILITY) return null;
  return { id: inst.id, dueDate: inst.dueDate.toISOString().slice(0, 10), status: inst.status };
}
