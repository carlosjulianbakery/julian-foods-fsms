import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const description = formData.get("description") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File size must be 10MB or less" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed. Allowed types: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const path = `rd-attachments/${params.id}/${Date.now()}-${file.name}`;
    const blob = await put(path, file, { access: "public" });

    const attachment = await prisma.rdAttachment.create({
      data: {
        iterationId: params.id,
        fileName: file.name,
        fileUrl: blob.url,
        fileSize: file.size,
        fileType: file.type,
        description: description ?? null,
        uploadedById: userId,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload attachment" }, { status: 500 });
  }
}
