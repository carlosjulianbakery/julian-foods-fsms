"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Package, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface FinishedGoodsRow {
  id: string;
  fsmsPresentationId: string;
  fsmsProductId: string;
  presentationName: string;
  productName: string;
  upc: string;
  unit: string;
  totalProduced: number;
  totalShipped: number;
  onHand: number;
  lastBatchSheetDate: string | null;
  lastShipmentDate: string | null;
  lastUpdated: string;
}

interface Summary {
  totalProduced: number;
  totalShipped: number;
  totalOnHand: number;
  skuCount: number;
  lastSync: { completedAt: string | null; shipmentsNew: number; itemsMatched: number; itemsUnmatched: number } | null;
}

type SortKey = "productName" | "presentationName" | "totalProduced" | "totalShipped" | "onHand";
type SortDir = "asc" | "desc";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric", day: "numeric", year: "numeric",
  });
}

function SortTh({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-gray-100"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-[#D64D4D]" /> : <ChevronDown className="w-3 h-3 text-[#D64D4D]" />
          : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
      </span>
    </th>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function FinishedGoodsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [rows, setRows] = useState<FinishedGoodsRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("productName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    if (authStatus === "unauthenticated") { router.push("/"); return; }
    if (authStatus === "authenticated" && (session?.user as { role?: string })?.role !== "ADMIN") {
      router.push("/dashboard"); return;
    }
  }, [authStatus, session, router]);

  async function loadData() {
    setLoading(true);
    try {
      const [dataRes, summaryRes] = await Promise.all([
        fetch("/api/finished-goods"),
        fetch("/api/finished-goods/summary"),
      ]);
      if (dataRes.ok) setRows(await dataRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (authStatus === "authenticated") loadData(); }, [authStatus]);

  async function triggerSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/integrations/shipstation/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 7 }),
      });
      const data = await res.json() as { status: string; shipmentsNew: number; errorMessage?: string };
      setSyncMsg(
        data.status === "success"
          ? `✓ ${data.shipmentsNew} new shipments synced`
          : `Error: ${data.errorMessage ?? "Unknown"}`
      );
      await loadData();
    } finally {
      setSyncing(false);
    }
  }

  function onSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
  }

  const filtered = rows.filter((r) =>
    search === "" ||
    r.productName.toLowerCase().includes(search.toLowerCase()) ||
    r.presentationName.toLowerCase().includes(search.toLowerCase()) ||
    r.upc.includes(search)
  );

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortKey]; const bVal = b[sortKey];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return sortDir === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const onHandRisk = sorted.filter((r) => r.onHand <= 0);

  if (authStatus === "loading" || (authStatus === "authenticated" && loading && rows.length === 0)) {
    return (
      <div className="max-w-5xl space-y-6">
        <div className="page-header"><h1 className="page-title">Finished Goods</h1></div>
        <div className="card p-10 text-center text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Finished Goods</h1>
          <p className="page-subtitle">Produced vs. shipped inventory by product presentation</p>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <p className={cn("text-sm", syncMsg.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>
              {syncMsg}
            </p>
          )}
          <button onClick={triggerSync} disabled={syncing} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="On Hand" value={summary.totalOnHand} sub="units across all SKUs" />
          <StatTile label="Total Produced" value={summary.totalProduced} sub="all-time" />
          <StatTile label="Total Shipped" value={summary.totalShipped} sub="via ShipStation" />
          <StatTile label="SKUs Tracked" value={summary.skuCount} sub={summary.lastSync ? `Last sync: ${fmtDate(summary.lastSync.completedAt)}` : "No sync yet"} />
        </div>
      )}

      {/* Out-of-stock alert */}
      {onHandRisk.length > 0 && (
        <div className="card p-4 border-l-4 border-l-amber-500 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">
            {onHandRisk.length} SKU{onHandRisk.length !== 1 ? "s" : ""} at zero or negative on-hand
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {onHandRisk.map((r) => r.presentationName).join(" · ")}
          </p>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <Package className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-gray-900 text-sm">All Presentations</span>
          <input
            type="text"
            placeholder="Search product, presentation, UPC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 w-72"
          />
        </div>

        {sorted.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            {rows.length === 0
              ? "No finished goods data yet. Run a ShipStation sync and ensure batch sheets are completed."
              : "No results match your search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <SortTh label="Product" col="productName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortTh label="Presentation" col="presentationName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">UPC</th>
                  <SortTh label="Produced" col="totalProduced" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortTh label="Shipped" col="totalShipped" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortTh label="On Hand" col="onHand" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Last Batch</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Last Shipped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.productName}</td>
                    <td className="px-4 py-3 text-gray-600">{row.presentationName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.upc || "—"}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">{row.totalProduced.toLocaleString()} <span className="text-xs text-gray-400">{row.unit}</span></td>
                    <td className="px-4 py-3 font-mono text-gray-700">{row.totalShipped.toLocaleString()} <span className="text-xs text-gray-400">{row.unit}</span></td>
                    <td className={cn("px-4 py-3 font-mono font-semibold", row.onHand <= 0 ? "text-red-600" : row.onHand < 50 ? "text-amber-600" : "text-emerald-600")}>
                      {row.onHand.toLocaleString()} <span className="text-xs font-normal text-gray-400">{row.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(row.lastBatchSheetDate)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(row.lastShipmentDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {summary?.lastSync && (
        <p className="text-xs text-gray-400 text-right">
          Last sync: {fmtDate(summary.lastSync.completedAt)} ·{" "}
          {summary.lastSync.itemsMatched} matched, {summary.lastSync.itemsUnmatched} unmatched ·{" "}
          <Link href="/admin/settings" className="text-brand-600 hover:underline">Configure in Settings</Link>
        </p>
      )}
    </div>
  );
}
