export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { NewWorkOrderPage } from "../NewWorkOrderPage";

// New maintenance work order (Step 1, the request). Any signed-in user.
export default async function NewWorkOrder() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <NewWorkOrderPage />;
}
