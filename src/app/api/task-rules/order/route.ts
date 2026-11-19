import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRuleReorder, ranksFor } from "@/lib/task-order";

export const dynamic = "force-dynamic";

/**
 * PUT { ruleIds: string[] } — the new top-to-bottom sequence of the rules the admin just reordered.
 * The saved order applies to every day and every user. Rules not in the list keep their place.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { ruleIds?: unknown } | null;
  const ruleIds = body?.ruleIds;
  if (!Array.isArray(ruleIds) || ruleIds.length === 0 || ruleIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "ruleIds must be a non-empty array of rule ids" }, { status: 400 });
  }
  if (new Set(ruleIds).size !== ruleIds.length) {
    return NextResponse.json({ error: "ruleIds contains duplicates" }, { status: 400 });
  }

  try {
    const rules = await prisma.taskRule.findMany({
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
    });
    const known = new Set(rules.map((r) => r.id));
    const unknown = (ruleIds as string[]).filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `Unknown rule id(s): ${unknown.join(", ")}` }, { status: 400 });
    }

    const ranks = ranksFor(applyRuleReorder(rules.map((r) => r.id), ruleIds as string[]));
    const current = new Map(rules.map((r) => [r.id, r.sortOrder]));
    const changed = ranks.filter((r) => current.get(r.id) !== r.sortOrder);

    await prisma.$transaction(
      changed.map((r) => prisma.taskRule.update({ where: { id: r.id }, data: { sortOrder: r.sortOrder } })),
    );

    return NextResponse.json({ ranks, changed: changed.length });
  } catch (err) {
    console.error("PUT /api/task-rules/order:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
