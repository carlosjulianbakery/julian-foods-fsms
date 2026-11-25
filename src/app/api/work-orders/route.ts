import { NextRequest } from "next/server";
import { createWorkOrder, healWorkOrderTasks, listWorkOrders, workOrderRoute } from "@/lib/work-orders-server";

export const dynamic = "force-dynamic";

// GET /api/work-orders — the list. Supervisors and admins get every work order; anyone else only those they
// requested or are assigned to (decided on the server).
export const GET = () => workOrderRoute(async (actor) => { await healWorkOrderTasks(actor); return listWorkOrders(actor); });

// POST /api/work-orders — open a work order (any signed-in, active user):
// { facility, requestType, equipmentId | "other", equipmentName?, problem, priority, assigneeId }.
// The date, the time and "requested by" are set by the server. Creates the assignee's task.
export const POST = (req: NextRequest) => workOrderRoute(async (actor) => createWorkOrder(actor, await req.json().catch(() => null)), 201);
