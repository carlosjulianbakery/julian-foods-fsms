export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const formId = searchParams.get("formId");
  const mine = searchParams.get("mine") === "1";

  const submissions = await prisma.formSubmission.findMany({
    where: {
      ...(formId && { formId }),
      ...(mine && { submittedById: session.user.id }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      form: { select: { title: true, category: true } },
      submittedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(submissions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { formId, data, notes, taskId } = await req.json();

    if (!formId || !data) {
      return NextResponse.json({ error: "formId and data are required." }, { status: 400 });
    }

    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });

    const submission = await prisma.formSubmission.create({
      data: {
        formId,
        data,
        notes: notes || null,
        submittedById: session.user.id,
        status: "SUBMITTED",
        ...(taskId && { taskId }),
      },
    });

    if (taskId) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: "SUBMISSION_CREATED",
        entity: "FormSubmission",
        entityId: submission.id,
        userId: session.user.id,
        userName: session.user.name ?? "Unknown",
        details: { formId, taskId },
      },
    });

    return NextResponse.json(submission, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Submission failed." }, { status: 500 });
  }
}
