import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface SectionItem {
  section: string;
  item: string;
  result: "PASS" | "FAIL" | "NA";
  notes?: string;
}

interface AtpAttempt {
  attempt_number: number;
  area_swabbed: string;
  rlu_result: number;
  result: "pass" | "warning" | "fail";
  initials: string;
  time_recorded: string;
}

interface AtpSwab {
  attempts: AtpAttempt[];
  final_result: "pass" | "warning" | "fail" | null;
}

function parseSectionsDb(raw: unknown): { items: SectionItem[]; atpSwab: AtpSwab | null } {
  if (Array.isArray(raw)) return { items: raw as SectionItem[], atpSwab: null };
  const obj = raw as { items?: SectionItem[]; atp_swab?: AtpSwab };
  return { items: obj.items ?? [], atpSwab: obj.atp_swab ?? null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role } = session.user as { role: string };
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const inspection = await prisma.preOpInspection.findUnique({
    where: { id: params.id },
    include: { submittedBy: { select: { name: true, email: true } } },
  });

  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { items, atpSwab } = parseSectionsDb(inspection.sections);
  return NextResponse.json({ ...inspection, sections: items, atpSwab });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    // Verify the record exists before attempting deletion
    const existing = await prisma.preOpInspection.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    await prisma.preOpInspection.delete({ where: { id: params.id } });

    console.log(`[DELETE /api/pre-op/${params.id}] Deleted by admin ${session.user.email}`);
    return NextResponse.json({ success: true, deleted_id: params.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DELETE /api/pre-op/${params.id}] Error:`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
