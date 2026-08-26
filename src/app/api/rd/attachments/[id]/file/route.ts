import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { get } from "@vercel/blob";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const attachment = await prisma.rdAttachment.findUnique({
    where: { id: params.id },
    select: { fileUrl: true, fileName: true },
  });

  if (!attachment) return new Response("Not found", { status: 404 });

  const result = await get(attachment.fileUrl, { access: "private" });
  if (!result) return new Response("Not found", { status: 404 });

  const safeFileName = encodeURIComponent(attachment.fileName).replace(/%20/g, " ");

  return new Response(result.stream as ReadableStream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeFileName}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
