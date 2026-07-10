"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BarChart2, TrendingUp, ShoppingCart, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface RunwayRow {
  fsmsPresentationId: string;
  productName: string;
  presentationName: string;
  upc: string;
  unit: string;
  totalShipped: number;
  avgMonthlyShipped: number;
  shipmentHistory: Array<{ month: string; shipped: number }>;
}

interface DemandData {
  inventory: RunwayRow[];
  lastSync: { completedAt: string | null; dateRangeFrom: string; dateRangeTo: string; shipmentsFetched: number } | null;
  generatedAt: string;
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

export default function DemandForecastPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DemandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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
        <p className="page-subtitle">Shipment velocity and on-hand runway by SKU</p>
      </div>

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
        <div className="card p-4 flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-4 text-gray-600">
            <span><span className="font-semibold text-gray-900">{data.inventory.length}</span> SKUs tracked</span>
            <span className="text-gray-300">|</span>
            <span>Shipment data: <span className="font-semibold">{fmtDate(data.lastSync.dateRangeFrom)}</span> – <span className="font-semibold">{fmtDate(data.lastSync.dateRangeTo)}</span></span>
            <span className="text-gray-300">|</span>
            <span><span className="font-semibold">{data.lastSync.shipmentsFetched}</span> shipments indexed</span>
          </div>
          <span className="text-xs text-gray-400">Last sync: {fmtDate(data.lastSync.completedAt)}</span>
        </div>
      )}

      {/* Inventory runway table */}
      {filtered.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-gray-100">
            <BarChart2 className="w-4 h-4 text-gray-400" />
            <span className="font-semibold text-gray-900 text-sm">Inventory Runway</span>
            <span className="text-xs text-gray-400 font-mono">90-day avg velocity</span>
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
                  {["Product", "Presentation", "Shipped (90d)", "Avg / Month", "Last 6 Months"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => (
                  <tr key={row.fsmsPresentationId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.productName}</td>
                    <td className="px-4 py-3 text-gray-600">{row.presentationName}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {row.totalShipped.toLocaleString()} <span className="text-xs font-normal text-gray-400">{row.unit}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {row.avgMonthlyShipped > 0 ? row.avgMonthlyShipped.toLocaleString() : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3"><MiniChart history={row.shipmentHistory} /></td>
                  </tr>
                ))}
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
