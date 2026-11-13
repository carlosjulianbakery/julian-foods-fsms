import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
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
      },
    },
    doneBy: { select: { id: true, name: true } },
    skippedBy: { select: { id: true, name: true } },
  };

  const statusConditions: Prisma.RuleInstanceWhereInput = {
    OR: [
      { status: { in: ["OVERDUE", "MISSED", "DUE_TODAY", "IN_PROGRESS"] } },
      {
        status: "UPCOMING",
        dueDate: { lte: new Date(sevenDaysOut + "T23:59:59Z") },
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

  const [instances, skippedInstances, calendarInstances] = await Promise.all([
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
  ]);

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
    };
  }

  const serialized: TaskInstance[] = instances.map(serializeInst);
  const serializedSkipped: TaskInstance[] = (skippedInstances as typeof instances).map(serializeInst);
  const serializedCalendar: TaskInstance[] = (calendarInstances as typeof instances).map(serializeInst);

  let facilities: { id: string; name: string }[] = [];
  let owners: { id: string; name: string }[] = [];
  if (role === "ADMIN") {
    [facilities, owners] = await Promise.all([
      prisma.facility.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
  }

  const firstName = (session.user as { name?: string }).name?.split(" ")[0] ?? "there";

  return (
    <MyTasksClient
      instances={serialized}
      skippedInstances={serializedSkipped}
      calendarInstances={serializedCalendar}
      calendarWeekStart={calendarWeekStart}
      role={role}
      userId={userId}
      firstName={firstName}
      facilities={facilities}
      owners={owners.map((u) => ({ id: u.id, name: u.name ?? "" }))}
      today={today}
    />
  );
}
