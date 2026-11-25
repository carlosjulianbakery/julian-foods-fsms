import { NextRequest } from "next/server";
import { cancelWorkOrder, workOrderRoute } from "@/lib/work-orders-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// POST /api/work-orders/[id]/cancel — who may do it is checked on the server (see workOrderCan).
export const POST = (req: NextRequest, { params }: Ctx) => workOrderRoute(async (actor) => cancelWorkOrder(actor, params.id, await req.json().catch(() => null)));
