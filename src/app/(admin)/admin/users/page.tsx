import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, getRoleColor } from "@/lib/utils";
import { Users, UserCheck, UserX } from "lucide-react";
import { UserRoleEditor } from "@/components/admin/UserRoleEditor";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session!.user.role === "ADMIN";

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      active: true,
      createdAt: true,
      _count: {
        select: {
          submissions: true,
          assignedTasks: true,
        },
      },
    },
  });

  const activeCount = users.filter((u) => u.active).length;
  const roleBreakdown = {
    ADMIN: users.filter((u) => u.role === "ADMIN").length,
    SUPERVISOR: users.filter((u) => u.role === "SUPERVISOR").length,
    OPERATOR: users.filter((u) => u.role === "OPERATOR").length,
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">User Management</h1>
        <p className="page-subtitle">Manage team access and roles</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: users.length, icon: Users, color: "text-gray-600", bg: "bg-gray-50" },
          { label: "Admins", value: roleBreakdown.ADMIN, icon: UserCheck, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Supervisors", value: roleBreakdown.SUPERVISOR, icon: UserCheck, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Operators", value: roleBreakdown.OPERATOR, icon: UserCheck, color: "text-brand-600", bg: "bg-brand-50" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center mb-2`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">All Users</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-4 px-6 py-4">
              <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-brand-700">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{user.name}</p>
                  {!user.active && (
                    <span className="badge bg-red-50 text-red-700">Inactive</span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{user.email}</p>
                {user.department && (
                  <p className="text-xs text-gray-400">{user.department}</p>
                )}
              </div>
              <div className="text-right text-xs text-gray-400 shrink-0">
                <p>{user._count.submissions} submissions</p>
                <p>{user._count.assignedTasks} tasks</p>
                <p className="mt-0.5">Joined {formatDate(user.createdAt)}</p>
              </div>
              <UserRoleEditor
                userId={user.id}
                currentRole={user.role}
                isActive={user.active}
                isAdmin={isAdmin}
                isSelf={user.id === session!.user.id}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
