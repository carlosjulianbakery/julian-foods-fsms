import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const ingredients = await prisma.rdIngredient.findMany({
      orderBy: { name: "asc" },
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json(ingredients);
  } catch {
    return NextResponse.json({ error: "Failed to fetch ingredients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { name, category, unit, supplierSource, notes } = body;

    if (!name || !category || !unit) {
      return NextResponse.json({ error: "name, category, and unit are required" }, { status: 400 });
    }

    const ingredient = await prisma.rdIngredient.create({
      data: {
        name,
        category,
        unit,
        supplierSource: supplierSource ?? null,
        notes: notes ?? null,
        createdById: userId,
      },
      include: { createdBy: { select: { name: true } } },
    });

    return NextResponse.json(ingredient, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create ingredient" }, { status: 500 });
  }
}
