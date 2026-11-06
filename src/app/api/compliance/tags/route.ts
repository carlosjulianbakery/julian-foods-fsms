import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tags = await prisma.sopTag.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json(tags);
  } catch (err) {
    console.error("GET /api/compliance/tags:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
