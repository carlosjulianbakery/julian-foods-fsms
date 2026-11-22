export const dynamic = "force-dynamic";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUseQuality } from "@/lib/quality";
import { capaOfTask } from "@/lib/quality-reviews";

// "Start" on a CAPA follow-up task lands here with ?taskId=…: find the CAPA that holds that task and open it.
export default async function CapaTaskPage({ searchParams }: { searchParams?: { taskId?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !canUseQuality(session.user.role)) redirect("/dashboard");
  const capa = await capaOfTask(searchParams?.taskId);
  if (capa) redirect(`/dashboard/admin/quality/capas/${capa.id}`);
  return (
    <div className="max-w-xl card p-6 space-y-3" data-capa-task-missing>
      <h1 className="text-base font-semibold text-gray-900">No CAPA was found for this task</h1>
      <p className="text-sm text-gray-600">The task is not linked to a CAPA any more. This can happen when the CAPA&apos;s owner or due date was cleared, or the CAPA was voided.</p>
      <Link href="/dashboard/admin/quality?tab=capas" className="btn-secondary inline-block text-sm">Open the CAPA list</Link>
    </div>
  );
}
