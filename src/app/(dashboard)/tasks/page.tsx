export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate, getStatusColor, getPriorityColor, isOverdue } from "@/lib/utils";
import { CalendarCheck, Plus, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { TaskStatusUpdater } from "@/components/tasks/TaskStatusUpdater";

const STATUS_FILTERS = ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "CANCELLED"];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { status?: string; mine?: string };
}) {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const role = session!.user.role;
  const canCreate = role === "ADMIN" || role === "SUPERVISOR";

  const statusFilter = searchParams.status ?? "ALL";
  const mineOnly = searchParams.mine === "1";

  const where: any = {};
  if (mineOnly) where.assignedToId = userId;
  if (statusFilter !== "ALL") {
    if (statusFilter === "OVERDUE") {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ["COMPLETED", "CANCELLED"] };
    } else {
      where.status = statusFilter;
    }
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: {
      assignedTo: { select: { name: true } },
      form: { select: { title: true } },
      createdBy: { select: { name: true } },
    },
  });

  const counts = await prisma.task.groupBy({
    by: ["status"],
    where: mineOnly ? { assignedToId: userId } : {},
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const overdueCount = tasks.filter(
    (t) => isOverdue(t.dueDate) && !["COMPLETED", "CANCELLED"].includes(t.status)
  ).length;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">Scheduled food safety activities</p>
        </div>
        {canCreate && (
          <Link href="/tasks/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Task
          </Link>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "All", value: "ALL", count: tasks.length },
          { label: "Pending", value: "PENDING", count: countMap.PENDING ?? 0 },
          { label: "In Progress", value: "IN_PROGRESS", count: countMap.IN_PROGRESS ?? 0 },
          { label: "Overdue", value: "OVERDUE", count: overdueCount },
          { label: "Completed", value: "COMPLETED", count: countMap.COMPLETED ?? 0 },
        ].map((item) => (
          <Link
            key={item.value}
            href={`/tasks?status=${item.value}${mineOnly ? "&mine=1" : ""}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === item.value
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {item.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${statusFilter === item.value ? "bg-brand-700" : "bg-gray-100"}`}>
              {item.count}
            </span>
          </Link>
        ))}
        {!mineOnly && (
          <Link
            href={`/tasks?status=${statusFilter}&mine=1`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:bg-gray-50 ml-auto"
          >
            My tasks only
          </Link>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <CheckCircle2 className="w-10 h-10 mb-3" />
          <p className="font-medium text-gray-600">No tasks found</p>
          {canCreate && (
            <Link href="/tasks/new" className="btn-primary mt-4">
              <Plus className="w-4 h-4" /> Create Task
            </Link>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate) && !["COMPLETED", "CANCELLED"].includes(task.status);
            return (
              <div key={task.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link href={`/tasks/${task.id}`} className="font-medium text-gray-900 hover:text-brand-700 transition-colors">
                      {task.title}
                    </Link>
                    {overdue && (
                      <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                        <AlertTriangle className="w-3 h-3" /> Overdue
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(task.dueDate)}
                    </span>
                    <span>·</span>
                    <span>Assigned to {task.assignedTo.name}</span>
                    {task.form && (
                      <>
                        <span>·</span>
                        <span className="text-blue-600">{task.form.title}</span>
                      </>
                    )}
                    {task.recurrence !== "NONE" && (
                      <>
                        <span>·</span>
                        <span className="capitalize">{task.recurrence.toLowerCase()}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`badge ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                  <TaskStatusUpdater taskId={task.id} currentStatus={task.status} canEdit={canCreate || task.assignedToId === userId} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
