import { NextRequest } from "next/server";
import { incidentAction, qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// POST /api/quality/incidents/[id]/status — { action: "move" | "close" | "void" | "reopen", to?, reason?, closedDate?, expectedUpdatedAt }
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  qualityRoute(async (actor) => incidentAction(actor, params.id, await req.json().catch(() => null)));
