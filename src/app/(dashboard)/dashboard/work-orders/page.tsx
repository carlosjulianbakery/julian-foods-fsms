export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { WorkOrdersHome } from "./WorkOrdersHome";

// Maintenance work orders — the list. For every signed-in user; what each person sees is decided by the server routes.
export default async function WorkOrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <WorkOrdersHome />;
}
