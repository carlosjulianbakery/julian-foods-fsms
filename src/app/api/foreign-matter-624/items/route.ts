import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FOREIGN_MATTER_FACILITY, itemProblem, matchAreaName, nameTaken, nameTakenMessage, sortOrderForNew, type Section } from "@/lib/foreign-matter-624";
import { bumpListVersion, canUseForeignMatter, loadLiveItems, loadListVersion } from "@/lib/foreign-matter-624-server";

export const dynamic = "force-dynamic";

// GET /api/foreign-matter-624/items — the live list
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseForeignMatter(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ items: await loadLiveItems(prisma), listVersion: await loadListVersion(prisma) });
}

// POST /api/foreign-matter-624/items — add an item at the end of its area (supervisors and admins)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseForeignMatter(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { section?: unknown; areaName?: unknown; name?: unknown; expectedQuantity?: unknown } | null;
  const input = { section: body?.section ?? "", name: body?.name ?? "", areaName: body?.areaName ?? "", expectedQuantity: body?.expectedQuantity ?? 1 };
  const problem = itemProblem(input);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const section = input.section as Section;

  // Names are unique within an area (case-insensitive)
  const existing = await loadLiveItems(prisma);
  const targetArea = matchAreaName(existing, section, input.areaName as string);
  if (nameTaken(existing, section, targetArea, input.name as string)) return NextResponse.json({ error: nameTakenMessage(targetArea, input.name as string) }, { status: 409 });

  const list = await prisma.$transaction(async (tx) => {
    const live = await loadLiveItems(tx);
    await tx.foreignMatterItem.create({
      data: {
        facility: FOREIGN_MATTER_FACILITY,
        section,
        // An existing area typed with other capitals is that area; anything else starts a new area, placed last in its section
        areaName: matchAreaName(live, section, input.areaName as string),
        name: (input.name as string).trim(),
        expectedQuantity: input.expectedQuantity as number,
        sortOrder: sortOrderForNew(live),
        createdById: session.user.id, updatedById: session.user.id,
      },
    });
    return bumpListVersion(tx, session.user.id);
  });

  return NextResponse.json({ items: await loadLiveItems(prisma), listVersion: list.version }, { status: 201 });
}
