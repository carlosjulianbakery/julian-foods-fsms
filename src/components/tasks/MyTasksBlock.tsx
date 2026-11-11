import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday, addDaysToDateStr } from "@/lib/pacific-time";
import { MyTasksClient, type TaskInstance } from "./MyTasksClient";

export async function MyTasksBlock() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const userId = session.user.id;
  const role = session.user.role;
  const today = getPacificToday();
  const sevenDaysOut = addDaysToDateStr(today, 7);

  const whereVisibility = role !== "ADMIN" ? { rule: { ownerId: userId } } : {};

  const instances = await prisma.ruleInstance.findMany({
    where: {
      ...whereVisibility,
      OR: [
        { status: { in: ["OVERDUE", "MISSED", "DUE_TODAY", "IN_PROGRESS"] } },
        {
          status: "UPCOMING",
          dueDate: { lte: new Date(sevenDaysOut + "T23:59:59Z") },
        },
        {
          status: "DONE",
          doneAt: { gte: new Date(today + "T00:00:00Z") },
        },
      ],
    },
    include: {
      rule: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          formKey: true,
          facility: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      },
      doneBy: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const serialized: TaskInstance[] = instances.map((inst) => ({
    id: inst.id,
    ruleTitle: inst.rule.title,
    facilityId: inst.rule.facility.id,
    facilityName: inst.rule.facility.name,
    ownerId: inst.rule.ownerId,
    ownerName: inst.rule.owner.name ?? "",
    formKey: inst.rule.formKey,
    label: inst.label,
    dueDate: inst.dueDate.toISOString().slice(0, 10),
    status: inst.status as string,
    source: inst.source,
    needsAdminReview: inst.needsAdminReview,
    reviewReason: inst.reviewReason,
    doneByName: inst.doneBy?.name ?? null,
    doneAt: inst.doneAt?.toISOString() ?? null,
  }));

  let facilities: { id: string; name: string }[] = [];
  let owners: { id: string; name: string }[] = [];
  if (role === "ADMIN") {
    [facilities, owners] = await Promise.all([
      prisma.facility.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
  }

  return (
    <MyTasksClient
      instances={serialized}
      role={role}
      userId={userId}
      facilities={facilities}
      owners={owners.map((u) => ({ id: u.id, name: u.name ?? "" }))}
      today={today}
    />
  );
}
