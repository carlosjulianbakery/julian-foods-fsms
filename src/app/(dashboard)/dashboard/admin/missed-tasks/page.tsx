import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import { MissedTasksClient } from "./MissedTasksClient";

export const dynamic = "force-dynamic";

function fmt(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function fmtDateTime(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date) + " PT";
}

export default async function MissedTasksPage({
  searchParams,
}: {
  searchParams: { owner?: string; from?: string; to?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") redirect("/dashboard");

  const today = getPacificToday();
  const thirtyDaysAgo = addDaysToDateStr(today, -30);

  const ownerFilter = searchParams.owner ?? "";
  const fromFilter = searchParams.from ?? "";
  const toFilter = searchParams.to ?? "";

  const instances = await prisma.ruleInstance.findMany({
    where: {
      status: "MISSED",
      ...(ownerFilter ? {
        OR: [
          { ownerUserId: ownerFilter },
          { ownerUserId: null, rule: { ownerId: ownerFilter } },
        ],
      } : {}),
      ...(fromFilter ? { markedMissedAt: { gte: new Date(`${fromFilter}T00:00:00Z`) } } : {}),
      ...(toFilter ? { markedMissedAt: { lte: new Date(`${toFilter}T23:59:59Z`) } } : {}),
    },
    include: {
      rule: {
        select: {
          title: true,
          ownerId: true,
          facility: { select: { name: true } },
          owner: { select: { name: true } },
        },
      },
      markedMissedBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { markedMissedAt: "desc" },
  });

  // Count missed per owner in last 30 days (for amber badge logic)
  const missed30 = await prisma.ruleInstance.findMany({
    where: {
      status: "MISSED",
      markedMissedAt: { gte: new Date(`${thirtyDaysAgo}T00:00:00Z`) },
    },
    select: { ownerUserId: true, rule: { select: { ownerId: true } } },
  });

  const missedCountByOwner = new Map<string, number>();
  for (const m of missed30) {
    const ownerId = m.ownerUserId ?? m.rule.ownerId;
    missedCountByOwner.set(ownerId, (missedCountByOwner.get(ownerId) ?? 0) + 1);
  }

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rows = instances.map((inst) => {
    const effectiveOwnerName = inst.assignedTo?.name ?? inst.rule.owner.name;
    const effectiveOwnerId = inst.ownerUserId ?? inst.rule.ownerId;
    const ownerMissed30 = missedCountByOwner.get(effectiveOwnerId) ?? 0;
    return {
      id: inst.id,
      date: fmt(inst.dueDate),
      task: inst.rule.title,
      facility: inst.rule.facility.name,
      owner: effectiveOwnerName,
      ownerMissed30,
      reason: inst.missedReason ?? "",
      markedAt: fmtDateTime(inst.markedMissedAt),
      markedBy: inst.markedMissedBy?.name ?? "—",
    };
  });

  return (
    <MissedTasksClient
      rows={rows}
      users={users}
      ownerFilter={ownerFilter}
      fromFilter={fromFilter}
      toFilter={toFilter}
    />
  );
}
