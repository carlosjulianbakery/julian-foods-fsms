"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  AlertTriangle, Package, Truck, Info, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { TabBar } from "@/components/ui/TabBar";
import { BundleConfigTab } from "./BundleConfigTab";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SSProduct {
  id: string;
  shipstationProductId: string;
  name: string;
  sku: string | null;
  upc: string | null;
  isBundle: boolean;
  isActive: boolean;
  configStatus: string;
  ignoredReason: string | null;
  fsmsPresentationId: string | null;
  fsmsProductId: string | null;
  fsmsProductName: string | null;
  fsmsPresentationName: string | null;
  totalShipped: number;
  // Raw SS bundle components (from aliases during sync)
  components: Array<{
    id: string;
    componentProductId: string;
    componentName: string;
    componentUpc: string | null;
    quantityPerBundle: number;
    fsmsPresentationId: string | null;
    fsmsProductId: string | null;
    fsmsPresentationName: string | null;
    fsmsProductName: string | null;
  }>;
  // Admin-configured bundle components (from Bundle Config page)
  bundleComponents: Array<{
    componentProductId: string;
    fsmsPresentationId: string | null;
    fsmsProductId: string | null;
    quantityPerBundle: number;
    presentationName: string | null;
    productName: string | null;
  }>;
}

type ShipMatchStatus = "all_matched" | "partial" | "none_matched" | "no_items";

interface SSShipmentItem {
  id: string;
  productName: string;
  upc: string | null;
  quantityShipped: number;
  isBundleComponent: boolean;
  bundleProductName: string | null;
  fsmsPresentationId: string | null;
  fsmsProductId: string | null;
  fsmsBatchSheetId: string | null;
  fsmsMatchStatus: string;
  fsmsPresentationName: string | null;
  fsmsProductName: string | null;
}

interface SSShipment {
  id: string;
  shipstationShipmentId: string;
  shipstationOrderNumber: string;
  shipstationOrderId: string;
  storeId: number;
  storeName: string;
  customerName: string | null;
  orderDate: string;
  shipDate: string;
  voided: boolean;
  voidDate: string | null;
  matchStatus: ShipMatchStatus;
  items: SSShipmentItem[];
}

interface ShipmentSummary {
  totalShipments: number;
  totalItems: number;
  allMatched: number;
  partial: number;
  noneMatched: number;
  noItems: number;
  voided: number;
}

interface ShipmentsResponse {
  shipments: SSShipment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: ShipmentSummary;
}

interface SyncLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  shipmentsFetched: number;
  shipmentsNew: number;
  shipmentsVoided: number;
  itemsProcessed: number;
  itemsMatched: number;
  itemsUnmatched: number;
  dateRangeFrom: string;
  dateRangeTo: string;
  errorMessage: string | null;
  notes: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric", day: "numeric", year: "numeric",
  });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

const STORE_COLORS: Record<string, string> = {
  Amazon: "bg-orange-100 text-orange-700",
  Shopify: "bg-emerald-100 text-emerald-700",
  Walmart: "bg-blue-100 text-blue-700",
  "Manual Orders": "bg-gray-100 text-gray-600",
};

