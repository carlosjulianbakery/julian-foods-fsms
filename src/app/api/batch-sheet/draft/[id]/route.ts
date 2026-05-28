import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// DELETE /api/batch-sheet/draft/[id]
// Deletes a draft. Only works if the record has status=DRAFT.
// Supervisors can only delete their own drafts; admins can delete any.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as { id: string; role: string };
    if (user.role !== "SUPERVISOR" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const where =
      user.role === "ADMIN"
        ? { id: params.id, status: "DRAFT" as const }
        : { id: params.id, status: "DRAFT" as const, submittedById: user.id };

    const existing = await prisma.batchSheetSubmission.findFirst({ where, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Draft not found or already submitted" }, { status: 404 });
    }

    await prisma.batchSheetSubmission.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/batch-sheet/draft/[id]]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
