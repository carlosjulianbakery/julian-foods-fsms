import { NextRequest } from "next/server";
import { capaAction, qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// POST /api/quality/capas/[id]/status — { action: "move" | "close" | "void" | "reopen", to?, reason?, expectedUpdatedAt }
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  qualityRoute(async (actor) => capaAction(actor, params.id, await req.json().catch(() => null)));
