import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sop = await prisma.sopDocument.update({
      where: { id: params.id },
      data: { isArchived: true },
    });

    return NextResponse.json(sop);
  } catch (err) {
    console.error("POST /api/compliance/sops/[id]/archive:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
