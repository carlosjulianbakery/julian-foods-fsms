"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";
import { formatQty, formatQtyUnit } from "@/lib/formatNumber";
import Link from "next/link";

interface Movement {
  id: string; movementType: string; quantity: number; unit: string;
  referenceNumber: string; referenceType: string; performedAt: string;
  performedBy: { name: string };
}

interface BatchSheet {
  id: string; productionDate: string; templateName: string;
  productionLot: string | null; status: string;
}

interface LotResult {
  id: string; materialName: string; supplierName: string; lotNumber: string;
  receivedDate: string; quantityReceived: number; quantityRemaining: number;
  unit: string; expirationDate: string | null; status: string;
  movements: Movement[]; batchSheets: BatchSheet[];
  receivingRecord: { recordNumber: string } | null;
}

const fmtDate = (d: string | null | undefined) => formatDate(d ?? null);

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-700", low_stock: "text-amber-600",
  conditional: "text-blue-600", quarantined: "text-red-600",
  expired: "text-red-500", depleted: "text-gray-400", recalled: "text-red-900",
};

export default function LotLookupPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LotResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/lot-lookup?q=${encodeURIComponent(query)}`);
      if (res.ok) setResults(await res.json());
    } finally { setLoading(false); }
  }

  const inp = "px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="page-header">
        <h1 className="page-title">Lot Lookup</h1>
      </div>

      {/* Search bar */}
      <div className="card p-6">
        <div className="flex gap-3">
          <input
            type="text"
            className={cn(inp, "flex-1 text-base")}
            placeholder="Search lot number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className="btn-primary px-5 flex items-center gap-2" onClick={search} disabled={loading}>
            <Search className="w-4 h-4" />
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {results !== null && results.length === 0 && (
        <div className="card p-8 text-center text-sm text-gray-400">No lots found for "{query}".</div>
      )}

      {results?.map((lot) => (
        <div key={lot.id} className="card p-6 space-y-4">
          {/* Lot header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold text-gray-900 font-mono text-lg">{lot.lotNumber}</p>
              <p className="text-sm text-gray-600">{lot.materialName} — {lot.supplierName}</p>
            </div>
            <span className={cn("text-sm font-semibold uppercase", STATUS_COLORS[lot.status] ?? "text-gray-600")}>
              {lot.status.replace("_", " ")}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-xs text-gray-500">Received</p><p>{fmtDate(lot.receivedDate)}</p></div>
            <div><p className="text-xs text-gray-500">Qty Received</p><p>{formatQtyUnit(lot.quantityReceived, lot.unit)}</p></div>
            <div><p className="text-xs text-gray-500">Qty Remaining</p><p className="font-semibold">{formatQtyUnit(lot.quantityRemaining, lot.unit)}</p></div>
            {lot.expirationDate && <div><p className="text-xs text-gray-500">Expires</p><p>{fmtDate(lot.expirationDate)}</p></div>}
          </div>

          {/* Movement history */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Movement History</p>
            {lot.movements.length === 0 ? (
              <p className="text-xs text-gray-400">No movements recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50">
                  <th className="text-left px-2 py-1.5 text-gray-500">Date</th>
                  <th className="text-left px-2 py-1.5 text-gray-500">Type</th>
                  <th className="text-right px-2 py-1.5 text-gray-500">Qty</th>
                  <th className="text-left px-2 py-1.5 text-gray-500">Reference</th>
                  <th className="text-left px-2 py-1.5 text-gray-500">By</th>
                </tr></thead>
                <tbody>
                  {lot.movements.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">{fmtDate(m.performedAt)}</td>
                      <td className="px-2 py-1.5 capitalize">{m.movementType.replace(/_/g, " ")}</td>
                      <td className={cn("px-2 py-1.5 text-right font-semibold", m.quantity > 0 ? "text-emerald-600" : "text-red-600")}>
                        {m.quantity > 0 ? "+" : ""}{formatQty(m.quantity)} {m.unit}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-brand-600">{m.referenceNumber}</td>
                      <td className="px-2 py-1.5 text-gray-500">{m.performedBy.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Batch sheets */}
          {lot.batchSheets.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Batch Sheets Using This Lot</p>
              <div className="space-y-1">
                {lot.batchSheets.map((bs) => (
                  <div key={bs.id} className="flex items-center gap-3 text-xs p-2 bg-gray-50 rounded">
                    <span className="font-mono text-gray-500">{fmtDate(bs.productionDate)}</span>
                    <span className="font-medium">{bs.templateName}</span>
                    {bs.productionLot && <span className="font-mono text-gray-400">{bs.productionLot}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
