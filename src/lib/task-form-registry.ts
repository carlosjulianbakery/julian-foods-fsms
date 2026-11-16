// To add a new form, add ONE entry here — the Task Rules dropdown, Start links and labels
// are all generated from it.
export interface TaskFormEntry {
  label: string;
  href: (instanceId: string) => string | null;
  /** null = any/all facilities; a string = that specific facility only */
  facility: string | null;
  /** Groups entries in the Task Rules dropdown */
  category: string;
}

export const TASK_FORM_REGISTRY: Record<string, TaskFormEntry> = {
  daily_cleaning: {
    label: "Daily Cleaning (Julian Bakery)",
    href: () => "/dashboard/supervisor/cleaning/daily",
    facility: "Julian Bakery",
    category: "cleaning",
  },
  preop: {
    label: "Pre-Op Inspection (Julian Bakery)",
    href: () => "/dashboard/supervisor/pre-op",
    facility: "Julian Bakery",
    category: "inspection",
  },
  monthly_cleaning: {
    label: "Monthly Cleaning (Julian Bakery)",
    href: () => "/dashboard/supervisor/cleaning/monthly",
    facility: "Julian Bakery",
    category: "cleaning",
  },
  batch_sheet: {
    label: "Batch Sheet",
    href: () => "/dashboard/supervisor/batch-sheet",
    facility: null,
    category: "production",
  },
  receiving: {
    label: "Receiving Record",
    href: () => "/dashboard/supervisor/receiving",
    facility: null,
    category: "receiving",
  },
  sop_review: {
    label: "SOP Review",
    href: () => "/dashboard/compliance/sops",
    facility: null,
    category: "compliance",
  },
  preop_624: {
    label: "Pre-Op Inspection — 624",
    href: () => "/dashboard/supervisor/pre-op-624",
    facility: "624",
    category: "inspection",
  },
  manual: {
    label: "Manual Task",
    href: () => null,
    facility: null,
    category: "other",
  },
};

export interface FormKeyOption {
  value: string;
  label: string;
  facility: string | null;
  category: string;
}

/** Returns all registry entries as dropdown options, in a stable order. */
export function getFormKeyOptions(): FormKeyOption[] {
  return Object.entries(TASK_FORM_REGISTRY).map(([key, entry]) => ({
    value: key,
    label: entry.label,
    facility: entry.facility,
    category: entry.category,
  }));
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
