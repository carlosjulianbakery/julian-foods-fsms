export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.user.id === params.id) return NextResponse.json({ error: "Cannot delete yourself." }, { status: 400 });

  try {
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.user.id === params.id) return NextResponse.json({ error: "Cannot modify yourself." }, { status: 400 });

  try {
    const body = await req.json();
    const { role, active } = body;

    const validRoles = ["SUPERVISOR", "ADMIN"];
    const normalizedRole = typeof role === "string" ? role.toUpperCase() : role;
    if (normalizedRole && !validRoles.includes(normalizedRole)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        ...(normalizedRole && { role: normalizedRole }),
        ...(typeof active === "boolean" && { active }),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "USER_UPDATED",
        entity: "User",
        entityId: user.id,
        userId: session.user.id,
        userName: session.user.name ?? "Unknown",
        details: { changes: body },
      },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
