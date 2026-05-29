import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, requirementType, isRequired, isActive, sortOrder } = body;

  const updated = await prisma.documentRequirement.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(requirementType !== undefined ? { requirementType } : {}),
      ...(isRequired !== undefined ? { isRequired } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
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

  // Check for documents using this requirement
  const count = await prisma.supplierDocument.count({ where: { requirementId: params.id } });
  if (count > 0) {
    // Soft-delete instead of hard delete
    await prisma.documentRequirement.update({ where: { id: params.id }, data: { isActive: false } });
    return NextResponse.json({ success: true, softDeleted: true });
  }

  await prisma.documentRequirement.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
