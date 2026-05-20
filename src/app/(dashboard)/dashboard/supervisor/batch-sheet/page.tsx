export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BatchSheetClient } from "./BatchSheetClient";

export default async function BatchSheetPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const templates = await prisma.batchSheetTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return (
    <BatchSheetClient
      templates={templates as Parameters<typeof BatchSheetClient>[0]["templates"]}
      supervisorName={session.user.name ?? ""}
    />
  );
}
