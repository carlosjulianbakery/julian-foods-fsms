import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role } = session.user as { role: string };
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await prisma.batchSheetTemplate.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(templates);
}
