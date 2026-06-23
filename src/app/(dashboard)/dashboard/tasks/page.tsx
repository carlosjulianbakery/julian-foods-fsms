export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TasksViewClient } from "./TasksViewClient";

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="max-w-5xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">Track and complete your assigned tasks</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin/tasks"
              className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
            >
              Manage Task Templates →
            </Link>
            <Link href="/dashboard/admin/tasks/new" className="btn-primary">
              <Plus className="w-4 h-4" /> Create Task
            </Link>
          </div>
        )}
      </div>
      <TasksViewClient role={session.user.role} userId={session.user.id} />
    </div>
  );
}
