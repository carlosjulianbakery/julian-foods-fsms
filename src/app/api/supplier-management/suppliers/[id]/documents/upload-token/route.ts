import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname) => {
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 25 * 1024 * 1024,
        };
      },
      onUploadCompleted: async ({ blob: _blob }) => {
        // DB record is saved by the client in a separate step
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error("[upload-token] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Token generation failed" },
      { status: 400 }
    );
  }
}
