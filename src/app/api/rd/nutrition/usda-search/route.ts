import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const USDA_API_KEY = process.env.USDA_API_KEY ?? "DEMO_KEY";

const NUTRIENT_IDS: Record<string, keyof NutritionValues> = {
  "1008": "caloriesPer100g",
  "1004": "fatPer100g",
  "1258": "saturatedFatPer100g",
  "1257": "transFatPer100g",
  "1253": "cholesterolPer100g",
  "1093": "sodiumPer100g",
  "1005": "carbsPer100g",
  "1079": "fiberPer100g",
  "2000": "sugarsPer100g",
  "1003": "proteinPer100g",
};

interface NutritionValues {
  caloriesPer100g: number | null;
  fatPer100g: number | null;
  saturatedFatPer100g: number | null;
  transFatPer100g: number | null;
  cholesterolPer100g: number | null;
  sodiumPer100g: number | null;
  carbsPer100g: number | null;
  fiberPer100g: number | null;
  sugarsPer100g: number | null;
  proteinPer100g: number | null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim();
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

  try {
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("query", query);
    url.searchParams.set("dataType", "SR Legacy,Foundation,Branded");
    url.searchParams.set("pageSize", "5");
    url.searchParams.set("api_key", USDA_API_KEY);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ error: "USDA API error", status: res.status }, { status: 502 });
    }

    const data = await res.json();
    const foods = data.foods ?? [];

    const results = foods.map((food: {
      fdcId: number;
      description: string;
      dataType: string;
      foodNutrients?: Array<{ nutrientId: number; value: number }>;
    }) => {
      const nutrition: NutritionValues = {
        caloriesPer100g: null,
        fatPer100g: null,
        saturatedFatPer100g: null,
        transFatPer100g: null,
        cholesterolPer100g: null,
        sodiumPer100g: null,
        carbsPer100g: null,
        fiberPer100g: null,
        sugarsPer100g: null,
        proteinPer100g: null,
      };

      for (const fn of food.foodNutrients ?? []) {
        const key = NUTRIENT_IDS[String(fn.nutrientId)];
        if (key && fn.value != null) {
          nutrition[key] = fn.value;
        }
      }

      return {
        fdcId: String(food.fdcId),
        description: food.description,
        dataType: food.dataType,
        nutrition,
      };
    });

    return NextResponse.json(results);
  } catch (err) {
    console.error("[usda-search]", err);
    return NextResponse.json({ error: "Failed to search USDA" }, { status: 500 });
  }
}
