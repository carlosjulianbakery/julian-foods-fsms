"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, XCircle, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AlertLot {
  id: string; materialName: string; supplierName: string; lotNumber: string;
  quantityRemaining: number; unit: string; expirationDate: string | null;
  status: string;
}

const SECTIONS = [
  {
    key: "expired",
    label: "Expired",
    icon: XCircle,
    cls: "border-red-200 bg-red-50",
    headerCls: "bg-red-100 text-red-800",
    badgeCls: "bg-red-500 text-white",
    desc: "These lots are past their expiration date.",
    filter: (lot: AlertLot) => lot.status === "expired" && lot.quantityRemaining > 0,
  },
  {
    key: "low_stock",
    label: "Low Stock",
    icon: AlertTriangle,
    cls: "border-amber-200 bg-amber-50",
    headerCls: "bg-amber-100 text-amber-800",
    badgeCls: "bg-amber-500 text-white",
    desc: "These lots are at or below minimum stock level.",
    filter: (lot: AlertLot) => lot.status === "low_stock",
  },
  {
    key: "expiring",
    label: "Expiring Soon",
    icon: Clock,
    cls: "border-yellow-200 bg-yellow-50",
    headerCls: "bg-yellow-100 text-yellow-800",
    badgeCls: "bg-yellow-500 text-white",
    desc: "These active lots expire within 60 days.",
    filter: (lot: AlertLot) => {
      if (lot.status !== "active") return false;
      if (!lot.expirationDate) return false;
      const diff = (new Date(lot.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 60;
    },
  },
];

export default function InventoryAlertsPage() {
  const [lots, setLots] = useState<AlertLot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/inventory/current?status=expired&status=low_stock&status=active")
      .then((r) => r.json())
      .then((d) => setLots(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>;
  }

  const totalAlerts = SECTIONS.reduce((acc, s) => acc + lots.filter(s.filter).length, 0);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalAlerts === 0 ? "No active alerts." : `${totalAlerts} lot${totalAlerts !== 1 ? "s" : ""} require attention.`}
          </p>
        </div>
        <Link href="/dashboard/inventory/current" className="btn-secondary text-sm">View All Stock</Link>
      </div>

      {SECTIONS.map(({ key, label, icon: Icon, cls, headerCls, badgeCls, desc, filter }) => {
        const items = lots.filter(filter);
        return (
          <div key={key} className={cn("rounded-lg border overflow-hidden", cls)}>
            <div className={cn("flex items-center justify-between px-4 py-3", headerCls)}>
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="font-semibold text-sm">{label}</span>
                {items.length > 0 && (
                  <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold", badgeCls)}>
                    {items.length}
                  </span>
                )}
              </div>
              <span className="text-xs opacity-70">{desc}</span>
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-4 text-xs text-gray-400">No {label.toLowerCase()} lots.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-opacity-30">
                    <th className="px-4 py-2 text-left text-gray-500">Material</th>
                    <th className="px-4 py-2 text-left text-gray-500">Lot #</th>
                    <th className="px-4 py-2 text-left text-gray-500">Qty Remaining</th>
                    <th className="px-4 py-2 text-left text-gray-500">Expiration</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((lot) => (
                    <tr key={lot.id} className="border-t border-opacity-20">
                      <td className="px-4 py-2 font-medium">{lot.materialName}</td>
                      <td className="px-4 py-2 font-mono">{lot.lotNumber}</td>
                      <td className="px-4 py-2">{lot.quantityRemaining} {lot.unit}</td>
                      <td className="px-4 py-2">
                        {lot.expirationDate ? lot.expirationDate.split("T")[0] : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/inventory/lot-lookup?q=${encodeURIComponent(lot.lotNumber)}`}
                          className="text-brand-600 hover:underline inline-flex items-center gap-1">
                          View <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
