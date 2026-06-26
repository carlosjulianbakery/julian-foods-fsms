"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";

interface Movement {
  id: string; inventoryLotId: string; materialName: string; lotNumber: string;
  movementType: string; quantity: number; unit: string;
  referenceType: string; referenceId: string; referenceNumber: string;
  quantityBefore: number; quantityAfter: number;
  performedAt: string; performedBy: { name: string };
  notes: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; cls: string; sign: string }> = {
  in_receiving:               { label: "IN — RECEIVING",      cls: "bg-emerald-100 text-emerald-700", sign: "↓" },
  in_initial_stock:           { label: "IN — INITIAL STOCK",  cls: "bg-blue-100 text-blue-700",       sign: "↓" },
  out_batch_sheet:            { label: "OUT — BATCH SHEET",   cls: "bg-red-100 text-red-700",         sign: "↑" },
  out_manual_adjustment:      { label: "OUT — ADJUSTMENT",    cls: "bg-orange-100 text-orange-700",   sign: "↑" },
  in_cycle_count_correction:  { label: "IN — CYCLE COUNT",    cls: "bg-blue-100 text-blue-700",       sign: "↓" },
  out_cycle_count_correction: { label: "OUT — CYCLE COUNT",   cls: "bg-blue-100 text-blue-700",       sign: "↑" },
};

const fmtDate = (d: string | null | undefined) => formatDate(d ?? null);

export default function MovementsPage() {
  const searchParams = useSearchParams();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialFilter, setMaterialFilter] = useState("");
  const [lotFilter, setLotFilter] = useState(searchParams.get("lot") ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (materialFilter) p.set("material", materialFilter);
    if (lotFilter) p.set("lot", lotFilter);
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    if (typeFilter) p.set("type", typeFilter);
    try {
      const res = await fetch(`/api/inventory/movements?${p}`);
      if (res.ok) setMovements(await res.json());
    } finally { setLoading(false); }
  }, [materialFilter, lotFilter, dateFrom, dateTo, typeFilter]);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  const inp = "px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="max-w-6xl space-y-5">
      <div className="page-header">
        <h1 className="page-title">Movement History</h1>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Material</label>
          <input type="text" className={inp} placeholder="Search…" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Lot #</label>
          <input type="text" className={inp} placeholder="Search…" value={lotFilter} onChange={(e) => setLotFilter(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" className={inp} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" className={inp} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select className={inp} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {(materialFilter || lotFilter || dateFrom || dateTo || typeFilter) && (
          <button className="text-xs text-gray-500 hover:text-gray-700 underline"
            onClick={() => { setMaterialFilter(""); setLotFilter(""); setDateFrom(""); setDateTo(""); setTypeFilter(""); }}>
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Date", "Material", "Lot #", "Movement", "Qty", "Before", "After", "Reference", "By"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">Loading…</td></tr>
            ) : movements.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">No movements found.</td></tr>
            ) : movements.map((m, i) => {
              const cfg = TYPE_CONFIG[m.movementType] ?? { label: m.movementType, cls: "bg-gray-100 text-gray-600", sign: "·" };
              return (
                <tr key={m.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-3 py-2.5 text-xs">{fmtDate(m.performedAt)}</td>
                  <td className="px-3 py-2.5 text-xs font-medium">{m.materialName}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{m.lotNumber}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", cfg.cls)}>
                      {cfg.sign} {cfg.label}
                    </span>
                  </td>
                  <td className={cn("px-3 py-2.5 text-xs font-semibold", m.quantity > 0 ? "text-emerald-600" : "text-red-600")}>
                    {m.quantity > 0 ? "+" : ""}{m.quantity} {m.unit}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{m.quantityBefore}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{m.quantityAfter}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-brand-600">{m.referenceNumber}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{m.performedBy.name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
