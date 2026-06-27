"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Package, ChevronRight, RefreshCw, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface POItem {
  id: string;
  materialName: string;
  qtyOrdered: number;
  unit: string;
  qtyReceived: number;
  isFullyReceived: boolean;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  sentDate: string;
  estimatedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  notes: string | null;
  forecastPeriodFrom: string | null;
  forecastPeriodTo: string | null;
  createdAt: string;
  items: POItem[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700" },
  partial: { label: "Partial", color: "bg-amber-100 text-amber-700" },
  received: { label: "Received", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500" },
};

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = statusFilter === "open"
        ? "?status=sent"
        : statusFilter === "all"
        ? ""
        : `?status=${statusFilter}`;
      const res = await fetch(`/api/purchasing/purchase-orders${params}`);
      if (statusFilter === "open") {
        // Also fetch partial
        const res2 = await fetch("/api/purchasing/purchase-orders?status=partial");
        const data = await res.json();
        const data2 = await res2.json();
        const combined = [...(data.purchaseOrders ?? []), ...(data2.purchaseOrders ?? [])];
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(combined);
      } else {
        const data = await res.json();
        setOrders(data.purchaseOrders ?? []);
      }
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [statusFilter]);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-garamond">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-1">Track orders sent to suppliers</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchOrders}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href="/dashboard/admin/purchasing/purchase-orders/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#D64D4D] text-white rounded-md text-sm font-medium hover:bg-[#c04444] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New PO
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {[
          { key: "open", label: "Open" },
          { key: "all", label: "All" },
          { key: "received", label: "Received" },
          { key: "cancelled", label: "Cancelled" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              statusFilter === f.key
                ? "border-[#D64D4D] text-[#D64D4D]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No purchase orders found</p>
          <p className="text-sm mt-1">Create one from the Ingredient Forecast purchase list</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((po) => {
            const status = STATUS_LABELS[po.status] ?? { label: po.status, color: "bg-gray-100 text-gray-600" };
            const totalItems = po.items.length;
            const receivedItems = po.items.filter((i) => i.isFullyReceived).length;
            return (
              <Link
                key={po.id}
                href={`/dashboard/admin/purchasing/purchase-orders/${po.id}`}
                className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-[#D64D4D] hover:shadow-sm transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-gray-900">{po.poNumber}</span>
                    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", status.color)}>
                      {status.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{po.supplierName}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                    <span>Sent {fmt(po.sentDate)}</span>
                    {po.estimatedDeliveryDate && <span>ETA {fmt(po.estimatedDeliveryDate)}</span>}
                    <span>{totalItems} item{totalItems !== 1 ? "s" : ""}{po.status === "partial" ? ` · ${receivedItems}/${totalItems} received` : ""}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#D64D4D] transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
