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

    let blob: { url: string };
    try {
      const path = `rd-attachments/${params.id}/${Date.now()}-${file.name}`;
      blob = await put(path, file, { access: "private" });
    } catch (blobErr) {
      const msg = blobErr instanceof Error ? blobErr.message : String(blobErr);
      console.error("[attachments] Blob upload failed:", msg);
      return NextResponse.json({ error: `Blob upload failed: ${msg}` }, { status: 500 });
    }

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[attachments] Unexpected error:", msg);
    return NextResponse.json({ error: msg || "Failed to upload attachment" }, { status: 500 });
  }
}
