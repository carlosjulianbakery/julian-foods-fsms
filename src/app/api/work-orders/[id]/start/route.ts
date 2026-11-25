import { NextRequest } from "next/server";
import { startWorkOrder, workOrderRoute } from "@/lib/work-orders-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// POST /api/work-orders/[id]/start — the assignee (or an admin) starts the work: Open → In progress, and the task with it.
export const POST = (req: NextRequest, { params }: Ctx) =>
  workOrderRoute(async (actor) => startWorkOrder(actor, params.id, ((await req.json().catch(() => null)) as { expectedUpdatedAt?: unknown } | null)?.expectedUpdatedAt));
