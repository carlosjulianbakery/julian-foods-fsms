// To add a new form, add ONE entry here — the Task Rules dropdown, Start links and labels
// are all generated from it.
export interface TaskFormEntry {
  label: string;
  href: (instanceId: string) => string | null;
}

export const TASK_FORM_REGISTRY: Record<string, TaskFormEntry> = {
  daily_cleaning: {
    label: "Daily Cleaning (Julian Bakery)",
    href: () => "/dashboard/supervisor/cleaning/daily",
  },
  preop: {
    label: "Pre-Op Inspection (Julian Bakery)",
    href: () => "/dashboard/supervisor/pre-op",
  },
  monthly_cleaning: {
    label: "Monthly Cleaning (Julian Bakery)",
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
  preop_624: {
    label: "Pre-Op Inspection — 624",
    href: () => "/dashboard/supervisor/pre-op-624",
  },
  daily_cleaning_624: {
    label: "Daily Cleaning — 624",
    href: () => "/dashboard/supervisor/daily-cleaning-624",
  },
  monthly_cleaning_624: {
    label: "Monthly Cleaning — 624",
    href: () => "/dashboard/supervisor/monthly-cleaning-624",
  },
  manual: {
    label: "Manual Task",
    href: () => null,
  },
};

export interface FormKeyOption {
  value: string;
  label: string;
}

/** Returns all registry entries as flat dropdown options, sorted alphabetically by label. */
export function getFormKeyOptions(): FormKeyOption[] {
  return Object.entries(TASK_FORM_REGISTRY)
    .map(([key, entry]) => ({ value: key, label: entry.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Returns the display label for a formKey, or null if not in the registry. */
export function getFormLabel(formKey: string | null | undefined): string | null {
  if (!formKey) return null;
  return TASK_FORM_REGISTRY[formKey]?.label ?? null;
}

export function getFormEntry(formKey: string | null | undefined): TaskFormEntry | null {
  if (!formKey) return null;
  return TASK_FORM_REGISTRY[formKey] ?? null;
}
