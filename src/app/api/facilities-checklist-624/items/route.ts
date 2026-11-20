import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FACILITIES_FACILITY, itemProblem, matchGroupName, sortOrderForNew } from "@/lib/facilities-checklist-624";
import { bumpListVersion, canUseFacilities, loadLiveItems, loadListVersion } from "@/lib/facilities-checklist-624-server";

export const dynamic = "force-dynamic";

// GET /api/facilities-checklist-624/items — the live checklist
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFacilities(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ items: await loadLiveItems(prisma), listVersion: await loadListVersion(prisma) });
}

// POST /api/facilities-checklist-624/items — add a check at the end of its group (supervisors and admins)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFacilities(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; description?: unknown; groupName?: unknown } | null;
  const input = { name: body?.name ?? "", description: body?.description ?? "", groupName: body?.groupName ?? "" };
  const problem = itemProblem(input);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const list = await prisma.$transaction(async (tx) => {
    const live = await loadLiveItems(tx);
    await tx.facilitiesChecklistItem.create({
      data: {
        facility: FACILITIES_FACILITY,
        name: (input.name as string).trim(),
        description: (input.description as string).trim(),
        // An existing group typed with other capitals is that group; anything else starts a new group, placed last
        groupName: matchGroupName(live, input.groupName as string),
        sortOrder: sortOrderForNew(live),
        createdById: session.user.id, updatedById: session.user.id,
      },
    });
    return bumpListVersion(tx, session.user.id);
  });

  return NextResponse.json({ items: await loadLiveItems(prisma), listVersion: list.version }, { status: 201 });
}
