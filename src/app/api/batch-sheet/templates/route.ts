import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await prisma.batchSheetTemplate.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(templates);
  } catch (err) {
    console.error("[GET /api/batch-sheet/templates]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
    const { id, name, ingredients } = body;

    if (!id || !name || !Array.isArray(ingredients)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const updated = await prisma.batchSheetTemplate.update({
      where: { id },
      data: { name, ingredients },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PUT /api/batch-sheet/templates]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
