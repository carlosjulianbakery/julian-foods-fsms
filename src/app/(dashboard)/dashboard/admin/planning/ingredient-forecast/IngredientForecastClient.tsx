"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import type {
  ForecastData,
  ForecastIngredient,
} from "@/app/api/planning/ingredient-forecast/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type WindowMode = "1week" | "2weeks" | "1month" | "custom";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getPacificToday(): Date {
  const pt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return new Date(Date.UTC(pt.getFullYear(), pt.getMonth(), pt.getDate()));
}

function getThisMonday(today: Date): Date {
  const dow = today.getUTCDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const d = new Date(today);
  d.setUTCDate(today.getUTCDate() - offset);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(d.getUTCDate() + n);
  return r;
}

function toIsoStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fmtDisplay(isoStr: string): string {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toMmDdYyyy(isoStr: string): string {
  const [y, m, d] = isoStr.split("-");
  return `${m}/${d}/${y}`;
}

function computeDateRange(mode: WindowMode, customFrom: string, customTo: string): { from: Date; to: Date } {
  const today = getPacificToday();
  const monday = getThisMonday(today);

  if (mode === "1week") return { from: monday, to: addDays(monday, 3) };
  if (mode === "2weeks") return { from: monday, to: addDays(monday, 10) };
  if (mode === "1month") return { from: monday, to: addDays(monday, 27) };

  const [fy, fm, fd] = customFrom.split("-").map(Number);
  const [ty, tm, td] = customTo.split("-").map(Number);
  return {
    from: isNaN(fy) ? monday : new Date(Date.UTC(fy, fm - 1, fd)),
    to: isNaN(ty) ? addDays(monday, 3) : new Date(Date.UTC(ty, tm - 1, td)),
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ForecastIngredient["forecast_status"] }) {
  if (status === "sufficient") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
        ✓ SUFFICIENT
      </span>
    );
  }
  if (status === "shortage") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
        ✗ SHORTAGE
      </span>
    );
  }
  if (status === "unit_mismatch") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
        ⚠ UNIT MISMATCH
      </span>
    );
  }
  if (status === "no_unit_defined") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
        ⚠ NO UNIT DEFINED
      </span>
    );
  }
  if (status === "partial_mismatch") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
        ⚠ PARTIAL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
      ? NO INVENTORY
    </span>
  );
}

