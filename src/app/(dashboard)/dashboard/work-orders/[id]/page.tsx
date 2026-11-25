export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { WorkOrderPage } from "../WorkOrderPage";

// One work order. Whether this person may see it is decided by the route the page loads it from (404 if not).
export default async function WorkOrder({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <WorkOrderPage id={params.id} />;
}
