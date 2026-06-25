import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.formTemplate.findMany({
    where: { isActive: true },
    include: {
      requirement: { select: { id: true, name: true, requirementType: true } },
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { error: "You must be logged in to upload documents." },
      { status: 401 }
    );
  }

  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") {
    console.error(
      `Upload blocked: user role is ${role}, expected ADMIN. User id: ${userId}`
    );
    return NextResponse.json(
      {
        error:
          "You do not have permission to upload documents. Admin role required.",
      },
      { status: 403 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const requirementId = (formData.get("requirementId") as string | null)?.trim() || null;

  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // File type validation
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are accepted. Please upload a PDF." },
      { status: 400 }
    );
  }

  // File size validation (10 MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      {
        error:
          "File exceeds the 10MB limit. Please compress or reduce the file size.",
      },
      { status: 400 }
    );
  }

  // If linking to a requirement, deactivate any existing active template for it
  if (requirementId) {
    await prisma.formTemplate.updateMany({
      where: { requirementId, isActive: true },
      data: { isActive: false },
    });
  }

  const blobPath = `form-templates/${Date.now()}-${file.name}`;
  let blob: Awaited<ReturnType<typeof put>>;
  try {
    blob = await put(blobPath, file, { access: "private" });
  } catch (blobError) {
    console.error("[form-templates upload] Blob storage error:", blobError);
    return NextResponse.json(
      { error: "File storage error. Please try again or contact support." },
      { status: 500 }
    );
  }

  let template: Awaited<ReturnType<typeof prisma.formTemplate.create>>;
  try {
    template = await prisma.formTemplate.create({
      data: {
        name,
        description,
        filePath: blobPath,
        fileUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        requirementId,
        uploadedById: userId,
      },
      include: {
        requirement: { select: { id: true, name: true, requirementType: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  } catch (dbError) {
    console.error("[form-templates upload] Database save error:", dbError);
    return NextResponse.json(
      {
        error:
          "File uploaded but could not be saved to records. Please contact admin.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(template, { status: 201 });
}
