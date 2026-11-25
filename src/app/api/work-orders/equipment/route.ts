import { NextRequest } from "next/server";
import { addEquipment, listEquipment, workOrderRoute } from "@/lib/work-orders-server";

export const dynamic = "force-dynamic";

// GET /api/work-orders/equipment — the whole equipment / area list, retired items included (supervisors and admins).
export const GET = () => workOrderRoute((actor) => listEquipment(actor));

// POST /api/work-orders/equipment — add an item: { facility, name } (supervisors and admins).
export const POST = (req: NextRequest) => workOrderRoute(async (actor) => addEquipment(actor, await req.json().catch(() => null)), 201);
