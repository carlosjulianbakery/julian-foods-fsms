import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface LineUpdateBody {
  key: string;
  expectedLineUpdatedAt?: string | null;
  state: string;
  reason?: string | null;
  lineDate?: string | null;
  lineInitials?: string | null;
  doneByUserId?: string | null;
}

type LineRecord = {
  key: string;
  labelEn: string;
  labelEs: string;
  chemical: string | null;
  state: string;
  reason: string | null;
  lineDate: string | null;
  lineInitials: string | null;
  doneByUserId: string | null;
  updatedAt: string;
  autoFilled: boolean;
};

// PATCH /api/monthly-cleaning-624/[id]/line  — per-line atomic update with conflict detection
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: LineUpdateBody;
  try {
    body = await req.json() as LineUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, expectedLineUpdatedAt, state, reason, lineDate, lineInitials, doneByUserId } = body;

  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  if (!["DONE", "NA", "NOT_DONE", "UNTOUCHED"].includes(state))
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  if (state === "NOT_DONE" && !reason?.trim())
    return NextResponse.json({ error: "reason required for NOT_DONE" }, { status: 400 });

  const prismaCode = (err: unknown): string | undefined => (err as { code?: string }).code;

  try {
    type TxResult = {
      lines: LineRecord[];
      doneCount: number;
      naCount: number;
      notDoneCount: number;
      updatedAt: Date;
      lastEditedBy: string | null;
      status: string;
      conflict?: true;
      currentLine?: LineRecord;
      notFound?: true;
      alreadySubmitted?: true;
    };

    const result = await prisma.$transaction(async (tx) => {
      // Lock the row exclusively so two simultaneous PATCHes are serialised
      const rows = await tx.$queryRaw<Array<{
        id: string;
        lines: unknown;
        status: string;
        updatedAt: Date;
      }>>`SELECT id, lines, status, "updatedAt" FROM monthly_clean_624_records WHERE id = ${params.id} FOR UPDATE`;

      if (!rows.length) return { notFound: true } as TxResult;
      const rec = rows[0];

      if (rec.status === "submitted") return { alreadySubmitted: true } as TxResult;

      const lines = rec.lines as LineRecord[];
      const idx = lines.findIndex((l) => l.key === key);
      if (idx < 0) return { notFound: true } as TxResult;

      const existing = lines[idx];

      // Conflict check: only if client sent an expectedLineUpdatedAt
      if (expectedLineUpdatedAt != null && existing.updatedAt !== expectedLineUpdatedAt) {
        return { conflict: true, currentLine: existing } as TxResult;
      }

      const now = new Date().toISOString();
      lines[idx] = {
        ...existing,
        state,
        reason: reason ?? null,
        lineDate: lineDate ?? null,
        lineInitials: lineInitials ?? null,
        doneByUserId: doneByUserId ?? null,
        updatedAt: now,
        autoFilled: false,
      };

      const doneCount    = lines.filter((l) => l.state === "DONE").length;
      const naCount      = lines.filter((l) => l.state === "NA").length;
      const notDoneCount = lines.filter((l) => l.state === "NOT_DONE").length;

      const updated = await tx.monthlyClean624Record.update({
        where: { id: params.id },
        data: {
          lines: lines as never,
          doneCount,
          naCount,
          notDoneCount,
          lastEditedBy: lineInitials ?? session.user.name ?? null,
          lastEditedAt: new Date(),
        },
        select: { updatedAt: true, doneCount: true, naCount: true, notDoneCount: true, lastEditedBy: true, status: true, lines: true },
      });

      return {
        lines: lines,
        doneCount: updated.doneCount,
        naCount: updated.naCount,
        notDoneCount: updated.notDoneCount,
        updatedAt: updated.updatedAt,
        lastEditedBy: updated.lastEditedBy,
        status: updated.status,
      } as TxResult;
    });

    if (result.notFound) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.alreadySubmitted) return NextResponse.json({ error: "Record already submitted", code: "already_submitted" }, { status: 409 });
    if (result.conflict) return NextResponse.json({ error: "Conflict — line was modified by another user", code: "line_conflict", currentLine: result.currentLine }, { status: 409 });

    return NextResponse.json({
      updatedAt: result.updatedAt,
      doneCount: result.doneCount,
      naCount: result.naCount,
      notDoneCount: result.notDoneCount,
      lastEditedBy: result.lastEditedBy,
    });
  } catch (err) {
    const code = prismaCode(err);
    const msg = err instanceof Error ? err.message : String(err);
    const refId = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (code === "P2021" || code === "P2022" || msg.includes("does not exist")) {
      const prismaMeta = (err as { meta?: { table?: string; column?: string } }).meta;
      const subject = code === "P2022" && prismaMeta?.column
        ? `column ${prismaMeta.column}`
        : `table ${prismaMeta?.table ?? "monthly_clean_624_records"}`;
      return NextResponse.json(
        { error: "db_setup_error", detail: `db_setup_error · ${code ?? "unknown"} · ${subject} · ref ${refId}` },
        { status: 503 }
      );
    }
    console.error(`[monthly-cleaning-624 PATCH/:id/line] ref=${refId} msg=${msg}`);
    return NextResponse.json({ error: "save_failed", refId }, { status: 500 });
  }
}
