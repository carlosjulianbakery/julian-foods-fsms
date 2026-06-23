export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TasksViewClient } from "./TasksViewClient";

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Tasks</h1>
        <p className="page-subtitle">Track and complete your assigned tasks</p>
      </div>
      <TasksViewClient role={session.user.role} userId={session.user.id} />
    </div>
  );
}
