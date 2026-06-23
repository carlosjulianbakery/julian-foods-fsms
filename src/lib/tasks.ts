import { PrismaClient, TaskInstance } from "@/generated/prisma";

export function calcNextDueDate(
  currentDueDate: Date,
  recurrenceType: string,
  recurrenceConfig: unknown
): Date | null {
  if (recurrenceType === "one_time") return null;

  const d = new Date(currentDueDate);
  const cfg = recurrenceConfig as Record<string, unknown> | null | undefined;

  switch (recurrenceType) {
    case "daily": {
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    }
    case "weekly": {
      const days = (cfg?.days_of_week as number[]) ?? [];
      if (days.length === 0) {
        d.setUTCDate(d.getUTCDate() + 7);
        return d;
      }
      const sortedDays = [...days].sort((a, b) => a - b);
      const currentDay = d.getUTCDay();
      const nextDay = sortedDays.find((day) => day > currentDay);
      if (nextDay !== undefined) {
        d.setUTCDate(d.getUTCDate() + (nextDay - currentDay));
      } else {
        const daysUntilNext = 7 - currentDay + sortedDays[0];
        d.setUTCDate(d.getUTCDate() + daysUntilNext);
      }
      return d;
    }
    case "biweekly": {
      d.setUTCDate(d.getUTCDate() + 14);
      return d;
    }
    case "monthly": {
      return addMonthsClamped(d, 1);
    }
    case "every_2_months": {
      return addMonthsClamped(d, 2);
    }
    case "quarterly": {
      return addMonthsClamped(d, 3);
    }
    case "every_6_months": {
      return addMonthsClamped(d, 6);
    }
    case "annual": {
      return addMonthsClamped(d, 12);
    }
    case "custom": {
      const intervalType = cfg?.interval_type as string | undefined;
      const intervalValue = (cfg?.interval_value as number) ?? 1;
      if (intervalType === "calendar" || cfg?.day_of_month !== undefined) {
        const dom = (cfg?.day_of_month as number) ?? d.getUTCDate();
        const next = new Date(d);
        next.setUTCMonth(next.getUTCMonth() + 1);
        const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(dom, lastDay));
        return next;
      }
      if (intervalType === "weeks") {
        d.setUTCDate(d.getUTCDate() + intervalValue * 7);
        return d;
      }
      if (intervalType === "months") {
        return addMonthsClamped(d, intervalValue);
      }
      d.setUTCDate(d.getUTCDate() + intervalValue);
      return d;
    }
    default:
      return null;
  }
}

function addMonthsClamped(d: Date, months: number): Date {
  const result = new Date(d);
  const originalDay = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function getNextNDueDates(
  firstDueDate: Date,
  recurrenceType: string,
  recurrenceConfig: unknown,
  n: number
): Date[] {
  const dates: Date[] = [new Date(firstDueDate)];
  if (recurrenceType === "one_time") return dates;

  let current = new Date(firstDueDate);
  for (let i = 1; i < n; i++) {
    const next = calcNextDueDate(current, recurrenceType, recurrenceConfig);
    if (!next) break;
    dates.push(new Date(next));
    current = next;
  }
  return dates;
}

export function formatTaskDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${m}/${day}/${d.getUTCFullYear()}`;
}

export function getPacificToday(): Date {
  const now = new Date();
  const pacificStr = now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const [year, month, day] = pacificStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export async function generateNextInstance(
  template: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    priority: string;
    assignedTo: unknown;
    taskType: string;
    formLink: unknown;
    recurrenceType: string;
    recurrenceConfig: unknown;
  },
  currentInstance: { dueDate: Date; instanceNumber: number },
  prismaClient: PrismaClient,
  performedById: string | null
): Promise<TaskInstance | null> {
  const nextDue = calcNextDueDate(
    currentInstance.dueDate,
    template.recurrenceType,
    template.recurrenceConfig
  );
  if (!nextDue) return null;

  const next = await (prismaClient as any).taskInstance.create({
    data: {
      templateId: template.id,
      title: template.title,
      description: template.description,
      category: template.category,
      priority: template.priority,
      assignedTo: template.assignedTo as any,
      taskType: template.taskType,
      formLink: template.formLink as any,
      dueDate: nextDue,
      status: "pending",
      instanceNumber: currentInstance.instanceNumber + 1,
    },
  });

  await (prismaClient as any).taskHistory.create({
    data: {
      instanceId: next.id,
      action: "next_instance_generated",
      performedById,
      note: `Generated from instance #${currentInstance.instanceNumber}`,
    },
  });

  return next;
}

export async function autoCompleteFormLinkedTasks(params: {
  formType: string;
  submittingUserId: string;
  submittedAt: Date;
  submissionId: string;
  supplierId?: string;
  requirementId?: string;
  prismaClient: PrismaClient;
}): Promise<void> {
  const { formType, submittingUserId, submittedAt, submissionId, supplierId, requirementId, prismaClient } = params;
  const today = getPacificToday();

  const candidates = await (prismaClient as any).taskInstance.findMany({
    where: {
      taskType: "form_linked",
      status: { in: ["pending", "overdue"] },
    },
    include: { template: true },
  });

  const matching = candidates.filter((inst: TaskInstance & { template: any }) => {
    const fl = inst.formLink as Record<string, unknown> | null;
    if (!fl) return false;
    if (fl.form_type !== formType) return false;

    const assignedTo = inst.assignedTo as Array<{ id: string; name: string }>;
    const isAssigned = assignedTo.some((u) => u.id === submittingUserId);
    if (!isAssigned) return false;

    const dueDate = new Date(inst.dueDate);
    const isDueOrOverdue = dueDate <= today || inst.status === "overdue";
    if (!isDueOrOverdue) return false;

    if (formType === "supplier_document") {
      if (fl.supplier_id && fl.supplier_id !== supplierId) return false;
      if (fl.requirement_id && fl.requirement_id !== requirementId) return false;
    }

    return true;
  });

  for (const inst of matching) {
    await (prismaClient as any).taskInstance.update({
      where: { id: inst.id },
      data: {
        status: "complete",
        completedById: submittingUserId,
        completedAt: submittedAt,
        formSubmissionId: submissionId,
      },
    });

    await (prismaClient as any).taskHistory.create({
      data: {
        instanceId: inst.id,
        action: "completed",
        performedById: submittingUserId,
        note: "Auto-completed by form submission",
      },
    });

    const tmpl = inst.template;
    await generateNextInstance(
      {
        id: tmpl.id,
        title: tmpl.title,
        description: tmpl.description,
        category: tmpl.category as string,
        priority: tmpl.priority as string,
        assignedTo: tmpl.assignedTo,
        taskType: tmpl.taskType as string,
        formLink: tmpl.formLink,
        recurrenceType: tmpl.recurrenceType as string,
        recurrenceConfig: tmpl.recurrenceConfig,
      },
      { dueDate: new Date(inst.dueDate), instanceNumber: inst.instanceNumber },
      prismaClient,
      submittingUserId
    );
  }
}
