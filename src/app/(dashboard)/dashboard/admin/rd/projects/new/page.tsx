import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import NewProjectForm from "./NewProjectForm";

export default async function NewRdProjectPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <h1 className="page-title">New R&D Project</h1>
      <NewProjectForm />
    </div>
  );
}
