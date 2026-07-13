"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Package, Truck, BarChart2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { TabBar } from "@/components/ui/TabBar";
import type {
  DistributionData,
  DistributionPO,
  ProductSummary,
  DemandVelocity,
  DataHealth,
} from "@/app/api/distribution/data/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtRelTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  return `${m} min ago`;
}

function daysLabel(n: number | null | undefined) {
  if (n == null) return null;
  if (n < 0) return { text: `${Math.abs(n)}d overdue`, cls: "text-red-600 font-semibold" };
  if (n === 0) return { text: "Due today", cls: "text-amber-600 font-semibold" };
  if (n <= 7) return { text: `${n}d away`, cls: "text-red-500" };
  if (n <= 14) return { text: `${n}d away`, cls: "text-amber-500" };
  return { text: `${n}d away`, cls: "text-green-600" };
}

// ─── Summary tile ──────────────────────────────────────────────────────────────

function Tile({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: number | string;
  accent?: "red" | "amber" | "blue" | "green" | "gray";
  sub?: string;
}) {
  const valueClass =
    accent === "red"
      ? "text-red-600"
      : accent === "amber"
      ? "text-amber-600"
      : accent === "blue"
      ? "text-blue-600"
      : accent === "green"
      ? "text-green-600"
      : "text-gray-900";
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 font-mono mb-1 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── FSMS match badge ──────────────────────────────────────────────────────────

function MatchBadge({
  status,
  name,
}: {
  status: "matched" | "unmatched_upc";
  name?: string | null;
}) {
  if (status === "matched") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
        ✓ {name ?? "Matched"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
      ✗ No UPC match
    </span>
  );
}

// ─── Needed badge ──────────────────────────────────────────────────────────────

function NeededBadge({ needed }: { needed: number }) {
  if (needed > 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
        ⚠ Produce {needed.toLocaleString()} units
      </span>
    );
  if (needed < 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
        ✓ Surplus {Math.abs(needed).toLocaleString()} units
      </span>
    );
  return <span className="text-xs text-gray-400">No change needed</span>;
}

// ─── Tab 1: Pending Orders ─────────────────────────────────────────────────────

function PendingOrdersTab({
  pos,
}: {
  pos: DistributionPO[];
}) {
  const [groupBy, setGroupBy] = useState<"po" | "product">("po");
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const pendingPOs = pos
    .filter((po) => po.status === "pending")
    .sort((a, b) => {
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return a.target_date.localeCompare(b.target_date);
    });

  const togglePO = (id: string) => {
    setExpandedPOs((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleProduct = (upc: string) => {
    setExpandedProducts((prev) => {
      const n = new Set(prev);
      n.has(upc) ? n.delete(upc) : n.add(upc);
      return n;
    });
  };

  // Build product-grouped view
  const productGroupMap = new Map<
    string,
    {
      upc: string;
      product_name: string;
      product_type: string;
      match_status: "matched" | "unmatched_upc";
      fsms_presentation_name: string | null;
      total_units: number;
      pos: Array<{
        po_number: string;
        customer_name: string;
        units: number;
        target_date: string | null;
        days_until: number | null;
      }>;
    }
  >();

  for (const po of pendingPOs) {
    for (const item of po.items) {
      if (!productGroupMap.has(item.upc)) {
        productGroupMap.set(item.upc, {
          upc: item.upc,
          product_name: item.product_name,
          product_type: item.product_type,
          match_status: item.match_status,
          fsms_presentation_name: item.fsms_presentation_name,
          total_units: 0,
          pos: [],
        });
      }
      const g = productGroupMap.get(item.upc)!;
      g.total_units += item.units;
      const earliest = po.target_date;
      const existingIdx = g.pos.findIndex((p) => p.po_number === po.po_number);
      if (existingIdx === -1) {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
        const d = earliest
          ? Math.round((new Date(earliest + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000)
          : null;
        g.pos.push({
          po_number: po.po_number,
          customer_name: po.customer_name,
          units: item.units,
          target_date: earliest,
          days_until: d,
        });
      }
    }
  }

  const productGroups = Array.from(productGroupMap.values()).sort(
    (a, b) => b.total_units - a.total_units
  );

  if (pendingPOs.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-gray-400">
        No pending orders found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setGroupBy("po")}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium border transition-colors",
            groupBy === "po"
              ? "bg-brand-600 text-white border-brand-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          )}
        >
          Group by PO
        </button>
        <button
          onClick={() => setGroupBy("product")}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium border transition-colors",
            groupBy === "product"
              ? "bg-brand-600 text-white border-brand-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          )}
        >
          Group by Product
        </button>
      </div>

      {/* Group by PO */}
      {groupBy === "po" && (
        <div className="space-y-3">
          {pendingPOs.map((po) => {
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
            const dUntil = po.target_date
              ? Math.round((new Date(po.target_date + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000)
              : null;
            const dl = daysLabel(dUntil);
            const totalUnits = po.items.reduce((s, i) => s + i.units, 0);
            const expanded = expandedPOs.has(po.po_number);

            return (
              <div key={po.po_number} className="card overflow-hidden">
                <button
                  className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                  onClick={() => togglePO(po.po_number)}
                >
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-gray-900 font-mono">{po.po_number}</span>
                      <span className="text-sm text-gray-600">{po.customer_name || "—"}</span>
                      {po.target_date && (
                        <span className="text-sm text-gray-500">
                          Target: {fmtDate(po.target_date)}
                        </span>
                      )}
                      {dl && (
                        <span className={`text-xs ${dl.cls}`}>{dl.text}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{po.items.length} product{po.items.length !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>{totalUnits.toLocaleString()} units total</span>
                    </div>
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {["Product", "UPC", "Units", "FSMS Match"].map((h) => (
                            <th
                              key={h}
                              className="text-left px-4 py-2 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {po.items.map((item) => (
                          <tr key={item.upc} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-900 font-medium">{item.product_name}</td>
                            <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">{item.upc}</td>
                            <td className="px-4 py-2.5 font-mono text-gray-700">{item.units.toLocaleString()}</td>
                            <td className="px-4 py-2.5">
                              <MatchBadge
                                status={item.match_status}
                                name={item.fsms_presentation_name}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Group by Product */}
      {groupBy === "product" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Product", "UPC", "NEEDED", "Pending POs", "Next Target", "Total Units", "FSMS Match"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productGroups.map((g) => {
                  const expanded = expandedProducts.has(g.upc);
                  const nextTarget = g.pos
                    .map((p) => p.target_date)
                    .filter(Boolean)
                    .sort()[0];
                  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
                  const dUntil = nextTarget
                    ? Math.round((new Date(nextTarget + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000)
                    : null;
                  const dl = daysLabel(dUntil);

                  return (
                    <>
                      <tr
                        key={g.upc}
                        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleProduct(g.upc)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            {expanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            )}
                            <span>{g.product_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{g.upc}</td>
                        <td className="px-4 py-3">—</td>
                        <td className="px-4 py-3 font-mono text-gray-700">{g.pos.length}</td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="text-gray-700">{fmtDate(nextTarget)}</span>
                            {dl && <span className={`ml-2 text-xs ${dl.cls}`}>{dl.text}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-700">{g.total_units.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <MatchBadge status={g.match_status} name={g.fsms_presentation_name} />
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <td colSpan={7} className="px-8 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400 font-mono">
                                  <th className="text-left pb-1 pr-4">PO #</th>
                                  <th className="text-left pb-1 pr-4">Customer</th>
                                  <th className="text-right pb-1 pr-4">Units</th>
                                  <th className="text-left pb-1 pr-4">Target Date</th>
                                  <th className="text-left pb-1">Days until</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.pos.map((p) => {
                                  const dl2 = daysLabel(p.days_until);
                                  return (
                                    <tr key={p.po_number} className="border-t border-gray-200">
                                      <td className="py-1.5 pr-4 font-mono text-gray-600">{p.po_number}</td>
                                      <td className="py-1.5 pr-4 text-gray-700">{p.customer_name}</td>
                                      <td className="py-1.5 pr-4 text-right font-mono font-semibold text-gray-800">{p.units.toLocaleString()}</td>
                                      <td className="py-1.5 pr-4 text-gray-600">{fmtDate(p.target_date)}</td>
                                      <td className={`py-1.5 text-xs ${dl2?.cls ?? "text-gray-400"}`}>
                                        {dl2?.text ?? "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Completed Orders ───────────────────────────────────────────────────

function CompletedOrdersTab({ pos }: { pos: DistributionPO[] }) {
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [onTimeFilter, setOnTimeFilter] = useState<"" | "on_time" | "late">("");

  const shippedPOs = pos
    .filter((po) => po.status === "shipped")
    .sort((a, b) => {
      if (!a.shipping_date) return 1;
      if (!b.shipping_date) return -1;
      return b.shipping_date.localeCompare(a.shipping_date);
    });

  const customers = Array.from(new Set(shippedPOs.map((po) => po.customer_name).filter(Boolean))).sort();

  const filtered = shippedPOs.filter((po) => {
    if (search) {
      const s = search.toLowerCase();
      if (!po.po_number.toLowerCase().includes(s) && !po.customer_name.toLowerCase().includes(s))
        return false;
    }
    if (customerFilter && po.customer_name !== customerFilter) return false;
    if (onTimeFilter) {
      const late = po.target_date && po.shipping_date && po.shipping_date > po.target_date;
      if (onTimeFilter === "on_time" && late) return false;
      if (onTimeFilter === "late" && !late) return false;
    }
    return true;
  });

  const totalUnits = filtered.reduce((s, po) => s + po.items.reduce((si, i) => si + i.units, 0), 0);
  const avgFillSkus =
    filtered.filter((p) => p.fill_rate_skus != null).reduce((s, p) => s + (p.fill_rate_skus ?? 0), 0) /
    (filtered.filter((p) => p.fill_rate_skus != null).length || 1);

  function daysDiff(po: DistributionPO): number | null {
    if (!po.shipping_date || !po.target_date) return null;
    const a = new Date(po.shipping_date + "T00:00:00Z").getTime();
    const b = new Date(po.target_date + "T00:00:00Z").getTime();
    return Math.round((a - b) / 86400000);
  }

  const onTimePct =
    filtered.filter((po) => {
      const d = daysDiff(po);
      return d !== null && d <= 0;
    }).length /
    (filtered.length || 1);

  const avgDays =
    filtered
      .map(daysDiff)
      .filter((d): d is number => d !== null)
      .reduce((s, d) => s + d, 0) / (filtered.filter((p) => daysDiff(p) !== null).length || 1);

  if (shippedPOs.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-gray-400">
        No completed orders found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search customer or PO #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 w-56"
        />
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={onTimeFilter}
          onChange={(e) => setOnTimeFilter(e.target.value as "" | "on_time" | "late")}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All (on time + late)</option>
          <option value="on_time">On time only</option>
          <option value="late">Late only</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Ship Date", "Customer", "PO #", "Products", "Units", "PO Value", "Fill Rate %", "vs Target"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((po) => {
                const diff = daysDiff(po);
                const totalU = po.items.reduce((s, i) => s + i.units, 0);
                let diffEl = <span className="text-gray-400">—</span>;
                if (diff !== null) {
                  if (diff <= 0)
                    diffEl = (
                      <span className="text-green-600 font-semibold">
                        ✓ {diff === 0 ? "On time" : `${Math.abs(diff)}d early`}
                      </span>
                    );
                  else if (diff <= 3)
                    diffEl = <span className="text-amber-600">⚠ {diff}d late</span>;
                  else diffEl = <span className="text-red-600 font-semibold">✗ {diff}d late</span>;
                }

                return (
                  <tr key={po.po_number} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{fmtDate(po.shipping_date)}</td>
                    <td className="px-4 py-2.5 text-gray-900">{po.customer_name || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-600 text-xs">{po.po_number}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-600">{po.items.length}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-700">{totalU.toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-600">
                      {po.po_value != null ? `$${po.po_value.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-600">{fmtPct(po.fill_rate_skus)}</td>
                    <td className="px-4 py-2.5">{diffEl}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Summary footer */}
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 flex items-center gap-6 text-xs text-gray-500 flex-wrap">
          <span>
            <span className="font-semibold text-gray-700">{filtered.length}</span> completed POs
          </span>
          <span>
            <span className="font-semibold text-gray-700">{totalUnits.toLocaleString()}</span> units shipped
          </span>
          <span>
            Avg fill rate: <span className="font-semibold text-gray-700">{fmtPct(avgFillSkus)}</span>
          </span>
          <span>
            Avg vs target: <span className="font-semibold text-gray-700">{isFinite(avgDays) ? `${avgDays >= 0 ? "+" : ""}${avgDays.toFixed(1)}d` : "—"}</span>
          </span>
          <span>
            On time: <span className="font-semibold text-gray-700">{(onTimePct * 100).toFixed(0)}%</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 3: Products Summary ───────────────────────────────────────────────────

function ProductsSummaryTab({
  products,
  velocity,
}: {
  products: ProductSummary[];
  velocity: DemandVelocity[];
}) {
  const [unmatchedExpanded, setUnmatchedExpanded] = useState(false);
  const velByPresId = new Map(velocity.map((v) => [v.fsms_presentation_id, v]));

  const matched = products.filter((p) => p.match_status === "matched");
  const unmatched = products.filter((p) => p.match_status === "unmatched_upc");

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[
                  "Type",
                  "Product",
                  "UPC",
                  "NEEDED",
                  "Pending Units",
                  "In Stock (N/P)",
                  "Next Target",
                  "Dist. Weekly Avg",
                  "FSMS Match",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matched.map((p) => {
                const vel = p.fsms_presentation_id
                  ? velByPresId.get(p.fsms_presentation_id)
                  : undefined;
                const nextTarget = p.pending_pos
                  .map((pp) => pp.target_date)
                  .filter(Boolean)
                  .sort()[0];

                return (
                  <tr key={p.upc} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">{p.product_type || "—"}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.product_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.upc}</td>
                    <td className="px-4 py-3">
                      <NeededBadge needed={p.needed} />
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">{p.sum_units.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">
                      {p.in_stock_np != null ? p.in_stock_np.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(nextTarget)}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {vel ? `${vel.weekly_avg.toFixed(1)} /wk` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <MatchBadge
                        status={p.match_status}
                        name={p.fsms_presentation_name}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unmatched UPCs */}
      {unmatched.length > 0 && (
        <div className="card overflow-hidden">
          <button
            className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50"
            onClick={() => setUnmatchedExpanded((v) => !v)}
          >
            {unmatchedExpanded ? (
              <ChevronDown className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              {unmatched.length} product{unmatched.length !== 1 ? "s" : ""} have no FSMS match
            </span>
          </button>
          {unmatchedExpanded && (
            <div className="border-t border-gray-100 px-5 py-4">
              <p className="text-xs text-gray-500 mb-3">
                Add these UPCs to FSMS Products to enable matching and ingredient forecast integration.
              </p>
              <div className="space-y-2">
                {unmatched.map((p) => (
                  <div key={p.upc} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {p.upc}
                    </span>
                    <span className="text-gray-700">{p.product_name}</span>
                    <span className="text-xs text-gray-400">{p.product_type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Data Health ────────────────────────────────────────────────────────

function DataHealthTab({ health }: { health: DataHealth }) {
  const [matchedExpanded, setMatchedExpanded] = useState(false);
  const [expandedProductsOnly, setExpandedProductsOnly] = useState<Set<string>>(new Set());

  const s = health.summary;
  // Active issues = pending POs with no monthly match + monthly-only entries (need immediate attention)
  const activeIssues = (s.in_products_only_active ?? s.in_products_only) + s.in_monthly_only;
  const totalIssues = s.in_products_only + s.in_monthly_only;
  const scoreColor = s.health_score === 100 ? "green" : s.health_score >= 90 ? "amber" : "red";

  const toggleProductsOnly = (po: string) => {
    setExpandedProductsOnly((prev) => {
      const n = new Set(prev);
      n.has(po) ? n.delete(po) : n.add(po);
      return n;
    });
  };

  return (
    <div className="space-y-5">
      {/* Health score card */}
      <div
        className={cn(
          "card p-5 border-l-4",
          scoreColor === "green" && "border-l-green-500 bg-green-50",
          scoreColor === "amber" && "border-l-amber-500 bg-amber-50",
          scoreColor === "red" && "border-l-red-500 bg-red-50"
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "text-3xl font-bold font-mono",
              scoreColor === "green" && "text-green-700",
              scoreColor === "amber" && "text-amber-700",
              scoreColor === "red" && "text-red-700"
            )}
          >
            {s.health_score === 100 ? "✓" : s.health_score >= 90 ? "⚠" : "✗"} {s.health_score.toFixed(1)}%
          </div>
          <div>
            <p
              className={cn(
                "font-semibold",
                scoreColor === "green" && "text-green-800",
                scoreColor === "amber" && "text-amber-800",
                scoreColor === "red" && "text-red-800"
              )}
            >
              {s.health_score === 100
                ? "All active POs matched"
                : s.health_score >= 90
                ? `${activeIssues} PO${activeIssues !== 1 ? "s" : ""} need attention`
                : `${activeIssues} PO${activeIssues !== 1 ? "s" : ""} have significant mismatches`}
            </p>
            <p
              className={cn(
                "text-xs mt-0.5",
                scoreColor === "green" && "text-green-700",
                scoreColor === "amber" && "text-amber-700",
                scoreColor === "red" && "text-red-700"
              )}
            >
              {s.health_score === 100
                ? "Every active PO has a corresponding monthly tab entry and vice versa."
                : `${s.exactly_matched} exactly matched · ${s.format_mismatches} format issues · ${activeIssues} active mismatches${s.in_products_only_historical ? ` · ${s.in_products_only_historical} historical gaps` : ""}`}
            </p>
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          label="Exactly Matched"
          value={s.exactly_matched}
          accent="green"
          sub="In both tabs"
        />
        <Tile
          label="Products Tab Only"
          value={s.in_products_only}
          accent={(s.in_products_only_active ?? s.in_products_only) > 0 ? "red" : s.in_products_only > 0 ? "amber" : "gray"}
          sub={
            (s.in_products_only_active ?? 0) > 0
              ? `${s.in_products_only_active} active · ${s.in_products_only_historical ?? 0} historical`
              : s.in_products_only > 0
              ? `${s.in_products_only} historical gaps`
              : "None — all good"
          }
        />
        <Tile
          label="Monthly Tabs Only"
          value={s.in_monthly_only}
          accent={s.in_monthly_only > 0 ? "red" : "gray"}
          sub={s.in_monthly_only > 0 ? "No Products tab column" : "None — all good"}
        />
        <Tile
          label="Format Mismatches"
          value={s.format_mismatches}
          accent={s.format_mismatches > 0 ? "amber" : "gray"}
          sub={s.format_mismatches > 0 ? "Fixable formatting" : "None"}
        />
      </div>

      {/* Section 1a: Active gaps — in SUM formula, no monthly match (high priority) */}
      {health.in_products_only.filter((e) => e.in_sum_formula).length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-red-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="font-semibold text-red-800 text-sm">
                ⚠ Active gaps — in SUM formula but no monthly tab entry ({health.in_products_only.filter((e) => e.in_sum_formula).length})
              </span>
            </div>
            <p className="text-xs text-red-700 mt-1">
              These POs are pending (currently in the SUM formula) but have no entry in any monthly tab.
              Target date, shipping date, and PO value are unknown. Fix these first.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["PO #", "Col", "Customer (row 1)", "Issue"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {health.in_products_only.filter((e) => e.in_sum_formula).map((entry) => (
                  <tr key={entry.po_number} className="hover:bg-red-50/30">
                    <td className="px-4 py-2.5 font-mono text-gray-800 font-semibold">{entry.po_number}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{entry.col_letter}</td>
                    <td className="px-4 py-2.5 text-gray-700">{entry.customer_name_row1 || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs">{entry.possible_issue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 1b: Historical gaps — outside SUM, no monthly match (lower priority) */}
      {health.in_products_only.filter((e) => !e.in_sum_formula).length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-amber-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-semibold text-amber-800 text-sm">
                ℹ Historical gaps — shipped but no monthly tab entry ({health.in_products_only.filter((e) => !e.in_sum_formula).length})
              </span>
            </div>
            <p className="text-xs text-amber-700 mt-1">
              These POs were removed from the SUM formula (shipped) but have no entry in any monthly tab.
              They may be from a previous year&apos;s document or were completed before monthly tracking began.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["PO #", "Col", "Customer (row 1)", "Issue"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {health.in_products_only.filter((e) => !e.in_sum_formula).map((entry) => {
                  const expanded = expandedProductsOnly.has(entry.po_number);
                  return (
                    <tr
                      key={entry.po_number}
                      className="hover:bg-amber-50/30 cursor-pointer"
                      onClick={() => toggleProductsOnly(entry.po_number)}
                    >
                      <td className="px-4 py-2.5 font-mono text-gray-700">
                        <div className="flex items-center gap-1.5">
                          {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                          {entry.po_number}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{entry.col_letter}</td>
                      <td className="px-4 py-2.5 text-gray-700">{entry.customer_name_row1 || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs">{entry.possible_issue}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 2: Monthly tabs only */}
      {health.in_monthly_only.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-red-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="font-semibold text-red-800 text-sm">
                In Monthly Tabs Only ({health.in_monthly_only.length})
              </span>
            </div>
            <p className="text-xs text-red-700 mt-1">
              These POs appear in a monthly tab but have no column in the Products tab. The unit breakdown per product is unknown.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["PO #", "Customer", "Monthly Tab", "Target Date", "Ship Date", "PO Value", "Issue"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {health.in_monthly_only.map((entry) => (
                  <tr key={entry.po_number} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-gray-800 font-semibold">{entry.po_number}</td>
                    <td className="px-4 py-2.5 text-gray-700">{entry.customer_name || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs italic">{entry.monthly_tab_source}</td>
                    <td className="px-4 py-2.5 text-gray-600">{fmtDate(entry.target_date)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{fmtDate(entry.shipping_date)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-600">
                      {entry.po_value != null ? `$${entry.po_value.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs">{entry.possible_issue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3: Format mismatches */}
      {health.format_mismatches.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-amber-50">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 text-base">🔧</span>
              <span className="font-semibold text-amber-800 text-sm">
                Format Mismatches ({health.format_mismatches.length})
              </span>
            </div>
            <p className="text-xs text-amber-700 mt-1">
              These POs likely refer to the same order but have slightly different formatting between
              the Products tab and monthly tabs (e.g. extra spaces, leading zeros).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Products Tab PO#", "Monthly Tab PO#", "Col", "Monthly Tab", "Suggestion"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {health.format_mismatches.map((entry) => (
                  <tr key={entry.products_tab_po} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-gray-800">{entry.products_tab_po}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-800">{entry.monthly_tab_po}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{entry.col_letter}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs italic">{entry.monthly_tab_source}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-xs">{entry.suggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-700">
              Fix these by making the PO number identical in both places — either update the Products tab column header (row 2) or the monthly tab Customer PO column (col C).
            </p>
          </div>
        </div>
      )}

      {/* Section 4: Matched POs (collapsed) */}
      <div className="card overflow-hidden">
        <button
          className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50"
          onClick={() => setMatchedExpanded((v) => !v)}
        >
          {matchedExpanded ? (
            <ChevronDown className="w-4 h-4 text-green-500 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-green-500 shrink-0" />
          )}
          <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-sm font-medium text-green-800">
            Matched POs ({health.matched_pos.length}) — all good, click to review
          </span>
        </button>
        {matchedExpanded && (
          <div className="border-t border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["PO #", "Customer", "Col", "Monthly Tab", "Status", "Target Date"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {health.matched_pos.map((entry) => (
                  <tr key={entry.po_number} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-gray-700 text-xs">{entry.po_number}</td>
                    <td className="px-4 py-2 text-gray-700">{entry.customer_name || "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{entry.col_letter}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 italic">{entry.monthly_tab_source}</td>
                    <td className="px-4 py-2">
                      {entry.status === "pending" ? (
                        <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">Pending</span>
                      ) : (
                        <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                          ✓ Shipped{entry.has_shipping_date ? "" : " (no date)"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600 text-xs">{fmtDate(entry.target_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function DistributionDataClient() {
  const [data, setData] = useState<DistributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "completed" | "products" | "health">("pending");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/distribution/data")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DistributionData) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Compute tab badges
  const healthIssues = data
    ? (data.data_health.summary.in_products_only_active ?? data.data_health.summary.in_products_only) +
      data.data_health.summary.in_monthly_only
    : 0;
  const healthFormatIssues = data ? data.data_health.summary.format_mismatches : 0;

  const TABS = [
    {
      id: "pending",
      label: "Pending Orders",
      badge: data ? data.summary.pending_pos : null,
      badgeVariant: "blue" as const,
    },
    {
      id: "completed",
      label: "Completed Orders",
      badge: data ? data.summary.shipped_pos : null,
      badgeVariant: "blue" as const,
    },
    { id: "products", label: "Products Summary" },
    {
      id: "health",
      label: "Data Health",
      badge: data
        ? healthIssues > 0
          ? healthIssues
          : healthFormatIssues > 0
          ? healthFormatIssues
          : "✓"
        : null,
      badgeVariant: data
        ? healthIssues > 0
          ? "red" as const
          : healthFormatIssues > 0
          ? "amber" as const
          : "green" as const
        : "green" as const,
    },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Distribution Data</h1>
          <p className="page-subtitle">Live data from Distribution Metrics 2026 Google Sheet</p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-gray-400">
              Last refreshed: {fmtRelTime(data.generatedAt)}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 border-l-4 border-l-red-500 bg-red-50">
          <p className="text-sm font-semibold text-red-800">Failed to load distribution data</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="card p-10 text-center text-sm text-gray-400">Loading distribution data…</div>
      )}

      {/* Main content */}
      {data && !loading && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Tile label="Open POs" value={data.summary.pending_pos} accent="blue" />
            <Tile
              label="Pending Units"
              value={data.summary.total_pending_units.toLocaleString()}
              accent="blue"
            />
            <Tile
              label="Need to Produce"
              value={`${data.summary.products_needing_production} products`}
              accent={data.summary.products_needing_production > 0 ? "red" : "gray"}
            />
            <Tile
              label="Overdue POs"
              value={data.summary.overdue_pos}
              accent={data.summary.overdue_pos > 0 ? "amber" : "gray"}
              sub={data.summary.overdue_pos > 0 ? "Past target date" : undefined}
            />
            <Tile
              label="Unmatched UPCs"
              value={data.summary.unmatched_upcs.length}
              accent={data.summary.unmatched_upcs.length > 0 ? "amber" : "gray"}
              sub={
                data.summary.unmatched_upcs.length > 0
                  ? "No FSMS product match"
                  : undefined
              }
            />
          </div>

          {/* Tabs */}
          <TabBar
            tabs={TABS}
            activeTab={activeTab}
            onChange={(t) => setActiveTab(t as "pending" | "completed" | "products" | "health")}
          />

          {/* Tab content */}
          {activeTab === "pending" && (
            <PendingOrdersTab pos={data.pos} />
          )}
          {activeTab === "completed" && (
            <CompletedOrdersTab pos={data.pos} />
          )}
          {activeTab === "products" && (
            <ProductsSummaryTab
              products={data.product_summary}
              velocity={data.demand_velocity}
            />
          )}
          {activeTab === "health" && (
            <DataHealthTab health={data.data_health} />
          )}
        </>
      )}
    </div>
  );
}
