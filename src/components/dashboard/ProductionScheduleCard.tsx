"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  RefreshCw,
  AlertTriangle,
  Circle,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleItemStatus = "complete" | "in_progress" | "not_started" | "issues" | "unmatched";

interface ScheduleItem {
  raw_text: string;
  product_name: string;
  base_unit_count: number | null;
  base_unit_label: string | null;
  comments: string | null;
  additional_lines: string[];
  status: ScheduleItemStatus;
  template_id: string | null;
  product_id: string | null;
  submission_id: string | null;
}

interface DaySchedule {
  day: string;
  date: string;
  full_date: string;
  iso_date: string;
  items: ScheduleItem[];
}

interface WeekSchedule {
  week_label: string;
  days: DaySchedule[];
}

interface ScheduleData {
  this_week: WeekSchedule | null;
  next_week: WeekSchedule | null;
  last_fetched: string;
  is_stale?: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff === 1) return "1 min ago";
  return `${diff} min ago`;
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({
  status,
  className,
}: {
  status: ScheduleItemStatus;
  className?: string;
}) {
  const base = `shrink-0 ${className ?? ""}`;
  switch (status) {
    case "complete":
      return <CheckCircle2 className={`${base} text-green-500`} />;
    case "in_progress":
      return <Clock className={`${base} text-amber-400`} />;
    case "issues":
      return <AlertCircle className={`${base} text-orange-400`} />;
    case "not_started":
      return <Circle className={`${base} text-gray-300`} />;
    default:
      return null;
  }
}

// ─── Day summary badge ────────────────────────────────────────────────────────

type DaySummaryBadge =
  | { type: "done" }
  | { type: "in_progress" }
  | { type: "partial"; done: number; total: number }
  | null;

function getDaySummary(items: ScheduleItem[]): DaySummaryBadge {
  const matchable = items.filter((i) => i.status !== "unmatched");
  if (matchable.length === 0) return null;

  const done = matchable.filter(
    (i) => i.status === "complete" || i.status === "issues"
  ).length;
  const inProg = matchable.filter((i) => i.status === "in_progress").length;

  if (done === matchable.length) return { type: "done" };
  if (inProg > 0) return { type: "in_progress" };
  if (done > 0) return { type: "partial", done, total: matchable.length };
  return null;
}

function SummaryBadge({ badge }: { badge: DaySummaryBadge }) {
  if (!badge) return null;
  if (badge.type === "done") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5 leading-none">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Done
      </span>
    );
  }
  if (badge.type === "in_progress") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 leading-none">
        <Clock className="w-2.5 h-2.5" />
        In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-1.5 py-0.5 leading-none">
      {badge.done}/{badge.total}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skel({ className }: { className?: string }) {
  return <div className={`bg-gray-100 animate-pulse rounded ${className ?? ""}`} />;
}

function ScheduleSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skel className="h-4 w-24" />
          <Skel className="h-3 w-16" />
          <div className="border-t border-gray-100 pt-2 space-y-1.5">
            <Skel className="h-3 w-full" />
            <Skel className="h-3 w-4/5" />
            <Skel className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Day column ───────────────────────────────────────────────────────────────

function DayColumn({ day }: { day: DaySchedule }) {
  const badge = getDaySummary(day.items);
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <p className="text-xs font-bold tracking-wide text-[#D64D4D] uppercase">
          {day.day}
        </p>
        <SummaryBadge badge={badge} />
      </div>
      <p className="text-[11px] text-gray-400 mb-2">{day.date}</p>
      <div className="border-t border-gray-100 pt-2">
        {day.items.length === 0 ? (
          <p className="text-xs text-gray-300 italic leading-relaxed">
            No production scheduled
          </p>
        ) : (
          <ul className="space-y-2">
            {day.items.map((item, idx) => (
              <li key={idx} className="text-xs leading-relaxed">
                <div className="flex items-start gap-1.5">
                  <StatusIcon status={item.status} className="w-3 h-3 mt-0.5" />
                  <div className="min-w-0">
                    <span
                      className={
                        item.status === "unmatched"
                          ? "text-gray-400"
                          : "text-gray-700 font-medium"
                      }
                    >
                      {item.product_name}
                    </span>
                    {(item.base_unit_count !== null || item.base_unit_label) && (
                      <p className="text-gray-400 text-[11px] mt-0.5">
                        {[item.base_unit_count, item.base_unit_label]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    )}
                    {item.comments && (
                      <p className="text-gray-400 text-[11px] mt-0.5">{item.comments}</p>
                    )}
                    {item.additional_lines.map((line, lineIdx) => (
                      <p key={lineIdx} className="text-gray-400 text-[11px] mt-0.5">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function ProductionScheduleCard() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"this" | "next">("this");
  const [, forceUpdate] = useState(0);

  // Re-render every minute to keep "X min ago" fresh
  useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const url = `/api/dashboard/production-schedule${refresh ? "?refresh=true" : ""}`;
      const res = await fetch(url);
      const json: ScheduleData = await res.json();
      setData(json);
    } catch {
      setData((prev) => (prev ? { ...prev, is_stale: true } : null));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeWeek = activeTab === "this" ? data?.this_week : data?.next_week;
  const nextWeekAvailable = !!data?.next_week;

  return (
    <div className="card border-l-4 border-l-[#D64D4D]">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2.5">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
              <h2 className="font-semibold text-gray-900 text-sm">Production Schedule</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("this")}
                disabled={loading}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors min-h-[32px] ${
                  activeTab === "this"
                    ? "bg-[#D64D4D] text-white"
                    : "border border-[#D64D4D] text-[#D64D4D] bg-transparent hover:bg-red-50"
                } disabled:opacity-50`}
              >
                This Week
              </button>
              <button
                onClick={() => nextWeekAvailable && setActiveTab("next")}
                disabled={loading || !nextWeekAvailable}
                title={
                  !nextWeekAvailable && !loading
                    ? "Next week's schedule has not been added yet."
                    : undefined
                }
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors min-h-[32px] ${
                  activeTab === "next" && nextWeekAvailable
                    ? "bg-[#D64D4D] text-white"
                    : nextWeekAvailable
                    ? "border border-[#D64D4D] text-[#D64D4D] bg-transparent hover:bg-red-50"
                    : "border border-gray-200 text-gray-300 cursor-not-allowed"
                } disabled:opacity-50`}
              >
                Next Week
              </button>
            </div>

            {!loading && activeWeek && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                Week of {activeWeek.week_label}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {data?.last_fetched && !loading && (
              <span className="text-[11px] text-gray-400 hidden sm:inline">
                Updated {minutesAgo(data.last_fetched)}
              </span>
            )}
            <button
              onClick={() => load(true)}
              disabled={loading || refreshing}
              title="Refresh production schedule"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 min-h-[32px] min-w-[32px] flex items-center justify-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {data?.is_stale && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Showing cached data — last updated{" "}
            {data.last_fetched ? minutesAgo(data.last_fetched) : "unknown"}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {loading ? (
          <ScheduleSkeleton />
        ) : data?.error ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <p className="text-sm text-gray-500">
              Unable to load production schedule. Check connection or refresh.
            </p>
            <button
              onClick={() => load(true)}
              className="flex items-center gap-1.5 text-xs text-[#D64D4D] hover:underline font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
        ) : !activeWeek ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-400 italic">
              {activeTab === "this"
                ? "This week's schedule has not been added yet."
                : "Next week's schedule has not been added yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5">
            {activeWeek.days.map((day) => (
              <DayColumn key={day.day} day={day} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
