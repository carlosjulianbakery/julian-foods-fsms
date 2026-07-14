import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { name, category, unit, supplierSource, notes, costPerUnit } = body;

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    if (category !== undefined && !category) {
      return NextResponse.json({ error: "category cannot be empty" }, { status: 400 });
    }
    if (unit !== undefined && !unit) {
      return NextResponse.json({ error: "unit cannot be empty" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = category;
    if (unit !== undefined) data.unit = unit;
    if (supplierSource !== undefined) data.supplierSource = supplierSource;
    if (notes !== undefined) data.notes = notes;
    if (costPerUnit !== undefined) data.costPerUnit = costPerUnit != null ? Number(costPerUnit) : null;

    const ingredient = await prisma.rdIngredient.update({
      where: { id: params.id },
      data,
      include: { createdBy: { select: { name: true } } },
    });

    return NextResponse.json(ingredient);
  } catch {
    return NextResponse.json({ error: "Failed to update ingredient" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.rdIngredient.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete ingredient" }, { status: 500 });
  }
}
