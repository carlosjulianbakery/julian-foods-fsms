import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { resolutionNotes } = await req.json();
  if (!resolutionNotes?.trim()) {
    return NextResponse.json({ error: "Resolution notes are required" }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;

  const record = await prisma.quarantineRecord.update({
    where: { id: params.id },
    data: {
      status: "resolved",
      resolutionNotes,
      resolvedById: userId,
      resolvedAt: new Date(),
    },
  });

  return NextResponse.json(record);
}
