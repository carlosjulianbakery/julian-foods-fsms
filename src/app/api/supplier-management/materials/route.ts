import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? "";
  const q = searchParams.get("q") ?? "";

  const materials = await prisma.material.findMany({
    where: {
      ...(category ? { category: category as never } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      suppliers: {
        include: { supplier: { select: { id: true, name: true, status: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(materials);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, category, unit, isOrganic, isAllergen, allergens } = body;

  if (!name || !category) {
    return NextResponse.json({ error: "name and category are required" }, { status: 400 });
  }

  const material = await prisma.material.create({
    data: {
      name,
      description: description ?? null,
      category,
      unit: unit ?? null,
      isOrganic: isOrganic ?? false,
      isAllergen: isAllergen ?? false,
      allergens: allergens ?? null,
    },
  });

  return NextResponse.json(material, { status: 201 });
}
