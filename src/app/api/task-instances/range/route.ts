export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const role = (session.user as { role: string }).role;

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const myOnly = searchParams.get("myOnly") === "1";
  // Admin-only filter param — ignored for non-admins
  const reqOwnerId = role === "ADMIN" ? (searchParams.get("ownerId") ?? null) : null;

  if (
    !from || !to ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to)
  ) {
    return NextResponse.json({ error: "Invalid from/to parameters" }, { status: 400 });
  }

  // Supervisors always see only their own tasks; admins can toggle
  const enforceOwner = role !== "ADMIN" || myOnly;
  const visibilityFilter: Prisma.RuleInstanceWhereInput = enforceOwner
    ? {
        OR: [
          { ownerUserId: userId },
          { ownerUserId: null, rule: { ownerId: userId } },
        ],
      }
    : {};

  // Supervisors never see SKIPPED; admins see all
  const statusFilter: Prisma.RuleInstanceWhereInput =
    role !== "ADMIN" ? { status: { not: "SKIPPED" } } : {};

  // Admin owner filter — by effective owner (ownerUserId, else rule owner)
  const ownerFilter: Prisma.RuleInstanceWhereInput = reqOwnerId
    ? {
        OR: [
          { ownerUserId: reqOwnerId },
          { ownerUserId: null, rule: { ownerId: reqOwnerId } },
        ],
      }
    : {};

  const instances = await prisma.ruleInstance.findMany({
    where: {
      AND: [
        visibilityFilter,
        statusFilter,
        ownerFilter,
        {
          dueDate: {
            gte: new Date(from + "T00:00:00Z"),
            lte: new Date(to + "T23:59:59Z"),
          },
        },
      ],
    },
    include: {
      rule: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          formKey: true,
          facility: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      },
      doneBy: { select: { id: true, name: true } },
      skippedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(
    instances.map((inst) => ({
      id: inst.id,
      ruleTitle: inst.rule.title,
      facilityId: inst.rule.facility.id,
      facilityName: inst.rule.facility.name,
      ownerId: inst.rule.ownerId,
      ownerUserId: inst.ownerUserId ?? null,
      ownerName: inst.rule.owner.name ?? "",
      formKey: inst.rule.formKey,
      label: inst.label,
      dueDate: inst.dueDate.toISOString().slice(0, 10),
      status: inst.status as string,
      source: inst.source,
      needsAdminReview: inst.needsAdminReview,
      reviewReason: inst.reviewReason,
      doneByName: inst.doneBy?.name ?? null,
      doneAt: inst.doneAt?.toISOString() ?? null,
      completedLate: inst.completedLate,
      daysLate: inst.daysLate,
      missedReason: inst.missedReason,
      skipReason: inst.skipReason ?? null,
      skippedByName: inst.skippedBy?.name ?? null,
      skippedAt: inst.skippedAt?.toISOString() ?? null,
    }))
  );
}