// ─── Summary stat card ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "red" | "green" | "amber" | "gray";
}) {
  const valueClass =
    accent === "red"
      ? "text-red-600"
      : accent === "green"
      ? "text-green-600"
      : accent === "amber"
      ? "text-amber-600"
      : "text-gray-900";
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 font-mono mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Ingredient row (expandable) ──────────────────────────────────────────────

function IngredientRow({
  ingredient,
  expanded,
  onToggle,
}: {
  ingredient: ForecastIngredient;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rowBg =
    ingredient.forecast_status === "shortage"
      ? "bg-red-50 hover:bg-red-100"
      : ingredient.forecast_status === "sufficient"
      ? "hover:bg-green-50"
      : ingredient.forecast_status === "unit_mismatch" || ingredient.forecast_status === "partial_mismatch"
      ? "bg-amber-50 hover:bg-amber-100"
      : ingredient.forecast_status === "no_unit_defined"
      ? "bg-red-50 hover:bg-red-100"
      : "hover:bg-gray-50";

  const displayUnit = ingredient.standard_unit ?? "—";
  const isAttention =
    ingredient.forecast_status === "unit_mismatch" ||
    ingredient.forecast_status === "no_unit_defined" ||
    ingredient.forecast_status === "partial_mismatch";

  return (
    <>
      <tr
        className={`border-b border-gray-100 cursor-pointer transition-colors ${rowBg}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-sm font-medium text-gray-800">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            )}
            {ingredient.material_name}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">{displayUnit}</td>
        <td className="px-4 py-3 text-sm text-gray-800 font-mono">
          {isAttention && ingredient.total_needed === 0
            ? "—"
            : ingredient.total_needed.toFixed(3)}
        </td>
        <td className="px-4 py-3 text-sm font-mono">
          {ingredient.unit_status === "mismatch" ? (
            <span className="text-amber-600">
              {ingredient.in_stock_raw !== null ? ingredient.in_stock_raw.toFixed(3) : "—"}{" "}
              {ingredient.inventory_unit}
            </span>
          ) : ingredient.unit_status === "no_stock" ? (
            <span className="text-gray-400">—</span>
          ) : (
            <div>
              <span className="text-gray-800">
                {ingredient.in_stock_converted !== null
                  ? ingredient.in_stock_converted.toFixed(3)
                  : "—"}{" "}
                {displayUnit}
              </span>
              {ingredient.unit_status === "converted" &&
                ingredient.in_stock_raw !== null &&
                ingredient.inventory_unit && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    ({ingredient.in_stock_raw.toFixed(3)} {ingredient.inventory_unit} converted)
                  </p>
                )}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-sm font-mono">
          {ingredient.forecast_status === "unit_mismatch" ||
          ingredient.forecast_status === "no_unit_defined" ||
          ingredient.forecast_status === "partial_mismatch" ? (
            <span className="text-gray-400">—</span>
          ) : ingredient.forecast_status === "no_stock_data" ? (
            <span className="text-gray-400">No inventory</span>
          ) : ingredient.surplus_or_shortfall !== null ? (
            <span
              className={
                ingredient.surplus_or_shortfall >= 0
                  ? "text-green-600 font-semibold"
                  : "text-red-600 font-semibold"
              }
            >
              {ingredient.surplus_or_shortfall >= 0 ? "+" : ""}
              {ingredient.surplus_or_shortfall.toFixed(3)} {displayUnit}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={ingredient.forecast_status} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6} className="px-8 py-3">

            {/* no_unit_defined explanation */}
            {ingredient.forecast_status === "no_unit_defined" && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm font-semibold text-red-800 mb-1">⚠ No Standard Unit Defined</p>
                <p className="text-xs text-red-700 mb-2">
                  This material has no standard unit set in the Materials registry. Without a
                  standard unit, recipe quantities cannot be aggregated or compared to inventory.
                </p>
                <Link
                  href={`/supplier-management/materials/${ingredient.material_id}/edit`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-700 underline hover:text-red-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  Set a unit for this material →
                </Link>
              </div>
            )}

            {/* unit_mismatch explanation */}
            {ingredient.unit_status === "mismatch" && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm font-semibold text-amber-800 mb-2">⚠ Inventory Unit Mismatch</p>
                <p className="text-xs text-amber-700 mb-1">
                  Standard unit:{" "}
                  <span className="font-medium">{ingredient.standard_unit}</span>
                </p>
                <p className="text-xs text-amber-700 mb-2">
                  Inventory tracked in:{" "}
                  <span className="font-medium">{ingredient.inventory_unit}</span>
                </p>
                <p className="text-xs text-amber-700">
                  These unit families are incompatible — quantities cannot be compared.
                </p>
              </div>
            )}

            {/* partial_mismatch — excluded contributions */}
            {ingredient.forecast_status === "partial_mismatch" && ingredient.excluded_contributions.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm font-semibold text-amber-800 mb-2">
                  ⚠ Partial — {ingredient.excluded_contributions.length} contribution{ingredient.excluded_contributions.length !== 1 ? "s" : ""} excluded
                </p>
                <p className="text-xs text-amber-700 mb-2">
                  The following productions use a unit that cannot be converted to{" "}
                  <span className="font-medium">{ingredient.standard_unit}</span>:
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-amber-600 font-mono">
                      <th className="text-left pb-1 pr-4">Date</th>
                      <th className="text-left pb-1 pr-4">Product</th>
                      <th className="text-right pb-1 pr-4">Quantity</th>
                      <th className="text-left pb-1">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredient.excluded_contributions.map((ec, i) => (
                      <tr key={i} className="border-t border-amber-200">
                        <td className="py-1 pr-4 text-amber-700">{ec.day_label}</td>
                        <td className="py-1 pr-4 text-amber-700">{ec.product_name}</td>
                        <td className="py-1 pr-4 text-right font-mono text-amber-700">
                          {ec.quantity.toFixed(3)} {ec.recipe_unit}
                        </td>
                        <td className="py-1 text-amber-600">{ec.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Breakdown table */}
            {ingredient.breakdown.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 font-mono">
                    <th className="text-left pb-1 pr-4">Date</th>
                    <th className="text-left pb-1 pr-4">Product</th>
                    <th className="text-right pb-1 pr-4">Base Units</th>
                    <th className="text-right pb-1 pr-4">Qty / Unit</th>
                    <th className="text-right pb-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredient.breakdown.map((b, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="py-1.5 pr-4 text-gray-500">{b.day_label}</td>
                      <td className="py-1.5 pr-4 text-gray-700">{b.product_name}</td>
                      <td className="py-1.5 pr-4 text-right font-mono text-gray-600">
                        {b.base_unit_count}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono text-gray-600">
                        {b.qty_per_base_unit.toFixed(4)} {b.recipe_unit}
                      </td>
                      <td className="py-1.5 text-right font-mono font-semibold text-gray-800">
                        <div>
                          {b.total.toFixed(3)} {b.unit}
                          {b.was_converted && (
                            <p className="text-[10px] text-gray-400 font-normal">
                              {b.raw_total.toFixed(3)} {b.recipe_unit} → {b.total.toFixed(3)} {b.unit}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={4} className="py-1.5 pr-4 text-right font-semibold text-gray-700">
                      Total needed
                    </td>
                    <td className="py-1.5 text-right font-mono font-bold text-gray-900">
                      {ingredient.total_needed.toFixed(3)} {ingredient.standard_unit ?? ""}
                    </td>
                  </tr>
                  {ingredient.unit_status !== "mismatch" &&
                    ingredient.forecast_status !== "no_unit_defined" &&
                    ingredient.forecast_status !== "partial_mismatch" && (
                    <>
                      <tr>
                        <td colSpan={4} className="py-0.5 pr-4 text-right text-gray-500">
                          In stock
                          {ingredient.unit_status === "converted" && ingredient.inventory_unit && (
                            <span className="text-gray-400 ml-1">
                              (converted from {ingredient.inventory_unit})
                            </span>
                          )}
                        </td>
                        <td className="py-0.5 text-right font-mono text-gray-700">
                          {ingredient.in_stock_converted === null
                            ? "—"
                            : `${ingredient.in_stock_converted.toFixed(3)} ${ingredient.standard_unit ?? ""}`}
                        </td>
                      </tr>
                      {ingredient.surplus_or_shortfall !== null && (
                        <tr>
                          <td colSpan={4} className="py-0.5 pr-4 text-right text-gray-500">
                            {ingredient.surplus_or_shortfall >= 0 ? "Surplus" : "Shortfall"}
                          </td>
                          <td
                            className={`py-0.5 text-right font-mono font-semibold ${
                              ingredient.surplus_or_shortfall >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {ingredient.surplus_or_shortfall >= 0 ? "+" : ""}
                            {ingredient.surplus_or_shortfall.toFixed(3)} {ingredient.standard_unit ?? ""}
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(data: ForecastData) {
  const rows: string[][] = [
    ["Material", "Standard Unit", "Total Needed", "In Stock (converted)", "In Stock (original)", "Surplus/Shortfall", "Status"],
  ];
  for (const ing of data.ingredients) {
    rows.push([
      ing.material_name,
      ing.standard_unit ?? "",
      ing.total_needed > 0 ? ing.total_needed.toFixed(3) : "",
      ing.in_stock_converted !== null ? ing.in_stock_converted.toFixed(3) : "",
      ing.in_stock_raw !== null ? `${ing.in_stock_raw.toFixed(3)} ${ing.inventory_unit ?? ""}` : "",
      ing.surplus_or_shortfall === null ? "" : ing.surplus_or_shortfall.toFixed(3),
      ing.forecast_status,
    ]);
  }
  const csv = rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ingredient-forecast-${data.date_from}-${data.date_to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IngredientForecastClient() {
  const [mode, setMode] = useState<WindowMode>("1week");
  const [customFrom, setCustomFrom] = useState(() => toIsoStr(getPacificToday()));
  const [customTo, setCustomTo] = useState(() => toIsoStr(addDays(getPacificToday(), 13)));

  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { from, to } = computeDateRange(mode, customFrom, customTo);

  const load = useCallback(
    async (fromDate: Date, toDate: Date) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          date_from: toMmDdYyyy(toIsoStr(fromDate)),
          date_to: toMmDdYyyy(toIsoStr(toDate)),
        });
        const res = await fetch(`/api/planning/ingredient-forecast?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ForecastData = await res.json();
        setData(json);
        setExpandedRows(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load forecast");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (mode !== "custom") {
      const { from: f, to: t } = computeDateRange(mode, customFrom, customTo);
      load(f, t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function handleCustomApply() {
    load(from, to);
  }

  function toggleRow(materialId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  }

  const presets: { label: string; value: WindowMode }[] = [
    { label: "1 Week", value: "1week" },
    { label: "2 Weeks", value: "2weeks" },
    { label: "1 Month", value: "1month" },
    { label: "Custom", value: "custom" },
  ];

  const noUnitDefinedIngredients = data?.ingredients.filter(
    (i) => i.forecast_status === "no_unit_defined"
  ) ?? [];

  return (
    <div className="max-w-6xl space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#D64D4D]" />
              Ingredient Forecast
            </h1>
            <p className="page-subtitle">
              Calculate ingredient requirements for upcoming scheduled productions and
              validate against current inventory.
            </p>
          </div>

          {data && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => exportCsv(data)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                onClick={window.print}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export PDF
              </button>
              <button
                onClick={() => load(from, to)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#D64D4D] text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Forecast window selector */}
      <div className="card px-5 py-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Show requirements for the next:</p>
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p.value}
              onClick={() => setMode(p.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                mode === p.value
                  ? "bg-[#D64D4D] text-white"
                  : "border border-gray-300 text-gray-600 hover:border-[#D64D4D] hover:text-[#D64D4D]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {mode === "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]"
              />
            </div>
            <button
              onClick={handleCustomApply}
              disabled={loading}
              className="px-4 py-2 bg-[#D64D4D] text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              Calculate
            </button>
          </div>
        )}

        {data && (
          <p className="mt-3 text-xs text-gray-400">
            Showing:{" "}
            <span className="text-gray-600 font-medium">
              {fmtDisplay(data.date_from)} — {fmtDisplay(data.date_to)}
            </span>
            {data.last_fetched && (
              <span className="ml-2 text-gray-400">
                · Last updated{" "}
                {new Date(data.last_fetched).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Calculating forecast…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="card px-5 py-4 flex items-start gap-3 border-l-4 border-l-red-400">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-800">Failed to load forecast</p>
            <p className="text-xs text-gray-500 mt-0.5">{error}</p>
            <button
              onClick={() => load(from, to)}
              className="mt-2 text-xs text-[#D64D4D] hover:underline font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              label="PRODUCTIONS SCHEDULED"
              value={data.summary.productions_count}
              sub="with matched product & base units"
            />
            <StatCard
              label="INGREDIENTS REQUIRED"
              value={data.summary.ingredients_count}
              sub="unique materials"
            />
            <StatCard
              label="SHORTAGES"
              value={data.summary.shortage_count}
              accent={data.summary.shortage_count > 0 ? "red" : "green"}
              sub={
                data.summary.shortage_count > 0
                  ? "insufficient stock"
                  : "no shortages"
              }
            />
            <StatCard
              label="FULLY STOCKED"
              value={data.summary.sufficient_count}
              accent="green"
              sub="materials covered"
            />
            <StatCard
              label="NEEDS ATTENTION"
              value={data.summary.attention_count}
              accent={data.summary.attention_count > 0 ? "amber" : "green"}
              sub={
                data.summary.attention_count > 0
                  ? "units need attention"
                  : "all units compatible"
              }
            />
          </div>

          {/* No-unit-defined alert */}
          {noUnitDefinedIngredients.length > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800 mb-1">
                  {noUnitDefinedIngredients.length} material{noUnitDefinedIngredients.length !== 1 ? "s" : ""} missing a standard unit
                </p>
                <p className="text-xs text-red-700 mb-2">
                  These materials have no standard unit defined in the registry. Forecast totals
                  cannot be calculated until a unit is set.
                </p>
                <ul className="space-y-0.5">
                  {noUnitDefinedIngredients.map((ing) => (
                    <li key={ing.material_id}>
                      <Link
                        href={`/supplier-management/materials/${ing.material_id}/edit`}
                        className="text-xs font-medium text-red-700 underline hover:text-red-900"
                      >
                        {ing.material_name} — set unit →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Conversion note */}
          {data.ingredients.some((i) => i.unit_status === "converted") && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5 px-1">
              <span className="text-blue-400">ℹ</span>
              Some inventory quantities were converted to match the material's standard unit.
              Conversion notes are shown in the In Stock column.
            </p>
          )}

          {/* Empty state */}
          {data.summary.productions_count === 0 && (
            <div className="card px-5 py-10 text-center">
              <p className="text-sm text-gray-500">
                No productions scheduled in the selected date range. Check the
                production calendar or select a different window.
              </p>
            </div>
          )}

          {/* Ingredients table */}
          {data.ingredients.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">
                  Ingredient Requirements
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Click a row to see the breakdown by production
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-mono uppercase tracking-wide">
                        Material
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-mono uppercase tracking-wide">
                        Standard Unit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-mono uppercase tracking-wide">
                        Total Needed
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-mono uppercase tracking-wide">
                        In Stock
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-mono uppercase tracking-wide">
                        Surplus / Shortfall
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 font-mono uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ingredients.map((ing) => (
                      <IngredientRow
                        key={ing.material_id}
                        ingredient={ing}
                        expanded={expandedRows.has(ing.material_id)}
                        onToggle={() => toggleRow(ing.material_id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Productions breakdown */}
          <div className="card px-5 py-4">
            <h2 className="font-semibold text-gray-900 text-sm mb-3">
              Productions Breakdown
            </h2>

            {data.productions_included.length > 0 && (
              <div className="space-y-1 mb-4">
                {data.productions_included.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-gray-400 text-xs w-24 shrink-0 font-mono">
                      {p.day_label}
                    </span>
                    <span className="font-medium">{p.product_name}</span>
                    {p.base_unit_count && (
                      <span className="text-gray-500 text-xs">
                        ({p.base_unit_count}
                        {p.base_unit_label ? ` ${p.base_unit_label}` : ""})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.productions_excluded.length > 0 && (
              <>
                <p className="text-xs text-gray-400 font-mono uppercase tracking-wide mb-2">
                  Excluded — already submitted
                </p>
                <div className="space-y-1">
                  {data.productions_excluded.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm text-gray-400 line-through"
                    >
                      <span className="text-xs w-24 shrink-0 font-mono">{p.day_label}</span>
                      <span>{p.product_name}</span>
                      <span className="text-xs no-underline">[{p.reason}]</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {data.productions_included.length === 0 &&
              data.productions_excluded.length === 0 && (
                <p className="text-sm text-gray-400 italic">
                  No productions in this date range.
                </p>
              )}
          </div>
        </>
      )}
    </div>
  );
}
