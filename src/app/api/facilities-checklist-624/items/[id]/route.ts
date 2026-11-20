import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FACILITIES_FACILITY, itemProblem, planReorder } from "@/lib/facilities-checklist-624";
import { bumpListVersion, canUseFacilities, loadLiveItems } from "@/lib/facilities-checklist-624-server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/facilities-checklist-624/items/[id] — supervisors and admins.
 * Body: { name?, description?, groupName?, retire?: true, move?: "up" | "down" }
 * Items are retired, never deleted. Every change takes effect at once and bumps the list version.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFacilities(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; description?: unknown; groupName?: unknown; retire?: boolean; move?: "up" | "down" }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const problem = itemProblem({ name: body.name, description: body.description, groupName: body.groupName });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const item = await prisma.facilitiesChecklistItem.findUnique({ where: { id: params.id } });
  if (!item || item.facility !== FACILITIES_FACILITY || item.retiredAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userId = session.user.id;
  const list = await prisma.$transaction(async (tx) => {
    if (body.retire === true) {
      await tx.facilitiesChecklistItem.update({ where: { id: item.id }, data: { retiredAt: new Date(), retiredById: userId, updatedById: userId } });
    } else if (body.move === "up" || body.move === "down") {
      // Swaps places with the neighbour in the same group
      for (const row of planReorder(await loadLiveItems(tx), { id: item.id, move: body.move })) {
        await tx.facilitiesChecklistItem.update({ where: { id: row.id }, data: { sortOrder: row.sortOrder, updatedById: userId } });
      }
    } else {
      // Changing the group moves the check to the end of that group (a new group goes last)
      const regroup = typeof body.groupName === "string" ? planReorder(await loadLiveItems(tx), { id: item.id, groupName: body.groupName })[0] : undefined;
      await tx.facilitiesChecklistItem.update({
        where: { id: item.id },
        data: {
          ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
          ...(typeof body.description === "string" ? { description: body.description.trim() } : {}),
          ...(regroup ? { groupName: regroup.groupName, sortOrder: regroup.sortOrder } : {}),
          updatedById: userId,
        },
      });
    }
    return bumpListVersion(tx, userId);
  });

  return NextResponse.json({ items: await loadLiveItems(prisma), listVersion: list.version });
}
