import { NextRequest } from "next/server";
import { createCapa, listCapas, qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// GET /api/quality/capas — the list (this is the log)
export const GET = () => qualityRoute(() => listCapas());

// POST /api/quality/capas — create: source and the problem are required
export const POST = (req: NextRequest) => qualityRoute(async (actor) => createCapa(actor, await req.json().catch(() => null)), 201);
