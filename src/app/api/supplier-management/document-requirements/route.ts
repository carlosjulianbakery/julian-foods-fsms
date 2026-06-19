import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requirements = await prisma.documentRequirement.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { documents: true } },
      formTemplates: {
        where: { isActive: true },
        select: { id: true, name: true, fileName: true },
        take: 1,
      },
    },
  });

  return NextResponse.json(requirements);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, requirementType, isRequired } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const maxSort = await prisma.documentRequirement.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

  const req2 = await prisma.documentRequirement.create({
    data: {
      name,
      description: description ?? null,
      requirementType: requirementType ?? "ANNUAL",
      isRequired: isRequired ?? true,
      sortOrder,
    },
  });

  return NextResponse.json(req2, { status: 201 });
}
