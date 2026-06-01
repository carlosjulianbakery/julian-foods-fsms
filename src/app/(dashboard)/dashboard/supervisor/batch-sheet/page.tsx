export const dynamic = "force-dynamic";
import { unstable_noStore as noStore } from "next/cache";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BatchSheetClient, Template } from "./BatchSheetClient";

export default async function BatchSheetPage() {
  // Explicitly opt out of ALL Next.js caching — ensures every page visit
  // fetches the latest template data from the database.
  noStore();

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [raw, recentSubs] = await Promise.all([
    prisma.batchSheetTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.batchSheetSubmission.findMany({
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: { section2_allergen: true },
    }),
  ]);

  // Map DB column names to client-side type names
  const templates: Template[] = raw.map((t) => ({
    id:                   t.id,
    name:                 t.name,
    description:          t.description,
    category:             t.category,
    updatedAt:            t.updatedAt.toISOString(),
    ingredients:          t.ingredients as Template["ingredients"],
    presentations:        t.packaging as Template["presentations"],
    ovensAvailable:       t.ovensAvailable as string[],
    calibrationWeights:   t.calibrationWeights as { label: string }[],
    ccpChecks:            t.ccpSettings as Template["ccpChecks"],
    ccpNumSessions:       t.ccpNumSessions,
    ccpRequireTimestamp:  t.ccpRequireTimestamp,
    endOfProductionFields:   t.endOfProductionFields as unknown as Template["endOfProductionFields"],
    releaseChecklistItems:   t.releaseChecklistItems as string[],
    // Unit config is now embedded per-presentation inside presentations[].primary_unit_name etc.
    declaredAllergens:       (t.declaredAllergens ?? []) as string[],
  }));

  // Find the equipment used in the last passing swab attempt
  let lastSwabEquipment: string | null = null;
  for (const sub of recentSubs) {
    if (!sub.section2_allergen) continue;
    const allergen = sub.section2_allergen as {
      changeover_required: boolean;
      swab_attempts?: Array<{ result: string; equipment_swabbed: string }>;
    };
    if (!allergen.changeover_required || !allergen.swab_attempts) continue;
    const lastPass = allergen.swab_attempts.find((a) => a.result === "pass");
    if (lastPass) { lastSwabEquipment = lastPass.equipment_swabbed; break; }
  }

  return (
    <BatchSheetClient
      templates={templates}
      supervisorName={session.user.name ?? ""}
      lastSwabEquipment={lastSwabEquipment}
    />
  );
}
