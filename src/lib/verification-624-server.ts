import type { Prisma, PrismaClient } from "@/generated/prisma";
import { SECTIONS, VERIFICATION_FACILITY, sortEquipment, type Equipment, type Section } from "@/lib/verification-624";

type Db = PrismaClient | Prisma.TransactionClient;

/** The live list: everything that has not been retired, in form order. */
export async function loadLiveEquipment(db: Db): Promise<Equipment[]> {
  const rows = await db.verification624Equipment.findMany({
    where: { facility: VERIFICATION_FACILITY, retiredAt: null },
    select: { id: true, section: true, name: true, location: true, inUse: true, sortOrder: true },
  });
  return sortEquipment(rows.filter((r) => (SECTIONS as string[]).includes(r.section)).map((r) => ({ ...r, section: r.section as Section })));
}

export async function loadListVersion(db: Db): Promise<number> {
  return (await db.verification624List.findUnique({ where: { facility: VERIFICATION_FACILITY }, select: { version: true } }))?.version ?? 1;
}

/** Every change to the equipment list goes through here. */
export function bumpListVersion(db: Db, userId: string) {
  return db.verification624List.upsert({
    where: { facility: VERIFICATION_FACILITY },
    create: { facility: VERIFICATION_FACILITY, version: 2, updatedById: userId },
    update: { version: { increment: 1 }, updatedById: userId },
    select: { version: true },
  });
}

export const canUseVerification = (role: string | undefined) => role === "SUPERVISOR" || role === "ADMIN";
