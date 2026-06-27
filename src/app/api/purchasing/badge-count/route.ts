import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPERVISOR"].includes(session.user.role)) {
    return NextResponse.json({ count: 0 });
  }

  const count = await prisma.purchaseOrder.count({
    where: { status: { in: ["sent", "partial"] } },
  });

  return NextResponse.json({ count });
}
