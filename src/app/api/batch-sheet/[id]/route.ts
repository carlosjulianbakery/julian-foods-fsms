import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const submission = await prisma.batchSheetSubmission.findUnique({
      where: { id: params.id },
      include: {
        submittedBy: { select: { name: true, email: true } },
        template:    { select: { name: true, ccpSettings: true } },
      },
    });

    if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(submission);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    // Verify the record exists before attempting deletion
    const existing = await prisma.batchSheetSubmission.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    await prisma.batchSheetSubmission.delete({ where: { id: params.id } });

    console.log(`[DELETE /api/batch-sheet/${params.id}] Deleted by admin ${session.user.email}`);
    return NextResponse.json({ success: true, deleted_id: params.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DELETE /api/batch-sheet/${params.id}] Error:`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
