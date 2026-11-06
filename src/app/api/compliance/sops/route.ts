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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const tag = searchParams.get("tag") ?? "";
    const status = searchParams.get("status") ?? "";
    const certificationId = searchParams.get("certificationId") ?? "";
    const ownerId = searchParams.get("ownerId") ?? "";
    const includeArchived = searchParams.get("includeArchived") === "true";

    const sops = await prisma.sopDocument.findMany({
      where: {
        ...(search && {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { documentNumber: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(tag && {
          tags: { some: { tag: { name: { equals: tag, mode: "insensitive" } } } },
        }),
        ...(certificationId && {
          OR: [
            { appliesToAll: true },
            { certScopes: { some: { certificationId } } },
          ],
        }),
        ...(ownerId && { ownerId }),
        ...(!includeArchived && { isArchived: false }),
      },
      include: {
        owner: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        certScopes: { include: { certification: true } },
      },
      orderBy: { nextReviewAt: "asc" },
    });

    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const withStatus = sops.map((sop) => {
      let reviewStatus: "current" | "due_soon" | "overdue";
      if (sop.nextReviewAt <= now) {
        reviewStatus = "overdue";
      } else if (sop.nextReviewAt <= sixtyDaysFromNow) {
        reviewStatus = "due_soon";
      } else {
        reviewStatus = "current";
      }
      return { ...sop, reviewStatus };
    });

    const filtered = status
      ? withStatus.filter((s) => s.reviewStatus === status)
      : withStatus;

    return NextResponse.json(filtered);
  } catch (err) {
    console.error("GET /api/compliance/sops:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!driveUrl?.trim() || !driveUrl.startsWith("http")) {
      return NextResponse.json({ error: "A valid Drive URL is required" }, { status: 400 });
    }
    if (!ownerId) {
      return NextResponse.json({ error: "Owner is required" }, { status: 400 });
    }
    if (!lastReviewedAt) {
      return NextResponse.json({ error: "Last reviewed date is required" }, { status: 400 });
    }
    if (!appliesToAll && (!certificationIds || certificationIds.length === 0)) {
      return NextResponse.json(
        { error: "Select at least one certification or choose 'Applies to all'" },
        { status: 400 }
      );
    }

    const ownerExists = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!ownerExists) {
      return NextResponse.json({ error: "Owner not found" }, { status: 400 });
    }

    const lastReviewed = new Date(lastReviewedAt);
    const nextReview = addMonths(lastReviewed, 12);
    const version = currentVersion?.trim() || "1.0";

    // Upsert tags (case-insensitive)
    const tagIds: string[] = [];
    if (tagNames && tagNames.length > 0) {
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

    const sop = await prisma.sopDocument.create({
      data: {
        title: title.trim(),
        documentNumber: documentNumber?.trim() || null,
        driveUrl: driveUrl.trim(),
        ownerId,
        currentVersion: version,
        appliesToAll: !!appliesToAll,
        lastReviewedAt: lastReviewed,
        nextReviewAt: nextReview,
        notes: notes?.trim() || null,
        certScopes: appliesToAll
          ? undefined
          : {
              create: (certificationIds as string[]).map((certificationId) => ({
                certificationId,
              })),
            },
        tags: tagIds.length > 0 ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
      },
      include: {
        owner: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        certScopes: { include: { certification: true } },
      },
    });

    // Write 'created' review log
    await prisma.sopReviewLog.create({
      data: {
        sopId: sop.id,
        eventType: "created",
        reviewedById: session.user.id,
        reviewedAt: lastReviewed,
        versionAtTime: version,
        driveUrlAtTime: driveUrl.trim(),
        note: null,
      },
    });

    return NextResponse.json(sop, { status: 201 });
  } catch (err) {
    console.error("POST /api/compliance/sops:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
