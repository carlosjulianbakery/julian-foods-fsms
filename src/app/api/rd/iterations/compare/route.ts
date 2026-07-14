import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface RecipeItem {
  ingredientName: string;
  quantity: number;
  unit: string;
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const iterationId1 = searchParams.get("iterationId1");
    const iterationId2 = searchParams.get("iterationId2");

    if (!iterationId1 || !iterationId2) {
      return NextResponse.json({ error: "iterationId1 and iterationId2 are required" }, { status: 400 });
    }

    const [iter1, iter2] = await Promise.all([
      prisma.rdIteration.findUnique({
        where: { id: iterationId1 },
        include: { project: { select: { name: true } }, evaluations: true, attachments: true },
      }),
      prisma.rdIteration.findUnique({
        where: { id: iterationId2 },
        include: { project: { select: { name: true } }, evaluations: true, attachments: true },
      }),
    ]);

    if (!iter1) return NextResponse.json({ error: "iterationId1 not found" }, { status: 404 });
    if (!iter2) return NextResponse.json({ error: "iterationId2 not found" }, { status: 404 });

    // Recipe diff
    const recipe1 = iter1.recipe as unknown as RecipeItem[];
    const recipe2 = iter2.recipe as unknown as RecipeItem[];

    const allIngredientNames = Array.from(
      new Set([...recipe1.map((r) => r.ingredientName), ...recipe2.map((r) => r.ingredientName)])
    );

    const recipeDiff = allIngredientNames.map((name) => {
      const item1 = recipe1.find((r) => r.ingredientName === name);
      const item2 = recipe2.find((r) => r.ingredientName === name);

      const qty1 = item1?.quantity ?? null;
      const unit1 = item1?.unit ?? null;
      const qty2 = item2?.quantity ?? null;
      const unit2 = item2?.unit ?? null;

      let status: "same" | "changed" | "added" | "removed";
      if (!item1) {
        status = "added";
      } else if (!item2) {
        status = "removed";
      } else if (qty1 === qty2 && unit1 === unit2) {
        status = "same";
      } else {
        status = "changed";
      }

      return { ingredientName: name, qty1, unit1, qty2, unit2, status };
    });

    // Sensory comparison
    const ratingKeys = [
      "ratingAppearance",
      "ratingAroma",
      "ratingTexture",
      "ratingSweetness",
      "ratingFlavorIntensity",
      "ratingOverall",
    ] as const;

    const sensoryAttributes = ratingKeys.map((key) => {
      const avg1 = avg(iter1.evaluations.map((e) => e[key]));
      const avg2 = avg(iter2.evaluations.map((e) => e[key]));
      const delta = avg1 != null && avg2 != null ? avg2 - avg1 : null;
      return { name: key, avg1, avg2, delta };
    });

    const countRecommendations = (evals: typeof iter1.evaluations): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const e of evals) {
        if (e.recommendation) {
          counts[e.recommendation] = (counts[e.recommendation] ?? 0) + 1;
        }
      }
      return counts;
    };

    const sensoryComparison = {
      attributes: sensoryAttributes,
      recommendations1: countRecommendations(iter1.evaluations),
      recommendations2: countRecommendations(iter2.evaluations),
    };

    // Nutritional comparison
    const nutritionalFields = [
      { nutrient: "calories", key: "actualCalories" },
      { nutrient: "fat", key: "actualFat" },
      { nutrient: "saturatedFat", key: "actualSaturatedFat" },
      { nutrient: "carbs", key: "actualCarbs" },
      { nutrient: "fiber", key: "actualFiber" },
      { nutrient: "sugars", key: "actualSugars" },
      { nutrient: "addedSugars", key: "actualAddedSugars" },
      { nutrient: "protein", key: "actualProtein" },
      { nutrient: "sodium", key: "actualSodium" },
    ] as const;

    const nutritionalComparison = nutritionalFields.map(({ nutrient, key }) => {
      const val1 = iter1[key] as number | null;
      const val2 = iter2[key] as number | null;
      const delta = val1 != null && val2 != null ? val2 - val1 : null;
      return { nutrient, val1, val2, delta };
    });

    const pickIterFields = (iter: typeof iter1) => ({
      id: iter.id,
      iterationNumber: iter.iterationNumber,
      projectId: iter.projectId,
      datePerformed: iter.datePerformed,
      recipe: iter.recipe,
      evaluations: iter.evaluations,
      actualCalories: iter.actualCalories,
      actualFat: iter.actualFat,
      actualSaturatedFat: iter.actualSaturatedFat,
      actualCarbs: iter.actualCarbs,
      actualFiber: iter.actualFiber,
      actualSugars: iter.actualSugars,
      actualAddedSugars: iter.actualAddedSugars,
      actualProtein: iter.actualProtein,
      actualSodium: iter.actualSodium,
    });

    return NextResponse.json({
      iteration1: pickIterFields(iter1),
      iteration2: pickIterFields(iter2),
      recipeDiff,
      sensoryComparison,
      nutritionalComparison,
    });
  } catch {
    return NextResponse.json({ error: "Failed to compare iterations" }, { status: 500 });
  }
}
