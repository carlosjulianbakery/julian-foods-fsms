export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = ["SUPERVISOR", "ADMIN"] as const;
type ValidRole = typeof VALID_ROLES[number];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden. Only administrators can create accounts." },
      { status: 403 }
    );
  }

  try {
    const { name, email, password, department, role } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const normalizedRole = typeof role === "string" ? role.toUpperCase() : "";
    const assignedRole: ValidRole = VALID_ROLES.includes(normalizedRole as ValidRole)
      ? (normalizedRole as ValidRole)
      : "SUPERVISOR";

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const hashed = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        department: department || null,
        role: assignedRole,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "USER_CREATED",
        entity: "User",
        entityId: user.id,
        userId: session.user.id,
        userName: session.user.name ?? "Unknown",
        details: { name, email, role: assignedRole },
      },
    });

    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
