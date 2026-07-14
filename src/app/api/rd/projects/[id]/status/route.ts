import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_STATUSES = [
  "concept",
  "in_development",
  "testing",
  "pending_approval",
  "closed_launched",
  "closed_discontinued",
];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const project = await prisma.rdProject.update({
      where: { id: params.id },
      data: { status },
    });

    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Failed to update project status" }, { status: 500 });
  }
}
