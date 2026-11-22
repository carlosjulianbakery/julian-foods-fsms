import { NextRequest } from "next/server";
import { createReview, listReviews } from "@/lib/quality-reviews";
import { qualityRoute } from "@/lib/quality-server";

export const dynamic = "force-dynamic";

// GET /api/quality/reviews — past reviews, plus today's month and its counts as of now
export const GET = () => qualityRoute(() => listReviews());

// POST /api/quality/reviews — save the review of a month: { period: "YYYY-MM", reviewDate, whatWasReviewed, notes?, taskId? }.
// One per month. Saving it completes that month's review task.
export const POST = (req: NextRequest) => qualityRoute(async (actor) => createReview(actor, await req.json().catch(() => null)), 201);
