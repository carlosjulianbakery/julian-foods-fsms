import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isAfter } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return format(new Date(date), "MM/dd/yyyy");
}

export function formatDateTime(date: Date | string) {
  return format(new Date(date), "MM/dd/yyyy h:mm a");
}

export function formatRelative(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function isOverdue(dueDate: Date | string) {
  return isAfter(new Date(), new Date(dueDate));
}

export function getStatusColor(status: string) {
  const map: Record<string, string> = {
    PENDING:     "bg-yellow-100 text-yellow-800",
    IN_PROGRESS: "bg-blue-100   text-blue-800",
    COMPLETED:   "bg-emerald-100 text-emerald-800",
    OVERDUE:     "bg-brand-50   text-brand-700",
    CANCELLED:   "bg-gray-100   text-gray-700",
    SUBMITTED:   "bg-blue-100   text-blue-800",
    APPROVED:    "bg-emerald-100 text-emerald-800",
    REJECTED:    "bg-brand-50   text-brand-700",
    DRAFT:       "bg-gray-100   text-gray-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-700";
}

export function getPriorityColor(priority: string) {
  const map: Record<string, string> = {
    LOW:      "bg-gray-100  text-gray-700",
    MEDIUM:   "bg-yellow-100 text-yellow-800",
    HIGH:     "bg-orange-100 text-orange-800",
    CRITICAL: "bg-brand-50  text-brand-700",
  };
  return map[priority] ?? "bg-gray-100 text-gray-700";
}

export function getRoleColor(role: string) {
  const map: Record<string, string> = {
    ADMIN:      "bg-brand-50  text-brand-700",
    SUPERVISOR: "bg-amber-100 text-amber-800",
  };
  return map[role] ?? "bg-gray-100 text-gray-700";
}
