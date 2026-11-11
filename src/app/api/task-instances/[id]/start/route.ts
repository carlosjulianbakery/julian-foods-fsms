import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const role = session.user.role;

  const instance = await prisma.ruleInstance.findUnique({
    where: { id: params.id },
    include: { rule: { select: { ownerId: true, formKey: true } } },
  });

  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Effective-owner: assigned takes priority; unassigned falls back to rule owner
  const isEffectiveOwner =
    instance.ownerUserId !== null
      ? instance.ownerUserId === userId
      : instance.rule.ownerId === userId;
  if (role !== "ADMIN" && !isEffectiveOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent: if already IN_PROGRESS or later, return current state
  if (["IN_PROGRESS", "DONE", "SKIPPED"].includes(instance.status)) {
    return NextResponse.json({ id: instance.id, status: instance.status, formKey: instance.rule.formKey });
  }

  const updated = await prisma.ruleInstance.update({
    where: { id: params.id },
    data: { status: "IN_PROGRESS" },
  });

  return NextResponse.json({ id: updated.id, status: updated.status, formKey: instance.rule.formKey });
}
