export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskRulesClient } from "./TaskRulesClient";

export default async function TaskRulesPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const [rules, facilities, users, openCounts, completedCounts, auditCountsRaw] = await Promise.all([
    prisma.taskRule.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        facility: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { instances: true } },
      },
    }),
    prisma.facility.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ruleInstance.groupBy({
      by: ["ruleId"],
      where: { status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"] } },
      _count: { id: true },
    }),
    prisma.ruleInstance.groupBy({
      by: ["ruleId"],
      where: { status: "DONE" },
      _count: { id: true },
    }),
    prisma.$queryRaw<{ ruleId: string; cnt: number }[]>`
      SELECT ri."ruleId", COUNT(tia.id)::int AS cnt
      FROM task_instance_audits tia
      JOIN rule_instances ri ON tia."instanceId" = ri.id
      GROUP BY ri."ruleId"
    `,
  ]);

  const openMap = new Map(openCounts.map((r) => [r.ruleId, r._count.id]));
  const completedMap = new Map(completedCounts.map((r) => [r.ruleId, r._count.id]));
  const auditMap = new Map(auditCountsRaw.map((r) => [r.ruleId, r.cnt]));

  const serialized = rules.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    facilityId: r.facilityId,
    facilityName: r.facility.name,
    ownerId: r.ownerId,
    ownerName: r.owner.name,
    triggerType: r.triggerType as string,
    recurrenceUnit: r.recurrenceUnit,
    recurrenceEvery: r.recurrenceEvery,
    recurrenceStart: r.recurrenceStart.toISOString().slice(0, 10),
    formKey: r.formKey,
    productName: r.productName ?? null,
    isActive: r.isActive,
    isArchived: r.isArchived,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    instanceCount: r._count.instances,
    openInstanceCount: openMap.get(r.id) ?? 0,
    completedInstanceCount: completedMap.get(r.id) ?? 0,
    auditCount: auditMap.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));

  const syncStatuses = facilities.map((f) => ({
    facilityId: f.id,
    facilityName: f.name,
    lastSyncAt: f.lastCalendarSyncAt?.toISOString() ?? null,
    lastSyncError: f.lastCalendarSyncError ?? null,
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Task Rules</h1>
          <p className="page-subtitle">Define recurring and one-off tasks for each facility</p>
        </div>
      </div>
      <TaskRulesClient
        rules={serialized}
        facilities={facilities.map((f) => ({ id: f.id, name: f.name }))}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        syncStatuses={syncStatuses}
      />
    </div>
  );
}
