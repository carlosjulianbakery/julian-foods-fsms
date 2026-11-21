import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FOREIGN_MATTER_FACILITY, isSection, itemProblem, matchAreaName, nameTaken, nameTakenMessage, planReorder, type Section } from "@/lib/foreign-matter-624";
import { bumpListVersion, canUseForeignMatter, loadLiveItems } from "@/lib/foreign-matter-624-server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/foreign-matter-624/items/[id] — supervisors and admins.
 * Body: { name?, expectedQuantity?, areaName?, section?, retire?: true, move?: "up" | "down" }
 * Items are retired, never deleted. Every change takes effect at once and bumps the list version.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseForeignMatter(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; expectedQuantity?: unknown; areaName?: unknown; section?: unknown; retire?: boolean; move?: "up" | "down" }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const problem = itemProblem({ name: body.name, expectedQuantity: body.expectedQuantity, areaName: body.areaName, section: body.section });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const item = await prisma.foreignMatterItem.findUnique({ where: { id: params.id } });
  if (!item || item.facility !== FOREIGN_MATTER_FACILITY || item.retiredAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Names are unique within an area (case-insensitive): checked for a rename and for a move to another area or section
  if (body.retire !== true && !body.move && (typeof body.name === "string" || typeof body.areaName === "string" || isSection(body.section))) {
    const live = await loadLiveItems(prisma);
    const section = (isSection(body.section) ? body.section : item.section) as Section;
    const areaName = matchAreaName(live, section, typeof body.areaName === "string" ? body.areaName : item.areaName);
    const name = typeof body.name === "string" ? body.name : item.name;
    if (nameTaken(live, section, areaName, name, item.id)) return NextResponse.json({ error: nameTakenMessage(areaName, name) }, { status: 409 });
  }

  const userId = session.user.id;
  const list = await prisma.$transaction(async (tx) => {
    if (body.retire === true) {
      await tx.foreignMatterItem.update({ where: { id: item.id }, data: { retiredAt: new Date(), retiredById: userId, updatedById: userId } });
    } else if (body.move === "up" || body.move === "down") {
      // Swaps places with the neighbour in the same area
      for (const row of planReorder(await loadLiveItems(tx), { id: item.id, move: body.move })) {
        await tx.foreignMatterItem.update({ where: { id: row.id }, data: { sortOrder: row.sortOrder, updatedById: userId } });
      }
    } else {
      // Changing the area (or the section) moves the item to the end of that area; a new area goes last in its section
      const moving = typeof body.areaName === "string" || isSection(body.section);
      const regroup = moving
        ? planReorder(await loadLiveItems(tx), {
            id: item.id,
            ...(typeof body.areaName === "string" ? { areaName: body.areaName } : {}),
            ...(isSection(body.section) ? { section: body.section } : {}),
          })[0]
        : undefined;
      await tx.foreignMatterItem.update({
        where: { id: item.id },
        data: {
          ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
          ...(typeof body.expectedQuantity === "number" ? { expectedQuantity: body.expectedQuantity } : {}),
          ...(regroup ? { areaName: regroup.areaName, section: regroup.section, sortOrder: regroup.sortOrder } : {}),
          updatedById: userId,
        },
      });
    }
    return bumpListVersion(tx, userId);
  });

  return NextResponse.json({ items: await loadLiveItems(prisma), listVersion: list.version });
}
