import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VERIFICATION_FACILITY } from "@/lib/verification-624";
import { bumpListVersion, canUseVerification, loadLiveEquipment } from "@/lib/verification-624-server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/verification-624/equipment/[id] — supervisors and admins.
 * Body: { name?, location?, inUse?, retire?: true, move?: "up" | "down" }
 * Items are retired, never deleted. Every change takes effect at once and bumps the list version.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseVerification(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { name?: string; location?: string; inUse?: boolean; retire?: boolean; move?: "up" | "down" }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (body.name !== undefined && !body.name.trim()) return NextResponse.json({ error: "Enter a name." }, { status: 400 });

  const item = await prisma.verification624Equipment.findUnique({ where: { id: params.id } });
  if (!item || item.facility !== VERIFICATION_FACILITY || item.retiredAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userId = session.user.id;
  const list = await prisma.$transaction(async (tx) => {
    if (body.retire === true) {
      await tx.verification624Equipment.update({ where: { id: item.id }, data: { retiredAt: new Date(), retiredById: userId, updatedById: userId } });
    } else if (body.move === "up" || body.move === "down") {
      const siblings = await tx.verification624Equipment.findMany({
        where: { facility: VERIFICATION_FACILITY, section: item.section, retiredAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true },
      });
      const from = siblings.findIndex((s) => s.id === item.id);
      const to = from + (body.move === "up" ? -1 : 1);
      if (to >= 0 && to < siblings.length) {
        [siblings[from], siblings[to]] = [siblings[to], siblings[from]];
        // Renumber the section so positions are always 10, 20, 30…
        for (let i = 0; i < siblings.length; i++) {
          await tx.verification624Equipment.update({ where: { id: siblings[i].id }, data: { sortOrder: (i + 1) * 10 } });
        }
      }
    } else {
      await tx.verification624Equipment.update({
        where: { id: item.id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.location !== undefined && item.section === "scale" ? { location: body.location.trim() } : {}),
          ...(body.inUse !== undefined ? { inUse: body.inUse === true } : {}),
          updatedById: userId,
        },
      });
    }
    return bumpListVersion(tx, userId);
  });

  return NextResponse.json({ equipment: await loadLiveEquipment(prisma), listVersion: list.version });
}
