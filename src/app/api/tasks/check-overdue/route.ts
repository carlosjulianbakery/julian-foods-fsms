export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/tasks";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const vercelSig = req.headers.get("x-vercel-signature");
    if (!vercelSig && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const today = getPacificToday();

  const overdueInstances = await prisma.taskInstance.findMany({
    where: {
      status: "pending",
      dueDate: { lt: today },
    },
    select: { id: true },
  });

  if (overdueInstances.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const ids = overdueInstances.map((i) => i.id);

  await prisma.taskInstance.updateMany({
    where: { id: { in: ids } },
    data: { status: "overdue" },
  });

  await prisma.taskHistory.createMany({
    data: ids.map((instanceId) => ({
      instanceId,
      action: "overdue" as const,
      performedById: null,
      note: "Automatically marked overdue",
    })),
  });

  return NextResponse.json({ updated: overdueInstances.length });
}
