import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface SubmissionRow {
  id: string;
  templateId: string;
  date: Date;
  shift: string;
  productName: string;
  numberOfBowls: number;
  status: string;
  ingredients: unknown;
  notes: string | null;
  supervisorSignature: string | null;
  submittedAt: Date;
  submittedById: string;
  submittedByName: string;
  submittedByEmail: string;
  templateName: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [row] = await prisma.$queryRaw<SubmissionRow[]>`
      SELECT
        bs.id,
        bs."templateId",
        bs.date,
        bs.shift,
        bs."productName",
        bs."numberOfBowls",
        bs.status,
        bs.ingredients,
        bs.notes,
        bs."supervisorSignature",
        bs."submittedAt",
        bs."submittedById",
        u.name  AS "submittedByName",
        u.email AS "submittedByEmail",
        t.name  AS "templateName"
      FROM batch_sheet_submissions bs
      JOIN users u ON u.id = bs."submittedById"
      JOIN batch_sheet_templates t ON t.id = bs."templateId"
      WHERE bs.id = ${params.id}
    `;

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { submittedByName, submittedByEmail, templateName, ...rest } = row;
    return NextResponse.json({
      ...rest,
      submittedBy: { name: submittedByName, email: submittedByEmail },
      template: { name: templateName },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet/:id]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
