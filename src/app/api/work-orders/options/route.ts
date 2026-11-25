import { NextRequest } from "next/server";
import { findDuplicates, workOrderOptions, workOrderRoute } from "@/lib/work-orders-server";

export const dynamic = "force-dynamic";

// GET /api/work-orders/options — what the forms need: active users, the equipment lists, today's Pacific date, the
// facility to start on. With ?facility=&equipmentId=&equipmentName= it also lists the open work orders for that
// equipment, shown as a warning before a new one is opened.
export const GET = (req: NextRequest) =>
  workOrderRoute(async (actor) => {
    const q = req.nextUrl.searchParams;
    const facility = q.get("facility") ?? "";
    const duplicates = facility ? await findDuplicates(actor, facility, q.get("equipmentId") || null, q.get("equipmentName") ?? "") : [];
    return { ...(await workOrderOptions(actor)), duplicates };
  });
