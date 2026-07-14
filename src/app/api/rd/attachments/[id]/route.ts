import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { del } from "@vercel/blob";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const attachment = await prisma.rdAttachment.findUnique({
      where: { id: params.id },
      select: { fileUrl: true },
    });

    if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

    await del(attachment.fileUrl);
    await prisma.rdAttachment.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
