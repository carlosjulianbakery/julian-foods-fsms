import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reopenInstanceForSubmissionDeletion } from "@/lib/task-completion";

export const dynamic = "force-dynamic";

// GET /api/monthly-cleaning-624/[id]  — get single record
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const record = await prisma.monthlyClean624Record.findUnique({
      where: { id: params.id },
      include: { submittedBy: { select: { name: true } } },
    });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(record);
  } catch (err) {
    const prismaCode = (err as { code?: string }).code;
    const msg = err instanceof Error ? err.message : String(err);
    const refId = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (prismaCode === "P2021" || prismaCode === "P2022" || msg.includes("does not exist")) {
      return NextResponse.json(
        { error: "db_setup_error", detail: `db_setup_error · ${prismaCode ?? "unknown"} · table monthly_clean_624_records · ref ${refId}` },
        { status: 503 }
      );
    }
    console.error(`[monthly-cleaning-624 GET/:id] ref=${refId} msg=${msg}`);
    return NextResponse.json({ error: "save_failed", refId }, { status: 500 });
  }
}

// DELETE /api/monthly-cleaning-624/[id]  — admin only; reopens linked task instance
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

  try {
    const record = await prisma.monthlyClean624Record.findUnique({ where: { id: params.id } });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let reopenWarning: string | null = null;
    try {
      await reopenInstanceForSubmissionDeletion({
        submissionId: params.id,
        userId: session.user.id,
        note: `Monthly Cleaning 624 record for ${record.month} deleted by admin`,
        prismaClient: prisma as never,
      });
    } catch (reopenErr) {
      const msg = reopenErr instanceof Error ? reopenErr.message : String(reopenErr);
      console.error(`[monthly-cleaning-624 DELETE/:id] reopen failed: ${msg}`);
      reopenWarning = "Record deleted but task instance could not be reopened — please check manually.";
    }

    await prisma.monthlyClean624Record.delete({ where: { id: params.id } });

    return NextResponse.json({
      success: true,
      ...(reopenWarning ? { warning: reopenWarning } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const refId = Math.random().toString(36).slice(2, 8).toUpperCase();
    console.error(`[monthly-cleaning-624 DELETE/:id] ref=${refId} msg=${msg}`);
    return NextResponse.json({ error: "save_failed", refId }, { status: 500 });
  }
}
