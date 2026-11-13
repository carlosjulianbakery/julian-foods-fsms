import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCalendarInstances } from "@/lib/calendar-generator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true";

  const [rules, openCounts] = await Promise.all([
    prisma.taskRule.findMany({
      where: includeArchived ? {} : { isArchived: false },
      orderBy: { createdAt: "desc" },
      include: {
        facility: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { instances: true } },
      },
    }),
    prisma.ruleInstance.groupBy({
      by: ["ruleId"],
      where: { status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"] } },
      _count: { id: true },
    }),
  ]);

  const openMap = new Map(openCounts.map((r) => [r.ruleId, r._count.id]));

  return NextResponse.json(
    rules.map((r) => ({
      ...r,
      instanceCount: r._count.instances,
      openInstanceCount: openMap.get(r.id) ?? 0,
      _count: undefined,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const {
      title,
      description,
      facilityId,
      ownerId,
      triggerType,
      recurrenceUnit,
      recurrenceEvery,
      recurrenceStart,
      formKey,
      productName,
    } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!facilityId) return NextResponse.json({ error: "Facility is required" }, { status: 400 });
    if (!ownerId) return NextResponse.json({ error: "Owner is required" }, { status: 400 });
    if (!recurrenceStart) return NextResponse.json({ error: "Start date is required" }, { status: 400 });

    const rule = await prisma.taskRule.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        facilityId,
        ownerId,
        triggerType: triggerType ?? "RECURRING",
        recurrenceUnit: recurrenceUnit || null,
        recurrenceEvery: recurrenceEvery ? parseInt(recurrenceEvery) : 1,
        recurrenceStart: new Date(recurrenceStart),
        formKey: formKey || null,
        productName: productName || null,
      },
      include: {
        facility: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    let generatorResult: { created: number; facilityName: string } | null = null;
    if (rule.triggerType === "PRODUCTION_DAY" || rule.triggerType === "PRODUCTION_PRODUCT" || rule.triggerType === "PRODUCTION_ANY") {
      try {
        const genResult = await generateCalendarInstances({ facilityId: rule.facilityId });
        const fac = genResult.results.find((r) => r.facilityId === rule.facilityId);
        generatorResult = { created: fac?.created ?? 0, facilityName: fac?.facilityName ?? "" };
      } catch (genErr) {
        console.error("[task-rules POST] calendar generator error:", genErr);
      }
    }

    return NextResponse.json({ ...rule, generatorResult }, { status: 201 });
  } catch (err) {
    console.error("POST /api/task-rules:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
