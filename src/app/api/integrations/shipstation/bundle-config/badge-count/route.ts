import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ count: 0 });
  if ((session.user as { role: string }).role !== "ADMIN") return NextResponse.json({ count: 0 });

  const count = await prisma.shipstationProduct.count({ where: { configStatus: "unmatched" } });
  return NextResponse.json({ count });
}
