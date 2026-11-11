import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/generated/prisma";

export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  instanceId?: string;
  title: string;
  body: string;
  dedupeKey: string;
}): Promise<void> {
  try {
    await prisma.notification.upsert({
      where: { dedupeKey: params.dedupeKey },
      update: {},
      create: {
        userId: params.userId,
        type: params.type,
        instanceId: params.instanceId ?? null,
        title: params.title,
        body: params.body,
        dedupeKey: params.dedupeKey,
      },
    });
  } catch (e) {
    console.error("[notify] failed to upsert notification:", e);
  }
}
