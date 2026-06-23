export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskFormClient } from "../../TaskFormClient";

export default async function EditTaskPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const [template, users, suppliers, requirements] = await Promise.all([
    prisma.taskTemplate.findUnique({ where: { id: params.id } }),
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

  if (!template) notFound();

  const serializedUsers = users.map((u) => ({
    id: u.id,
    name: u.name ?? "",
    role: u.role,
  }));

  const serializedTemplate = {
    id: template.id,
    title: template.title,
    description: template.description,
    category: template.category,
    priority: template.priority,
    assignedTo: (Array.isArray(template.assignedTo) ? template.assignedTo : []) as string[],
    taskType: template.taskType,
    formLink: template.formLink as Record<string, unknown> | null,
    recurrenceType: template.recurrenceType,
    recurrenceConfig: template.recurrenceConfig as Record<string, unknown> | null,
    firstDueDate: template.firstDueDate.toISOString(),
    isActive: template.isActive,
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Edit Task</h1>
        <p className="page-subtitle">Update task details, schedule, or assignments</p>
      </div>
      <TaskFormClient
        mode="edit"
        template={serializedTemplate}
        users={serializedUsers}
        suppliers={suppliers}
        requirements={requirements}
      />
    </div>
  );
}
