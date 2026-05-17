import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  const forms = await prisma.form.findMany({
    where: {
      active: true,
      ...(category && { category }),
      ...(q && { title: { contains: q, mode: "insensitive" } }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { submissions: true } },
    },
  });

  return NextResponse.json(forms);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "OPERATOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { title, description, category, fields } = await req.json();

    if (!title || !category || !fields?.length) {
      return NextResponse.json({ error: "Title, category, and at least one field are required." }, { status: 400 });
    }

    const form = await prisma.form.create({
      data: {
        title,
        description: description || null,
        category,
        fields,
        createdById: session.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "FORM_CREATED",
        entity: "Form",
        entityId: form.id,
        userId: session.user.id,
        userName: session.user.name ?? "Unknown",
        details: { title },
      },
    });

    return NextResponse.json(form, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create form." }, { status: 500 });
  }
}
