"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Edit3, XCircle, Package, CheckCircle2, Clock, AlertTriangle, RotateCcw, Lock,
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
  closedAt: string | null;
  closedBy: string | null;
  closeNote: string | null;
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
  ordered: { label: "Ordered — Awaiting Delivery", icon: Clock, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  partial: { label: "Partially Received", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  received: { label: "Fully Received", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
  closed: { label: "Closed", icon: Lock, color: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
};

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Uncancel modal
  const [showUncancelModal, setShowUncancelModal] = useState(false);
  const [uncancelling, setUncancelling] = useState(false);

  // Close PO modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [closing, setClosing] = useState(false);

  const loadPo = async () => {
    const res = await fetch(`/api/purchasing/purchase-orders/${id}`);
    const data = await res.json();
    setPo(data.purchaseOrder ?? null);
  };

  useEffect(() => {
    loadPo().finally(() => setLoading(false));
  }, [id]);

  const handleCancel = async () => {
    if (!confirm("Cancel this purchase order?")) return;
    setCancelling(true);
    await fetch(`/api/purchasing/purchase-orders/${id}/cancel`, { method: "POST" });
    setCancelling(false);
    await loadPo();
  };

  const handleUncancel = async () => {
    setUncancelling(true);
    try {
      const res = await fetch(`/api/purchasing/purchase-orders/${id}/uncancel`, { method: "POST" });
      if (res.ok) {
        setShowUncancelModal(false);
        await loadPo();
      }
    } finally {
      setUncancelling(false);
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      const res = await fetch(`/api/purchasing/purchase-orders/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: closeNote }),
      });
      if (res.ok) {
        setShowCloseModal(false);
        setCloseNote("");
        await loadPo();
      }
    } finally {
      setClosing(false);
    }
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

  // Determine what status uncancel would restore to
  const anyReceived = po.items.some((i) => (i.qtyReceived ?? 0) > 0);
  const uncancelTarget = anyReceived ? "partial" : "ordered";

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
        <div className="flex items-center gap-2">
          {/* Edit + Cancel: only for non-terminal statuses */}
          {po.status !== "cancelled" && po.status !== "received" && po.status !== "closed" && (
            <>
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
            </>
          )}
          {/* Close PO: only for partial status */}
          {po.status === "partial" && (
            <button
              onClick={() => setShowCloseModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md disabled:opacity-50"
              style={{ border: "1.5px solid #F59E0B", color: "#D97706", background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#FFFBEB"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Lock className="w-3.5 h-3.5" /> Close PO
            </button>
          )}
          {/* Uncancel: only for cancelled status */}
          {po.status === "cancelled" && (
            <button
              onClick={() => setShowUncancelModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md"
              style={{ border: "1.5px solid #D4C9B8", color: "#6B5F50", background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#F59E0B"; e.currentTarget.style.color = "#D97706"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#D4C9B8"; e.currentTarget.style.color = "#6B5F50"; }}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Uncancel PO
            </button>
          )}
        </div>
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

      {/* Closed note */}
      {po.status === "closed" && po.closeNote && (
        <p className="text-sm text-gray-400 italic mb-4">Closed note: {po.closeNote}</p>
      )}

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

      {/* ── Uncancel Modal ── */}
      {showUncancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">Uncancel Purchase Order?</h2>
            <p className="text-sm text-gray-600 mb-6">
              PO <span className="font-mono font-semibold">{po.poNumber}</span> will be restored to{" "}
              <strong>{uncancelTarget}</strong> status. Expected deliveries will resume tracking.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowUncancelModal(false)}
                disabled={uncancelling}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleUncancel}
                disabled={uncancelling}
                className="px-4 py-2 text-sm rounded-md font-medium text-white disabled:opacity-50"
                style={{ background: "#6B5F50" }}
              >
                {uncancelling ? "Uncancelling…" : "Uncancel PO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close PO Modal ── */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">Close Purchase Order?</h2>
            <p className="text-sm text-gray-600 mb-4">
              PO <span className="font-mono font-semibold">{po.poNumber}</span> will be marked as closed.
              The partial receipt will be accepted as the final quantity. No further deliveries will be expected.
            </p>

            {/* Items summary */}
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-mono text-gray-500">Material</th>
                    <th className="text-right px-3 py-2 font-mono text-gray-500">Ordered</th>
                    <th className="text-right px-3 py-2 font-mono text-gray-500">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {po.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium text-gray-800">{item.materialName}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">
                        {formatQtyUnit(item.qtyOrdered, item.unit)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">
                        {formatQty(item.qtyReceived)} {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Optional note */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-700 mb-1">Note (optional)</label>
              <textarea
                rows={2}
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                placeholder="e.g. Supplier cannot fulfill remainder"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowCloseModal(false); setCloseNote(""); }}
                disabled={closing}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="px-4 py-2 text-sm rounded-md font-medium disabled:opacity-50"
                style={{ background: "#F59E0B", color: "#fff" }}
              >
                {closing ? "Closing…" : "Close PO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
