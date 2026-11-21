import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSection, itemProblem, matchAreaName, nameTaken, nameTakenMessage } from "@/lib/foreign-matter-624";
import { bumpListVersion, canUseForeignMatter, loadLiveItems } from "@/lib/foreign-matter-624-server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/foreign-matter-624/areas — supervisors and admins.
 * Body: { section, areaName, rename?: string, retire?: true }
 * An area exists through its items: renaming it renames it on all of them; retiring it retires all of
 * them (never deleted). Renaming to the name of another area of the same section merges the two.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseForeignMatter(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { section?: unknown; areaName?: unknown; rename?: unknown; retire?: boolean } | null;
  if (!body || !isSection(body.section) || typeof body.areaName !== "string") return NextResponse.json({ error: "Choose a section and an area." }, { status: 400 });
  const retire = body.retire === true;
  if (!retire) {
    const problem = itemProblem({ areaName: body.rename ?? "" });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const section = body.section;
  const live = await loadLiveItems(prisma);
  const members = live.filter((i) => i.section === section && i.areaName === body.areaName);
  if (members.length === 0) return NextResponse.json({ error: "That area has no items." }, { status: 404 });
  // Renaming onto another area merges the two — refused if that would put two items of the same name in one area
  const newName = retire ? "" : matchAreaName(live.filter((i) => !members.includes(i)), section, body.rename as string);
  if (!retire) {
    const clash = members.find((m) => nameTaken(live, section, newName, m.name, m.id) && newName.toLowerCase() !== m.areaName.toLowerCase());
    if (clash) return NextResponse.json({ error: nameTakenMessage(newName, clash.name) }, { status: 409 });
  }

  const userId = session.user.id;
  const now = new Date();
  const list = await prisma.$transaction(async (tx) => {
    for (const m of members) {
      await tx.foreignMatterItem.update({
        where: { id: m.id },
        data: retire ? { retiredAt: now, retiredById: userId, updatedById: userId } : { areaName: newName, updatedById: userId },
      });
    }
    return bumpListVersion(tx, userId);
  });

  return NextResponse.json({ items: await loadLiveItems(prisma), listVersion: list.version, changed: members.length });
}
