import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TemplateForm } from "../TemplateForm";

export default async function NewTemplatePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">New Batch Sheet Template</h1>
        <p className="page-subtitle">Define ingredients, packaging, ovens, and CCP settings</p>
      </div>
      <TemplateForm mode="new" />
    </div>
  );
}
