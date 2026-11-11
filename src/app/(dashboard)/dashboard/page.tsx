export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardClient from "./DashboardClient";
import { MyTasksBlock } from "@/components/tasks/MyTasksBlock";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as { id: string; name?: string; role: string };
  const firstName = user.name?.split(" ")[0] ?? "there";
  const role = user.role ?? "SUPERVISOR";

  return (
    <>
      <MyTasksBlock />
      <DashboardClient role={role} firstName={firstName} />
    </>
  );
}
