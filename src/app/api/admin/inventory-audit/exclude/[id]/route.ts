import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// DELETE /api/admin/inventory-audit/exclude/[id]
// Removes an exclusion — the NFC gap will reappear in future audit runs.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role } = session.user as { role: string };
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = params;

    const exclusion = await prisma.inventoryAuditExclusion.findUnique({
      where: { id },
      select: { id: true, submissionId: true, materialId: true },
    });
    if (!exclusion) {
      return NextResponse.json({ error: "Exclusion not found" }, { status: 404 });
    }

    await prisma.inventoryAuditExclusion.delete({ where: { id } });

    return NextResponse.json({
      message: `Exclusion ${id} removed. The NFC gap for submission ${exclusion.submissionId} will appear in future audit runs.`,
      deletedId: id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/admin/inventory-audit/exclude/[id]]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
