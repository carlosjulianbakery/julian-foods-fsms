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

function formatPT(isoString: string | null | Date): string {
  if (!isoString) return "never";
  return new Date(isoString).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default async function TaskInstancesPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const [instances, facilities] = await Promise.all([
    prisma.ruleInstance.findMany({
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
    }),
    prisma.facility.findMany({ orderBy: { name: "asc" } }),
  ]);

  const staleSyncs = facilities.filter((f) => {
    if (f.lastCalendarSyncError) return true;
    if (!f.lastCalendarSyncAt) return true;
    return Date.now() - new Date(f.lastCalendarSyncAt).getTime() > 24 * 60 * 60 * 1000;
  });

  const flaggedCount = instances.filter((i) => i.needsAdminReview).length;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Task Instances</h1>
          <p className="page-subtitle">All generated task instances (most recent first)</p>
        </div>
      </div>

      {/* Stale sync warnings */}
      {staleSyncs.map((f) => (
        <div
          key={f.id}
          className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
        >
          ⚠️ Calendar for <strong>{f.name}</strong>{" "}
          {f.lastCalendarSyncError
            ? <>failed: {f.lastCalendarSyncError}. Last success: {formatPT(f.lastCalendarSyncAt)}</>
            : <>not refreshed since {formatPT(f.lastCalendarSyncAt)}</>}
        </div>
      ))}

      {/* Flagged instances banner */}
      {flaggedCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          🚩 <strong>{flaggedCount} instance{flaggedCount !== 1 ? "s" : ""}</strong> flagged for admin review — production was removed from the calendar after a task was started.
        </div>
      )}

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
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Label</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Due Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Source</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Done By</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {instances.map((inst) => (
                <tr
                  key={inst.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${inst.needsAdminReview ? "bg-red-50 dark:bg-red-900/10" : ""}`}
                >
                  <td className="px-4 py-3 font-medium">{inst.rule.title}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {inst.rule.facility.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {inst.label || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {inst.dueDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        inst.source === "SCHEDULE"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {inst.source === "SCHEDULE" ? "Schedule" : "Manual"}
                    </span>
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
                  <td className="px-4 py-3">
                    {inst.needsAdminReview && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        🚩 Review
                      </span>
                    )}
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
