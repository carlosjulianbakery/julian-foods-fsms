"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BarChart2, TrendingUp, ShoppingCart, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface CompletedPO {
  po_number: string;
  customer_name: string;
  ship_date: string;
  units: number;
  monthly_tab_source: string;
}

interface ByCustomer {
  customer_name: string;
  units_90_days: number;
  weekly_avg: number;
  percentage_of_total: number;
}

interface DistDetail {
  completed_pos: CompletedPO[];
  by_customer: ByCustomer[];
  calculation_detail: {
    date_range_from: string | null;
    date_range_to: string;
    weeks_divisor: number;
    low_data_warning: boolean;
  };
}

interface RunwayRow {
  fsmsPresentationId: string;
  productName: string;
  presentationName: string;
  upc: string;
  unit: string;
  totalShipped: number;
  avgMonthlyShipped: number;
  shipmentHistory: Array<{ month: string; shipped: number }>;
  distWeeklyAvg: number;
  distUnits30: number;
  distUnits90: number;
  distCompletedPOs: number;
  distLowDataWarning: boolean;
  distDateRangeFrom: string | null;
  distDetail: DistDetail | null;
}

interface DistCoverage {
  total_completed_pos: number;
  monthly_tabs_analyzed: number;
  date_range_from: string | null;
  date_range_to: string | null;
  skus_with_data: number;
}

interface DemandData {
  inventory: RunwayRow[];
  lastSync: { completedAt: string | null; dateRangeFrom: string; dateRangeTo: string; shipmentsFetched: number } | null;
  generatedAt: string;
  distributionUnavailable?: boolean;
  distCoverage?: DistCoverage;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short", day: "numeric", year: "numeric",
  });
}


function MiniChart({ history }: { history: Array<{ month: string; shipped: number }> }) {
  if (history.length === 0) return <span className="text-xs text-gray-300">—</span>;
  const max = Math.max(...history.map((h) => h.shipped), 1);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {history.slice(-6).map((h) => (
        <div
          key={h.month}
          title={`${h.month}: ${h.shipped}`}
          className="bg-brand-200 rounded-sm w-2.5 shrink-0"
          style={{ height: `${Math.max(2, Math.round((h.shipped / max) * 24))}px` }}
        />
      ))}
    </div>
  );
}

function ComingSoonCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="card p-6 flex flex-col gap-3 opacity-70">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-gray-400" />
        <h3 className="font-semibold text-gray-700">{title}</h3>
        <span className="ml-auto text-[10px] font-mono font-semibold bg-gray-100 text-gray-400 px-2 py-0.5 rounded">COMING SOON</span>
      </div>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

