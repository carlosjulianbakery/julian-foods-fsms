"use client";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { markTaskCompleted } from "@/lib/completedTasks";

export function navigateAfterSubmit(
  router: AppRouterInstance,
  completedInstanceId: string | null | undefined,
  destination: string,
): void {
  if (completedInstanceId) markTaskCompleted(completedInstanceId);
  router.push(destination);
}
