export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  getStatusColor,
  getPriorityColor,
  getRoleColor,
} from "@/lib/utils";
import Link from "next/link";
import {
  ClipboardList,
  CalendarCheck,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Users,
  ChevronRight,
  Settings,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getDashboardData(userId: string, role: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (role === "SUPERVISOR") {
    const [
      totalTasksToday,
      completedTasksToday,
      overdueTasks,
      recentSubmissions,
    ] = await Promise.all([
      prisma.task.count({
        where: { dueDate: { gte: today, lt: tomorrow } },
      }),
      prisma.task.count({
        where: {
          status: "COMPLETED",
          dueDate: { gte: today, lt: tomorrow },
        },
      }),
      prisma.task.findMany({
        where: {
          dueDate: { lt: today },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        orderBy: { dueDate: "asc" },
        take: 8,
        include: {
          assignedTo: { select: { name: true } },
          form: { select: { title: true } },
        },
      }),
      prisma.formSubmission.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          form: { select: { title: true } },
          submittedBy: { select: { name: true } },
        },
      }),
    ]);
    return {
      role: "SUPERVISOR" as const,
      totalTasksToday,
      completedTasksToday,
      overdueTasks,
      recentSubmissions,
    };
  }

  // ADMIN
  const [
    totalForms,
    totalTasks,
    totalRecords,
    totalUsers,
    overdueTasks,
    recentSubmissions,
  ] = await Promise.all([
    prisma.form.count({ where: { active: true } }),
    prisma.task.count(),
    prisma.record.count({ where: { archived: false } }),
    prisma.user.count({ where: { active: true } }),
    prisma.task.findMany({
      where: {
        dueDate: { lt: today },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: {
        assignedTo: { select: { name: true } },
        form: { select: { title: true } },
      },
    }),
    prisma.formSubmission.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        form: { select: { title: true } },
        submittedBy: { select: { name: true } },
      },
    }),
  ]);

  return {
    role: "ADMIN" as const,
    totalForms,
    totalTasks,
    totalRecords,
    totalUsers,
    overdueTasks,
    recentSubmissions,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const role = session!.user.role;
  const firstName = session?.user?.name?.split(" ")[0];

  const data = await getDashboardData(userId, role);

  return (
    <div className="space-y-6 max-w-6xl">
      {data.role === "SUPERVISOR" && (
        <SupervisorDashboard firstName={firstName} role={role} data={data} />
      )}
      {data.role === "ADMIN" && (
        <AdminDashboard firstName={firstName} role={role} data={data} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUPERVISOR view
// ---------------------------------------------------------------------------

type SupervisorData = Extract<
  Awaited<ReturnType<typeof getDashboardData>>,
  { role: "SUPERVISOR" }
>;

function SupervisorDashboard({
  firstName,
  role,
  data,
}: {
  firstName?: string;
  role: string;
  data: SupervisorData;
}) {
  const completionPct =
    data.totalTasksToday > 0
      ? Math.round((data.completedTasksToday / data.totalTasksToday) * 100)
      : 0;

  return (
    <>
      <div className="flex items-center gap-3">
        <div>
          <h1 className="page-title">Good {getGreeting()}, {firstName} 👋</h1>
          <p className="page-subtitle">Team overview for today.</p>
        </div>
        <span className={`badge ${getRoleColor(role)}`}>{role}</span>
      </div>

      {/* Team completion stat */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center">
              <CalendarCheck className="w-4.5 h-4.5 text-brand-600" />
            </div>
            <p className="text-sm text-gray-500">Tasks Today</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.totalTasksToday}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-green-600" />
            </div>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.completedTasksToday}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500">Completion Rate</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{completionPct}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue tasks */}
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Overdue Tasks</h2>
            <Link href="/tasks?status=OVERDUE" className="text-xs text-brand-600 hover:underline font-medium">
              View all
            </Link>
          </div>
          {data.overdueTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <CheckCircle2 className="w-8 h-8 mb-2" />
              <p className="text-sm">No overdue tasks</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.overdueTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="flex items-start gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {task.assignedTo.name}
                        {task.form && ` · ${task.form.title}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`badge ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                      <p className="text-xs text-red-400 mt-1">{formatDate(task.dueDate)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent submissions */}
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Submissions</h2>
            <Link href="/forms/submissions" className="text-xs text-brand-600 hover:underline font-medium">
              View all
            </Link>
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
          <Link href="/forms/submissions" className="btn-primary">
            <ClipboardList className="w-4 h-4" /> Review Submissions
          </Link>
          <Link href="/tasks/new" className="btn-secondary">
            <CalendarCheck className="w-4 h-4" /> Create Task
          </Link>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ADMIN view
// ---------------------------------------------------------------------------

type AdminData = Extract<
  Awaited<ReturnType<typeof getDashboardData>>,
  { role: "ADMIN" }
>;

function AdminDashboard({
  firstName,
  role,
  data,
}: {
  firstName?: string;
  role: string;
  data: AdminData;
}) {
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
      label: "Active Users",
      value: data.totalUsers,
      icon: Users,
      color: "text-green-600",
      bg: "bg-green-50",
      href: "/dashboard/admin/users",
    },
  ];

  return (
    <>
      <div className="flex items-center gap-3">
        <div>
          <h1 className="page-title">Good {getGreeting()}, {firstName} 👋</h1>
          <p className="page-subtitle">System overview for Julian's Foods.</p>
        </div>
        <span className={`badge ${getRoleColor(role)}`}>{role}</span>
      </div>

      {/* System stats */}
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
        {/* Overdue tasks system-wide */}
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Overdue Tasks</h2>
            <Link href="/tasks?status=OVERDUE" className="text-xs text-brand-600 hover:underline font-medium">
              View all
            </Link>
          </div>
          {data.overdueTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <CheckCircle2 className="w-8 h-8 mb-2" />
              <p className="text-sm">No overdue tasks</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.overdueTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="flex items-start gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {task.assignedTo.name}
                        {task.form && ` · ${task.form.title}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`badge ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                      <p className="text-xs text-red-400 mt-1">{formatDate(task.dueDate)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent submissions system-wide */}
        <div className="card">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Submissions</h2>
            <Link href="/forms/submissions" className="text-xs text-brand-600 hover:underline font-medium">
              View all
            </Link>
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
          <Link href="/forms/builder" className="btn-primary">
            <Settings className="w-4 h-4" /> Form Builder
          </Link>
          <Link href="/dashboard/admin/users" className="btn-secondary">
            <Users className="w-4 h-4" /> Manage Users
          </Link>
          <Link href="/tasks/new" className="btn-secondary">
            <CalendarCheck className="w-4 h-4" /> Create Task
          </Link>
          <Link href="/records/new" className="btn-secondary">
            <FolderOpen className="w-4 h-4" /> Add Record
          </Link>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
