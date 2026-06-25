"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, XCircle, Clock, ExternalLink, PackagePlus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LowStockMaterial {
  materialId: string;
  materialName: string;
  totalRemaining: number;
  minimumQuantity: number;
  minimumUnit: string | null;
  unit: string;
  shortage: number;
}

interface AlertLot {
  id: string;
  materialName: string;
  lotNumber: string;
  quantityRemaining: number;
  unit: string;
  expirationDate: string | null;
}

interface UnitMismatchMaterial {
  materialId: string;
  materialName: string;
  totalRemaining: number;
  inventoryUnit: string;
  minimumQuantity: number;
  minimumUnit: string;
  reason: string;
}

interface AlertsData {
  lowStock: LowStockMaterial[];
  unitMismatch?: UnitMismatchMaterial[];
  expired: AlertLot[];
  expiringSoon: AlertLot[];
}

export default function InventoryAlertsPage() {
  const [data, setData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/inventory/alerts")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>;
  }

  const lowStock = data?.lowStock ?? [];
  const unitMismatch = data?.unitMismatch ?? [];
  const expired = data?.expired ?? [];
  const expiringSoon = data?.expiringSoon ?? [];
  const totalAlerts = lowStock.length + unitMismatch.length + expired.length + expiringSoon.length;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalAlerts === 0
              ? "No active alerts."
              : `${totalAlerts} alert${totalAlerts !== 1 ? "s" : ""} require attention.`}
          </p>
        </div>
        <Link href="/dashboard/inventory/current" className="btn-secondary text-sm">
          View All Stock
        </Link>
      </div>

      {/* LOW STOCK — per material */}
      <div className={cn("rounded-lg border overflow-hidden", "border-amber-200 bg-amber-50")}>
        <div className={cn("flex items-center justify-between px-4 py-3", "bg-amber-100 text-amber-800")}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-semibold text-sm">Low Stock</span>
            {lowStock.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {lowStock.length}
              </span>
            )}
          </div>
          <span className="text-xs opacity-70">
            Materials where total on-hand is below minimum required.
          </span>
        </div>
        {lowStock.length === 0 ? (
          <div className="px-4 py-4 text-xs text-gray-400 flex items-center gap-1.5">
            <span className="text-emerald-500">✓</span> All materials are above minimum stock levels.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-amber-200">
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Material</th>
                <th className="px-4 py-2 text-right text-gray-500 font-medium">On Hand</th>
                <th className="px-4 py-2 text-right text-gray-500 font-medium">Minimum</th>
                <th className="px-4 py-2 text-right text-gray-500 font-medium">Need</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((m) => (
                <tr key={m.materialId} className="border-t border-amber-100">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{m.materialName}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700 font-mono">
                    {m.totalRemaining % 1 === 0 ? m.totalRemaining : m.totalRemaining.toFixed(2)} {m.unit}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 font-mono">
                    {m.minimumQuantity} {m.minimumUnit ?? m.unit}
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-600 font-mono font-semibold">
                    +{m.shortage % 1 === 0 ? m.shortage : m.shortage.toFixed(2)} {m.unit}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href="/dashboard/supervisor/receiving/new"
                      className="inline-flex items-center gap-1 text-brand-600 hover:underline whitespace-nowrap"
                    >
                      <PackagePlus className="w-3 h-3" />
                      Receive
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* UNIT MISMATCHES */}
      {unitMismatch.length > 0 && (
        <div className={cn("rounded-lg border overflow-hidden", "border-amber-200 bg-amber-50")}>
          <div className={cn("flex items-center justify-between px-4 py-3", "bg-amber-100 text-amber-800")}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold text-sm">Unit Mismatches</span>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {unitMismatch.length}
              </span>
            </div>
            <span className="text-xs opacity-70">
              Inventory and minimum stock units cannot be compared.
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-amber-200">
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Material</th>
                <th className="px-4 py-2 text-right text-gray-500 font-medium">On Hand</th>
                <th className="px-4 py-2 text-right text-gray-500 font-medium">Minimum</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Issue</th>
              </tr>
            </thead>
            <tbody>
              {unitMismatch.map((m) => (
                <tr key={m.materialId} className="border-t border-amber-100">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{m.materialName}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-700">
                    {m.totalRemaining % 1 === 0 ? m.totalRemaining : m.totalRemaining.toFixed(3)}{" "}
                    {m.inventoryUnit}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-500">
                    {m.minimumQuantity} {m.minimumUnit}
                  </td>
                  <td className="px-4 py-2.5 text-amber-700">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* EXPIRED — per lot */}
      <div className={cn("rounded-lg border overflow-hidden", "border-red-200 bg-red-50")}>
        <div className={cn("flex items-center justify-between px-4 py-3", "bg-red-100 text-red-800")}>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            <span className="font-semibold text-sm">Expired</span>
            {expired.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                {expired.length}
              </span>
            )}
          </div>
          <span className="text-xs opacity-70">These lots are past their expiration date.</span>
        </div>
        {expired.length === 0 ? (
          <div className="px-4 py-4 text-xs text-gray-400">No expired lots.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-red-200">
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Material</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Lot #</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Qty Remaining</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Expired</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expired.map((lot) => (
                <tr key={lot.id} className="border-t border-red-100">
                  <td className="px-4 py-2 font-medium">{lot.materialName}</td>
                  <td className="px-4 py-2 font-mono">{lot.lotNumber}</td>
                  <td className="px-4 py-2">{lot.quantityRemaining} {lot.unit}</td>
                  <td className="px-4 py-2">{lot.expirationDate ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/dashboard/inventory/lot-lookup?q=${encodeURIComponent(lot.lotNumber)}`}
                      className="text-brand-600 hover:underline inline-flex items-center gap-1"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* EXPIRING SOON — per lot */}
      <div className={cn("rounded-lg border overflow-hidden", "border-yellow-200 bg-yellow-50")}>
        <div className={cn("flex items-center justify-between px-4 py-3", "bg-yellow-100 text-yellow-800")}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span className="font-semibold text-sm">Expiring Soon</span>
            {expiringSoon.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-yellow-500 text-white">
                {expiringSoon.length}
              </span>
            )}
          </div>
          <span className="text-xs opacity-70">These active lots expire within 60 days.</span>
        </div>
        {expiringSoon.length === 0 ? (
          <div className="px-4 py-4 text-xs text-gray-400">No lots expiring soon.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-yellow-200">
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Material</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Lot #</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Qty Remaining</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">Expires</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expiringSoon.map((lot) => (
                <tr key={lot.id} className="border-t border-yellow-100">
                  <td className="px-4 py-2 font-medium">{lot.materialName}</td>
                  <td className="px-4 py-2 font-mono">{lot.lotNumber}</td>
                  <td className="px-4 py-2">{lot.quantityRemaining} {lot.unit}</td>
                  <td className="px-4 py-2">{lot.expirationDate ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/dashboard/inventory/lot-lookup?q=${encodeURIComponent(lot.lotNumber)}`}
                      className="text-brand-600 hover:underline inline-flex items-center gap-1"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
