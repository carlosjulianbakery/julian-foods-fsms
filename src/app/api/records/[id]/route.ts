import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.record.update({
    where: { id: params.id },
    data: { archived: true },
  });

  await prisma.auditLog.create({
    data: {
      action: "RECORD_ARCHIVED",
      entity: "Record",
      entityId: params.id,
      userId: session.user.id,
      userName: session.user.name ?? "Unknown",
    },
  });

  return NextResponse.json({ success: true });
}
