import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.formTemplate.findUnique({ where: { id: params.id } });
  if (!existing || !existing.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    // Full replacement — new file upload
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string | null)?.trim();
    const description = (formData.get("description") as string | null)?.trim() || null;
    const requirementId = (formData.get("requirementId") as string | null)?.trim() || null;

    if (!file) return NextResponse.json({ error: "file is required for replace" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
    }

    // Deactivate current record
    await prisma.formTemplate.update({ where: { id: params.id }, data: { isActive: false } });

    // Deactivate any other active template for the same requirement
    const targetReqId = requirementId ?? existing.requirementId;
    if (targetReqId) {
      await prisma.formTemplate.updateMany({
        where: { requirementId: targetReqId, isActive: true, id: { not: params.id } },
        data: { isActive: false },
      });
    }

    const blobPath = `form-templates/${Date.now()}-${file.name}`;
    const blob = await put(blobPath, file, { access: "private" });

    const newTemplate = await prisma.formTemplate.create({
      data: {
        name: name ?? existing.name,
        description: description ?? existing.description,
        filePath: blobPath,
        fileUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        requirementId: targetReqId,
        uploadedById: userId,
      },
      include: {
        requirement: { select: { id: true, name: true, requirementType: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(newTemplate);
  }

  // Metadata-only update (name, description, requirementId)
  const body = await req.json();
  const { name, description, requirementId } = body;

  // If relinking to a different requirement, deactivate existing templates there
  if (requirementId !== undefined && requirementId !== existing.requirementId && requirementId) {
    await prisma.formTemplate.updateMany({
      where: { requirementId, isActive: true, id: { not: params.id } },
      data: { isActive: false },
    });
  }

  const updated = await prisma.formTemplate.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(requirementId !== undefined ? { requirementId: requirementId || null } : {}),
    },
    include: {
      requirement: { select: { id: true, name: true, requirementType: true } },
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.formTemplate.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-delete — preserve history
  await prisma.formTemplate.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
