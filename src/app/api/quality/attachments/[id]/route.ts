import { NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { removeAttachment } from "@/lib/quality-attachments";
import { qualityRoute, requireQuality } from "@/lib/quality-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// GET /api/quality/attachments/[id] — the file itself, streamed after the session check. Add ?download=1 to save it.
// This is the only way to a file: its storage address is never sent to the browser. Removed attachments and those
// of closed or void records remain viewable.
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireQuality();
  if (auth.response) return auth.response;

  const row = await prisma.qualityAttachment.findUnique({ where: { id: params.id }, select: { fileUrl: true, fileName: true, mimeType: true } });
  if (!row) return new Response("Not found", { status: 404 });
  const result = await get(row.fileUrl, { access: "private" });
  if (!result) return new Response("Not found", { status: 404 });

  const name = encodeURIComponent(row.fileName).replace(/%20/g, " ");
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new Response(result.stream as ReadableStream, {
    headers: {
      "Content-Type": row.mimeType || result.blob.contentType || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// DELETE /api/quality/attachments/[id] — mark it removed, with a required reason: { reason }. The file is kept.
export const DELETE = (req: NextRequest, { params }: Ctx) =>
  qualityRoute(async (actor) => removeAttachment(actor, params.id, ((await req.json().catch(() => null)) as { reason?: unknown } | null)?.reason));
