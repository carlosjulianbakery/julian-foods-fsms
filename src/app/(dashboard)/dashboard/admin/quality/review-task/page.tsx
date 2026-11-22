export const dynamic = "force-dynamic";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUseQuality } from "@/lib/quality";
import { periodOfReviewTask } from "@/lib/quality-reviews";
import { noteTaskStarted } from "@/lib/quality-server";

// "Start" on the monthly review task lands here with ?taskId=…: open the Reviews tab on that task's month.
// The first time, the start is noted on the task; the Reviews tab then marks the task "In progress".
export default async function ReviewTaskPage({ searchParams }: { searchParams?: { taskId?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !canUseQuality(session.user.role)) redirect("/dashboard");
  const period = await periodOfReviewTask(searchParams?.taskId);
  if (period) {
    await noteTaskStarted({ id: session.user.id, name: session.user.name ?? "" }, searchParams?.taskId);
    redirect(`/dashboard/admin/quality?tab=reviews&period=${period}&taskId=${encodeURIComponent(searchParams!.taskId!)}`);
  }
  return (
    <div className="max-w-xl card p-6 space-y-3" data-review-task-missing>
      <h1 className="text-base font-semibold text-gray-900">This task is not a monthly review task</h1>
      <p className="text-sm text-gray-600">Open the Reviews tab to record the review of a month.</p>
      <Link href="/dashboard/admin/quality?tab=reviews" className="btn-secondary inline-block text-sm">Open Reviews</Link>
    </div>
  );
}
