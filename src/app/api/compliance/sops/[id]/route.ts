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

const SOP_INCLUDE = {
  owner: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
  certScopes: { include: { certification: true } },
  reviewLogs: {
    include: { reviewedBy: { select: { id: true, name: true } } },
    orderBy: { reviewedAt: "desc" as const },
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sop = await prisma.sopDocument.findUnique({
      where: { id: params.id },
      include: SOP_INCLUDE,
    });

    if (!sop) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    let reviewStatus: "current" | "due_soon" | "overdue";
    if (sop.nextReviewAt <= now) reviewStatus = "overdue";
    else if (sop.nextReviewAt <= sixtyDaysFromNow) reviewStatus = "due_soon";
    else reviewStatus = "current";

    return NextResponse.json({ ...sop, reviewStatus });
  } catch (err) {
    console.error("GET /api/compliance/sops/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
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

    const body = await req.json();
    const {
      title,
      documentNumber,
      driveUrl,
      ownerId,
      currentVersion,
      appliesToAll,
      certificationIds,
      tagNames,
      notes,
      lastReviewedAt,
    } = body;

    const newTitle = title?.trim() ?? existing.title;
    const newDriveUrl = driveUrl?.trim() ?? existing.driveUrl;
    const newVersion = currentVersion?.trim() ?? existing.currentVersion;
    const newOwnerId = ownerId ?? existing.ownerId;
    const newAppliesToAll = appliesToAll ?? existing.appliesToAll;
    const lastReviewed = lastReviewedAt ? new Date(lastReviewedAt) : existing.lastReviewedAt;
    const nextReview = lastReviewedAt ? addMonths(lastReviewed, 12) : existing.nextReviewAt;

    // Determine what changed for logs
    const urlChanged = newDriveUrl !== existing.driveUrl;
    const versionChanged = newVersion !== existing.currentVersion;

    // Upsert tags
    const tagIds: string[] = [];
    if (tagNames !== undefined) {
      for (const rawName of tagNames as string[]) {
        const name = rawName.trim().toLowerCase();
        if (!name) continue;
        const tag = await prisma.sopTag.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        tagIds.push(tag.id);
      }
    }

    const sop = await prisma.sopDocument.update({
      where: { id: params.id },
      data: {
        title: newTitle,
        documentNumber: documentNumber?.trim() ?? existing.documentNumber,
        driveUrl: newDriveUrl,
        ownerId: newOwnerId,
        currentVersion: newVersion,
        appliesToAll: newAppliesToAll,
        lastReviewedAt: lastReviewed,
        nextReviewAt: nextReview,
        notes: notes?.trim() ?? existing.notes,
        ...(certificationIds !== undefined && {
          certScopes: {
            deleteMany: {},
            ...(newAppliesToAll
              ? {}
              : {
                  create: (certificationIds as string[]).map((certificationId) => ({
                    certificationId,
                  })),
                }),
          },
        }),
        ...(tagNames !== undefined && {
          tags: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          },
        }),
      },
      include: SOP_INCLUDE,
    });

    // Write change logs
    const now = new Date();
    if (urlChanged) {
      await prisma.sopReviewLog.create({
        data: {
          sopId: params.id,
          eventType: "link_updated",
          reviewedById: session.user.id,
          reviewedAt: now,
          versionAtTime: newVersion,
          driveUrlAtTime: newDriveUrl,
          note: null,
        },
      });
    }
    if (versionChanged) {
      await prisma.sopReviewLog.create({
        data: {
          sopId: params.id,
          eventType: "version_changed",
          reviewedById: session.user.id,
          reviewedAt: now,
          versionAtTime: newVersion,
          driveUrlAtTime: newDriveUrl,
          note: `Version changed from ${existing.currentVersion} to ${newVersion}`,
        },
      });
    }

    return NextResponse.json(sop);
  } catch (err) {
    console.error("PATCH /api/compliance/sops/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
