"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetailByChannel {
  amazon: number;
  shopify: number;
  walmart: number;
  manual: number;
}

interface MonthlyData {
  year: number;
  month: number;
  month_label: string;
  is_current_month: boolean;
  retail_units: number;
  distribution_units: number;
  total_units: number;
  retail_by_channel: RetailByChannel;
  distribution_by_customer: Array<{ customer_name: string; units: number }>;
  data_confidence: "full" | "partial" | "low";
}

interface Trends {
  // Overall (badge + collapsed card)
  overall_trend: "growing" | "declining" | "stable" | "insufficient_data";
  overall_change_pct: number | null;
  overall_date_range: { from: string; to: string } | null;

  // MoM (expanded card, clearly labeled)
  mom_change_units: number;
  mom_change_pct: number | null;
  mom_compared: { last_month: string; prior_month: string } | null;

  // 3-month avg
  three_month_avg: number;
  three_month_period: { from: string; to: string } | null;

  // Best / worst (complete months only)
  best_month: { month_label: string; total_units: number } | null;
  worst_month: { month_label: string; total_units: number } | null;

  // Channel split
  retail_share_pct: number;
  distribution_share_pct: number;

  // Current month (never in trend calculations)
  current_month_to_date: {
    month_label: string;
    retail_units: number;
    distribution_units: number;
    total_units: number;
    days_elapsed: number;
    days_in_month: number;
    projected_month_total: number | null;
  } | null;
}

interface PresentationTrend {
  presentation_id: string;
  presentation_name: string;
  product_name: string;
  upc: string;
  monthly_data: MonthlyData[];
  total_units_all_time: number;
  trends: Trends;
}

interface PortfolioHighlight {
  presentation_name: string;
  overall_change_pct: number | null;
  overall_date_range: { from: string; to: string } | null;
}

interface PortfolioSummary {
  total_skus_with_data: number;
  growing_skus: number;
  declining_skus: number;
  stable_skus: number;
  insufficient_data_skus: number;
  top_products_by_volume: Array<{
    presentation_name: string;
    total_units_all_time: number;
    overall_change_pct: number | null;
  }>;
  fastest_growing: PortfolioHighlight[];
  declining: PortfolioHighlight[];
}

