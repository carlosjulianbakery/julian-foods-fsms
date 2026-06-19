import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueSignedToken, presignUrl } from "@vercel/blob";

const TTL_MS = 60 * 60 * 1000; // 1 hour

function blobPathname(fileUrl: string): string {
  const { pathname } = new URL(fileUrl);
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await prisma.formTemplate.findUnique({
    where: { id: params.id },
    select: { id: true, fileUrl: true, fileName: true, isActive: true },
  });

  if (!template || !template.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pathname = blobPathname(template.fileUrl);
  const validUntil = Date.now() + TTL_MS;

  const signedToken = await issueSignedToken({
    operations: ["get"],
    pathname,
    validUntil,
  });

  const { presignedUrl } = await presignUrl(signedToken, {
    operation: "get",
    access: "private",
    pathname,
    validUntil,
  });

  return NextResponse.json({
    url: presignedUrl,
    fileName: template.fileName,
    expiresAt: new Date(validUntil).toISOString(),
  });
}
