"use client";

import { CheckCircle2 } from "lucide-react";
import { submittedForDate, submittedPeriodMessage, type SubmittedPeriodInfo } from "@/lib/verification-624";
import type { VerificationListRow } from "@/components/forms624/VerificationRecordsTable624";

/**
 * Shown wherever the current period's form would otherwise be opened but is already submitted:
 * who submitted it and when, a way to see that record, and when the next period's form opens.
 */
export function VerificationSubmittedNotice624({ info, onView }: { info: SubmittedPeriodInfo; onView?: () => void }) {
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
  rows: VerificationListRow[];
  /** Today in Pacific time, YYYY-MM-DD: it decides which period is the current one. */
  today: string;
}

/**
 * The records page's way into the form. While the current period is open it is a plain button;
 * once that period is submitted there is no button at all (the notice below the header says why).
 */
export function OpenCurrentFormButton624({ rows, today, onOpen }: CurrentProps & { onOpen: () => void }) {
  if (submittedForDate(rows, today)) return null;
  return <button type="button" onClick={onOpen} className="btn-primary">Open current form</button>;
}

/** The explanation that goes with the disabled button; nothing while the current period is still open. */
export function CurrentPeriodNotice624({ rows, today, onView }: CurrentProps & { onView: (row: VerificationListRow) => void }) {
  const done = submittedForDate(rows, today);
  if (!done) return null;
  return (
    <VerificationSubmittedNotice624
      info={{ period: done.period, submittedAt: done.submittedAt, submittedBy: done.submittedBy?.name ?? (done.conductedBy || null) }}
      onView={() => onView(done)}
    />
  );
}

/** What the form route shows instead of the form when the current period is already submitted. */
export function VerificationSubmittedView624({ info, onView, onRecords }: { info: SubmittedPeriodInfo; onView: () => void; onRecords: () => void }) {
  return (
    <div className="space-y-4" data-form-closed>
      <VerificationSubmittedNotice624 info={info} onView={onView} />
      <div className="card p-6 text-center space-y-3">
        <p className="text-sm text-gray-600">There is nothing to fill in right now.</p>
        <button type="button" onClick={onRecords} className="btn-secondary">View Records</button>
      </div>
    </div>
  );
}
