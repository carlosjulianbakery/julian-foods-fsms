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

// ─── Daily Cleaning 624 ───────────────────────────────────────────────────────

export type RowState = "DONE" | "NA" | "NOT_DONE" | "UNTOUCHED";

export interface CleaningRowSnapshot {
  key: string;
  labelEn: string;      // English label as shown at submission time
  labelEs: string;      // Spanish label as shown at submission time
  state: Exclude<RowState, "UNTOUCHED">;   // DONE | NA | NOT_DONE  (never UNTOUCHED in DB)
  reason: string | null;    // required when NOT_DONE
  chemical: string | null;  // chemical hint text from config at submission time
}

export interface DailyClean624Record {
  id: string;
  date: string;          // YYYY-MM-DD
  time: string;          // "HH:MM" 24h
  conductedBy: string;   // full name
  initials: string;      // e.g. "HGA"
  rows: CleaningRowSnapshot[];
  doneCount: number;
  naCount: number;
  notDoneCount: number;
  allergenChange?: boolean;  // kept for old records; new records always false
  notes: string | null;
  instructionsVer: string;
  submittedAt: string;
  submittedBy: { name: string };
  linkedInstanceId: string | null;
}

// ─── Monthly Cleaning 624 ─────────────────────────────────────────────────────

export interface MonthlyClean624LineSnapshot {
  key: string;
  labelEn: string;
  labelEs: string;
  chemical: string | null;
  state: Exclude<RowState, "UNTOUCHED">;   // DONE | NA | NOT_DONE in DB
  reason: string | null;
  lineDate: string | null;      // "YYYY-MM-DD" stamped at the time line was answered
  lineInitials: string | null;  // initials at the time line was answered
  doneByUserId: string | null;
  updatedAt: string;            // ISO timestamp of last line edit
  autoFilled: boolean;          // true if auto-submitted with NOT_DONE fill
}

/** In-memory representation while form is active — state may be UNTOUCHED. */
export interface MonthlyClean624LineEntry extends Omit<MonthlyClean624LineSnapshot, "state"> {
  state: RowState;   // includes UNTOUCHED
  reason: string;    // non-null for local edits
}

export interface MonthlyClean624Record {
  id: string;
  facility: string;
  month: string;              // "YYYY-MM"
  status: "draft" | "submitted";
  conductedBy: string;
  initials: string;
  lines: MonthlyClean624LineSnapshot[];
  doneCount: number;
  naCount: number;
  notDoneCount: number;
  notes: string | null;
  instructionsVer: string;
  autoSubmitted: boolean;
  lastEditedBy: string | null;
  lastEditedAt: string | null;
  createdById: string | null;
  submittedAt: string | null;
  submittedById: string | null;
  submittedBy: { name: string } | null;
  linkedInstanceId: string | null;
  createdAt: string;
  updatedAt: string;
}
