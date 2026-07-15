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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest"
          style={{ background: "#F59E0B15", border: "1px solid #F59E0B40", color: "#F59E0B" }}
        >
          🧪 R&D Lab
        </span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#F5F0E8" }}>
        New R&D Project
      </h1>
      <NewProjectForm />
    </div>
  );
}