interface SalesTrendsData {
  generatedAt: string;
  dataRange: {
    earliest_month: string;
    latest_month: string;
    total_months: number;
    current_month_complete: boolean;
    note: string;
  } | null;
  presentations: PresentationTrend[];
  portfolio_summary: PortfolioSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtQty(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtPct(n: number | null, plus = true) {
  if (n === null) return "—";
  const s = `${Math.abs(n).toFixed(1)}%`;
  return plus && n > 0 ? `+${s}` : n < 0 ? `-${s}` : s;
}

function shortMonth(label: string) {
  return label.split(" ")[0]; // "Jan 2026" → "Jan"
}

// ─── Trend Badge ──────────────────────────────────────────────────────────────

// Badge always shows overall_trend + overall_change_pct — same source, no mixing
function TrendBadge({
  trend,
  pct,
}: {
  trend: Trends["overall_trend"];
  pct: number | null;
}) {
  if (trend === "growing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 whitespace-nowrap">
        <TrendingUp className="w-3 h-3" />
        Growing {pct !== null ? fmtPct(pct) : ""}
      </span>
    );
  }
  if (trend === "declining") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5 whitespace-nowrap">
        <TrendingDown className="w-3 h-3" />
        Declining {pct !== null ? fmtPct(pct) : ""}
      </span>
    );
  }
  if (trend === "stable") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-0.5 whitespace-nowrap">
        <Minus className="w-3 h-3" />
        Stable {pct !== null ? fmtPct(pct) : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-0.5 whitespace-nowrap">
      <Info className="w-3 h-3" />
      Insufficient data
    </span>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const retail = payload.find((p) => p.name === "retail")?.value ?? 0;
  const dist = payload.find((p) => p.name === "distribution")?.value ?? 0;
  const total = retail + dist;
  const isCurrent =
    payload[0] &&
    (payload as unknown as Array<{ payload: { isCurrent: boolean } }>)[0].payload
      .isCurrent;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[140px]">
      <p className="font-semibold text-gray-800 mb-1.5">
        {label}
        {isCurrent && (
          <span className="ml-1.5 text-amber-600 font-normal">(in progress)</span>
        )}
      </p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-[#C41E3A] font-medium">Retail</span>
          <span className="font-mono text-gray-700">{retail.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#0D9488] font-medium">Distribution</span>
          <span className="font-mono text-gray-700">{dist.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-gray-100 pt-1 mt-1">
          <span className="font-semibold text-gray-700">Total</span>
          <span className="font-mono font-semibold text-gray-900">
            {total.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────

function TrendChart({ data }: { data: MonthlyData[] }) {
  const chartData = data.map((m) => ({
    name: shortMonth(m.month_label),
    retail: m.retail_units,
    distribution: m.distribution_units,
    isCurrent: m.is_current_month,
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
        barSize={Math.max(
          8,
          Math.min(24, Math.floor(280 / Math.max(chartData.length, 1)))
        )}
      >
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#9CA3AF" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9CA3AF" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => fmtQty(v)}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F3F4F6" }} />
        <Bar dataKey="retail" stackId="s" name="retail" radius={[0, 0, 0, 0]}>
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill="#C41E3A" fillOpacity={entry.isCurrent ? 0.35 : 1} />
          ))}
        </Bar>
        <Bar dataKey="distribution" stackId="s" name="distribution" radius={[2, 2, 0, 0]}>
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill="#0D9488" fillOpacity={entry.isCurrent ? 0.35 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Channel Breakdown ────────────────────────────────────────────────────────

function ChannelBreakdown({ data }: { data: MonthlyData }) {
  const channels = [
    { label: "Amazon", value: data.retail_by_channel.amazon },
    { label: "Shopify", value: data.retail_by_channel.shopify },
    { label: "Walmart", value: data.retail_by_channel.walmart },
    { label: "Manual", value: data.retail_by_channel.manual },
  ].filter((c) => c.value > 0);

  const totalRetail = data.retail_units || 1;
  const totalDist = data.distribution_units || 1;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
      <div>
        <p className="text-[10px] font-mono font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Retail by Channel
        </p>
        {channels.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No retail data</p>
        ) : (
          <div className="space-y-1.5">
            {channels.map((c) => (
              <div key={c.label} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{c.label}</span>
                <span className="font-mono text-gray-700 shrink-0 ml-2">
                  {c.value.toLocaleString()}{" "}
                  <span className="text-gray-400">
                    ({Math.round((c.value / totalRetail) * 100)}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-mono font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Distribution by Customer
        </p>
        {data.distribution_by_customer.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No distribution data</p>
        ) : (
          <div className="space-y-1.5">
            {data.distribution_by_customer.slice(0, 6).map((c) => (
              <div key={c.customer_name} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate max-w-[120px]">
                  {c.customer_name}
                </span>
                <span className="font-mono text-gray-700 shrink-0 ml-2">
                  {c.units.toLocaleString()}{" "}
                  <span className="text-gray-400">
                    ({Math.round((c.units / totalDist) * 100)}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function MetricDivider() {
  return <div className="border-t border-gray-100 my-0.5" />;
}

// ─── Expanded Key Metrics ─────────────────────────────────────────────────────

function KeyMetrics({ pres }: { pres: PresentationTrend }) {
  const { trends } = pres;
  const complete = pres.monthly_data.filter((m) => !m.is_current_month);

  // MoM color: green if > 0, red if < 0, gray if flat/null
  const momPct = trends.mom_change_pct;
  const momColor =
    momPct === null ? "text-gray-400"
    : momPct > 5 ? "text-emerald-600"
    : momPct < -5 ? "text-red-600"
    : "text-gray-500";
  const momLabel =
    momPct !== null && Math.abs(momPct) < 5 ? "essentially flat" : null;

  return (
    <div className="w-[210px] shrink-0 p-4 space-y-3">
      {/* 1 — Overall trend (matches badge) */}
      <div>
        <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Overall Trend
        </p>
        <TrendBadge
          trend={trends.overall_trend}
          pct={trends.overall_change_pct}
        />
        {trends.overall_date_range && (
          <p className="text-[10px] text-gray-400 mt-1 font-mono">
            {trends.overall_date_range.from} → {trends.overall_date_range.to}
          </p>
        )}
      </div>

      <MetricDivider />

      {/* 2 — Month over month (labeled with month names) */}
      {trends.mom_compared ? (
        <div>
          <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Month over month
          </p>
          <p className="text-[10px] text-gray-400 mb-1">
            {trends.mom_compared.last_month} vs {trends.mom_compared.prior_month}
          </p>
          <p className={cn("text-sm font-bold", momColor)}>
            {trends.mom_change_units >= 0 ? "+" : ""}
            {trends.mom_change_units.toLocaleString()} units
          </p>
          {momLabel ? (
            <p className="text-[10px] text-gray-500 italic">{momLabel}</p>
          ) : momPct !== null ? (
            <p className={cn("text-xs font-mono", momColor)}>{fmtPct(momPct)}</p>
          ) : null}
        </div>
      ) : (
        <div>
          <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Month over month
          </p>
          <p className="text-xs text-gray-400 italic">Need 2+ complete months</p>
        </div>
      )}

      <MetricDivider />

      {/* 3 — 3-month average (with period label) */}
      <div>
        <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
          3-Month Avg
          {trends.three_month_period && (
            <span className="text-gray-300 ml-1 normal-case font-normal">
              ({trends.three_month_period.from !== trends.three_month_period.to
                ? `${shortMonth(trends.three_month_period.from)}–${shortMonth(trends.three_month_period.to)}`
                : shortMonth(trends.three_month_period.from)})
            </span>
          )}
        </p>
        <p className="text-sm font-bold text-gray-800">
          {fmtQty(trends.three_month_avg)}{" "}
          <span className="text-xs font-normal text-gray-400">units/mo</span>
        </p>
      </div>

      <MetricDivider />

      {/* 4 — Best / worst months */}
      {(trends.best_month || trends.worst_month) && (
        <div className="space-y-1.5">
          {trends.best_month && (
            <div>
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
                Best Month
              </p>
              <p className="text-xs text-gray-700 mt-0.5">
                {trends.best_month.month_label}:{" "}
                <span className="font-semibold">
                  {trends.best_month.total_units.toLocaleString()}
                </span>
              </p>
            </div>
          )}
          {trends.worst_month &&
            trends.best_month?.month_label !== trends.worst_month.month_label && (
              <div>
                <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
                  Worst Month
                </p>
                <p className="text-xs text-gray-700 mt-0.5">
                  {trends.worst_month.month_label}:{" "}
                  <span className="font-semibold">
                    {trends.worst_month.total_units.toLocaleString()}
                  </span>
                </p>
              </div>
            )}
        </div>
      )}

      {/* 5 — Retail / Dist split */}
      {(complete.length > 0) && (
        <>
          <MetricDivider />
          <div>
            <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
              Retail / Dist Split
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {trends.retail_share_pct}% retail · {trends.distribution_share_pct}% dist
            </p>
            <div className="mt-1 h-1.5 rounded-full bg-[#0D9488] overflow-hidden">
              <div
                className="h-full bg-[#C41E3A] rounded-full"
                style={{ width: `${trends.retail_share_pct}%` }}
              />
            </div>
          </div>
        </>
      )}

      {/* 6 — Current month projection (clearly labeled, gray italic) */}
      {trends.current_month_to_date && (
        <>
          <MetricDivider />
          <div>
            <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1">
              {trends.current_month_to_date.month_label} (in progress)
            </p>
            <p className="text-xs text-gray-600">
              {trends.current_month_to_date.total_units.toLocaleString()} units so far
            </p>
            <p className="text-[10px] text-gray-400">
              day {trends.current_month_to_date.days_elapsed} of{" "}
              {trends.current_month_to_date.days_in_month}
            </p>
            {trends.current_month_to_date.projected_month_total !== null && (
              <p className="text-xs text-gray-400 italic mt-0.5">
                ~{trends.current_month_to_date.projected_month_total.toLocaleString()} projected
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

interface ProductCardProps {
  pres: PresentationTrend;
  isExpanded: boolean;
  onToggle: () => void;
}

function ProductCard({ pres, isExpanded, onToggle }: ProductCardProps) {
  const [channelExpanded, setChannelExpanded] = useState(false);
  const { trends, monthly_data } = pres;
  const complete = monthly_data.filter((m) => !m.is_current_month);
  const lastComplete = complete[complete.length - 1] ?? null;
  const hasEnoughData = monthly_data.length >= 2;

  return (
    <div className="card overflow-hidden">
      {/* ── Collapsed summary row — always visible, always clickable ── */}
      <div
        onClick={onToggle}
        className={cn(
          "px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors select-none",
          isExpanded && "border-b border-gray-100"
        )}
      >
        {/* Left: product info */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm leading-snug">
            {pres.product_name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {pres.presentation_name}
            {pres.upc && <span className="text-gray-400"> · {pres.upc}</span>}
          </p>
        </div>

        {/* Right: overall trend badge + date range + 3mo avg — all same source */}
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <TrendBadge
            trend={trends.overall_trend}
            pct={trends.overall_change_pct}
          />
          {trends.overall_date_range && (
            <p className="text-[10px] text-gray-400 font-mono">
              {trends.overall_date_range.from} → {trends.overall_date_range.to}
            </p>
          )}
          {trends.three_month_avg > 0 && (
            <p className="text-[10px] text-gray-400 font-mono hidden sm:block">
              3mo avg: {fmtQty(trends.three_month_avg)} units/mo
            </p>
          )}
        </div>

        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200",
            isExpanded && "rotate-180"
          )}
        />
      </div>

      {/* ── Expanded body — animated ── */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          {!hasEnoughData ? (
            <div className="px-5 py-6 text-center space-y-1">
              <p className="text-sm font-medium text-gray-700">
                {pres.presentation_name}
              </p>
              <p className="text-xs text-gray-400">
                📊 Accumulating data — trend analysis available after 2+ months of sales history
              </p>
              {monthly_data.length === 1 && (
                <p className="text-xs text-gray-400 font-mono mt-1">
                  {monthly_data[0].month_label}:{" "}
                  {monthly_data[0].total_units.toLocaleString()} units
                </p>
              )}
            </div>
          ) : (
            <div className="flex gap-0 divide-x divide-gray-100">
              {/* Left: bar chart — unchanged */}
              <div className="flex-1 min-w-0 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2 rounded-sm bg-[#C41E3A]" />
                    <span className="text-[10px] text-gray-500">Retail</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2 rounded-sm bg-[#0D9488]" />
                    <span className="text-[10px] text-gray-500">Distribution</span>
                  </div>
                  {monthly_data.some((m) => m.is_current_month) && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="inline-block w-3 h-2 rounded-sm bg-[#C41E3A] opacity-35" />
                      <span className="text-[10px] text-gray-400">
                        Current month (partial)
                      </span>
                    </div>
                  )}
                </div>
                <TrendChart data={monthly_data} />
              </div>

              {/* Right: key metrics — reorganized */}
              <KeyMetrics pres={pres} />
            </div>
          )}

          {/* Channel/customer breakdown footer */}
          {lastComplete && (
            <div className="border-t border-gray-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setChannelExpanded((v) => !v);
                }}
                className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                {channelExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                )}
                Channel &amp; customer breakdown
                <span className="text-gray-400 font-normal ml-1">
                  ({lastComplete.month_label})
                </span>
              </button>
              {channelExpanded && (
                <div className="px-5 pb-4">
                  <ChannelBreakdown data={lastComplete} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Portfolio Summary ────────────────────────────────────────────────────────

function PortfolioSummarySection({
  summary,
  presentations,
}: {
  summary: PortfolioSummary;
  presentations: PresentationTrend[];
}) {
  const tiles = [
    {
      label: "📈 Growing",
      value: summary.growing_skus,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-200",
    },
    {
      label: "📉 Declining",
      value: summary.declining_skus,
      color: "text-red-600",
      bg: "bg-red-50 border-red-200",
    },
    {
      label: "➡ Stable",
      value: summary.stable_skus,
      color: "text-gray-700",
      bg: "bg-gray-50 border-gray-200",
    },
    {
      label: "❓ Insufficient data",
      value: summary.insufficient_data_skus,
      color: "text-gray-400",
      bg: "bg-gray-50 border-gray-200",
    },
  ];

  const topGrowing = summary.fastest_growing[0] ?? null;
  const topDeclining = summary.declining[0] ?? null;

  // Look up product_name from presentations list by matching presentation_name
  const presProductMap = new Map(
    presentations.map((p) => [p.presentation_name, p.product_name])
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className={cn("rounded-lg border px-4 py-3", t.bg)}>
            <p className="text-[10px] font-mono font-semibold text-gray-500 uppercase tracking-wider">
              {t.label}
            </p>
            <p className={cn("text-2xl font-bold mt-0.5", t.color)}>{t.value}</p>
            <p className="text-[10px] text-gray-400">SKUs</p>
          </div>
        ))}
      </div>

      {(topGrowing || topDeclining) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {topGrowing && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-[10px] font-mono font-semibold text-emerald-600 uppercase tracking-wider">
                Fastest Growing
              </p>
              <p className="text-sm font-semibold text-gray-900 mt-1 truncate">
                {presProductMap.get(topGrowing.presentation_name) ??
                  topGrowing.presentation_name}
              </p>
              {presProductMap.has(topGrowing.presentation_name) && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {topGrowing.presentation_name}
                </p>
              )}
              <p className="text-xs text-emerald-700 font-mono mt-1">
                📈 {fmtPct(topGrowing.overall_change_pct)} overall
              </p>
              {topGrowing.overall_date_range && (
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                  {topGrowing.overall_date_range.from} → {topGrowing.overall_date_range.to}
                </p>
              )}
            </div>
          )}
          {topDeclining && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-[10px] font-mono font-semibold text-red-600 uppercase tracking-wider">
                Needs Attention
              </p>
              <p className="text-sm font-semibold text-gray-900 mt-1 truncate">
                {presProductMap.get(topDeclining.presentation_name) ??
                  topDeclining.presentation_name}
              </p>
              {presProductMap.has(topDeclining.presentation_name) && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {topDeclining.presentation_name}
                </p>
              )}
              <p className="text-xs text-red-700 font-mono mt-1">
                📉 {fmtPct(topDeclining.overall_change_pct)} overall
              </p>
              {topDeclining.overall_date_range && (
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                  {topDeclining.overall_date_range.from} →{" "}
                  {topDeclining.overall_date_range.to}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-gray-100" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type SortOption = "volume" | "growing" | "declining" | "name";
type FilterOption = "all" | "growing" | "declining" | "stable" | "insufficient_data";

export function SalesTrendAnalysis() {
  const [data, setData] = useState<SalesTrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("volume");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/planning/sales-trends")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: SalesTrendsData) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Collapse all when sort or filter changes — clean slate
  useEffect(() => {
    setExpandedIds(new Set());
  }, [sort, filter]);

  function toggleCard(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Sort uses overall_change_pct for growing/declining; volume uses total_units_all_time (complete months only)
  const displayed = (data?.presentations ?? [])
    .filter((p) => {
      if (filter === "all") return true;
      return p.trends.overall_trend === filter;
    })
    .slice()
    .sort((a, b) => {
      if (sort === "name")
        return a.product_name.localeCompare(b.product_name);
      if (sort === "growing")
        return (
          (b.trends.overall_change_pct ?? -Infinity) -
          (a.trends.overall_change_pct ?? -Infinity)
        );
      if (sort === "declining")
        return (
          (a.trends.overall_change_pct ?? Infinity) -
          (b.trends.overall_change_pct ?? Infinity)
        );
      return b.total_units_all_time - a.total_units_all_time;
    });

  const allExpanded =
    displayed.length > 0 &&
    displayed.every((p) => expandedIds.has(p.presentation_id));

  function expandAll() {
    setExpandedIds(new Set(displayed.map((p) => p.presentation_id)));
  }
  function collapseAll() {
    setExpandedIds(new Set());
  }

  const dr = data?.dataRange;
  const ps = data?.portfolio_summary;

  const FILTER_PILLS: { id: FilterOption; label: string }[] = [
    { id: "all", label: "All" },
    { id: "growing", label: "📈 Growing" },
    { id: "declining", label: "📉 Declining" },
    { id: "stable", label: "➡ Stable" },
    { id: "insufficient_data", label: "❓ Insufficient data" },
  ];

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#C41E3A]" />
            <h2 className="text-lg font-bold text-gray-900">Sales Trend Analysis</h2>
          </div>
          {dr && (
            <p className="text-sm text-gray-500">
              Showing {dr.total_months} month
              {dr.total_months !== 1 ? "s" : ""} of data ({dr.earliest_month} —{" "}
              {dr.latest_month}) · Retail + Distribution combined
            </p>
          )}
          <div className="flex items-start gap-1.5 text-xs text-gray-400 max-w-xl">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Trend badges and percentages always reflect the same period — first to last
              complete month. Current month is never included in trend calculations.
            </span>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load trend data: {error}
        </div>
      )}

      {loading && !data && <Skeleton />}

      {data && !loading && (
        <>
          {ps && ps.total_skus_with_data > 0 && (
            <PortfolioSummarySection
              summary={ps}
              presentations={data.presentations}
            />
          )}

          {ps?.total_skus_with_data === 0 && (
            <div className="card p-10 text-center space-y-2">
              <p className="text-sm text-gray-500 font-medium">
                No sales data available yet.
              </p>
              <p className="text-xs text-gray-400">
                Data will appear here once ShipStation shipments are synced and
                distribution POs are recorded.
              </p>
            </div>
          )}

          {ps && ps.total_skus_with_data > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1.5 flex-wrap">
                {FILTER_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setFilter(pill.id)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-semibold transition-colors",
                      filter === pill.id
                        ? "bg-[#C41E3A] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-gray-400">Sort:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="text-xs border border-gray-200 rounded-md px-2.5 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#C41E3A]"
                >
                  <option value="volume">Most sold</option>
                  <option value="growing">Fastest growing</option>
                  <option value="declining">Biggest decline</option>
                  <option value="name">Name A→Z</option>
                </select>
              </div>
            </div>
          )}

          {displayed.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-end gap-3 text-xs text-gray-400">
                <button
                  onClick={expandAll}
                  disabled={allExpanded}
                  className="hover:text-[#C41E3A] disabled:opacity-40 transition-colors"
                >
                  Expand all
                </button>
                <span>·</span>
                <button
                  onClick={collapseAll}
                  disabled={expandedIds.size === 0}
                  className="hover:text-[#C41E3A] disabled:opacity-40 transition-colors"
                >
                  Collapse all
                </button>
              </div>

              <div className="space-y-2">
                {displayed.map((pres) => (
                  <ProductCard
                    key={pres.presentation_id}
                    pres={pres}
                    isExpanded={expandedIds.has(pres.presentation_id)}
                    onToggle={() => toggleCard(pres.presentation_id)}
                  />
                ))}
              </div>
            </div>
          )}

          {displayed.length === 0 && filter !== "all" && (
            <div className="card p-8 text-center">
              <p className="text-sm text-gray-400">No products match this filter.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
