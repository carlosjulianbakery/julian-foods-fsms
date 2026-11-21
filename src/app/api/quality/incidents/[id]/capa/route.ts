import { NextRequest } from "next/server";
import { openCapaFromIncident, qualityRoute, unlinkIncident } from "@/lib/quality-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// POST /api/quality/incidents/[id]/capa — "Open CAPA": creates a CAPA from this incident and links the two
export const POST = (_req: NextRequest, { params }: Ctx) => qualityRoute((actor) => openCapaFromIncident(actor, params.id), 201);

// DELETE /api/quality/incidents/[id]/capa — unlink, with a required reason: { reason }
export const DELETE = (req: NextRequest, { params }: Ctx) =>
  qualityRoute(async (actor) => unlinkIncident(actor, params.id, ((await req.json().catch(() => null)) as { reason?: unknown } | null)?.reason));
