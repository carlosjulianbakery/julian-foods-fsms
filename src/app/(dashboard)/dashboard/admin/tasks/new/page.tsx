export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskFormClient } from "../TaskFormClient";

export default async function NewTaskPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const [users, suppliers, requirements] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.documentRequirement.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedUsers = users.map((u) => ({
    id: u.id,
    name: u.name ?? "",
    role: u.role,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Create Task</h1>
        <p className="page-subtitle">Set up a new recurring or one-time task for your team</p>
      </div>
      <TaskFormClient
        mode="create"
        users={serializedUsers}
        suppliers={suppliers}
        requirements={requirements}
      />
    </div>
  );
}
