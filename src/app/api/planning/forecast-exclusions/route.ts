export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/planning/forecast-exclusions?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const where: Record<string, unknown> = { isActive: true };
  if (dateFrom) {
    where.productionDate = { ...(where.productionDate as object ?? {}), gte: new Date(dateFrom) };
  }
  if (dateTo) {
    where.productionDate = { ...(where.productionDate as object ?? {}), lte: new Date(dateTo) };
  }

  const exclusions = await prisma.forecastExclusion.findMany({
    where,
    orderBy: { productionDate: "asc" },
    select: {
      id: true,
      excludedAt: true,
      productionDate: true,
      productName: true,
      productId: true,
      baseUnitCount: true,
      reason: true,
      excludedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(exclusions);
}

// POST /api/planning/forecast-exclusions
// Body: { productionDate: string, productName: string, productId?: string, baseUnitCount?: number, reason?: string }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { productionDate, productName, productId, baseUnitCount, reason } = body;

  if (!productionDate || !productName) {
    return NextResponse.json({ error: "productionDate and productName are required" }, { status: 400 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: "Session missing user id" }, { status: 500 });

  const exclusion = await prisma.forecastExclusion.create({
    data: {
      excludedById: userId,
      productionDate: new Date(productionDate),
      productName,
      productId: productId ?? null,
      baseUnitCount: baseUnitCount ?? null,
      reason: reason?.trim() || null,
      isActive: true,
    },
    select: {
      id: true,
      excludedAt: true,
      productionDate: true,
      productName: true,
      productId: true,
      baseUnitCount: true,
      reason: true,
    },
  });

  return NextResponse.json(exclusion, { status: 201 });
}
