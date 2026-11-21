import { NextRequest } from "next/server";
import { getCapa, qualityRoute, updateCapa } from "@/lib/quality-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// GET /api/quality/capas/[id] — the record, its incidents and its history
export const GET = (_req: NextRequest, { params }: Ctx) => qualityRoute(() => getCapa(params.id));

// PATCH /api/quality/capas/[id] — save changed fields. 409 if someone else saved in the meantime.
export const PATCH = (req: NextRequest, { params }: Ctx) => qualityRoute(async (actor) => updateCapa(actor, params.id, await req.json().catch(() => null)));
