export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUseQuality } from "@/lib/quality";
import { capaOfTask } from "@/lib/quality-reviews";
import { QualityRecordPage } from "../../QualityRecordPage";

export default async function CapaPage({ params, searchParams }: { params: { id: string }; searchParams?: { taskId?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !canUseQuality(session.user.role)) redirect("/dashboard");
  // Opened from the task's Start button: the task is marked "In progress", but only if it really is this CAPA's task
  const taskId = searchParams?.taskId;
  const startTaskId = taskId && (await capaOfTask(taskId))?.id === params.id ? taskId : undefined;
  return <QualityRecordPage kind="capas" id={params.id} startTaskId={startTaskId} />;
}
