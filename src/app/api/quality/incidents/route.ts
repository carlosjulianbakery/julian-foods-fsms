import { NextRequest } from "next/server";
import { createIncident, listIncidents, qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// GET /api/quality/incidents — the list (this is the log)
export const GET = () => qualityRoute(() => listIncidents());

// POST /api/quality/incidents — create: date received, how it came in and what happened are required
export const POST = (req: NextRequest) => qualityRoute(async (actor) => createIncident(actor, await req.json().catch(() => null)), 201);
