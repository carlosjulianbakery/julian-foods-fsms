export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canUseQuality, isPeriod } from "@/lib/quality";
import { periodOfReviewTask } from "@/lib/quality-reviews";
import { QualityHome } from "./QualityHome";

// Quality — Customer Incidents and CAPA. Admins only (the one check is canUseQuality).
export default async function QualityPage({ searchParams }: { searchParams?: { tab?: string; period?: string; taskId?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !canUseQuality(session.user.role)) redirect("/dashboard");
  const tab = searchParams?.tab === "capas" ? "capas" : searchParams?.tab === "reviews" ? "reviews" : "incidents";
  // Opened from the review task's Start button: the task is marked "In progress", but only if it really is that month's review task
  const period = isPeriod(searchParams?.period) ? searchParams!.period : undefined;
  const taskId = searchParams?.taskId;
  const startTaskId = tab === "reviews" && taskId && period && (await periodOfReviewTask(taskId)) === period ? taskId : undefined;
  return (
    <QualityHome
      initialTab={tab}
      reviewerName={session.user.name ?? ""}
      // From the review task's Start button: the month to open, and the task to complete when the review is saved
      initialPeriod={period}
      taskId={taskId}
      startTaskId={startTaskId}
    />
  );
}
