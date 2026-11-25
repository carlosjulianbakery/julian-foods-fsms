import { NextRequest } from "next/server";
import { reassignWorkOrder, workOrderRoute } from "@/lib/work-orders-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// POST /api/work-orders/[id]/assign — who may do it is checked on the server (see workOrderCan).
export const POST = (req: NextRequest, { params }: Ctx) => workOrderRoute(async (actor) => reassignWorkOrder(actor, params.id, await req.json().catch(() => null)));
