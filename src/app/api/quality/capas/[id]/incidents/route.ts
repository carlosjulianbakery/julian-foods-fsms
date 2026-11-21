import { NextRequest } from "next/server";
import { linkIncident, qualityRoute, unlinkIncident } from "@/lib/quality-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };
type Body = { incidentId?: unknown; reason?: unknown } | null;

// POST /api/quality/capas/[id]/incidents — link an incident to this CAPA: { incidentId }
export const POST = (req: NextRequest, { params }: Ctx) =>
  qualityRoute(async (actor) => linkIncident(actor, params.id, ((await req.json().catch(() => null)) as Body)?.incidentId), 201);

// DELETE /api/quality/capas/[id]/incidents — unlink an incident, with a required reason: { incidentId, reason }
export const DELETE = (req: NextRequest, { params }: Ctx) =>
  qualityRoute(async (actor) => {
    const body = (await req.json().catch(() => null)) as Body;
    return unlinkIncident(actor, String(body?.incidentId ?? ""), body?.reason, params.id);
  });
