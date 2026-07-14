export const PROJECT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  concept: { label: "Concept", color: "bg-gray-100 text-gray-700" },
  in_development: { label: "In Development", color: "bg-blue-100 text-blue-700" },
  testing: { label: "Testing", color: "bg-amber-100 text-amber-700" },
  pending_approval: { label: "Pending Approval", color: "bg-purple-100 text-purple-700" },
  closed_launched: { label: "Closed — Product Launched", color: "bg-emerald-100 text-emerald-700" },
  closed_discontinued: { label: "Closed — Discontinued", color: "bg-gray-100 text-gray-500" },
};

export const ITERATION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  complete: { label: "Complete", color: "bg-green-100 text-green-700" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700" },
};

export const RECOMMENDATION_MAP: Record<string, { label: string; color: string }> = {
  needs_significant_changes: { label: "Needs Significant Changes", color: "bg-red-100 text-red-700" },
  needs_minor_adjustments: { label: "Needs Minor Adjustments", color: "bg-amber-100 text-amber-700" },
  ready_for_next_phase: { label: "Ready for Next Phase", color: "bg-blue-100 text-blue-700" },
  approve_this_version: { label: "Approve This Version", color: "bg-green-100 text-green-700" },
};

const FALLBACK = { label: "", color: "bg-gray-100 text-gray-700" };

export function formatProjectStatus(status: string): { label: string; color: string } {
  return PROJECT_STATUS_MAP[status] ?? { ...FALLBACK, label: status };
}

export function formatIterationStatus(status: string): { label: string; color: string } {
  return ITERATION_STATUS_MAP[status] ?? { ...FALLBACK, label: status };
}

export function formatRecommendation(status: string): { label: string; color: string } {
  return RECOMMENDATION_MAP[status] ?? { ...FALLBACK, label: status };
}
