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
          className="inline-flex items-center rounded-full font-bold uppercase tracking-widest"
          style={{ padding: "8px 20px", fontSize: "0.85rem", background: "#FEF3C7", border: "1.5px solid #F59E0B", color: "#D97706", animation: "labPulse 3s ease-in-out infinite" }}
        >
          🧪 R&D Lab
        </span>
      </div>
      <h1 style={{ fontSize: "3.5rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, background: "linear-gradient(135deg, #D97706 0%, #F59E0B 40%, #F97316 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
        New R&D Project
      </h1>
      <NewProjectForm />
    </div>
  );
}
