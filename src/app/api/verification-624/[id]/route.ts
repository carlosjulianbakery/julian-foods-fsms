import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reopenInstanceForSubmissionDeletion } from "@/lib/task-completion";
import { progressOf, splitStored, valuesForLiveList, withCheckedAt, type HeaderEntry, type ItemValues } from "@/lib/verification-624";
import { canUseVerification, loadLiveEquipment, loadListVersion } from "@/lib/verification-624-server";

export const dynamic = "force-dynamic";

// GET /api/verification-624/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseVerification(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const record = await prisma.verification624Record.findUnique({ where: { id: params.id }, include: { submittedBy: { select: { name: true } } } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    record,
    equipment: record.status === "draft" ? await loadLiveEquipment(prisma) : [],
    listVersion: await loadListVersion(prisma),
  });
}

// PATCH /api/verification-624/[id] — autosave the draft. 409 if someone else saved in the meantime.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseVerification(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { values?: ItemValues[]; initials?: string; notes?: string | null; expectedUpdatedAt?: string | null; taskId?: string | null; date?: string; time?: string }
    | null;
  if (!body || !Array.isArray(body.values)) return NextResponse.json({ error: "values required" }, { status: 400 });

  const record = await prisma.verification624Record.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "draft") return NextResponse.json({ error: "This period was already submitted.", code: "already_submitted" }, { status: 409 });
  if (body.expectedUpdatedAt && record.updatedAt.toISOString() !== body.expectedUpdatedAt) {
    return NextResponse.json({ error: "Someone else saved this form — reloaded from the server.", code: "conflict", record }, { status: 409 });
  }

  // The draft follows the live list; checkedAt is stamped the first time an item gets a result
  const equipment = await loadLiveEquipment(prisma);
  const stored = splitStored(record.items);
  const previous = valuesForLiveList(equipment, stored.entries);
  const header: HeaderEntry | null =
    body.date && body.time ? { ...(stored.header ?? {}), kind: "header", date: body.date, time: body.time } : stored.header;
  const incoming = valuesForLiveList(equipment, body.values);
  const now = new Date();
  const values = equipment.flatMap((e) => (incoming[e.id] ? [withCheckedAt(e, previous[e.id], incoming[e.id], now.toISOString())] : []));
  const progress = progressOf(equipment, Object.fromEntries(values.map((v) => [v.equipmentId, v])));

  const saved = await prisma.verification624Record.updateMany({
    // Guard on the timestamp we just read: a concurrent save makes this match nothing
    where: { id: params.id, status: "draft", updatedAt: record.updatedAt },
    data: {
      items: [...values, ...(header ? [header] : [])] as never,
      okCount: progress.ok,
      failCount: progress.notOk,
      notInUseCount: progress.notInUse,
      listVersion: await loadListVersion(prisma),
      ...(body.initials !== undefined ? { initials: body.initials.toUpperCase().slice(0, 4) } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      ...(body.taskId && !record.linkedInstanceId ? { linkedInstanceId: body.taskId } : {}),
      lastEditedBy: session.user.name ?? null,
      lastEditedAt: now,
      updatedAt: now,
    },
  });
  if (saved.count !== 1) {
    const current = await prisma.verification624Record.findUnique({ where: { id: params.id } });
    return NextResponse.json({ error: "Someone else saved this form — reloaded from the server.", code: "conflict", record: current }, { status: 409 });
  }

  return NextResponse.json({ updatedAt: now.toISOString(), values, progress });
}

// DELETE /api/verification-624/[id] — admin only; reopens the task the record had completed
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

  const record = await prisma.verification624Record.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let warning: string | null = null;
  try {
    await reopenInstanceForSubmissionDeletion({
      submissionId: params.id,
      userId: session.user.id,
      note: `Scales & Thermometer Verification record for ${record.period} deleted by admin`,
      prismaClient: prisma as never,
    });
  } catch (e) {
    console.error("[verification-624 DELETE] reopen failed:", e instanceof Error ? e.message : e);
    warning = "Record deleted but its task could not be reopened — please check it manually.";
  }
  await prisma.verification624Record.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, ...(warning ? { warning } : {}) });
}
