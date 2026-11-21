export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUseQuality } from "@/lib/quality";
import { QualityRecordPage } from "../../QualityRecordPage";

export default async function IncidentPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !canUseQuality(session.user.role)) redirect("/dashboard");
  return <QualityRecordPage kind="incidents" id={params.id} />;
}
