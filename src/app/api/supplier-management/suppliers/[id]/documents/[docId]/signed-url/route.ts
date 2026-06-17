import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueSignedToken, presignUrl } from "@vercel/blob";

/** Signed URLs expire after 1 hour */
const TTL_MS = 60 * 60 * 1000;

/**
 * Extract the blob pathname (everything after the host) from a Vercel Blob URL.
 * Works for both private  (https://{store}.blob.vercel-storage.com/{path})
 * and legacy public       (https://{store}.public.blob.vercel-storage.com/{path}) URLs.
 */
function blobPathname(fileUrl: string): string {
  const { pathname } = new URL(fileUrl);
  // pathname always starts with '/' — strip it
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Look up the document, verify it belongs to this supplier
  const doc = await prisma.supplierDocument.findUnique({
    where: { id: params.docId },
    select: { id: true, fileUrl: true, fileName: true, supplierId: true },
  });

  if (!doc || doc.supplierId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pathname = blobPathname(doc.fileUrl);
  const validUntil = Date.now() + TTL_MS;

  // Issue a short-lived read-only delegation token (server-side only)
  const signedToken = await issueSignedToken({
    operations: ["get"],
    pathname,
    validUntil,
  });

  // Produce the presigned GET URL valid for 1 hour
  const { presignedUrl } = await presignUrl(signedToken, {
    operation: "get",
    access: "private",
    pathname,
    validUntil,
  });

  return NextResponse.json({
    url: presignedUrl,
    fileName: doc.fileName,
    expiresAt: new Date(validUntil).toISOString(),
  });
}
