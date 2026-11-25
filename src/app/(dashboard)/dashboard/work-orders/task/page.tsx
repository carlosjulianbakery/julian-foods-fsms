export const dynamic = "force-dynamic";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { currentActor, startWorkOrder, workOrderOfTask } from "@/lib/work-orders-server";

// "Start" on a work order task lands here with ?taskId=…: find the work order that holds the task and open it.
// Pressing Start on the task is pressing Start on the work order: if it is still Open and this person may do
// the work, it goes to In progress (and so does the task). Anything else is left exactly as it is.
export default async function WorkOrderTaskPage({ searchParams }: { searchParams?: { taskId?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const actor = await currentActor(session);
  if (!actor) redirect("/dashboard");
  const found = await workOrderOfTask(actor, searchParams?.taskId);
  if (found) {
    await startWorkOrder(actor, found.id).catch(() => null);
    redirect(`/dashboard/work-orders/${found.id}`);
  }
  return (
    <div className="max-w-xl card p-6 space-y-3" data-work-order-task-missing>
      <h1 className="text-base font-semibold text-gray-900">No work order was found for this task</h1>
      <p className="text-sm text-gray-600">The task is not linked to a work order you can open. It may have been cancelled or reassigned.</p>
      <Link href="/dashboard/work-orders" className="btn-secondary inline-block text-sm">Open the work order list</Link>
    </div>
  );
}
