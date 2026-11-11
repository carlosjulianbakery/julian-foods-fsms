import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const ruleId = searchParams.get("ruleId");
  const facilityId = searchParams.get("facilityId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const instances = await prisma.ruleInstance.findMany({
    where: {
      ...(status && { status: status as never }),
      ...(ruleId && { ruleId }),
      ...(facilityId && { rule: { facilityId } }),
      ...(from && { dueDate: { gte: new Date(from) } }),
      ...(to && { dueDate: { lte: new Date(to) } }),
    },
    orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      rule: {
        select: {
          id: true,
          title: true,
          facility: { select: { id: true, name: true } },
        },
      },
      doneBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(instances);
}
