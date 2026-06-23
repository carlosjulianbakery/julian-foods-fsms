import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user as { id: string; name?: string | null; role: string };
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const body = await req.json();
    const { admin_notes } = body as { admin_notes: string | null };

    const existing = await prisma.batchSheetSubmission.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isClearing = admin_notes === null || admin_notes === "";

    const updated = await prisma.batchSheetSubmission.update({
      where: { id: params.id },
      data: {
        adminNotes:              isClearing ? null : admin_notes.trim(),
        adminNotesUpdatedByName: isClearing ? null : (user.name ?? "Admin"),
        adminNotesUpdatedAt:     isClearing ? null : new Date(),
      },
      select: {
        id: true,
        adminNotes: true,
        adminNotesUpdatedByName: true,
        adminNotesUpdatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PUT /api/batch-sheet/${params.id}/admin-notes]`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
