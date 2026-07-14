import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProjectDetailClient from "./ProjectDetailClient";

export const dynamic = "force-dynamic";

export default async function RdProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") redirect("/dashboard");

  const project = await prisma.rdProject.findUnique({
    where: { id: params.id },
    include: {
      createdBy: { select: { name: true } },
      iterations: {
        include: {
          evaluations: { orderBy: { evaluationDate: "desc" } },
          attachments: { orderBy: { uploadedAt: "desc" } },
        },
        orderBy: { iterationNumber: "asc" },
      },
    },
  });

  if (!project) redirect("/dashboard/admin/rd/projects");

  const serialized = JSON.parse(JSON.stringify(project));

  return <ProjectDetailClient project={serialized} userId={userId} />;
}
