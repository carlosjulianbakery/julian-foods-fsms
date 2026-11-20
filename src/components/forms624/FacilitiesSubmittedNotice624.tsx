"use client";

import { CheckCircle2 } from "lucide-react";
import { submittedForDate, submittedPeriodMessage, type SubmittedPeriodInfo } from "@/lib/facilities-checklist-624";
import type { FacilitiesListRow } from "@/components/forms624/FacilitiesRecordsTable624";

/**
 * Shown wherever a week's form would otherwise be opened but is already submitted: who submitted it
 * and when, a way to see that record, and when the next week's form opens.
 */
export function FacilitiesSubmittedNotice624({ info, onView }: { info: SubmittedPeriodInfo; onView?: () => void }) {
  const text = submittedPeriodMessage(info);
  return (
    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3" data-period-submitted={info.period}>
      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      <div className="text-sm text-emerald-900 space-y-1">
        <p>
          {text.submitted}{" "}
          {onView && <button type="button" onClick={onView} className="underline font-medium">View that record</button>}
        </p>
        {text.next && <p className="text-emerald-800">{text.next}</p>}
      </div>
    </div>
  );
}

interface CurrentProps {
  rows: FacilitiesListRow[];
  /** Today in Pacific time, YYYY-MM-DD: it decides which week is the current one. */
  today: string;
}

/** The records page's way into the form: a button while the current week is open, nothing once it is submitted. */
export function OpenCurrentFacilitiesButton624({ rows, today, onOpen }: CurrentProps & { onOpen: () => void }) {
  if (submittedForDate(rows, today)) return null;
  return <button type="button" onClick={onOpen} className="btn-primary">Open current form</button>;
}

/** The explanation shown instead of the button; nothing while the current week is still open. */
export function CurrentFacilitiesNotice624({ rows, today, onView }: CurrentProps & { onView: (row: FacilitiesListRow) => void }) {
  const done = submittedForDate(rows, today);
  if (!done) return null;
  return (
    <FacilitiesSubmittedNotice624
      info={{ period: done.period, submittedAt: done.submittedAt, submittedBy: done.submittedBy?.name ?? (done.conductedBy || null) }}
      onView={() => onView(done)}
    />
  );
}

/** What the form route shows instead of the form when that week is already submitted. */
export function FacilitiesSubmittedView624({ info, onView, onRecords }: { info: SubmittedPeriodInfo; onView: () => void; onRecords: () => void }) {
  return (
    <div className="space-y-4" data-form-closed>
      <FacilitiesSubmittedNotice624 info={info} onView={onView} />
      <div className="card p-6 text-center space-y-3">
        <p className="text-sm text-gray-600">There is nothing to fill in right now.</p>
        <button type="button" onClick={onRecords} className="btn-secondary">View Records</button>
      </div>
    </div>
  );
}
