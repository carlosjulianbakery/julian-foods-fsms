import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const q = searchParams.get("q");

  const records = await prisma.record.findMany({
    where: {
      archived: false,
      ...(type && { type }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { title, type, description, data, tags } = await req.json();

    if (!title || !type) {
      return NextResponse.json({ error: "Title and type are required." }, { status: 400 });
    }

    const record = await prisma.record.create({
      data: {
        title,
        type,
        description: description || null,
        data: data ?? {},
        tags: tags ?? [],
        createdById: session.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "RECORD_CREATED",
        entity: "Record",
        entityId: record.id,
        userId: session.user.id,
        userName: session.user.name ?? "Unknown",
        details: { title, type },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create record." }, { status: 500 });
  }
}
