import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom  = searchParams.get("date_from")  ?? "";
  const dateTo    = searchParams.get("date_to")    ?? "";
  const material  = searchParams.get("material")   ?? "";
  const supplier  = searchParams.get("supplier")   ?? "";
  const coaStatus = searchParams.get("coa_status") ?? "";
  const poStatus  = searchParams.get("po_status")  ?? "";

  const records = await prisma.receivingRecord.findMany({
    where: {
      ...(dateFrom  ? { date: { gte: new Date(dateFrom) } } : {}),
      ...(dateTo    ? { date: { lte: new Date(dateTo + "T23:59:59") } } : {}),
      ...(material  ? { materialName: { contains: material, mode: "insensitive" } } : {}),
      ...(supplier  ? { supplierName: { contains: supplier, mode: "insensitive" } } : {}),
      ...(coaStatus === "received"     ? { coaRequired: true, coaReceived: true }    : {}),
      ...(coaStatus === "not_received" ? { coaRequired: true, coaReceived: false }   : {}),
      ...(coaStatus === "na"           ? { coaRequired: false }                       : {}),
      ...(poStatus  === "linked"       ? { poId: { not: null } }                     : {}),
      ...(poStatus  === "no_po"        ? { poId: null, noPOReason: { not: null } }   : {}),
    },
    select: {
      id: true, recordNumber: true, date: true, timeReceived: true,
      materialName: true, supplierName: true, lotNumber: true,
      quantityReceived: true, unit: true,
      coaRequired: true, coaReceived: true, poNumber: true, noPOReason: true,
      isUnregisteredMaterial: true, conditionCheck: true,
      receivedBy: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(records);
}
