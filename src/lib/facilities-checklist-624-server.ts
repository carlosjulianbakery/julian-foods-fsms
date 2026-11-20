import type { Prisma, PrismaClient } from "@/generated/prisma";
import { FACILITIES_FACILITY, FACILITIES_FORM_KEY, sortItems, taskInPeriod, type ChecklistItem, type Period } from "@/lib/facilities-checklist-624";

type Db = PrismaClient | Prisma.TransactionClient;

/** The live checklist: everything that has not been retired, in form order. */
export async function loadLiveItems(db: Db): Promise<ChecklistItem[]> {
  const rows = await db.facilitiesChecklistItem.findMany({
    where: { facility: FACILITIES_FACILITY, retiredAt: null },
    select: { id: true, groupName: true, name: true, description: true, sortOrder: true },
  });
  return sortItems(rows);
}

export async function loadListVersion(db: Db): Promise<number> {
  return (await db.facilitiesChecklistList.findUnique({ where: { facility: FACILITIES_FACILITY }, select: { version: true } }))?.version ?? 1;
}

/** Every change to the checklist goes through here. */
export function bumpListVersion(db: Db, userId: string) {
  return db.facilitiesChecklistList.upsert({
    where: { facility: FACILITIES_FACILITY },
    create: { facility: FACILITIES_FACILITY, version: 2, updatedById: userId },
    update: { version: { increment: 1 }, updatedById: userId },
    select: { version: true },
  });
}

export const canUseFacilities = (role: string | undefined) => role === "SUPERVISOR" || role === "ADMIN";

export interface PeriodTask { id: string; dueDate: string; status: string }

/** The Facilities Checklist task due inside a week (Monday..Sunday), if the rule has one. */
export async function findTaskForPeriod(db: Db, period: Pick<Period, "start" | "end">): Promise<PeriodTask | null> {
  const instances = await db.ruleInstance.findMany({
    where: {
      rule: { formKey: FACILITIES_FORM_KEY, facility: { name: FACILITIES_FACILITY } },
      dueDate: { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T00:00:00Z`) },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, dueDate: true, status: true },
  });
  const task = taskInPeriod(instances, period);
  return task ? { id: task.id, dueDate: task.dueDate.toISOString().slice(0, 10), status: task.status } : null;
}

/** A task id only counts if it really is this form's task; returns its due date. */
export async function facilitiesTaskById(db: Db, taskId: string | null | undefined): Promise<PeriodTask | null> {
  if (!taskId) return null;
  const inst = await db.ruleInstance.findUnique({
    where: { id: taskId },
    select: { id: true, dueDate: true, status: true, rule: { select: { formKey: true, facility: { select: { name: true } } } } },
  });
  if (!inst || inst.rule.formKey !== FACILITIES_FORM_KEY || inst.rule.facility?.name !== FACILITIES_FACILITY) return null;
  return { id: inst.id, dueDate: inst.dueDate.toISOString().slice(0, 10), status: inst.status };
}
