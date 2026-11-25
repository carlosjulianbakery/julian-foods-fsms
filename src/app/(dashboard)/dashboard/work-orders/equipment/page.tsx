export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { workOrderCan } from "@/lib/work-orders";
import { EquipmentPage } from "../EquipmentPage";

// The equipment / area list used by work orders. Supervisors and admins only (the routes check it again).
export default async function WorkOrderEquipment() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!workOrderCan.editEquipment({ id: session.user.id, role: session.user.role })) redirect("/dashboard/work-orders");
  return <EquipmentPage />;
}
