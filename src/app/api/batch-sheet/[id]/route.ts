import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const submission = await prisma.batchSheetSubmission.findUnique({
      where: { id: params.id },
      include: {
        submittedBy: { select: { name: true, email: true } },
        template:    { select: { name: true, ccpSettings: true } },
      },
    });

    if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(submission);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
