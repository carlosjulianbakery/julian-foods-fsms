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

  const rows = await prisma.$queryRawUnsafe<Array<{ status: string; cnt: bigint }>>(
    `
    SELECT status, COUNT(*) as cnt
    FROM task_instances
    WHERE
      (status = 'overdue' OR (status = 'pending' AND "dueDate" = $1::date))
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements("assignedTo") elem
        WHERE elem->>'id' = $2
      )
    GROUP BY status
    `,
    today,
    userId
  );

  let count = 0;
  let hasOverdue = false;

  for (const row of rows) {
    const n = Number(row.cnt);
    count += n;
    if (row.status === "overdue") hasOverdue = true;
  }

  return NextResponse.json({ count, hasOverdue });
}