function DistributionDetail({ detail }: { detail: DistDetail }) {
  return (
    <tr>
      <td colSpan={7} className="px-0 pb-0">
        <div className="mx-4 mb-3 bg-blue-50 border border-blue-100 rounded-lg overflow-hidden">
          {/* Calculation summary */}
          <div className="px-4 py-2.5 border-b border-blue-100 bg-blue-100/50 flex items-center gap-3 flex-wrap text-xs text-blue-700">
            <span className="font-semibold">Calculation:</span>
            <span>{detail.calculation_detail.date_range_from ?? "—"} → {detail.calculation_detail.date_range_to}</span>
            <span className="text-blue-400">·</span>
            <span>{detail.completed_pos.length} shipped POs ÷ {detail.calculation_detail.weeks_divisor} weeks</span>
            {detail.calculation_detail.low_data_warning && (
              <span className="ml-auto text-amber-700 font-semibold">⚠ Low data — fewer than 3 completed POs in 90-day window</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-blue-100">
            {/* Completed POs */}
            <div className="p-3">
              <div className="text-xs font-semibold text-blue-600 mb-2">Completed POs (last 90 days)</div>
              {detail.completed_pos.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No completed POs in the last 90 days</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left pb-1 font-medium">PO#</th>
                      <th className="text-left pb-1 font-medium">Customer</th>
                      <th className="text-right pb-1 font-medium">Units</th>
                      <th className="text-right pb-1 font-medium">Shipped</th>
                      <th className="text-left pb-1 font-medium pl-2">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {detail.completed_pos.map((p) => (
                      <tr key={p.po_number} className="text-gray-700">
                        <td className="py-0.5 font-mono">{p.po_number}</td>
                        <td className="py-0.5 max-w-[120px] truncate">{p.customer_name}</td>
                        <td className="py-0.5 text-right font-mono">{p.units.toLocaleString()}</td>
                        <td className="py-0.5 text-right">{p.ship_date}</td>
                        <td className="py-0.5 pl-2 text-gray-400 italic">{p.monthly_tab_source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* By customer */}
            <div className="p-3">
              <div className="text-xs font-semibold text-blue-600 mb-2">By Customer (90 days)</div>
              {detail.by_customer.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No data</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left pb-1 font-medium">Customer</th>
                      <th className="text-right pb-1 font-medium">Units</th>
                      <th className="text-right pb-1 font-medium">Avg/Wk</th>
                      <th className="text-right pb-1 font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {detail.by_customer.map((c) => (
                      <tr key={c.customer_name} className="text-gray-700">
                        <td className="py-0.5 max-w-[140px] truncate">{c.customer_name}</td>
                        <td className="py-0.5 text-right font-mono">{c.units_90_days.toLocaleString()}</td>
                        <td className="py-0.5 text-right font-mono">{c.weekly_avg.toFixed(1)}</td>
                        <td className="py-0.5 text-right font-mono text-blue-600">{c.percentage_of_total.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function DemandForecastPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DemandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedDistRows, setExpandedDistRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authStatus === "unauthenticated") { router.push("/"); return; }
    if (authStatus === "authenticated" && (session?.user as { role?: string })?.role !== "ADMIN") {
      router.push("/dashboard"); return;
    }
  }, [authStatus, session, router]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    setLoading(true);
    fetch("/api/planning/demand-forecast")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [authStatus]);

  const filtered = (data?.inventory ?? []).filter((r) =>
    search === "" ||
    r.productName.toLowerCase().includes(search.toLowerCase()) ||
    r.presentationName.toLowerCase().includes(search.toLowerCase())
  );

  const noShipData = !data?.lastSync;

  function toggleDistRow(id: string) {
    setExpandedDistRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="max-w-5xl space-y-6">
        <div className="page-header"><h1 className="page-title">Demand Forecast</h1></div>
        <div className="card p-10 text-center text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="page-header">
        <h1 className="page-title">Demand Forecast</h1>
        <p className="page-subtitle">Retail + distribution velocity by SKU</p>
      </div>

      {data?.distributionUnavailable && (
        <div className="card p-4 border-l-4 border-l-gray-300 bg-gray-50">
          <p className="text-xs text-gray-500">
            Distribution data unavailable — showing retail only. Dist. Avg/Wk column will be blank.
          </p>
        </div>
      )}

      {noShipData && (
        <div className="card p-6 border-l-4 border-l-amber-500 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">No ShipStation data yet</p>
          <p className="text-xs text-amber-700 mt-1">
            Run an initial sync in{" "}
            <Link href="/admin/settings" className="underline">Settings → Integrations</Link>{" "}
            to populate shipment history.
          </p>
        </div>
      )}

      {/* Data coverage */}
      {data?.lastSync && (
        <div className="card p-4 flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-gray-600 flex-wrap">
              <span><span className="font-semibold text-gray-900">{data.inventory.length}</span> SKUs tracked</span>
              <span className="text-gray-300">|</span>
              <span>Retail: <span className="font-semibold">{fmtDate(data.lastSync.dateRangeFrom)}</span> – <span className="font-semibold">{fmtDate(data.lastSync.dateRangeTo)}</span></span>
              <span className="text-gray-300">|</span>
              <span><span className="font-semibold">{data.lastSync.shipmentsFetched}</span> shipments indexed</span>
            </div>
            <span className="text-xs text-gray-400 shrink-0">Last sync: {fmtDate(data.lastSync.completedAt)}</span>
          </div>
          {data.distCoverage && data.distCoverage.skus_with_data > 0 && (
            <div className="flex items-center gap-4 text-xs text-blue-600 border-t border-gray-100 pt-2 flex-wrap">
              <span className="font-semibold text-blue-700">Distribution:</span>
              <span><span className="font-semibold">{data.distCoverage.skus_with_data}</span> SKUs with data</span>
              <span className="text-blue-300">·</span>
              <span><span className="font-semibold">{data.distCoverage.total_completed_pos}</span> completed POs</span>
              <span className="text-blue-300">·</span>
              <span><span className="font-semibold">{data.distCoverage.monthly_tabs_analyzed}</span> monthly tabs analyzed</span>
              {data.distCoverage.date_range_from && (
                <>
                  <span className="text-blue-300">·</span>
                  <span>{data.distCoverage.date_range_from} – {data.distCoverage.date_range_to}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Inventory runway table */}
      {filtered.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-gray-100">
            <BarChart2 className="w-4 h-4 text-gray-400" />
            <span className="font-semibold text-gray-900 text-sm">Demand Velocity</span>
            <span className="text-xs text-gray-400 font-mono">Retail + Distribution</span>
            <input
              type="text"
              placeholder="Filter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 w-56"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Product", "Presentation", "Retail (90d)", "Retail Avg/Mo", "Dist. Avg/Wk", "Total Avg/Mo", "Last 6 Months"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => {
                  const isExpanded = expandedDistRows.has(row.fsmsPresentationId);
                  const hasDistData = row.distWeeklyAvg > 0 && row.distDetail;
                  return (
                    <>
                      <tr
                        key={row.fsmsPresentationId}
                        className={cn("hover:bg-gray-50", isExpanded && "bg-blue-50/30")}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{row.productName}</td>
                        <td className="px-4 py-3 text-gray-600">{row.presentationName}</td>
                        <td className="px-4 py-3 font-mono text-gray-700">
                          {row.totalShipped > 0 ? <>{row.totalShipped.toLocaleString()} <span className="text-xs font-normal text-gray-400">{row.unit}</span></> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-700">
                          {row.avgMonthlyShipped > 0 ? row.avgMonthlyShipped.toLocaleString() : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {row.distWeeklyAvg > 0 ? (
                            <button
                              onClick={() => hasDistData && toggleDistRow(row.fsmsPresentationId)}
                              className={cn(
                                "flex items-center gap-1 group",
                                hasDistData ? "cursor-pointer" : "cursor-default"
                              )}
                            >
                              <span className="text-blue-700">{row.distWeeklyAvg.toFixed(1)}<span className="text-xs font-normal text-blue-400 ml-0.5">/wk</span></span>
                              {row.distLowDataWarning && (
                                <span title="Low data: fewer than 3 completed POs in 90-day window" className="text-amber-500 text-xs ml-0.5">⚠</span>
                              )}
                              {hasDistData && (
                                isExpanded
                                  ? <ChevronDown className="w-3 h-3 text-blue-400 ml-0.5" />
                                  : <ChevronRight className="w-3 h-3 text-blue-300 ml-0.5 group-hover:text-blue-400" />
                              )}
                            </button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-700">
                          {(() => {
                            const totalAvg = row.avgMonthlyShipped + Math.round(row.distWeeklyAvg * 4.33);
                            return totalAvg > 0 ? totalAvg.toLocaleString() : <span className="text-gray-300">—</span>;
                          })()}
                        </td>
                        <td className="px-4 py-3"><MiniChart history={row.shipmentHistory} /></td>
                      </tr>
                      {isExpanded && row.distDetail && (
                        <DistributionDetail key={`${row.fsmsPresentationId}-detail`} detail={row.distDetail} />
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Coming soon cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ComingSoonCard
          icon={TrendingUp}
          title="Sales Trend Analysis"
          description="Month-over-month growth rates and seasonal patterns per product."
        />
        <ComingSoonCard
          icon={ShoppingCart}
          title="Reorder Recommendations"
          description="Auto-generated purchase order triggers based on runway and lead times."
        />
        <ComingSoonCard
          icon={BarChart2}
          title="Production Planning"
          description="Suggested batch runs to maintain target weeks-of-supply for each SKU."
        />
      </div>

      <p className="text-xs text-gray-400 text-right">
        Generated {fmtDate(data?.generatedAt)} ·{" "}
        <Link href="/admin/settings" className="text-brand-600 hover:underline">Configure sync in Settings</Link>
      </p>
    </div>
  );
}
