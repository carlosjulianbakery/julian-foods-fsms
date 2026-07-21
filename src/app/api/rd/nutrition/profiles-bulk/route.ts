import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/rd/nutrition/profiles-bulk?names=name1,name2,...
// Returns { [ingredientName]: NutritionProfileLite | null }
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const namesParam = req.nextUrl.searchParams.get("names") ?? "";
  const names = namesParam
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (names.length === 0) return NextResponse.json({});

  const profiles = await prisma.rdNutritionProfile.findMany({
    where: { ingredientName: { in: names } },
    select: {
      ingredientName: true,
      caloriesPer100g: true,
      fatPer100g: true,
      saturatedFatPer100g: true,
      carbsPer100g: true,
      fiberPer100g: true,
      sugarsPer100g: true,
      proteinPer100g: true,
      sodiumPer100g: true,
    },
  });

  const result: Record<string, object | null> = {};
  for (const name of names) result[name] = null;

  for (const p of profiles) {
    result[p.ingredientName] = {
      ingredientName: p.ingredientName,
      caloriesPer100g: p.caloriesPer100g != null ? parseFloat(String(p.caloriesPer100g)) : null,
      fatPer100g: p.fatPer100g != null ? parseFloat(String(p.fatPer100g)) : null,
      saturatedFatPer100g: p.saturatedFatPer100g != null ? parseFloat(String(p.saturatedFatPer100g)) : null,
      carbsPer100g: p.carbsPer100g != null ? parseFloat(String(p.carbsPer100g)) : null,
      fiberPer100g: p.fiberPer100g != null ? parseFloat(String(p.fiberPer100g)) : null,
      sugarsPer100g: p.sugarsPer100g != null ? parseFloat(String(p.sugarsPer100g)) : null,
      proteinPer100g: p.proteinPer100g != null ? parseFloat(String(p.proteinPer100g)) : null,
      sodiumPer100g: p.sodiumPer100g != null ? parseFloat(String(p.sodiumPer100g)) : null,
    };
  }

  return NextResponse.json(result);
}
