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
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const requirementId = (formData.get("requirementId") as string | null)?.trim() || null;

  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // Enforce max 10 MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
  }

  // If linking to a requirement, deactivate any existing active template for it
  if (requirementId) {
    await prisma.formTemplate.updateMany({
      where: { requirementId, isActive: true },
      data: { isActive: false },
    });
  }

  const blobPath = `form-templates/${Date.now()}-${file.name}`;
  const blob = await put(blobPath, file, { access: "private" });

  const template = await prisma.formTemplate.create({
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

  return NextResponse.json(template, { status: 201 });
}
