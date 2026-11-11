export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    UPCOMING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    DUE_TODAY: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    IN_PROGRESS: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    DONE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    SKIPPED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
    MISSED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

export default async function TaskInstancesPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const instances = await prisma.ruleInstance.findMany({
    orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      rule: {
        select: {
          id: true,
          title: true,
          facility: { select: { name: true } },
        },
      },
      doneBy: { select: { name: true } },
    },
  });

  return (
    <div className="max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Task Instances</h1>
          <p className="page-subtitle">All generated task instances (most recent first)</p>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No instances yet. Run the task generator cron to populate.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Rule</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Facility</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Due Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Done By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {instances.map((inst) => (
                <tr key={inst.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium">{inst.rule.title}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {inst.rule.facility.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {inst.dueDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(inst.status)}`}
                    >
                      {inst.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {inst.doneBy?.name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
