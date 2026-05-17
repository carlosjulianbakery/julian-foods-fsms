import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { NewTaskForm } from "@/components/tasks/NewTaskForm";

export default async function NewTaskPage() {
  const session = await getServerSession(authOptions);
  const role = session!.user.role;
  if (role === "OPERATOR") redirect("/tasks");

  const [users, forms] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true },
      orderBy: { name: "asc" },
    }),
    prisma.form.findMany({
      where: { active: true },
      select: { id: true, title: true, category: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <NewTaskForm users={users} forms={forms} />
    </div>
  );
}