function StoreBadge({ name }: { name: string }) {
  const cls = STORE_COLORS[name] ?? "bg-gray-100 text-gray-600";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold font-mono ${cls}`}>{name}</span>;
}

function MatchBadge({ status }: { status: ShipMatchStatus }) {
  if (status === "all_matched") return <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> All matched</span>;
  if (status === "partial") return <span className="text-xs font-semibold text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Partial</span>;
  if (status === "none_matched") return <span className="text-xs font-semibold text-red-600 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> None matched</span>;
  return <span className="text-xs text-gray-400">— No items</span>;
}

function SyncStatusBadge({ status }: { status: string }) {
  if (status === "success") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />Success</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Error</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><RefreshCw className="w-3 h-3 animate-spin" />Running</span>;
}

function StatTile({ label, value, color = "text-gray-900", sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] font-mono font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-semibold font-mono transition-colors",
        active ? "bg-[#D64D4D] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      )}
    >
      {label}
    </button>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({ onGoToBundleConfig }: { onGoToBundleConfig?: () => void }) {
  const [products, setProducts] = useState<SSProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<"" | "single_matched" | "bundle" | "unmatched" | "ignored">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/integrations/shipstation/products")
      .then((r) => r.ok ? r.json() : [])
      .then((d: SSProduct[]) => setProducts(d))
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter((p) => {
    const matchesSearch =
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.upc ?? "").includes(search);

    const matchesFilter =
      matchFilter === "" ? true :
      p.configStatus === matchFilter;

    return matchesSearch && matchesFilter;
  });

  const singleMatched = products.filter((p) => p.configStatus === "single_matched").length;
  const configuredBundles = products.filter((p) => p.configStatus === "bundle").length;
  const notConfigured = products.filter((p) => p.configStatus === "unmatched").length;
  const ignored = products.filter((p) => p.configStatus === "ignored").length;

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading products…</div>;

  return (
    <div className="space-y-4">
      {/* Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Total SS Products" value={products.length} />
        <StatTile label="✓ Matched Singles" value={singleMatched} color="text-emerald-600" />
        <StatTile label="✓ Configured Bundles" value={configuredBundles} color="text-emerald-600" />
        <StatTile label="✗ Not Configured" value={notConfigured} color="text-red-600" />
        <StatTile label="— Ignored" value={ignored} color="text-gray-400" />
      </div>

      {/* Unmatched alert */}
      {notConfigured > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-md">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">{notConfigured} ShipStation product{notConfigured !== 1 ? "s" : ""} not yet configured.</span>{" "}
            Shipments for these products are not counted in Finished Goods or Demand Forecast.{" "}
            Go to the <button onClick={onGoToBundleConfig} className="underline font-semibold hover:text-amber-900">Bundle Config</button> tab to map each product to an FSMS presentation.
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by name, SKU, or UPC…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 w-72"
        />
        <div className="flex items-center gap-2">
          <FilterPill label="All" active={matchFilter === ""} onClick={() => setMatchFilter("")} />
          <FilterPill label="✓ Singles" active={matchFilter === "single_matched"} onClick={() => setMatchFilter("single_matched")} />
          <FilterPill label="✓ Bundles" active={matchFilter === "bundle"} onClick={() => setMatchFilter("bundle")} />
          <FilterPill label="✗ Not Configured" active={matchFilter === "unmatched"} onClick={() => setMatchFilter("unmatched")} />
          <FilterPill label="— Ignored" active={matchFilter === "ignored"} onClick={() => setMatchFilter("ignored")} />
        </div>
        <span className="ml-auto text-xs text-gray-400 font-mono">{filtered.length} of {products.length}</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">No products match your filter.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Product Name (ShipStation)", "SKU", "UPC", "Type", "FSMS Match", "Total Shipped"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <>
                  <tr
                    key={p.id}
                    className={cn("hover:bg-gray-50 transition-colors", (p.isBundle || p.configStatus === "bundle") && "cursor-pointer")}
                    onClick={(p.isBundle || p.configStatus === "bundle") ? () => toggleExpand(p.id) : undefined}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {(p.isBundle || p.configStatus === "bundle") && (
                          expanded.has(p.id)
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        )}
                        {p.name}
                        {!p.isActive && <span className="text-[10px] font-mono font-semibold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">INACTIVE</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.upc || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{p.isBundle ? "Bundle" : "Single"}</td>
                    <td className="px-4 py-3">
                      {p.configStatus === "ignored" ? (
                        <span className="text-xs text-gray-400 flex items-center gap-1 group relative cursor-default">
                          <Minus className="w-3.5 h-3.5 shrink-0" />
                          Ignored
                          {p.ignoredReason && (
                            <span className="hidden group-hover:block absolute left-0 top-full mt-1 z-10 bg-gray-900 text-white text-xs rounded px-2 py-1 w-48 shadow-lg pointer-events-none">
                              {p.ignoredReason}
                            </span>
                          )}
                        </span>
                      ) : p.configStatus === "bundle" ? (
                        <span className="text-xs text-emerald-700 flex items-center gap-1 cursor-pointer" onClick={() => toggleExpand(p.id)}>
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Bundle — {p.bundleComponents.length} component{p.bundleComponents.length !== 1 ? "s" : ""}
                          {expanded.has(p.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </span>
                      ) : p.configStatus === "single_matched" && p.fsmsPresentationId ? (
                        <span className="text-xs text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span><span className="font-semibold">{p.fsmsProductName}</span>{p.fsmsPresentationName ? ` — ${p.fsmsPresentationName}` : ""}</span>
                        </span>
                      ) : (
                        <Link href="/dashboard/admin/planning/shipstation-bundles" className="text-xs text-red-600 flex items-center gap-1 hover:text-red-700">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          Not configured →
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">{p.totalShipped.toLocaleString()}</td>
                  </tr>
                  {expanded.has(p.id) && p.configStatus === "bundle" && p.bundleComponents.length > 0 && (
                    <tr key={`${p.id}-bundle-configs`}>
                      <td colSpan={6} className="px-8 py-3 bg-emerald-50/40 border-t border-emerald-100">
                        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider font-mono mb-2">Configured Components</p>
                        <ul className="space-y-1">
                          {p.bundleComponents.map((bc, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="font-mono text-gray-500">× {bc.quantityPerBundle}</span>
                              <span className="font-medium">{bc.productName}</span>
                              {bc.presentationName && <span className="text-gray-400">— {bc.presentationName}</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                  {expanded.has(p.id) && p.isBundle && p.configStatus !== "bundle" && p.components.length > 0 && (
                    <tr key={`${p.id}-components`}>
                      <td colSpan={6} className="px-8 py-3 bg-gray-50">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-mono mb-2">Bundle Components (from ShipStation)</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-1.5 pr-4 text-gray-500 font-mono">Component</th>
                              <th className="text-left py-1.5 pr-4 text-gray-500 font-mono">UPC</th>
                              <th className="text-left py-1.5 pr-4 text-gray-500 font-mono">Qty/Bundle</th>
                              <th className="text-left py-1.5 text-gray-500 font-mono">FSMS Match</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {p.components.map((c) => (
                              <tr key={c.id}>
                                <td className="py-1.5 pr-4 font-medium text-gray-800">{c.componentName}</td>
                                <td className="py-1.5 pr-4 font-mono text-gray-500">{c.componentUpc || "—"}</td>
                                <td className="py-1.5 pr-4 font-mono text-gray-700">× {c.quantityPerBundle}</td>
                                <td className="py-1.5">
                                  {c.fsmsPresentationId ? (
                                    <span className="text-emerald-700 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      {c.fsmsProductName}{c.fsmsPresentationName ? ` — ${c.fsmsPresentationName}` : ""}
                                    </span>
                                  ) : (
                                    <span className="text-red-600 flex items-center gap-1">
                                      <XCircle className="w-3 h-3" /> No UPC match
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Shipment Item Row ────────────────────────────────────────────────────────

function ItemDetail({ item }: { item: SSShipmentItem }) {
  const isMatched = !!item.fsmsPresentationId;
  return (
    <div className={cn("rounded border p-3 text-xs space-y-1", isMatched ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-800">{item.productName}</p>
          {item.isBundleComponent && item.bundleProductName && (
            <p className="text-gray-400 font-mono">Bundle component of: {item.bundleProductName}</p>
          )}
          <div className="flex gap-3 mt-0.5 text-gray-500 font-mono">
            <span>UPC: {item.upc ?? "—"}</span>
          </div>
        </div>
        <span className="font-bold text-gray-900 shrink-0">× {item.quantityShipped}</span>
      </div>
      <div className="pt-1 border-t border-gray-200/50">
        <p className="text-gray-500 font-semibold mb-0.5">FSMS Match:</p>
        <p>
          {isMatched ? (
            <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {item.fsmsProductName}{item.fsmsPresentationName ? ` — ${item.fsmsPresentationName}` : ""}</span>
          ) : (
            <span className="text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3" /> No match</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Shipments Tab ────────────────────────────────────────────────────────────

function ShipmentsTab() {
  const [data, setData] = useState<ShipmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [matchFilter, setMatchFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page), page_size: "50",
    });
    if (search) params.set("search", search);
    if (storeFilter) params.set("store_id", storeFilter);
    if (matchFilter) params.set("match_status", matchFilter);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    if (includeVoided) params.set("include_voided", "true");
    try {
      const res = await fetch(`/api/integrations/shipstation/shipments?${params}`);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [page, search, storeFilter, matchFilter, fromDate, toDate, includeVoided]);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function applyFilters() { setPage(1); }

  const s = data?.summary;

  return (
    <div className="space-y-4">
      {/* Tiles */}
      {s && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile label="Shipments" value={s.totalShipments} />
          <StatTile label="Items" value={s.totalItems} />
          <StatTile label="✓ All Matched" value={s.allMatched} color="text-emerald-600" />
          <StatTile label="⚠ Partial" value={s.partial} color="text-amber-600" />
          <StatTile label="✗ None Matched" value={s.noneMatched} color="text-red-600" />
          <StatTile label="🚫 Voided" value={s.voided} />
        </div>
      )}

      {/* Filter bar */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search order # or customer…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 w-60"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-mono">Store:</span>
            <FilterPill label="All" active={storeFilter === ""} onClick={() => { setStoreFilter(""); setPage(1); }} />
            {[["826519", "Amazon"], ["826624", "Shopify"], ["825549", "Walmart"], ["490544", "Manual"]].map(([id, name]) => (
              <FilterPill key={id} label={name} active={storeFilter === id} onClick={() => { setStoreFilter(id); setPage(1); }} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-mono">Match:</span>
            <FilterPill label="All" active={matchFilter === ""} onClick={() => { setMatchFilter(""); setPage(1); }} />
            <FilterPill label="✓ Matched" active={matchFilter === "all_matched"} onClick={() => { setMatchFilter("all_matched"); setPage(1); }} />
            <FilterPill label="⚠ Partial" active={matchFilter === "partial"} onClick={() => { setMatchFilter("partial"); setPage(1); }} />
            <FilterPill label="✗ None" active={matchFilter === "none_matched"} onClick={() => { setMatchFilter("none_matched"); setPage(1); }} />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <button onClick={applyFilters} className="btn-secondary text-xs px-3 py-1.5">Apply</button>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={includeVoided} onChange={(e) => { setIncludeVoided(e.target.checked); setPage(1); }} className="accent-brand-600 w-3.5 h-3.5" />
              Show voided
            </label>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading shipments…</div>
        ) : (data?.shipments.length ?? 0) === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {data?.total === 0 ? "No shipments found. Try adjusting your filters or run a sync." : "No results on this page."}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Ship Date", "Order #", "Store", "Customer", "Items", "Match Status", "Voided"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.shipments.map((ship) => (
                  <>
                    <tr
                      key={ship.id}
                      className={cn("hover:bg-gray-50 transition-colors cursor-pointer", ship.voided && "opacity-60")}
                      onClick={() => toggleExpand(ship.id)}
                    >
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(ship.shipDate)}</td>
                      <td className="px-4 py-3 font-mono text-brand-600 font-semibold">{ship.shipstationOrderNumber}</td>
                      <td className="px-4 py-3"><StoreBadge name={ship.storeName} /></td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{ship.customerName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-gray-600">
                          {ship.items.length} item{ship.items.length !== 1 ? "s" : ""}
                          {expanded.has(ship.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </span>
                      </td>
                      <td className="px-4 py-3"><MatchBadge status={ship.matchStatus} /></td>
                      <td className="px-4 py-3">
                        {ship.voided ? <span className="text-xs font-semibold text-gray-500">Voided {fmtDate(ship.voidDate)}</span> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                    {expanded.has(ship.id) && (
                      <tr key={`${ship.id}-items`}>
                        <td colSpan={7} className="px-6 py-4 bg-gray-50/60 border-b border-gray-100">
                          {ship.items.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No items recorded for this shipment.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {ship.items.map((item) => <ItemDetail key={item.id} item={item} />)}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-mono">
                  Showing {((data.page - 1) * data.pageSize) + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.page === 1} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">← Prev</button>
                  <span className="text-xs text-gray-500 font-mono">Page {data.page} of {data.totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={data.page === data.totalPages} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sync Log Tab ─────────────────────────────────────────────────────────────

function SyncLogTab() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/integrations/shipstation/logs")
      .then((r) => r.ok ? r.json() : [])
      .then((d: SyncLog[]) => setLogs(d))
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading sync history…</div>;

  if (logs.length === 0) {
    return (
      <div className="card p-10 text-center space-y-3">
        <p className="text-sm text-gray-500">No sync history yet.</p>
        <p className="text-xs text-gray-400">Click Sync Now above to import your ShipStation data.</p>
      </div>
    );
  }

  function duration(start: string, end: string | null) {
    if (!end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)}m`;
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            {["Date/Time", "Status", "Fetched", "New", "Voided", "Items", "Matched", "Unmatched", "Duration", "Date Range"].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log) => (
            <>
              <tr key={log.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(log.id)}>
                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtDateTime(log.startedAt)}</td>
                <td className="px-4 py-3"><SyncStatusBadge status={log.status} /></td>
                <td className="px-4 py-3 font-mono">{log.shipmentsFetched}</td>
                <td className="px-4 py-3 font-mono">{log.shipmentsNew}</td>
                <td className="px-4 py-3 font-mono">{log.shipmentsVoided}</td>
                <td className="px-4 py-3 font-mono">{log.itemsProcessed}</td>
                <td className="px-4 py-3 font-mono text-emerald-600">{log.itemsMatched}</td>
                <td className="px-4 py-3 font-mono text-amber-600">{log.itemsUnmatched}</td>
                <td className="px-4 py-3 font-mono text-gray-500">{duration(log.startedAt, log.completedAt)}</td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(log.dateRangeFrom)} – {fmtDate(log.dateRangeTo)}</td>
              </tr>
              {expanded.has(log.id) && (
                <tr key={`${log.id}-detail`}>
                  <td colSpan={10} className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                    {log.errorMessage && (
                      <div className="flex items-start gap-2 mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                        <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span><span className="font-semibold">Error:</span> {log.errorMessage}</span>
                      </div>
                    )}
                    {log.notes && (
                      <div className="flex items-start gap-2 text-xs text-gray-600 bg-white border border-gray-200 rounded p-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                        <span>{log.notes}</span>
                      </div>
                    )}
                    {!log.errorMessage && !log.notes && (
                      <p className="text-xs text-gray-400 italic">No additional details for this run.</p>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "products" | "shipments" | "bundle-config" | "sync-log";

export default function ShipStationDataPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initTab = (searchParams.get("tab") ?? "products") as Tab;
  const [activeTab, setActiveTab] = useState<Tab>(initTab);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [bundleUnmatched, setBundleUnmatched] = useState(0);

  useEffect(() => {
    if (authStatus === "unauthenticated") { router.push("/"); return; }
    if (authStatus === "authenticated" && (session?.user as { role?: string })?.role !== "ADMIN") {
      router.push("/dashboard"); return;
    }
  }, [authStatus, session, router]);

  useEffect(() => {
    fetch("/api/integrations/shipstation/logs")
      .then((r) => r.ok ? r.json() : [])
      .then((d: SyncLog[]) => {
        const last = d.find((l) => l.status === "success");
        if (last?.completedAt) setLastSync(last.completedAt);
      })
      .catch(() => {});
  }, []);

  async function triggerSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/integrations/shipstation/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 7 }),
      });
      const d = await res.json() as { status: string; shipmentsNew: number; errorMessage?: string };
      setSyncMsg(d.status === "success"
        ? `✓ Sync complete — ${d.shipmentsNew} new shipments`
        : `Error: ${d.errorMessage ?? "Unknown"}`);
      if (d.status === "success") setLastSync(new Date().toISOString());
    } finally { setSyncing(false); }
  }

  const TABS = [
    { id: "products", label: "Products" },
    { id: "shipments", label: "Shipments" },
    {
      id: "bundle-config",
      label: "Bundle Config",
      badge: bundleUnmatched > 0 ? bundleUnmatched : null,
      badgeVariant: "amber" as const,
    },
    { id: "sync-log", label: "Sync Log" },
  ];

  if (authStatus === "loading") return null;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">ShipStation Data</h1>
          <p className="page-subtitle">
            Read-only mirror of data imported from ShipStation — shipments, products, and match status
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right text-xs text-gray-500">
            <p>Last sync</p>
            <p className="font-semibold">{lastSync ? fmtDateTime(lastSync) : "Never"}</p>
          </div>
          {syncMsg && (
            <p className={cn("text-sm", syncMsg.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>
              {syncMsg}
            </p>
          )}
          <button onClick={triggerSync} disabled={syncing} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as Tab)}
      />

      {/* Tab content */}
      {activeTab === "products" && <ProductsTab onGoToBundleConfig={() => setActiveTab("bundle-config")} />}
      {activeTab === "shipments" && <ShipmentsTab />}
      {activeTab === "bundle-config" && (
        <BundleConfigTab onUnmatchedCount={setBundleUnmatched} />
      )}
      {activeTab === "sync-log" && <SyncLogTab />}
    </div>
  );
}
