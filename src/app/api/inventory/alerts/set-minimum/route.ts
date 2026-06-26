import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMaterialStockLevel } from "@/lib/inventoryUtils";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const body = await req.json() as {
    materialId: string;
    minimumStockQuantity: number;
    minimumStockUnit: string;
  };

  const { materialId, minimumStockQuantity, minimumStockUnit } = body;
  if (!materialId || minimumStockQuantity == null || !minimumStockUnit) {
    return NextResponse.json({ error: "materialId, minimumStockQuantity, and minimumStockUnit are required" }, { status: 400 });
  }
  if (minimumStockQuantity < 0) {
    return NextResponse.json({ error: "minimumStockQuantity must be >= 0" }, { status: 400 });
  }

  await prisma.material.update({
    where: { id: materialId },
    data: { minimumStockQuantity, minimumStockUnit: minimumStockUnit.trim() },
  });

  // Re-evaluate stock level now that minimum is set
  await checkMaterialStockLevel(materialId);

  return NextResponse.json({ success: true });
}
