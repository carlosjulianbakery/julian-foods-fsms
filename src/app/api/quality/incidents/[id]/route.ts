import { NextRequest } from "next/server";
import { getIncident, qualityRoute, updateIncident } from "@/lib/quality-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// GET /api/quality/incidents/[id] — the record, its linked CAPA and its history
export const GET = (_req: NextRequest, { params }: Ctx) => qualityRoute(() => getIncident(params.id));

// PATCH /api/quality/incidents/[id] — save changed fields. 409 if someone else saved in the meantime.
export const PATCH = (req: NextRequest, { params }: Ctx) => qualityRoute(async (actor) => updateIncident(actor, params.id, await req.json().catch(() => null)));
