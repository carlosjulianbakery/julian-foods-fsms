"use client";

import { useState } from "react";
import { DateInput } from "@/components/DateInput";
import { Field, ProblemList, QualityHistory, type QualityEventRow } from "@/components/quality/QualityParts";
import { exportHref } from "@/lib/quality-export";
import {
  REVIEW_COUNT_LABELS, filterReviews, formatDay, formatMoment, periodLabel, reviewYears, type FieldProblem, type ReviewCounts, type ReviewRow,
} from "@/lib/quality";

/** The last twelve months up to the current one, newest first. */
export function recentPeriods(current: string): string[] {
  const [y, m] = current.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; });
}

function Counts({ counts, caption }: { counts: ReviewCounts; caption: string }) {
  return (
    <div data-counts>
      <p className="text-xs font-medium text-gray-500 mb-1">{caption}</p>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(Object.keys(REVIEW_COUNT_LABELS) as (keyof ReviewCounts)[]).map((k) => (
          <div key={k} className="border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <dt className="text-[11px] text-gray-500">{REVIEW_COUNT_LABELS[k]}</dt>
            <dd className="text-lg font-mono font-bold text-gray-900" data-count={k}>{counts?.[k] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface ReviewsTabProps {
  reviews: ReviewRow[];
  /** Today in Pacific time, and the month it falls in. */
  today: string;
  currentPeriod: string;
  /** The counts as of now, shown before a review is saved. */
  currentCounts: ReviewCounts;
  /** The admin who is signed in: recorded as the reviewer. */
  reviewerName: string;
  /** The month to open on (from the task's Start button); the current month otherwise. */
  initialPeriod?: string;
  initialYear?: string;
  /** History of the review being edited. */
  events?: QualityEventRow[];
  busy?: boolean;
  error?: string;
  problems?: FieldProblem[];
  onCreate: (data: { period: string; reviewDate: string; whatWasReviewed: string; notes: string }) => void;
  onUpdate: (review: ReviewRow, data: { reviewDate: string; whatWasReviewed: string; notes: string }) => void;
  onSelect?: (period: string) => void;
}

export function ReviewsTab(p: ReviewsTabProps) {
  const [period, setPeriod] = useState(p.initialPeriod ?? p.currentPeriod);
  const [year, setYear] = useState(p.initialYear ?? "");
  const existing = p.reviews.find((r) => r.period === period) ?? null;
  const [draft, setDraft] = useState({ period: "", reviewDate: "", whatWasReviewed: "", notes: "" });
  // The form follows the month chosen: an existing review is loaded for editing, a new one starts blank with today's date
  const form = draft.period === period ? draft : { period, reviewDate: existing?.reviewDate ?? p.today, whatWasReviewed: existing?.whatWasReviewed ?? "", notes: existing?.notes ?? "" };
  const set = (patch: Partial<typeof form>) => setDraft({ ...form, ...patch });
  const choose = (next: string) => { setPeriod(next); setDraft({ period: "", reviewDate: "", whatWasReviewed: "", notes: "" }); p.onSelect?.(next); };
  const ready = !!form.reviewDate && form.whatWasReviewed.trim().length > 0;
  const periods = Array.from(new Set([...recentPeriods(p.currentPeriod), ...(p.initialPeriod ? [p.initialPeriod] : [])])).sort().reverse();
  const shown = filterReviews(p.reviews, year || undefined);

  return (
    <div className="space-y-5" data-reviews>
      <section className="card p-4 space-y-3" data-review-form={existing ? "edit" : "new"}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Month being reviewed">
            <select className="input text-sm" value={period} onChange={(e) => choose(e.target.value)}>
              {periods.map((x) => <option key={x} value={x}>{periodLabel(x)}{p.reviews.some((r) => r.period === x) ? " (reviewed)" : ""}</option>)}
            </select>
          </Field>
          <p className="text-sm text-gray-600 pb-2">
            {existing
              ? <>Reviewed by <b>{existing.reviewedByName}</b>. Last saved {formatMoment(existing.updatedAt)}.</>
              : <>Reviewer: <b>{p.reviewerName}</b> (recorded when you save). Saving completes the review task for {periodLabel(period)}.</>}
          </p>
        </div>
        <ProblemList error={p.error} problems={p.problems} />
        <Counts counts={existing ? existing.counts : p.currentCounts} caption={existing ? "Counts recorded when this review was saved" : "Counts right now (recorded when you save)"} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Review date"><DateInput value={form.reviewDate} onChange={(v) => set({ reviewDate: v })} /></Field>
          <div />
          <Field label="What was reviewed" wide><textarea rows={3} className="input w-full text-sm" value={form.whatWasReviewed} onChange={(e) => set({ whatWasReviewed: e.target.value })} placeholder="For example: all incidents received this month, open CAPAs and their due dates" /></Field>
          <Field label="Notes" wide><textarea rows={3} className="input w-full text-sm" value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </div>
        <button
          type="button" disabled={p.busy || !ready} className="btn-primary text-sm disabled:opacity-50"
          onClick={() => (existing ? p.onUpdate(existing, { reviewDate: form.reviewDate, whatWasReviewed: form.whatWasReviewed.trim(), notes: form.notes.trim() }) : p.onCreate({ period, reviewDate: form.reviewDate, whatWasReviewed: form.whatWasReviewed.trim(), notes: form.notes.trim() }))}
        >
          {p.busy ? "Saving…" : existing ? "Save changes" : `Save the review for ${periodLabel(period)}`}
        </button>
      </section>

      {existing && p.events && <QualityHistory type="review" events={p.events} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold text-gray-900">Past reviews</h2>
          <label className="text-[11px] font-medium text-gray-500">Year{" "}
            <select className="input text-sm" value={year} onChange={(e) => setYear(e.target.value)}><option value="">All</option>{reviewYears(p.reviews).map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </label>
          <span className="text-xs text-gray-400" data-count-shown>{shown.length} of {p.reviews.length}</span>
          <a href={exportHref("reviews", { year: year || undefined })} data-export="review" className="btn-secondary text-xs ml-auto">Export CSV</a>
        </div>
        {shown.length === 0 ? <div className="card p-6 text-center text-sm text-gray-500">{p.reviews.length === 0 ? "No reviews yet." : "No reviews in that year."}</div> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm" data-list="reviews">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="px-3 py-2">Month</th><th className="px-3 py-2">Review date</th><th className="px-3 py-2">Reviewer</th><th className="px-3 py-2">What was reviewed</th>
                <th className="px-3 py-2 text-right">Open incidents</th><th className="px-3 py-2 text-right">Open CAPAs</th><th className="px-3 py-2 text-right">Overdue CAPAs</th><th className="px-3 py-2 text-right">Received</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} data-row={r.period} onClick={() => choose(r.period)} className={`border-b last:border-b-0 border-gray-100 cursor-pointer hover:bg-gray-50 ${r.period === period ? "bg-indigo-50/50" : ""}`}>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{periodLabel(r.period)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDay(r.reviewDate)}</td>
                    <td className="px-3 py-2">{r.reviewedByName}</td>
                    <td className="px-3 py-2 max-w-[280px] truncate text-gray-600">{r.whatWasReviewed}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.counts?.openIncidents ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.counts?.openCapas ?? 0}</td>
                    <td className={`px-3 py-2 text-right font-mono ${(r.counts?.overdueCapas ?? 0) > 0 ? "text-red-700 font-semibold" : ""}`}>{r.counts?.overdueCapas ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.counts?.incidentsReceived ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
