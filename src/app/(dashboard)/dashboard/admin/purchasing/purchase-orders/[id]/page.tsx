"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Edit3, XCircle, Package, CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";
import { formatQty, formatQtyUnit } from "@/lib/formatNumber";

interface POItem {
  id: string;
  materialId: string;
  materialName: string;
  qtyOrdered: number;
  unit: string;
  qtyReceived: number;
  qtyRemaining: number;
  isFullyReceived: boolean;
  source: string;
  wipMaterialName: string | null;
  notes: string | null;
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
  receivingRecords: {
    id: string;
    submittedAt: string;
    notes: string | null;
    receivedBy: { name: string } | null;
  }[];
}

const STATUS_LABELS: Record<string, { label: string; icon: React.FC<{ className?: string }>; color: string; bg: string }> = {
  sent: { label: "Sent — Awaiting Delivery", icon: Clock, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  partial: { label: "Partially Received", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  received: { label: "Fully Received", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
};

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetch(`/api/purchasing/purchase-orders/${id}`)
      .then((r) => r.json())
      .then((d) => setPo(d.purchaseOrder ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleCancel = async () => {
    if (!confirm("Cancel this purchase order?")) return;
    setCancelling(true);
    await fetch(`/api/purchasing/purchase-orders/${id}/cancel`, { method: "POST" });
    setCancelling(false);
    router.refresh();
    const res = await fetch(`/api/purchasing/purchase-orders/${id}`);
    const data = await res.json();
    setPo(data.purchaseOrder);
  };

  const fmt = (iso: string | null) => formatDate(iso) || "—";

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#D64D4D] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!po) return <div className="text-center py-20 text-gray-400">Purchase order not found.</div>;

  const statusInfo = STATUS_LABELS[po.status] ?? {
    label: po.status, icon: Package, color: "text-gray-600", bg: "bg-gray-50 border-gray-200",
  };
  const StatusIcon = statusInfo.icon;

  const totalOrdered = po.items.reduce((s, i) => s + i.qtyOrdered, 0);
  const totalReceived = po.items.reduce((s, i) => s + i.qtyReceived, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/admin/purchasing/purchase-orders" className="p-2 hover:bg-gray-100 rounded-md text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 font-mono">{po.poNumber}</h1>
          <p className="text-sm text-gray-500">{po.supplierName}</p>
        </div>
        {po.status !== "cancelled" && po.status !== "received" && (
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/admin/purchasing/purchase-orders/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </Link>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 rounded-md hover:bg-red-50 text-red-600 disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Status banner */}
      <div className={cn("flex items-center gap-3 p-4 rounded-lg border mb-6", statusInfo.bg)}>
        <StatusIcon className={cn("w-5 h-5 shrink-0", statusInfo.color)} />
        <div>
          <p className={cn("font-semibold text-sm", statusInfo.color)}>{statusInfo.label}</p>
          {po.status === "partial" && (
            <p className="text-xs text-amber-600 mt-0.5">
              {po.items.filter((i) => i.isFullyReceived).length} of {po.items.length} items fully received
            </p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          ["Sent", fmt(po.sentDate)],
          ["Est. Delivery", fmt(po.estimatedDeliveryDate)],
          ["Actual Delivery", fmt(po.actualDeliveryDate)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-[11px] font-mono text-gray-400 uppercase">{label}</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {po.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-xs font-mono text-amber-600 uppercase mb-1">Notes</p>
          <p className="text-sm text-amber-800">{po.notes}</p>
        </div>
      )}

      {/* Items table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Order Items</h2>
          <span className="text-xs text-gray-400">
            {formatQty(totalReceived)} / {formatQty(totalOrdered)} total units received
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-mono text-gray-500">Material</th>
              <th className="text-right px-4 py-2.5 text-xs font-mono text-gray-500">Ordered</th>
              <th className="text-right px-4 py-2.5 text-xs font-mono text-gray-500">Received</th>
              <th className="text-right px-4 py-2.5 text-xs font-mono text-gray-500">Remaining</th>
              <th className="px-4 py-2.5 text-xs font-mono text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {po.items.map((item) => (
              <tr key={item.id} className={item.isFullyReceived ? "bg-emerald-50/40" : ""}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{item.materialName}</p>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">
                  {formatQtyUnit(item.qtyOrdered, item.unit)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">
                  {formatQty(item.qtyReceived)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">
                  {formatQty(item.qtyRemaining)}
                </td>
                <td className="px-4 py-3">
                  {item.isFullyReceived ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3 h-3" /> Done
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Receiving history */}
      {po.receivingRecords.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Receiving History</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {po.receivingRecords.map((rec) => (
              <div key={rec.id} className="px-4 py-3">
                <p className="text-xs text-gray-400">{fmt(rec.submittedAt)} · {rec.receivedBy?.name ?? "Unknown"}</p>
                {rec.notes && <p className="text-sm text-gray-700 mt-0.5">{rec.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
