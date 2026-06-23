export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { TaskTemplatesClient } from "./TaskTemplatesClient";

export default async function AdminTasksPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const [templates, users] = await Promise.all([
    prisma.taskTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        instances: {
          where: { status: { in: ["pending", "overdue"] } },
          orderBy: { dueDate: "asc" },
          take: 1,
          select: { dueDate: true, status: true },
        },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);

  const userMap: Record<string, string> = {};
  for (const u of users) {
    userMap[u.id] = u.name ?? u.id;
  }

  const serialized = templates.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    priority: t.priority,
    assignedTo: (Array.isArray(t.assignedTo) ? t.assignedTo : []) as string[],
    taskType: t.taskType,
    recurrenceType: t.recurrenceType,
    isActive: t.isActive,
    nextDue: t.instances[0]?.dueDate?.toISOString() ?? null,
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Task Templates</h1>
          <p className="page-subtitle">Create and manage recurring tasks for your team</p>
        </div>
        <Link href="/dashboard/admin/tasks/new" className="btn-primary">
          Create Task
        </Link>
      </div>
      <TaskTemplatesClient templates={serialized} userMap={userMap} />
    </div>
  );
}
