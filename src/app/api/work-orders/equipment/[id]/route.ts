import { NextRequest } from "next/server";
import { updateEquipment, workOrderRoute } from "@/lib/work-orders-server";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

// PATCH /api/work-orders/equipment/[id] — rename, retire or bring back an item: { name?, retired? } (supervisors and admins).
// Items are never deleted.
export const PATCH = (req: NextRequest, { params }: Ctx) => workOrderRoute(async (actor) => updateEquipment(actor, params.id, await req.json().catch(() => null)));
