import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reopenInstanceForSubmissionDeletion } from "@/lib/task-completion";

export const dynamic = "force-dynamic";

// DELETE /api/pre-op-624/[id]  — ADMIN only
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const insp = await prisma.preOp624Inspection.findUnique({ where: { id: params.id } });
  if (!insp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.preOp624Inspection.delete({ where: { id: params.id } });

  // Reopen the linked task instance so it can be completed again
  reopenInstanceForSubmissionDeletion({
    submissionId: params.id,
    userId: session.user.id,
    prismaClient: prisma as never,
  }).catch((e) => console.error("[DELETE pre-op-624] task reopen failed:", e));

  return NextResponse.json({ deleted: true });
}
