import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TeamStatusPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") redirect("/dashboard");

  const today = getPacificToday();
  const weekStart = addDaysToDateStr(today, -6);
  const thirtyDaysAgo = addDaysToDateStr(today, -30);

  // All active users
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // All relevant instances in one query for performance
  const allInstances = await prisma.ruleInstance.findMany({
    where: {
      OR: [
        // Currently open instances (need current owner)
        { status: { in: ["UPCOMING", "DUE_TODAY", "IN_PROGRESS", "OVERDUE"] } },
        // Completed in last 7 days
        { status: "DONE", doneAt: { gte: new Date(`${weekStart}T00:00:00Z`) } },
        // All in last 30 days for on-time % and missed count
        {
          createdAt: { gte: new Date(`${thirtyDaysAgo}T00:00:00Z`) },
          status: { in: ["DONE", "MISSED"] },
        },
      ],
    },
    include: {
      rule: { select: { ownerId: true, facility: { select: { name: true } } } },
    },
  });

  type UserStats = {
    userId: string;
    name: string;
    role: string;
    open: number;
    dueToday: number;
    overdue: number;
    completedThisWeek: number;
    onTimeCount: number;
    totalDone30: number;
    missed30: number;
  };

  const statsMap = new Map<string, UserStats>();
  for (const u of users) {
    statsMap.set(u.id, {
      userId: u.id,
      name: u.name,
      role: u.role,
      open: 0,
      dueToday: 0,
      overdue: 0,
      completedThisWeek: 0,
      onTimeCount: 0,
      totalDone30: 0,
      missed30: 0,
    });
  }

  function effectiveOwner(inst: { ownerUserId: string | null; rule: { ownerId: string } }): string {
    return inst.ownerUserId ?? inst.rule.ownerId;
  }

  for (const inst of allInstances) {
    const ownerId = effectiveOwner(inst);
    const stats = statsMap.get(ownerId);
    if (!stats) continue;

    if (["UPCOMING", "DUE_TODAY", "IN_PROGRESS", "OVERDUE"].includes(inst.status)) {
      stats.open++;
      if (inst.status === "DUE_TODAY") stats.dueToday++;
      if (inst.status === "OVERDUE") stats.overdue++;
    }

    if (inst.status === "DONE" && inst.doneAt) {
      const doneStr = inst.doneAt.toISOString().slice(0, 10);
      if (doneStr >= weekStart) stats.completedThisWeek++;
      if (doneStr >= thirtyDaysAgo) {
        stats.totalDone30++;
        if (!(inst as { completedLate?: boolean }).completedLate) stats.onTimeCount++;
      }
    }

    if (inst.status === "MISSED") {
      const missedAt = (inst as { markedMissedAt?: Date | null }).markedMissedAt;
      if (missedAt) {
        const missedStr = missedAt.toISOString().slice(0, 10);
        if (missedStr >= thirtyDaysAgo) stats.missed30++;
      }
    }
  }

  const rows = Array.from(statsMap.values());

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 font-garamond">Team Status</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">Task overview per team member</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Name</th>
                <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Role</th>
                <th className="text-center px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Open</th>
                <th className="text-center px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Due Today</th>
                <th className="text-center px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Overdue</th>
                <th className="text-center px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Done (7d)</th>
                <th className="text-center px-4 py-3 font-mono font-semibold text-gray-700 text-xs">On-time % (30d)</th>
                <th className="text-center px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Missed (30d)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const onTimePct = r.totalDone30 > 0
                  ? Math.round((r.onTimeCount / r.totalDone30) * 100)
                  : null;
                return (
                  <tr key={r.userId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 font-garamond">{r.name}</td>
                    <td className="px-4 py-3">
                      <span className={[
                        "text-[10px] font-mono font-semibold px-2 py-0.5 rounded",
                        r.role === "ADMIN" ? "bg-brand-50 text-brand-700" : "bg-amber-100 text-amber-700",
                      ].join(" ")}>
                        {r.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-gray-700">{r.open}</td>
                    <td className="px-4 py-3 text-center">
                      {r.dueToday > 0 ? (
                        <span className="font-mono font-semibold text-amber-700">{r.dueToday}</span>
                      ) : (
                        <span className="font-mono text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.overdue > 0 ? (
                        <span className="font-mono font-semibold text-red-600">{r.overdue}</span>
                      ) : (
                        <span className="font-mono text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-gray-700">{r.completedThisWeek}</td>
                    <td className="px-4 py-3 text-center">
                      {onTimePct === null ? (
                        <span className="font-mono text-gray-400">—</span>
                      ) : (
                        <span className={[
                          "font-mono font-semibold",
                          onTimePct >= 90 ? "text-green-600" : onTimePct >= 70 ? "text-amber-600" : "text-red-600",
                        ].join(" ")}>
                          {onTimePct}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.missed30 >= 3 ? (
                        <span className="font-mono font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">{r.missed30}</span>
                      ) : (
                        <span className="font-mono text-gray-700">{r.missed30}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/admin/missed-tasks?owner=${r.userId}`}
                        className="text-xs text-blue-600 hover:text-blue-800 font-mono"
                      >
                        View tasks →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
