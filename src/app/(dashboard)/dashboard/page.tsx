export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, getStatusColor, getPriorityColor } from "@/lib/utils";
import Link from "next/link";
import {
  ClipboardList,
  CalendarCheck,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ChevronRight,
} from "lucide-react";

async function getDashboardData(userId: string, role: string) {
  const isAdmin = role === "ADMIN" || role === "SUPERVISOR";

  const [totalForms, totalTasks, totalRecords, myTasks, recentSubmissions, overdueTasks] =
    await Promise.all([
      prisma.form.count({ where: { active: true } }),
      prisma.task.count({
        where: isAdmin ? {} : { assignedToId: userId },
      }),
      prisma.record.count({ where: { archived: false } }),
      prisma.task.findMany({
        where: {
          assignedToId: userId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
        include: { form: { select: { title: true } } },
      }),
      prisma.formSubmission.findMany({
        where: isAdmin ? {} : { submittedById: userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          form: { select: { title: true } },
          submittedBy: { select: { name: true } },
        },
      }),
      prisma.task.count({
        where: {
          ...(isAdmin ? {} : { assignedToId: userId }),
          dueDate: { lt: new Date() },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
    ]);

  const completedTasks = await prisma.task.count({
    where: {
      ...(isAdmin ? {} : { assignedToId: userId }),
      status: "COMPLETED",
    },
  });

  return {
    totalForms,
    totalTasks,
    totalRecords,
    myTasks,
    recentSubmissions,
    overdueTasks,
    completedTasks,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const role = session!.user.role;

  const data = await getDashboardData(userId, role);

  const stats = [
    {
      label: "Active Forms",
      value: data.totalForms,
      icon: ClipboardList,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/forms",
    },
    {
      label: "Total Tasks",
      value: data.totalTasks,
      icon: CalendarCheck,
      color: "text-brand-600",
      bg: "bg-brand-50",
      href: "/tasks",
    },
    {
      label: "Records",
      value: data.totalRecords,
      icon: FolderOpen,
      color: "text-purple-600",
      bg: "bg-purple-50",
      href: "/records",
    },
    {
      label: "Overdue",
      value: data.overdueTasks,
      icon: AlertTriangle,
      color: data.overdueTasks > 0 ? "text-red-600" : "text-gray-400",
      bg: data.overdueTasks > 0 ? "bg-red-50" : "bg-gray-50",
      href: "/tasks?status=OVERDUE",
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="page-title">Good {getGreeting()}, {session?.user?.name?.split(" ")[0]} 👋</h1>
        <p className="page-subtitle">Here's what's happening at Julian's Foods today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-4.5 h-4.5 ${stat.color}`} />
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Upcoming Tasks */}
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">My Upcoming Tasks</h2>
            <Link href="/tasks" className="text-xs text-brand-600 hover:underline font-medium">View all</Link>
          </div>
          {data.myTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <CheckCircle2 className="w-8 h-8 mb-2" />
              <p className="text-sm">No pending tasks</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.myTasks.map((task) => (
                <li key={task.id}>
                  <Link href={`/tasks/${task.id}`} className="flex items-start gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      {task.form && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{task.form.title}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`badge ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(task.dueDate)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Submissions */}
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Submissions</h2>
            <Link href="/forms/submissions" className="text-xs text-brand-600 hover:underline font-medium">View all</Link>
          </div>
          {data.recentSubmissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <ClipboardList className="w-8 h-8 mb-2" />
              <p className="text-sm">No submissions yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.recentSubmissions.map((sub) => (
                <li key={sub.id} className="flex items-center gap-3 px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{sub.form.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">by {sub.submittedBy.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`badge ${getStatusColor(sub.status)}`}>{sub.status}</span>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(sub.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/forms" className="btn-primary">
            <ClipboardList className="w-4 h-4" /> Fill a Form
          </Link>
          <Link href="/tasks/new" className="btn-secondary">
            <CalendarCheck className="w-4 h-4" /> Create Task
          </Link>
          <Link href="/records/new" className="btn-secondary">
            <FolderOpen className="w-4 h-4" /> Add Record
          </Link>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
