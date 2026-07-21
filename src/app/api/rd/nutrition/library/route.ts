import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const profiles = await prisma.rdNutritionProfile.findMany({
      orderBy: { ingredientName: "asc" },
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json(profiles);
  } catch (err) {
    console.error("[rd/nutrition/library]", err);
    return NextResponse.json({ error: "Failed to fetch library" }, { status: 500 });
  }
}
