import { NextRequest } from "next/server";
import { createCapa, healCapaTasks, listCapas, qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// GET /api/quality/capas — the list (this is the log). Loading it first completes any follow-up task left open
// on a CAPA that is already at Verifying effectiveness or Closed.
export const GET = () => qualityRoute(async (actor) => { await healCapaTasks(actor); return listCapas(); });

// POST /api/quality/capas — create: source and the problem are required
export const POST = (req: NextRequest) => qualityRoute(async (actor) => createCapa(actor, await req.json().catch(() => null)), 201);
