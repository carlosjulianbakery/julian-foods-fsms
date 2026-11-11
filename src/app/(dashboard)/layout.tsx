export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { OverdueBanner } from "@/components/tasks/OverdueBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId = session.user.id;
  const role = session.user.role;

  const [userOverdueCount, teamOverdueCount] = await Promise.all([
    prisma.ruleInstance.count({
      where: {
        OR: [
          { ownerUserId: userId },
          { ownerUserId: null, rule: { ownerId: userId } },
        ],
        status: { in: ["OVERDUE", "MISSED"] },
      },
    }),
    role === "ADMIN"
      ? prisma.ruleInstance.count({ where: { status: { in: ["OVERDUE", "MISSED"] } } })
      : Promise.resolve(undefined),
  ]);

  return (
    <DashboardShell>
      <OverdueBanner
        userOverdueCount={userOverdueCount}
        teamOverdueCount={teamOverdueCount ?? undefined}
      />
      {children}
    </DashboardShell>
  );
}
