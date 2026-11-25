import { NextRequest } from "next/server";
import { getWorkOrder, healWorkOrderTasks, saveStep2Draft, workOrderRoute } from "@/lib/work-orders-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// GET /api/work-orders/[id] — the record and its change log. 404 for anyone who may not see it.
export const GET = (_req: NextRequest, { params }: Ctx) => workOrderRoute(async (actor) => { await healWorkOrderTasks(actor, params.id); return getWorkOrder(actor, params.id); });

// PATCH /api/work-orders/[id] — "Save draft" of Step 2 (the assignee, or an admin). 409 if someone else saved in the meantime.
export const PATCH = (req: NextRequest, { params }: Ctx) => workOrderRoute(async (actor) => saveStep2Draft(actor, params.id, await req.json().catch(() => null)));
