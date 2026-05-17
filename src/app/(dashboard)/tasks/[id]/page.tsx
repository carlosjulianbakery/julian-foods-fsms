export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, getStatusColor, getPriorityColor } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, User, MapPin, RefreshCw, ClipboardList } from "lucide-react";
import { TaskStatusUpdater } from "@/components/tasks/TaskStatusUpdater";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const role = session!.user.role;
  const canEdit = role === "ADMIN" || role === "SUPERVISOR";

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: { select: { name: true, email: true, department: true } },
      createdBy: { select: { name: true } },
      form: { select: { id: true, title: true } },
      submissions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          submittedBy: { select: { name: true } },
        },
      },
    },
  });

  if (!task) notFound();
  if (!canEdit && task.assignedToId !== userId) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tasks" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="page-title">{task.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`badge ${getStatusColor(task.status)}`}>{task.status.replace("_", " ")}</span>
            <span className={`badge ${getPriorityColor(task.priority)}`}>{task.priority}</span>
          </div>
        </div>
        <TaskStatusUpdater
          taskId={task.id}
          currentStatus={task.status}
          canEdit={canEdit || task.assignedToId === userId}
        />
      </div>

      <div className="card p-6 space-y-4">
        {task.description && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-gray-700">{task.description}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Assigned To</p>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{task.assignedTo.name}</p>
                {task.assignedTo.department && (
                  <p className="text-xs text-gray-500">{task.assignedTo.department}</p>
                )}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Due Date</p>
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-gray-400" />
              <p className="text-sm text-gray-900">{formatDateTime(task.dueDate)}</p>
            </div>
          </div>
          {task.location && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Location</p>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-900">{task.location}</p>
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Recurrence</p>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-gray-400" />
              <p className="text-sm text-gray-900 capitalize">{task.recurrence.toLowerCase()}</p>
            </div>
          </div>
        </div>
      </div>

      {task.form && (
        <div className="card p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Required Form</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-500" />
              <p className="text-sm font-medium text-gray-900">{task.form.title}</p>
            </div>
            <Link
              href={`/forms/${task.form.id}/submit?taskId=${task.id}`}
              className="btn-primary text-xs px-3 py-1.5"
            >
              Fill Form
            </Link>
          </div>
        </div>
      )}

      {task.submissions.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Submissions</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {task.submissions.map((sub) => (
              <li key={sub.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">by {sub.submittedBy.name}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(sub.createdAt)}</p>
                </div>
                <span className={`badge ${getStatusColor(sub.status)}`}>{sub.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-gray-400">
        Created by {task.createdBy.name} · {formatDateTime(task.createdAt)}
      </div>
    </div>
  );
}
