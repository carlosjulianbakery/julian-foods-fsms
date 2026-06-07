import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier-management/suppliers/brief
 *
 * Lightweight endpoint returning { id, name, status } for every
 * active supplier. Used as the fallback option list in the batch-sheet
 * supplier dropdown when a material has no linked suppliers.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    suppliers.map((s) => ({ id: s.id, name: s.name, status: s.status as string })),
  );
}
