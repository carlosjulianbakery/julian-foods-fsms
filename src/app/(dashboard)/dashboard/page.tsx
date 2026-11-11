export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardClient from "./DashboardClient";
import { MyTasksBlock } from "@/components/tasks/MyTasksBlock";
import { OverdueBanner } from "@/components/tasks/OverdueBanner";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as { id: string; name?: string; role: string };
  const firstName = user.name?.split(" ")[0] ?? "there";
  const role = user.role ?? "SUPERVISOR";
  const userId = user.id;

  // Count overdue instances for current user
  const userOverdueCount = await prisma.ruleInstance.count({
    where: {
      rule: { ownerId: userId },
      status: { in: ["OVERDUE", "MISSED"] },
    },
  });

  // Admin: count team-wide overdue
  let teamOverdueCount: number | undefined;
  if (role === "ADMIN") {
    teamOverdueCount = await prisma.ruleInstance.count({
      where: { status: { in: ["OVERDUE", "MISSED"] } },
    });
  }

  return (
    <>
      <OverdueBanner
        userOverdueCount={userOverdueCount}
        teamOverdueCount={teamOverdueCount}
      />
      <MyTasksBlock />
      <DashboardClient role={role} firstName={firstName} />
    </>
  );
}
