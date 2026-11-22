import { NextRequest } from "next/server";
import { recordPdf } from "@/lib/quality-export-data";
import { qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// GET /api/quality/capas/[id]/pdf — the page layout of this record's PDF and its file name: { html, filename }.
// The browser turns it into the PDF file with the 624 exporter. Admins only: 401 without a session, 403 otherwise.
export const GET = (_req: NextRequest, { params }: Ctx) => qualityRoute((actor) => recordPdf("capa", params.id, actor));
