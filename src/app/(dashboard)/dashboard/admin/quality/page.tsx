export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUseQuality } from "@/lib/quality";
import { QualityHome } from "./QualityHome";

// Quality — Customer Incidents and CAPA. Admins only (the one check is canUseQuality).
export default async function QualityPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !canUseQuality(session.user.role)) redirect("/dashboard");
  return <QualityHome initialTab={searchParams?.tab === "capas" ? "capas" : "incidents"} />;
}
