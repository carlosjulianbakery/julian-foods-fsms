"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ForecastProduction,
  ForecastExcluded,
  WipAnalysisItem,
  PurchaseSupplierGroup,
} from "@/app/api/planning/ingredient-forecast/route";
import { formatQty, formatQtyUnit, formatDelta } from "@/lib/formatNumber";

// ─── Types ────────────────────────────────────────────────────────────────────

type WindowMode = "1week" | "2weeks" | "1month" | "custom";

interface SufficientItem {
  material_id: string;
  material_name: string;
  unit: string;
  total_needed: number;
  in_stock: number;
  surplus: number;
  supplier_name: string | null;
}

interface StatusEntry {
  product_id: string | null;
  production_date: string;
  status: string;
  submitted_at: string | null;
}

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

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "never";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

// ─── Same-week matching (mirrors the API's submission-matching logic) ──────────

function getWeekMonday(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

const FINISHED_STATUSES_CLIENT = new Set(["complete", "pass", "pass_with_issues", "fail"]);

function isNowSubmitted(prod: ForecastProduction, freshStatuses: StatusEntry[]): boolean {
  const scheduledWeekMonday = getWeekMonday(prod.iso_date);
  return freshStatuses.some((s) => {
    if (s.product_id !== prod.product_id) return false;
    if (!FINISHED_STATUSES_CLIENT.has(s.status.toLowerCase())) return false;
    return (
      s.production_date === prod.iso_date ||
      getWeekMonday(s.production_date) === scheduledWeekMonday
    );
  });
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
            : formatQty(ingredient.total_needed)}
        </td>
        <td className="px-4 py-3 text-sm font-mono">
          {ingredient.unit_status === "mismatch" ? (
            <span className="text-amber-600">
              {ingredient.in_stock_raw !== null ? formatQty(ingredient.in_stock_raw) : "—"}{" "}
              {ingredient.inventory_unit}
            </span>
          ) : ingredient.unit_status === "no_stock" ? (
            <span className="text-gray-400">—</span>
          ) : (
            <div>
              <span className="text-gray-800">
                {ingredient.in_stock_converted !== null
                  ? formatQty(ingredient.in_stock_converted)
                  : "—"}{" "}
                {displayUnit}
              </span>
              {ingredient.unit_status === "converted" &&
                ingredient.in_stock_raw !== null &&
                ingredient.inventory_unit && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    ({formatQty(ingredient.in_stock_raw)} {ingredient.inventory_unit} converted)
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
              {formatDelta(ingredient.surplus_or_shortfall, displayUnit)}
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
                          {formatQty(ec.quantity)} {ec.recipe_unit}
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
                    <tr key={i} className={`border-t ${b.distribution_label ? "bg-blue-50 border-blue-100" : "border-gray-200"}`}>
                      <td className="py-1.5 pr-4 text-gray-500">
                        {b.distribution_label ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                            Distribution
                          </span>
                        ) : b.day_label}
                      </td>
                      <td className="py-1.5 pr-4 text-gray-700">{b.product_name}</td>
                      <td className="py-1.5 pr-4 text-right font-mono text-gray-600">
                        {b.base_unit_count}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono text-gray-600">
                        {formatQty(b.qty_per_base_unit)} {b.recipe_unit}
                      </td>
                      <td className="py-1.5 text-right font-mono font-semibold text-gray-800">
                        <div>
                          {formatQty(b.total)} {b.unit}
                          {b.was_converted && (
                            <p className="text-[10px] text-gray-400 font-normal">
                              {formatQty(b.raw_total)} {b.recipe_unit} → {formatQty(b.total)} {b.unit}
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
                      {formatQtyUnit(ingredient.total_needed, ingredient.standard_unit ?? "")}
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
                            : formatQtyUnit(ingredient.in_stock_converted, ingredient.standard_unit ?? "")}
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
                            {formatDelta(ingredient.surplus_or_shortfall, ingredient.standard_unit ?? "")}
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
      ing.total_needed > 0 ? formatQty(ing.total_needed, "") : "",
      formatQty(ing.in_stock_converted, ""),
      ing.in_stock_raw !== null ? `${formatQty(ing.in_stock_raw)} ${ing.inventory_unit ?? ""}` : "",
      formatQty(ing.surplus_or_shortfall, ""),
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

// ─── Exclude confirm dialog ───────────────────────────────────────────────────

function ExcludeConfirm({
  production,
  onConfirm,
  onCancel,
}: {
  production: ForecastProduction;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    await onConfirm(reason);
    setBusy(false);
  }

  return (
    <div className="mt-1 p-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs space-y-2">
      <p className="text-gray-700 font-medium">
        Exclude <span className="text-gray-900">{production.product_name}</span> on{" "}
        {production.day_label} from the forecast?
      </p>
      <input
        type="text"
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#D64D4D]"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleConfirm}
          disabled={busy}
          className="px-2.5 py-1 bg-[#D64D4D] text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Excluding…" : "Exclude"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-2.5 py-1 text-gray-500 hover:text-gray-700 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── WIP coverage row (expandable) ───────────────────────────────────────────

function WipRow({
  wip,
  expanded,
  onToggle,
}: {
  wip: WipAnalysisItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColors: Record<WipAnalysisItem["wip_status"], string> = {
    sufficient: "text-emerald-700 bg-emerald-50 border-emerald-200",
    shortage: "text-red-700 bg-red-50 border-red-200",
    no_stock_data: "text-gray-600 bg-gray-50 border-gray-200",
  };
  const statusLabels: Record<WipAnalysisItem["wip_status"], string> = {
    sufficient: "Stocked",
    shortage: "Shortage",
    no_stock_data: "No Stock Data",
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900">{wip.wip_material_name}</span>
              <span
                className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusColors[wip.wip_status]}`}
              >
                {statusLabels[wip.wip_status]}
              </span>
              {wip.is_scheduled && (
                <span className="inline-flex text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                  Scheduled
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
              <span>
                Need:{" "}
                <span className="font-medium text-gray-700">
                  {formatQtyUnit(wip.total_needed, wip.wip_unit)}
                </span>
              </span>
              {wip.in_stock !== null && (
                <span>
                  Stock:{" "}
                  <span className="font-medium text-gray-700">
                    {formatQtyUnit(wip.in_stock, wip.wip_unit)}
                  </span>
                </span>
              )}
              {wip.bowls_needed !== null && (
                <span>
                  Bowls to make:{" "}
                  <span className="font-medium text-gray-700">{formatQty(wip.bowls_needed)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-2 bg-gray-50 border-t border-gray-100">
          {wip.is_scheduled && wip.scheduled_dates.length > 0 && (
            <p className="text-xs text-blue-600 mb-3">
              Scheduled on:{" "}
              {wip.scheduled_dates.map((d) => fmtDisplay(d)).join(", ")}
            </p>
          )}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Raw Ingredients Needed ({wip.bowls_needed !== null ? `${formatQty(wip.bowls_needed)} bowls` : "bowls unknown"})
          </p>
          {wip.raw_ingredients.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No recipe ingredients found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 font-mono uppercase tracking-wide">
                    <th className="text-left pb-1.5 pr-4">Ingredient</th>
                    <th className="text-right pb-1.5 pr-4">Needed</th>
                    <th className="text-right pb-1.5 pr-4">In Stock</th>
                    <th className="text-right pb-1.5 pr-4">Surplus / Short</th>
                    <th className="text-left pb-1.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {wip.raw_ingredients.map((ri) => (
                    <tr key={ri.material_id} className="text-gray-700">
                      <td className="py-1.5 pr-4">{ri.material_name}</td>
                      <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                        {formatQtyUnit(ri.qty_needed, ri.unit)}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                        {ri.in_stock !== null ? formatQtyUnit(ri.in_stock, ri.unit) : "—"}
                      </td>
                      <td
                        className={`py-1.5 pr-4 text-right font-mono tabular-nums font-semibold ${
                          ri.surplus_or_shortfall === null
                            ? "text-gray-400"
                            : ri.surplus_or_shortfall >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {ri.surplus_or_shortfall !== null
                          ? formatDelta(ri.surplus_or_shortfall, ri.unit)
                          : "—"}
                      </td>
                      <td className="py-1.5">
                        {ri.status === "sufficient" && (
                          <span className="text-emerald-600 font-medium">OK</span>
                        )}
                        {ri.status === "shortage" && (
                          <span className="text-red-600 font-medium">Short</span>
                        )}
                        {ri.status === "unit_mismatch" && (
                          <span className="text-amber-600">Mismatch</span>
                        )}
                        {ri.status === "no_stock_data" && (
                          <span className="text-gray-400">No data</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Purchase list group row ───────────────────────────────────────────────────

function PurchaseGroupRow({ group, forecastFrom, forecastTo }: {
  group: PurchaseSupplierGroup;
  forecastFrom?: string;
  forecastTo?: string;
}) {
  const logPOHref = (() => {
    const items = group.items.map((it) => ({
      materialId: it.material_id ?? "",
      materialName: it.material_name,
      qtyOrdered: it.qty_to_buy,
      unit: it.unit,
      source: it.source === "section_a" ? "direct" : "wip",
      wipMaterialName: it.wip_name ?? "",
    }));
    const params = new URLSearchParams();
    if (group.supplier_id) params.set("supplierId", group.supplier_id);
    if (forecastFrom) params.set("forecastFrom", forecastFrom);
    if (forecastTo) params.set("forecastTo", forecastTo);
    params.set("items", encodeURIComponent(JSON.stringify(items)));
    return `/dashboard/admin/purchasing/purchase-orders/new?${params.toString()}`;
  })();

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-semibold text-gray-800">{group.supplier_name}</p>
          {!group.supplier_id && (
            <span className="text-xs text-gray-400">(no supplier assigned)</span>
          )}
        </div>
        <Link
          href={logPOHref}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium transition-colors shrink-0"
        >
          Log PO →
        </Link>
      </div>
      <div className="space-y-1.5">
        {group.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
            <span className="flex-1 min-w-0 truncate">{item.material_name}</span>
            <span className="tabular-nums font-semibold text-gray-900 shrink-0">
              {formatQtyUnit(item.qty_to_buy, item.unit)}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 border ${
                item.source === "section_a"
                  ? "bg-orange-50 text-orange-700 border-orange-200"
                  : "bg-purple-50 text-purple-700 border-purple-200"
              }`}
            >
              {item.source === "section_a" ? "Direct" : `WIP: ${item.wip_name ?? ""}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sufficient items helpers ─────────────────────────────────────────────────

function buildSufficientItems(data: ForecastData): SufficientItem[] {
  const seen = new Map<string, SufficientItem>();

  for (const ing of data.ingredients) {
    if (ing.forecast_status !== "sufficient") continue;
    seen.set(ing.material_id, {
      material_id: ing.material_id,
      material_name: ing.material_name,
      unit: ing.standard_unit ?? "",
      total_needed: ing.total_needed,
      in_stock: ing.in_stock_converted ?? 0,
      surplus: ing.surplus_or_shortfall ?? 0,
      supplier_name: ing.supplier_name,
    });
  }

  for (const wip of data.wip_analysis) {
    for (const ri of wip.raw_ingredients) {
      if (ri.status !== "sufficient") continue;
      if (seen.has(ri.material_id)) continue;
      seen.set(ri.material_id, {
        material_id: ri.material_id,
        material_name: ri.material_name,
        unit: ri.unit,
        total_needed: ri.qty_needed,
        in_stock: ri.in_stock ?? 0,
        surplus: ri.surplus_or_shortfall ?? 0,
        supplier_name: ri.supplier_name,
      });
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.material_name.localeCompare(b.material_name)
  );
}

// ─── Sufficient items collapsible section ─────────────────────────────────────

function SufficientSection({ items }: { items: SufficientItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full text-left px-5 py-3 flex items-center gap-2 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>
          Sufficient stock ({items.length} ingredient{items.length !== 1 ? "s" : ""}) — no order needed
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 bg-emerald-50/60">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-emerald-700 font-mono uppercase tracking-wide border-b border-emerald-100">
                  <th className="text-left pb-2 pr-4">Material</th>
                  <th className="text-left pb-2 pr-4">Supplier</th>
                  <th className="text-right pb-2 pr-4">Needed</th>
                  <th className="text-right pb-2 pr-4">In Stock</th>
                  <th className="text-right pb-2">Surplus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100">
                {items.map((item) => (
                  <tr key={item.material_id} className="text-gray-700">
                    <td className="py-2 pr-4 font-medium">{item.material_name}</td>
                    <td className="py-2 pr-4 text-gray-500">{item.supplier_name ?? "—"}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">
                      {formatQtyUnit(item.total_needed, item.unit)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">
                      {formatQtyUnit(item.in_stock, item.unit)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums font-semibold text-emerald-600">
                      +{formatQtyUnit(item.surplus, item.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Purchase list PDF export ─────────────────────────────────────────────────

function exportPurchasePdf(
  data: ForecastData,
  includeSufficient: boolean,
  sufficientItems: SufficientItem[]
) {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
  };
  const now = new Date();
  const generatedDate = now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const generatedTime =
    now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Los_Angeles",
    }) + " Pacific";

  // Combine items by material within each supplier group
  type CombinedMat = { name: string; qty: number; unit: string };
  const supplierBlocks = data.purchase_list.map((group) => {
    const combined = new Map<string, CombinedMat>();
    for (const item of group.items) {
      const ex = combined.get(item.material_id);
      if (ex) {
        ex.qty += item.qty_to_buy;
      } else {
        combined.set(item.material_id, {
          name: item.material_name,
          qty: item.qty_to_buy,
          unit: item.unit,
        });
      }
    }
    return {
      supplier_id: group.supplier_id,
      supplier_name: group.supplier_name,
      materials: Array.from(combined.values()),
    };
  });

  const knownGroups = supplierBlocks.filter((g) => g.supplier_id);
  const unknownGroups = supplierBlocks.filter((g) => !g.supplier_id);
  const totalItems = data.purchase_list.reduce((s, g) => s + g.items.length, 0);
  const totalSuppliers = knownGroups.length;

  const rowsBg = (i: number) => (i % 2 === 0 ? "#ffffff" : "#F9FAFB");
  const tableRows = (mats: CombinedMat[]) =>
    mats
      .map(
        (m, i) =>
          `<tr style="background:${rowsBg(i)}">
            <td style="padding:9px 14px;border-bottom:1px solid #E5E7EB;font-size:13px">${m.name}</td>
            <td style="padding:9px 14px;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;text-align:right;white-space:nowrap">${formatQtyUnit(m.qty, m.unit)}</td>
          </tr>`
      )
      .join("");

  const supplierSections = knownGroups
    .map(
      (g) =>
        `<div style="margin-bottom:20px;break-inside:avoid">
          <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:4px;overflow:hidden">
            <thead>
              <tr style="background:#FEF2F2;border-bottom:2px solid #D64D4D">
                <th colspan="2" style="padding:9px 14px;text-align:left;font-size:14px;font-weight:700;color:#111827">${g.supplier_name}</th>
              </tr>
            </thead>
            <tbody>${tableRows(g.materials)}</tbody>
          </table>
        </div>`
    )
    .join("");

  const noSupplierMats = unknownGroups.flatMap((g) => g.materials);
  const noSupplierSection =
    noSupplierMats.length > 0
      ? `<div style="margin-bottom:20px;break-inside:avoid">
          <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:4px;padding:10px 14px;margin-bottom:8px">
            <div style="font-weight:700;color:#92400E;font-size:13px">⚠ No Supplier Assigned</div>
            <div style="font-size:11px;color:#92400E;margin-top:2px">Please assign a supplier in the Materials registry</div>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #FCD34D;border-radius:4px;overflow:hidden">
            <tbody>${noSupplierMats
              .map(
                (m, i) =>
                  `<tr style="background:${i % 2 === 0 ? "#fff" : "#FFFBEB"}">
                    <td style="padding:9px 14px;border-bottom:1px solid #FDE68A;font-size:13px">${m.name}</td>
                    <td style="padding:9px 14px;border-bottom:1px solid #FDE68A;font-size:13px;font-weight:700;text-align:right">${formatQtyUnit(m.qty, m.unit)}</td>
                  </tr>`
              )
              .join("")}</tbody>
          </table>
        </div>`
      : "";

  const sufficientSection =
    includeSufficient && sufficientItems.length > 0
      ? `<div style="margin-top:36px;break-before:avoid">
          <div style="font-size:13px;font-weight:700;color:#065F46;border-bottom:2px solid #059669;padding-bottom:8px;margin-bottom:14px;letter-spacing:0.04em">
            SUFFICIENT STOCK — NO ORDER NEEDED
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #D1FAE5;border-radius:4px;overflow:hidden">
            <thead>
              <tr style="background:#ECFDF5;border-bottom:1px solid #D1FAE5">
                <th style="padding:7px 12px;text-align:left;font-size:10px;font-family:monospace;color:#065F46">MATERIAL</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;font-family:monospace;color:#065F46">SUPPLIER</th>
                <th style="padding:7px 12px;text-align:right;font-size:10px;font-family:monospace;color:#065F46">NEEDED</th>
                <th style="padding:7px 12px;text-align:right;font-size:10px;font-family:monospace;color:#065F46">IN STOCK</th>
                <th style="padding:7px 12px;text-align:right;font-size:10px;font-family:monospace;color:#065F46">SURPLUS</th>
              </tr>
            </thead>
            <tbody>
              ${sufficientItems
                .map(
                  (item, i) =>
                    `<tr style="background:${i % 2 === 0 ? "#fff" : "#F0FDF4"}">
                      <td style="padding:7px 12px;border-bottom:1px solid #D1FAE5;font-size:12px">${item.material_name}</td>
                      <td style="padding:7px 12px;border-bottom:1px solid #D1FAE5;font-size:12px;color:#6B7280">${item.supplier_name ?? "—"}</td>
                      <td style="padding:7px 12px;border-bottom:1px solid #D1FAE5;font-size:12px;text-align:right;font-family:monospace">${formatQtyUnit(item.total_needed, item.unit)}</td>
                      <td style="padding:7px 12px;border-bottom:1px solid #D1FAE5;font-size:12px;text-align:right;font-family:monospace">${formatQtyUnit(item.in_stock, item.unit)}</td>
                      <td style="padding:7px 12px;border-bottom:1px solid #D1FAE5;font-size:12px;text-align:right;font-family:monospace;color:#059669;font-weight:700">+${formatQtyUnit(item.surplus, item.unit)}</td>
                    </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`
      : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>purchase-list-${data.date_from}-${data.date_to}</title>
<style>
  body { font-family: Georgia, serif; margin: 32px; color: #111827; }
  @media print { body { margin: 16px; } }
</style>
</head>
<body>
<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:24px;border-bottom:2px solid #D64D4D;padding-bottom:16px">
  <div style="width:40px;height:40px;background:#D64D4D;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="24" height="24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </div>
  <div>
    <div style="font-size:16px;font-weight:700;color:#111827">Julian Bakery</div>
    <div style="font-size:22px;font-weight:700;color:#111827;margin-top:2px">Purchase List</div>
    <div style="font-size:11px;color:#6B7280;margin-top:6px">Forecast period: ${fmt(data.date_from)} — ${fmt(data.date_to)}</div>
    <div style="font-size:11px;color:#6B7280">Generated: ${generatedDate} at ${generatedTime}</div>
  </div>
</div>

${supplierSections}
${noSupplierSection}
${sufficientSection}

<div style="margin-top:40px;border-top:1px solid #E5E7EB;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#9CA3AF;font-family:monospace">
  <span>Julian Bakery Food Safety Management System</span>
  <span>Total: ${totalItems} item${totalItems !== 1 ? "s" : ""} from ${totalSuppliers} supplier${totalSuppliers !== 1 ? "s" : ""}</span>
</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ─── Purchase list CSV export ─────────────────────────────────────────────────

function exportPurchaseCsv(purchaseList: PurchaseSupplierGroup[]) {
  const header = ["Supplier", "Material", "Qty to Buy", "Unit", "Source", "WIP Name"];
  const rows: string[][] = [header];
  for (const group of purchaseList) {
    for (const item of group.items) {
      rows.push([
        group.supplier_name,
        item.material_name,
        formatQty(item.qty_to_buy),
        item.unit,
        item.source === "section_a" ? "Direct Shortage" : "WIP Ingredient",
        item.wip_name ?? "",
      ]);
    }
  }
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "purchase-list.csv";
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
  const [expandedWipRows, setExpandedWipRows] = useState<Set<string>>(new Set());
  const [includeSufficientInPdf, setIncludeSufficientInPdf] = useState(false);
  const [logPOSupplier, setLogPOSupplier] = useState<{ id: string | null; name: string } | null>(null);

  const sufficientItems = useMemo(
    () => (data ? buildSufficientItems(data) : []),
    [data]
  );

  // Key = `${product_id}:${iso_date}` — which row has the confirm dialog open
  const [confirmingExclude, setConfirmingExclude] = useState<string | null>(null);
  // Tracks which exclusion IDs are currently being re-included (loading state)
  const [reincludingIds, setReincludingIds] = useState<Set<string>>(new Set());

  // Status polling state
  const [statusPolledAt, setStatusPolledAt] = useState<string | null>(null);
  // Keys that just transitioned to "submitted" — shown with green flash for 2 seconds
  const [newlyExcludedKeys, setNewlyExcludedKeys] = useState<Set<string>>(new Set());
  // Tick counter to force "X min ago" labels to re-render every minute
  const [tick, setTick] = useState(0);

  // Stable refs for the current date range (used inside the poll interval)
  const { from, to } = computeDateRange(mode, customFrom, customTo);
  const dateRangeRef = useRef({ from, to });
  useEffect(() => { dateRangeRef.current = { from, to }; }, [from, to]);

  // Stable ref to current included productions (used in poll to detect changes)
  const includedRef = useRef<ForecastProduction[]>([]);
  useEffect(() => { if (data) includedRef.current = data.productions_included; }, [data]);

  // ── Full forecast load ────────────────────────────────────────────────────────
  const load = useCallback(
    async (fromDate: Date, toDate: Date, opts: { forceRefreshSheets?: boolean; silent?: boolean } = {}) => {
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams({
          date_from: toMmDdYyyy(toIsoStr(fromDate)),
          date_to:   toMmDdYyyy(toIsoStr(toDate)),
        });
        if (opts.forceRefreshSheets) params.set("refresh", "true");

        const res = await fetch(`/api/planning/ingredient-forecast?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ForecastData = await res.json();

        if (!opts.silent) {
          setExpandedRows(new Set());
          setConfirmingExclude(null);
        }
        setData(json);
      } catch (e) {
        if (!opts.silent) {
          setError(e instanceof Error ? e.message : "Failed to load forecast");
        } else {
          console.error("[forecast poll] load failed:", e);
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    []
  );

  // ── 60-second status poll ─────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      const { from: f, to: t } = dateRangeRef.current;
      const params = new URLSearchParams({
        date_from: toIsoStr(f),
        date_to:   toIsoStr(t),
      });
      try {
        const res = await fetch(`/api/planning/forecast-submission-status?${params}`);
        if (!res.ok) return; // silent failure
        const json: { submissions: StatusEntry[]; fetched_at: string } = await res.json();
        setStatusPolledAt(json.fetched_at);

        // Check if any currently-included production is now submitted
        const currentIncluded = includedRef.current;
        const newlyDone = currentIncluded.filter((p) => isNowSubmitted(p, json.submissions));

        if (newlyDone.length > 0) {
          // Mark keys for green flash
          const keys = new Set(newlyDone.map((p) => `${p.product_id}:${p.iso_date}`));
          setNewlyExcludedKeys(keys);
          // Full reload using cached sheets — just refreshes submission statuses
          await load(f, t, { silent: true });
          // Clear flash after 2.5 seconds
          setTimeout(() => setNewlyExcludedKeys(new Set()), 2500);
        }
      } catch {
        // Silent — don't surface polling errors to the user
      }
    };

    const pollInterval = setInterval(poll, 60_000);
    // Tick to refresh "X min ago" labels every 60 seconds
    const tickInterval = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
    };
  }, [load]);

  async function handleExclude(prod: ForecastProduction, reason: string) {
    await fetch("/api/planning/forecast-exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productionDate: prod.iso_date,
        productName: prod.product_name,
        productId: prod.product_id,
        baseUnitCount: prod.base_unit_count,
        reason: reason.trim() || undefined,
      }),
    });
    await load(from, to);
  }

  async function handleReinclude(exclusionId: string) {
    setReincludingIds((prev) => new Set(prev).add(exclusionId));
    await fetch(`/api/planning/forecast-exclusions/${exclusionId}`, { method: "DELETE" });
    await load(from, to);
    setReincludingIds((prev) => {
      const next = new Set(prev);
      next.delete(exclusionId);
      return next;
    });
  }

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

  function toggleWipRow(wipMaterialId: string) {
    setExpandedWipRows((prev) => {
      const next = new Set(prev);
      if (next.has(wipMaterialId)) next.delete(wipMaterialId);
      else next.add(wipMaterialId);
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

  // Suppress tick lint warning — used to re-render relative timestamps
  void tick;

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
                onClick={() => load(from, to, { forceRefreshSheets: true })}
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
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-xs text-gray-400">
              Showing:{" "}
              <span className="text-gray-600 font-medium">
                {fmtDisplay(data.date_from)} — {fmtDisplay(data.date_to)}
              </span>
            </p>
            <p className="text-xs text-gray-400">
              Schedule: last updated{" "}
              <span className="text-gray-500">{relativeTime(data.sheet_fetched_at)}</span>
            </p>
            <p className="text-xs text-gray-400">
              Production status:{" "}
              <span className="text-emerald-600 font-medium">
                live
              </span>
              {statusPolledAt && (
                <span className="text-gray-400">
                  {" · "}checked {relativeTime(statusPolledAt)}
                </span>
              )}
              {!statusPolledAt && (
                <span className="text-gray-400"> · updates every 60s</span>
              )}
            </p>
          </div>
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
          {/* Distribution data unavailable warning */}
          {data.distribution_unavailable && (
            <div className="card p-4 border-l-4 border-l-amber-500 bg-amber-50">
              <p className="text-sm font-semibold text-amber-800">
                ⚠ Distribution data could not be loaded
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Showing production schedule needs only. Distribution requirements are not included in ingredient totals.
              </p>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              label="PRODUCTIONS SCHEDULED"
              value={data.summary.productions_count}
              sub={
                data.summary.manually_excluded_count > 0
                  ? `(${data.summary.manually_excluded_count} manually excluded)`
                  : "with matched product & base units"
              }
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

          {/* Section B: WIP Coverage Analysis */}
          {data.wip_analysis.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">
                  WIP / Pre-Mix Coverage
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  WIP materials needed for this forecast — stock check and raw ingredient requirements
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {data.wip_analysis.map((wip) => (
                  <WipRow
                    key={wip.wip_material_id}
                    wip={wip}
                    expanded={expandedWipRows.has(wip.wip_material_id)}
                    onToggle={() => toggleWipRow(wip.wip_material_id)}
                  />
                ))}
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
                {data.productions_included.map((p, i) => {
                  const key = `${p.product_id}:${p.iso_date}`;
                  const isConfirming = confirmingExclude === key;
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
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
                        <button
                          onClick={() =>
                            setConfirmingExclude(isConfirming ? null : key)
                          }
                          className="ml-auto text-[11px] text-gray-400 hover:text-gray-600 shrink-0"
                        >
                          {isConfirming ? "Cancel" : "Exclude from forecast"}
                        </button>
                      </div>
                      {isConfirming && (
                        <ExcludeConfirm
                          production={p}
                          onConfirm={(reason) => handleExclude(p, reason)}
                          onCancel={() => setConfirmingExclude(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Already-submitted excluded */}
            {data.productions_excluded.filter((e) => e.exclusion_id === null).length > 0 && (
              <>
                <p className="text-xs text-gray-400 font-mono uppercase tracking-wide mb-2">
                  Excluded — already submitted
                </p>
                <div className="space-y-1 mb-4">
                  {data.productions_excluded
                    .filter((e) => e.exclusion_id === null)
                    .map((p, i) => {
                      const key = `${p.product_id}:${p.iso_date}`;
                      const isNew = newlyExcludedKeys.has(key);
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 text-sm text-gray-400 line-through rounded transition-colors duration-700 ${
                            isNew ? "bg-green-50 text-green-700" : ""
                          }`}
                        >
                          <span className="text-xs w-24 shrink-0 font-mono">{p.day_label}</span>
                          <span>{p.product_name}</span>
                          {isNew && (
                            <span className="text-[10px] font-medium text-green-600 no-underline ml-1">
                              ✓ just submitted
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </>
            )}

            {/* Manually excluded */}
            {data.productions_excluded.filter((e) => e.exclusion_id !== null).length > 0 && (
              <>
                <p className="text-xs text-gray-400 font-mono uppercase tracking-wide mb-2">
                  Excluded — manually
                </p>
                <div className="space-y-1">
                  {data.productions_excluded
                    .filter((e): e is ForecastExcluded & { exclusion_id: string } =>
                      e.exclusion_id !== null
                    )
                    .map((p, i) => {
                      const busy = reincludingIds.has(p.exclusion_id);
                      return (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <div className="flex items-center gap-2 text-gray-400 line-through flex-1 min-w-0">
                            <span className="text-xs w-24 shrink-0 font-mono no-underline">
                              {p.day_label}
                            </span>
                            <span>{p.product_name}</span>
                            {p.reason && p.reason !== "Manually excluded" && (
                              <span className="text-xs no-underline text-gray-400 truncate">
                                — {p.reason}
                              </span>
                            )}
                          </div>
                          <span className="inline-flex items-center text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-1.5 py-0.5 shrink-0 no-underline">
                            Excluded
                          </span>
                          <button
                            onClick={() => handleReinclude(p.exclusion_id)}
                            disabled={busy}
                            className="text-[11px] text-[#D64D4D] hover:underline shrink-0 disabled:opacity-50"
                          >
                            {busy ? "…" : "Re-include"}
                          </button>
                        </div>
                      );
                    })}
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

          {/* Section C: Purchase List */}
          {data.purchase_list.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900 text-sm">Purchase List</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Items to order, grouped by supplier
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        exportPurchasePdf(data, includeSufficientInPdf, sufficientItems)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Export PDF
                    </button>
                    <button
                      onClick={() => exportPurchaseCsv(data.purchase_list)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>
                </div>
                {sufficientItems.length > 0 && (
                  <label className="flex items-center gap-2 mt-3 cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      checked={includeSufficientInPdf}
                      onChange={(e) => setIncludeSufficientInPdf(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#D64D4D]"
                    />
                    <span className="text-xs text-gray-500">
                      Include sufficient items in PDF export
                    </span>
                  </label>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {data.purchase_list.map((group) => (
                  <PurchaseGroupRow
                    key={group.supplier_id ?? "~unknown~"}
                    group={group}
                    forecastFrom={toIsoStr(from)}
                    forecastTo={toIsoStr(to)}
                  />
                ))}
              </div>
              {sufficientItems.length > 0 && (
                <SufficientSection items={sufficientItems} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
