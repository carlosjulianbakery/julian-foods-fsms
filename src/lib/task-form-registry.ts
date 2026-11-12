export interface TaskFormEntry {
  label: string;
  href: (instanceId: string) => string | null;
}

export const TASK_FORM_REGISTRY: Record<string, TaskFormEntry> = {
  daily_cleaning: {
    label: "Daily Cleaning Checklist",
    href: () => "/dashboard/supervisor/cleaning/daily",
  },
  preop: {
    label: "Pre-Op Inspection",
    href: () => "/dashboard/supervisor/pre-op",
  },
  monthly_cleaning: {
    label: "Monthly Cleaning",
    href: () => "/dashboard/supervisor/cleaning/monthly",
  },
  batch_sheet: {
    label: "Batch Sheet",
    href: () => "/dashboard/supervisor/batch-sheet",
  },
  receiving: {
    label: "Receiving Record",
    href: () => "/dashboard/supervisor/receiving",
  },
  sop_review: {
    label: "SOP Review",
    href: () => "/dashboard/compliance/sops",
  },
  manual: {
    label: "Manual Task",
    href: () => null,
  },
};

export function getFormEntry(formKey: string | null | undefined): TaskFormEntry | null {
  if (!formKey) return null;
  return TASK_FORM_REGISTRY[formKey] ?? null;
}
