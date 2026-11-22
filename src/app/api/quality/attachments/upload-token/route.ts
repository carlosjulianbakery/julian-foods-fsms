import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { attachmentTokenOptions } from "@/lib/quality-attachments";
import { QualityError, requireQuality } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// POST /api/quality/attachments/upload-token — a short-lived token for one direct upload from the browser.
// Admins only (canUseQuality). The record, the type, the size and the limit of ten are checked before a token is given.
export async function POST(req: NextRequest) {
  const auth = await requireQuality();
  if (auth.response) return auth.response;

  let body: HandleUploadBody;
  try { body = (await req.json()) as HandleUploadBody; } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: (pathname, clientPayload) => attachmentTokenOptions(pathname, clientPayload),
      onUploadCompleted: async () => {
        // The attachment row is created by POST /api/quality/attachments, which checks everything again
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    if (e instanceof QualityError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error("[quality upload-token]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not prepare the upload." }, { status: 400 });
  }
}
