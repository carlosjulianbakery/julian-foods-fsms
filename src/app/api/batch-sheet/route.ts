import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// All columns are camelCase (Prisma db push without @map field annotations).
// Using $queryRaw to bypass the model layer so this works with any cached client.

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
  templateName: string;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.$queryRaw<SubmissionRow[]>`
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
        t.name  AS "templateName"
      FROM batch_sheet_submissions bs
      JOIN users u ON u.id = bs."submittedById"
      JOIN batch_sheet_templates t ON t.id = bs."templateId"
      ORDER BY bs."submittedAt" DESC
    `;

    const submissions = rows.map(({ submittedByName, templateName, ...rest }) => ({
      ...rest,
      submittedBy: { name: submittedByName },
      template: { name: templateName },
    }));

    return NextResponse.json(submissions);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user as { id: string; role: string };
    if (user.role !== "SUPERVISOR" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      templateId,
      date,
      shift,
      productName,
      numberOfBowls,
      ingredients,
      notes,
      supervisorSignature,
    } = body as {
      templateId?: string;
      date?: string;
      shift?: string;
      productName?: string;
      numberOfBowls?: number;
      ingredients?: { lot_number?: string }[];
      notes?: string;
      supervisorSignature?: string;
    };

    if (!templateId || !date || !shift || !productName || !numberOfBowls || !ingredients) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const hasMissingLot = ingredients.some((ing) => !ing.lot_number?.trim());
    const status = hasMissingLot ? "PASS_WITH_ISSUES" : "PASS";
    const ingredientsJson = JSON.stringify(ingredients);
    const notesVal = notes?.trim() || null;
    const sigVal = supervisorSignature?.trim() || null;
    const bowls = Number(numberOfBowls);
    const dateVal = new Date(date);

    const [row] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO batch_sheet_submissions
        ("templateId", date, shift, "productName", "numberOfBowls", status,
         ingredients, notes, "supervisorSignature", "submittedById", "submittedAt")
      VALUES
        (${templateId}, ${dateVal}, ${shift}::"PreOpShift", ${productName}, ${bowls},
         ${status}::"BatchSheetStatus", ${ingredientsJson}::jsonb,
         ${notesVal}, ${sigVal}, ${user.id}, NOW())
      RETURNING id
    `;

    return NextResponse.json({ id: row.id, status }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
