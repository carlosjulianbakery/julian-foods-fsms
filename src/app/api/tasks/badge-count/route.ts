export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/tasks";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = getPacificToday();
  const userId = session.user.id;

  // Safety net: treat pending tasks with a past due date as overdue in the badge,
  // in case the cron hasn't run yet.
  const rows = await prisma.$queryRawUnsafe<Array<{ display_group: string; cnt: bigint }>>(
    `
    SELECT
      CASE WHEN status = 'overdue' OR (status = 'pending' AND "dueDate"::date < $1::date) THEN 'overdue' ELSE 'today' END AS display_group,
      COUNT(*) AS cnt
    FROM task_instances
    WHERE
      (status = 'overdue' OR (status = 'pending' AND "dueDate"::date <= $1::date))
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements("assignedTo") elem
        WHERE elem->>'id' = $2
      )
    GROUP BY display_group
    `,
    today,
    userId
  );

  let count = 0;
  let hasOverdue = false;

  for (const row of rows) {
    const n = Number(row.cnt);
    count += n;
    if (row.display_group === "overdue") hasOverdue = true;
  }

  return NextResponse.json({ count, hasOverdue });
}
