import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.sopDocument.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.isArchived) {
      return NextResponse.json({ error: "Cannot review an archived SOP" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const note: string | null = body.note?.trim() || null;
    const newVersion: string | null = body.newVersion?.trim() || null;
    const newDriveUrl: string | null = body.newDriveUrl?.trim() || null;

    const now = new Date();
    const nextReview = addMonths(now, 12);
    const version = newVersion ?? existing.currentVersion;
    const driveUrl = newDriveUrl ?? existing.driveUrl;

    const sop = await prisma.sopDocument.update({
      where: { id: params.id },
      data: {
        lastReviewedAt: now,
        nextReviewAt: nextReview,
        currentVersion: version,
        driveUrl,
      },
      include: {
        owner: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        certScopes: { include: { certification: true } },
        reviewLogs: {
          include: { reviewedBy: { select: { id: true, name: true } } },
          orderBy: { reviewedAt: "desc" },
        },
      },
    });

    // Write 'reviewed' log
    await prisma.sopReviewLog.create({
      data: {
        sopId: params.id,
        eventType: "reviewed",
        reviewedById: session.user.id,
        reviewedAt: now,
        versionAtTime: version,
        driveUrlAtTime: driveUrl,
        note,
      },
    });

    // Close open RuleInstances for this SOP and clear SopReminder dedup rows
    try {
      const sopRule = await prisma.taskRule.findFirst({
        where: { formKey: "sop_review" },
        select: { id: true },
      });
      if (sopRule) {
        const openInstances = await prisma.ruleInstance.findMany({
          where: {
            ruleId: sopRule.id,
            calendarKey: params.id,
            status: { notIn: ["DONE", "MISSED", "SKIPPED"] },
          },
          select: { id: true, dueDate: true },
        });
        for (const inst of openInstances) {
          await prisma.ruleInstance.update({
            where: { id: inst.id },
            data: {
              status: "DONE",
              doneAt: now,
              doneById: session.user.id,
            },
          });
          await prisma.taskInstanceAudit.create({
            data: {
              instanceId: inst.id,
              action: "COMPLETED",
              userId: session.user.id,
              note: `SOP marked reviewed by ${session.user.name ?? session.user.id}`,
            },
          });
        }
      }
      await prisma.sopReminder.deleteMany({ where: { sopId: params.id } });
    } catch (closeErr) {
      console.error("Failed to close SOP review instances:", closeErr);
    }

    return NextResponse.json(sop);
  } catch (err) {
    console.error("POST /api/compliance/sops/[id]/review:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
