import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.inventoryAuditAcknowledgment.findUnique({
    where: { id: params.id },
    select: { id: true, sourceType: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Acknowledgment not found" }, { status: 404 });
  }
  if (existing.sourceType !== "batch_depletion_alert") {
    return NextResponse.json({ error: "Not a batch depletion acknowledgment" }, { status: 400 });
  }

  await prisma.inventoryAuditAcknowledgment.delete({ where: { id: params.id } });
  return NextResponse.json({ deleted: true });
}
