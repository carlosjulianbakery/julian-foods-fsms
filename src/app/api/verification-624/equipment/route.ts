import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SECTIONS, VERIFICATION_FACILITY, defaultSpec, type Section } from "@/lib/verification-624";
import { bumpListVersion, canUseVerification, loadLiveEquipment, loadListVersion } from "@/lib/verification-624-server";

export const dynamic = "force-dynamic";

// GET /api/verification-624/equipment — the live list
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseVerification(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ equipment: await loadLiveEquipment(prisma), listVersion: await loadListVersion(prisma) });
}

// POST /api/verification-624/equipment — add an item at the end of its section (supervisors and admins)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseVerification(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { section?: string; name?: string; location?: string } | null;
  const section = body?.section as Section;
  const name = body?.name?.trim() ?? "";
  if (!(SECTIONS as string[]).includes(section)) return NextResponse.json({ error: "Choose a section." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Enter a name." }, { status: 400 });

  const [, list] = await prisma.$transaction(async (tx) => {
    const last = await tx.verification624Equipment.aggregate({ where: { facility: VERIFICATION_FACILITY, section, retiredAt: null }, _max: { sortOrder: true } });
    const created = await tx.verification624Equipment.create({
      data: {
        facility: VERIFICATION_FACILITY, section, name,
        location: section === "scale" ? body?.location?.trim() ?? "" : "",
        sortOrder: (last._max.sortOrder ?? 0) + 10,
        // New items start with the standard limits; they are changed in "Edit equipment"
        ...defaultSpec(section),
        createdById: session.user.id, updatedById: session.user.id,
      },
    });
    return [created, await bumpListVersion(tx, session.user.id)] as const;
  });

  return NextResponse.json({ equipment: await loadLiveEquipment(prisma), listVersion: list.version }, { status: 201 });
}
