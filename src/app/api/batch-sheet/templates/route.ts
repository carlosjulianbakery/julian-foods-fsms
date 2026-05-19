import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// All column names in batch_sheet_templates are camelCase (Prisma db push default).
// We use $queryRaw so this route works regardless of which Prisma client version
// is cached in the running dev server.

interface TemplateRow {
  id: string;
  name: string;
  ingredients: unknown;
  createdAt: Date;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await prisma.$queryRaw<TemplateRow[]>`
      SELECT id, name, ingredients, "createdAt"
      FROM batch_sheet_templates
      ORDER BY "createdAt" ASC
    `;

    return NextResponse.json(templates);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet/templates]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { id, name, ingredients } = body as {
      id?: string;
      name?: string;
      ingredients?: unknown[];
    };

    if (!id || !name?.trim() || !Array.isArray(ingredients)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const ingredientsJson = JSON.stringify(ingredients);

    await prisma.$executeRaw`
      UPDATE batch_sheet_templates
      SET name = ${name.trim()}, ingredients = ${ingredientsJson}::jsonb
      WHERE id = ${id}
    `;

    const [updated] = await prisma.$queryRaw<TemplateRow[]>`
      SELECT id, name, ingredients, "createdAt"
      FROM batch_sheet_templates
      WHERE id = ${id}
    `;

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/batch-sheet/templates]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
