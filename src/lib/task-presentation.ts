/**
 * Single source of truth for task instance label + color + sort priority.
 * Every view (banner, calendar chip, day panel, admin table) must use this
 * instead of its own mapping.
 *
 * Handles the common case where a cron hasn't promoted an UPCOMING task to
 * DUE_TODAY yet: if status=UPCOMING and dueDate=today, we display it as
 * DUE_TODAY (amber / "Due today") — never as "In progress".
 */

// Statuses that can appear on a RuleInstance
export type EffectiveStatus =
  | "DONE"
  | "IN_PROGRESS"
  | "DUE_TODAY"
  | "UPCOMING"
  | "OVERDUE"
  | "MISSED"
  | "SKIPPED";

export interface TaskPresentation {
  effectiveStatus: EffectiveStatus;
  /** Human label shown in banners and task cards */
  label: string;
  /** Tailwind classes for a small rounded badge (bg + text) */
  badgeBg: string;
  /** border-l-4 color class for a card's left accent */
  borderColor: string;
  /** Card background class */
  bgColor: string;
  /** Calendar week/month chip background */
  chipBg: string;
  /** Calendar chip text color */
  chipText: string;
  /** Calendar chip border color */
  chipBorder: string;
  /** Calendar month-view dot color */
  dotColor: string;
}

/**
 * Derive the display-state from the DB status + dueDate, normalizing
 * UPCOMING-but-due-today → DUE_TODAY, and UPCOMING-past → OVERDUE.
 */
export function getEffectiveStatus(
  status: string,
  dueDate: string,
  today: string,
): EffectiveStatus {
  if (status === "UPCOMING" && dueDate === today) return "DUE_TODAY";
  if (status === "UPCOMING" && dueDate < today)   return "OVERDUE";
  if (status === "DUE_TODAY" && dueDate < today)  return "OVERDUE";
  if (
    status === "DONE" || status === "IN_PROGRESS" ||
    status === "DUE_TODAY" || status === "UPCOMING" ||
    status === "OVERDUE" || status === "MISSED" || status === "SKIPPED"
  ) {
    return status as EffectiveStatus;
  }
  return "UPCOMING"; // unknown → treat as upcoming
}

export function getTaskPresentation(
  status: string,
  dueDate: string,
  today: string,
): TaskPresentation {
  const effectiveStatus = getEffectiveStatus(status, dueDate, today);

  switch (effectiveStatus) {
    case "DONE":
      return {
        effectiveStatus,
        label: "Done",
        badgeBg: "bg-green-100 text-green-700",
        borderColor: "border-green-300",
        bgColor: "bg-green-50/30",
        chipBg: "bg-green-100", chipText: "text-green-700", chipBorder: "border-green-200",
        dotColor: "bg-green-500",
      };

    case "IN_PROGRESS":
      return {
        effectiveStatus,
        label: "In progress",
        badgeBg: "bg-blue-100 text-blue-700",
        borderColor: "border-blue-400",
        bgColor: "bg-blue-50/30",
        chipBg: "bg-blue-100", chipText: "text-blue-700", chipBorder: "border-blue-200",
        dotColor: "bg-blue-500",
      };

    case "DUE_TODAY":
      return {
        effectiveStatus,
        label: "Due today",
        badgeBg: "bg-amber-100 text-amber-700",
        borderColor: "border-amber-400",
        bgColor: "bg-amber-50/40",
        chipBg: "bg-amber-100", chipText: "text-amber-700", chipBorder: "border-amber-200",
        dotColor: "bg-amber-500",
      };

    case "OVERDUE":
      return {
        effectiveStatus,
        label: "Overdue",
        badgeBg: "bg-red-100 text-red-700",
        borderColor: "border-red-400",
        bgColor: "bg-red-50/40",
        chipBg: "bg-red-100", chipText: "text-red-700", chipBorder: "border-red-200",
        dotColor: "bg-red-500",
      };

    case "MISSED":
      return {
        effectiveStatus,
        label: "Missed",
        badgeBg: "bg-red-100 text-red-700",
        borderColor: "border-red-400",
        bgColor: "bg-red-50/40",
        chipBg: "bg-red-100", chipText: "text-red-700", chipBorder: "border-red-200",
        dotColor: "bg-red-500",
      };

    case "SKIPPED":
      return {
        effectiveStatus,
        label: "Skipped",
        badgeBg: "bg-gray-100 text-gray-500",
        borderColor: "border-gray-200",
        bgColor: "bg-white",
        chipBg: "bg-gray-100", chipText: "text-gray-400", chipBorder: "border-gray-200",
        dotColor: "bg-gray-400",
      };

    default: // UPCOMING (future)
      return {
        effectiveStatus: "UPCOMING",
        label: "Upcoming",
        badgeBg: "bg-gray-100 text-gray-500",
        borderColor: "border-gray-200",
        bgColor: "bg-white",
        chipBg: "bg-gray-50", chipText: "text-gray-500", chipBorder: "border-gray-200",
        dotColor: "bg-gray-400",
      };
  }
}

/** Sort priority: lower = more urgent. Use effectiveStatus for ordering. */
export const TASK_SORT_PRIORITY: Record<EffectiveStatus, number> = {
  OVERDUE:     0,
  MISSED:      1,
  DUE_TODAY:   2,
  IN_PROGRESS: 3,
  UPCOMING:    4,
  DONE:        5,
  SKIPPED:     6,
};
