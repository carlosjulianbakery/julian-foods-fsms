import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role } = session.user as { role: string };
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const inspection = await prisma.preOpInspection.findUnique({
    where: { id: params.id },
    include: { submittedBy: { select: { name: true, email: true } } },
  });

  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(inspection);
}
