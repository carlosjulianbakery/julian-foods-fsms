export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BatchSheetClient, Template } from "./BatchSheetClient";

export default async function BatchSheetPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const raw = await prisma.batchSheetTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Map DB column names to client-side type names:
  //   packaging  (DB) → presentations (client)
  //   ccpSettings (DB) → ccpChecks (client)
  const templates: Template[] = raw.map((t) => ({
    id:                   t.id,
    name:                 t.name,
    description:          t.description,
    category:             t.category,
    ingredients:          t.ingredients as Template["ingredients"],
    presentations:        t.packaging as Template["presentations"],
    ovensAvailable:       t.ovensAvailable as string[],
    calibrationWeights:   t.calibrationWeights as { label: string }[],
    ccpChecks:            t.ccpSettings as Template["ccpChecks"],
    ccpNumSessions:       t.ccpNumSessions,
    ccpRequireTimestamp:  t.ccpRequireTimestamp,
    endOfProductionFields: t.endOfProductionFields as string[] ?? [],
    releaseChecklistItems: t.releaseChecklistItems as string[],
  }));

  return (
    <BatchSheetClient
      templates={templates}
      supervisorName={session.user.name ?? ""}
    />
  );
}
