import { NextRequest } from "next/server";
import { getReview, updateReview } from "@/lib/quality-reviews";
import { qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// GET /api/quality/reviews/[id] — the review and its history
export const GET = (_req: NextRequest, { params }: Ctx) => qualityRoute(() => getReview(params.id));

// PATCH /api/quality/reviews/[id] — edit the review date, what was reviewed or the notes. 409 if someone else saved meanwhile.
export const PATCH = (req: NextRequest, { params }: Ctx) => qualityRoute(async (actor) => updateReview(actor, params.id, await req.json().catch(() => null)));
