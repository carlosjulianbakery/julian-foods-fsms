import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import { computeWindowStart, isInWindow, windowOverlapsRange } from "@/lib/window-tasks";
import { sortTasks } from "@/lib/task-order";
import { MyTasksClient, type TaskInstance } from "./MyTasksClient";

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun
  const daysBack = dow === 0 ? -6 : 1 - dow;
  return addDaysToDateStr(dateStr, daysBack);
}

export async function MyTasksBlock() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const userId = session.user.id;
  const role = session.user.role;
  const today = getPacificToday();
  const sevenDaysOut = addDaysToDateStr(today, 7);
  const sevenDaysAgo = addDaysToDateStr(today, -7);
  const calendarWeekStart = getMondayOf(today);
  const calendarWeekEnd = addDaysToDateStr(calendarWeekStart, 6);

  // Effective-owner: show if explicitly assigned, OR if not reassigned and rule.ownerId matches.
  // ownerUserId null means "not reassigned" — still belongs to rule owner.
  // ownerUserId non-null means reassigned — only the assignee sees it, not the original rule owner.
  const visibilityFilter: Prisma.RuleInstanceWhereInput =
    role !== "ADMIN"
      ? {
          OR: [
            { ownerUserId: userId },
            { ownerUserId: null, rule: { ownerId: userId } },
          ],
        }
      : {};

  const instanceInclude = {
    rule: {
      select: {
        id: true,
        title: true,
        ownerId: true,
        formKey: true,
        facility: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        windowMode: true,
        windowDaysBefore: true,
        recurrenceUnit: true,
        sortOrder: true,
        createdAt: true,
      },
    },
    doneBy: { select: { id: true, name: true } },
    skippedBy: { select: { id: true, name: true } },
  };

  const statusConditions: Prisma.RuleInstanceWhereInput = {
    OR: [
      { status: { in: ["OVERDUE", "MISSED", "DUE_TODAY"] } },
      // IN_PROGRESS on today/past or on a non-window rule → show in Today section
      { status: "IN_PROGRESS", dueDate: { lte: new Date(today + "T23:59:59Z") } },
      { status: "IN_PROGRESS", dueDate: { gt: new Date(today + "T23:59:59Z") }, rule: { windowMode: "NONE" } },
      // UPCOMING due today (regardless of window mode — will show as DUE_TODAY)
      { status: "UPCOMING", dueDate: { lte: new Date(today + "T23:59:59Z") } },
      // UPCOMING future, non-window tasks only (window tasks go to "Open this period")
      {
        status: "UPCOMING",
        dueDate: { gt: new Date(today + "T23:59:59Z"), lte: new Date(sevenDaysOut + "T23:59:59Z") },
        rule: { windowMode: "NONE" },
      },
      {
        status: "DONE",
        doneAt: { gte: new Date(today + "T00:00:00Z") },
      },
    ],
  };

  // Calendar visibility filter — admins see all by default
  const calendarVisibilityFilter: Prisma.RuleInstanceWhereInput =
    role !== "ADMIN"
      ? {
          OR: [
            { ownerUserId: userId },
            { ownerUserId: null, rule: { ownerId: userId } },
          ],
        }
      : {};

  const [instances, skippedInstances, calendarInstances, rawWindowInstances] = await Promise.all([
    prisma.ruleInstance.findMany({
      where:
        role !== "ADMIN"
          ? { AND: [visibilityFilter, statusConditions] }
          : statusConditions,
      include: instanceInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    // Only fetch skipped instances for admins — last 7 days
    role === "ADMIN"
      ? prisma.ruleInstance.findMany({
          where: {
            status: "SKIPPED",
            skippedAt: { gte: new Date(sevenDaysAgo + "T00:00:00Z") },
          },
          include: instanceInclude,
          orderBy: [{ skippedAt: "desc" }],
        })
      : Promise.resolve([]),
    // Calendar — current week Mon-Sun (all statuses for admins, no SKIPPED for supervisors)
    prisma.ruleInstance.findMany({
      where: {
        AND: [
          calendarVisibilityFilter,
          role !== "ADMIN" ? { status: { not: "SKIPPED" } } : {},
          {
            dueDate: {
              gte: new Date(calendarWeekStart + "T00:00:00Z"),
              lte: new Date(calendarWeekEnd + "T23:59:59Z"),
            },
          },
        ],
      },
      include: instanceInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    // Window instances: future, not terminal, window rule — filtered in TypeScript
    prisma.ruleInstance.findMany({
      where: {
        AND: [
          visibilityFilter,
          { rule: { windowMode: { not: "NONE" } } },
          { dueDate: { gt: new Date(today + "T23:59:59Z") } },
          { status: { notIn: ["DONE", "SKIPPED", "MISSED"] } },
        ],
      },
      include: instanceInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  function windowStartOf(inst: (typeof rawWindowInstances)[number]): string | null {
    return computeWindowStart(
      {
        windowMode: inst.rule.windowMode,
        windowDaysBefore: inst.rule.windowDaysBefore,
        recurrenceUnit: inst.rule.recurrenceUnit,
      },
      inst.dueDate.toISOString().slice(0, 10),
    );
  }

  // Keep only instances whose window is currently open (windowStart <= today)
  const openWindowInstances = rawWindowInstances.filter((inst) =>
    isInWindow(windowStartOf(inst), inst.dueDate.toISOString().slice(0, 10), today),
  );

  // Window tasks due after this week whose window reaches into it — the calendar draws their band
  const calendarWindowExtras = rawWindowInstances.filter((inst) => {
    const dueStr = inst.dueDate.toISOString().slice(0, 10);
    return dueStr > calendarWeekEnd && windowOverlapsRange(windowStartOf(inst), dueStr, calendarWeekStart, calendarWeekEnd);
  });

  // Fetch MC624 progress for open window instances
  const mc624InstanceIds = openWindowInstances
    .filter((i) => i.rule.formKey === "monthly_cleaning_624")
    .map((i) => i.id);
  const mc624Records =
    mc624InstanceIds.length > 0
      ? await prisma.monthlyClean624Record.findMany({
          where: { linkedInstanceId: { in: mc624InstanceIds } },
          select: { linkedInstanceId: true, doneCount: true, naCount: true, notDoneCount: true },
        })
      : [];
  const mc624ByInstanceId = new Map(
    mc624Records.filter((r) => r.linkedInstanceId != null).map((r) => [r.linkedInstanceId!, r]),
  );

  function serializeInst(inst: typeof instances[number]): TaskInstance {
    return {
      id: inst.id,
      ruleTitle: inst.rule.title,
      facilityId: inst.rule.facility.id,
      facilityName: inst.rule.facility.name,
      ownerId: inst.rule.ownerId,
      ownerUserId: inst.ownerUserId ?? null,
      ownerName: inst.rule.owner.name ?? "",
      formKey: inst.rule.formKey,
      label: inst.label,
      dueDate: inst.dueDate.toISOString().slice(0, 10),
      status: inst.status as string,
      source: inst.source,
      needsAdminReview: inst.needsAdminReview,
      reviewReason: inst.reviewReason,
      doneByName: inst.doneBy?.name ?? null,
      doneAt: inst.doneAt?.toISOString() ?? null,
      completedLate: inst.completedLate,
      daysLate: inst.daysLate,
      missedReason: inst.missedReason,
      skipReason: inst.skipReason ?? null,
      skippedByName: inst.skippedBy?.name ?? null,
      skippedAt: inst.skippedAt?.toISOString() ?? null,
      windowStart: windowStartOf(inst),
      ruleId: inst.rule.id,
      ruleSortOrder: inst.rule.sortOrder,
      ruleCreatedAt: inst.rule.createdAt.toISOString(),
      sortKey: inst.sortKey,
      createdAt: inst.createdAt.toISOString(),
    };
  }

  // Every work list uses the one saved work order (skipped history keeps newest-first)
  const serialized: TaskInstance[] = sortTasks(instances.map(serializeInst));
  const serializedSkipped: TaskInstance[] = (skippedInstances as typeof instances).map(serializeInst);
  const serializedCalendar: TaskInstance[] = sortTasks([
    ...(calendarInstances as typeof instances),
    ...calendarWindowExtras,
  ].map(serializeInst));

  function serializeWindowInst(inst: typeof openWindowInstances[number]): TaskInstance {
    const mc624 = mc624ByInstanceId.get(inst.id);
    const total = mc624 ? mc624.doneCount + mc624.naCount + mc624.notDoneCount : null;
    const done = mc624 ? mc624.doneCount + mc624.naCount : null;
    return {
      ...serializeInst(inst),
      progress: total != null && total > 0 ? { done: done!, total } : null,
    };
  }

  const serializedWindowInstances: TaskInstance[] = sortTasks(openWindowInstances.map(serializeWindowInst));

  let owners: { id: string; name: string }[] = [];
  if (role === "ADMIN") {
    owners = await prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  const facilitySyncInfoRaw = await prisma.facility.findMany({
    select: { id: true, lastCalendarSyncAt: true, lastCalendarSyncError: true },
  });
  const facilitySyncInfo = facilitySyncInfoRaw.map((f) => ({
    id: f.id,
    lastCalendarSyncAt: f.lastCalendarSyncAt?.toISOString() ?? null,
    lastCalendarSyncError: f.lastCalendarSyncError ?? null,
  }));

  const firstName = (session.user as { name?: string }).name?.split(" ")[0] ?? "there";

  return (
    <MyTasksClient
      instances={serialized}
      skippedInstances={serializedSkipped}
      calendarInstances={serializedCalendar}
      calendarWeekStart={calendarWeekStart}
      windowInstances={serializedWindowInstances}
      role={role}
      userId={userId}
      firstName={firstName}
      owners={owners.map((u) => ({ id: u.id, name: u.name ?? "" }))}
      today={today}
      facilitySyncInfo={facilitySyncInfo}
    />
  );
}
