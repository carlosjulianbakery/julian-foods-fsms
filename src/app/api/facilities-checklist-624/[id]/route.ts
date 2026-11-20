import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reopenInstanceForSubmissionDeletion } from "@/lib/task-completion";
import { periodDates, progressOf, splitStored, valuesForLiveList, withCheckedAt, type HeaderEntry, type ItemValues } from "@/lib/facilities-checklist-624";
import { canUseFacilities, loadLiveItems, loadListVersion } from "@/lib/facilities-checklist-624-server";

export const dynamic = "force-dynamic";

// GET /api/facilities-checklist-624/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFacilities(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const record = await prisma.facilitiesChecklistRecord.findUnique({ where: { id: params.id }, include: { submittedBy: { select: { name: true } } } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    record,
    items: record.status === "draft" ? await loadLiveItems(prisma) : [],
    listVersion: await loadListVersion(prisma),
  });
}

// PATCH /api/facilities-checklist-624/[id] — autosave the draft. 409 if someone else saved in the meantime.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFacilities(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { values?: ItemValues[]; initials?: string; notes?: string | null; expectedUpdatedAt?: string | null; date?: string; time?: string }
    | null;
  if (!body || !Array.isArray(body.values)) return NextResponse.json({ error: "values required" }, { status: 400 });

  const record = await prisma.facilitiesChecklistRecord.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "draft") return NextResponse.json({ error: "This week was already submitted.", code: "already_submitted" }, { status: 409 });
  if (body.expectedUpdatedAt && record.updatedAt.toISOString() !== body.expectedUpdatedAt) {
    return NextResponse.json({ error: "Someone else saved this form — reloaded from the server.", code: "conflict", record }, { status: 409 });
  }

  // The draft follows the live list; checkedAt is stamped the first time a check gets a result
  const items = await loadLiveItems(prisma);
  const stored = splitStored(record.items);
  const previous = valuesForLiveList(items, stored.entries);
  const header: HeaderEntry | null = body.date && body.time ? { kind: "header", date: body.date, time: body.time } : stored.header;
  const incoming = valuesForLiveList(items, body.values);
  const now = new Date();
  const values = items.flatMap((i) => (incoming[i.id] ? [withCheckedAt(previous[i.id], incoming[i.id], now.toISOString())] : []));
  const progress = progressOf(items, Object.fromEntries(values.map((v) => [v.itemId, v])));

  const saved = await prisma.facilitiesChecklistRecord.updateMany({
    // Guard on the timestamp we just read: a concurrent save makes this match nothing
    where: { id: params.id, status: "draft", updatedAt: record.updatedAt },
    data: {
      items: [...values, ...(header ? [header] : [])] as never,
      okCount: progress.ok,
      failCount: progress.notOk,
      listVersion: await loadListVersion(prisma),
      ...(body.initials !== undefined ? { initials: body.initials.toUpperCase().slice(0, 4) } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      lastEditedBy: session.user.name ?? null,
      lastEditedAt: now,
      updatedAt: now,
    },
  });
  if (saved.count !== 1) {
    const current = await prisma.facilitiesChecklistRecord.findUnique({ where: { id: params.id } });
    return NextResponse.json({ error: "Someone else saved this form — reloaded from the server.", code: "conflict", record: current }, { status: 409 });
  }

  return NextResponse.json({ updatedAt: now.toISOString(), values, progress });
}

// DELETE /api/facilities-checklist-624/[id] — admin only; reopens the task the record had completed
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

  const record = await prisma.facilitiesChecklistRecord.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let warning: string | null = null;
  try {
    await reopenInstanceForSubmissionDeletion({
      submissionId: params.id,
      userId: session.user.id,
      note: `Facilities Checklist record for ${periodDates(record.period)} deleted by admin`,
      prismaClient: prisma as never,
    });
  } catch (e) {
    console.error("[facilities-checklist-624 DELETE] reopen failed:", e instanceof Error ? e.message : e);
    warning = "Record deleted but its task could not be reopened — please check it manually.";
  }
  await prisma.facilitiesChecklistRecord.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, ...(warning ? { warning } : {}) });
}
