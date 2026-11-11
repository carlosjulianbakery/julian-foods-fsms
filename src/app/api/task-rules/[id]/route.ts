import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
      isActive,
    } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (facilityId !== undefined) data.facilityId = facilityId;
    if (ownerId !== undefined) data.ownerId = ownerId;
    if (triggerType !== undefined) data.triggerType = triggerType;
    if (recurrenceUnit !== undefined) data.recurrenceUnit = recurrenceUnit || null;
    if (recurrenceEvery !== undefined) data.recurrenceEvery = parseInt(recurrenceEvery);
    if (recurrenceStart !== undefined) data.recurrenceStart = new Date(recurrenceStart);
    if (formKey !== undefined) data.formKey = formKey || null;
    if (productName !== undefined) data.productName = productName || null;
    if (isActive !== undefined) data.isActive = isActive;

    const rule = await prisma.taskRule.update({
      where: { id: params.id },
      data,
      include: {
        facility: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(rule);
  } catch (err) {
    console.error("PATCH /api/task-rules/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
