import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const instance = await prisma.ruleInstance.findUnique({ where: { id: params.id } });
  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (instance.status === "DONE" || instance.status === "SKIPPED") {
    return NextResponse.json(
      { error: `Instance is already ${instance.status}` },
      { status: 400 }
    );
  }

  const body = await req.json() as { reason?: string };
  const reason = (body.reason ?? "").trim();
  if (reason.length < 10) {
    return NextResponse.json({ error: "Reason must be at least 10 characters" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.ruleInstance.update({
      where: { id: params.id },
      data: {
        status: "SKIPPED",
        skippedAt: new Date(),
        skippedById: session.user.id,
        skipReason: reason,
      },
    }),
    prisma.taskInstanceAudit.create({
      data: {
        instanceId: params.id,
        action: "skipped",
        userId: session.user.id,
        note: reason,
      },
    }),
  ]);

  return NextResponse.json({ id: params.id, status: "SKIPPED" });
}
