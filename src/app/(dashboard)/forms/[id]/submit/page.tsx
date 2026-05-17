export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DynamicFormRenderer } from "@/components/forms/DynamicFormRenderer";

export default async function SubmitFormPage({ params }: { params: { id: string } }) {
  const form = await prisma.form.findUnique({
    where: { id: params.id, active: true },
    include: { createdBy: { select: { name: true } } },
  });

  if (!form) notFound();

  return (
    <div className="max-w-2xl">
      <DynamicFormRenderer form={form} />
    </div>
  );
}
