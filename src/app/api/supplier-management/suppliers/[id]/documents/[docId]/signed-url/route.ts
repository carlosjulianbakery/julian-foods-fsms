import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { get } from "@vercel/blob";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const doc = await prisma.supplierDocument.findUnique({
    where: { id: params.docId },
    select: { id: true, fileUrl: true, fileName: true, supplierId: true },
  });

  if (!doc || doc.supplierId !== params.id) {
    return new Response("Not found", { status: 404 });
  }

  const result = await get(doc.fileUrl, { access: "private" });
  if (!result) return new Response("Not found", { status: 404 });

  const safeFileName = encodeURIComponent(doc.fileName).replace(/%20/g, " ");

  return new Response(result.stream as ReadableStream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeFileName}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
