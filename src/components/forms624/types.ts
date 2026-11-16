// Shared types for 624-facility forms.
// Historic records must render exactly as submitted — all text and limits
// are snapshotted at submission time.

export const FRIDGE_MAX_F = 41;   // ≤41°F = OK
export const FREEZER_MAX_F = 0;   // ≤0°F = OK
export const ATP_MAX_RLU = 30;    // >30 = Not OK

export type RowCondition = "OK" | "NOT_OK" | "NA";

export interface RowSnapshot {
  key: string;
  label: string;              // text as shown at submission time
  condition: RowCondition;
  initials: string;
  correctiveAction: string;
  reInspected: boolean;
  reInspectedAt: string | null;   // ISO timestamp or null
  // numeric temperature (only for temp rows)
  tempValue: number | null;       // °F
  tempLimit: number | null;       // the limit in force at submission (41 or 0)
  // ATP RLU (only for ATP row)
  atpRlu: number | null;
  atpLimit: number | null;        // the limit in force at submission (30)
  // re-inspection temperature
  reInspectTempValue: number | null;
}

export interface Inspection624 {
  id: string;
  date: string;              // ISO date string YYYY-MM-DD
  conductedBy: string;
  rows: RowSnapshot[];
  hasNotOk: boolean;
  overallOk: boolean;
  submittedAt: string;
  submittedBy: { name: string };
  linkedInstanceId: string | null;
}
