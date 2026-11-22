import { NextRequest } from "next/server";
import { addAttachment } from "@/lib/quality-attachments";
import { qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// POST /api/quality/attachments — record an uploaded file on its incident or CAPA:
// { recordType, recordId, kind, fileName, fileUrl, fileSize, mimeType, description? }. Type, size and the limit are checked again here.
export const POST = (req: NextRequest) => qualityRoute(async (actor) => addAttachment(actor, await req.json().catch(() => null)), 201);
