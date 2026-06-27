"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ItemRow {
  id?: string;
  materialId: string;
  materialName: string;
  qtyOrdered: string;
  unit: string;
  qtyReceived: number;
  qtyRemaining: string;
  isFullyReceived: boolean;
  source: string;
  wipMaterialName: string;
  notes: string;
}

const UNITS = ["lb", "oz", "kg", "g", "gal", "L", "ml", "fl oz", "units", "each", "case", "pallet"];
const STATUS_OPTIONS = ["sent", "partial", "received", "cancelled"];

export default function EditPOPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState("sent");
  const [sentDate, setSentDate] = useState("");
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");
  const [actualDeliveryDate, setActualDeliveryDate] = useState("");
  const [forecastPeriodFrom, setForecastPeriodFrom] = useState("");
  const [forecastPeriodTo, setForecastPeriodTo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  useEffect(() => {
    fetch(`/api/purchasing/purchase-orders/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const po = d.purchaseOrder;
        if (!po) return;
        setStatus(po.status);
        setSentDate(po.sentDate ? po.sentDate.split("T")[0] : "");
        setEstimatedDeliveryDate(po.estimatedDeliveryDate ? po.estimatedDeliveryDate.split("T")[0] : "");
        setActualDeliveryDate(po.actualDeliveryDate ? po.actualDeliveryDate.split("T")[0] : "");
        setForecastPeriodFrom(po.forecastPeriodFrom ? po.forecastPeriodFrom.split("T")[0] : "");
        setForecastPeriodTo(po.forecastPeriodTo ? po.forecastPeriodTo.split("T")[0] : "");
        setNotes(po.notes ?? "");
        setItems(po.items.map((it: {
          id: string; materialId: string; materialName: string; qtyOrdered: number;
          unit: string; qtyReceived: number; qtyRemaining: number; isFullyReceived: boolean;
          source: string; wipMaterialName: string | null; notes: string | null;
        }) => ({
          id: it.id,
          materialId: it.materialId,
          materialName: it.materialName,
          qtyOrdered: String(it.qtyOrdered),
          unit: it.unit,
          qtyReceived: it.qtyReceived,
          qtyRemaining: String(it.qtyRemaining),
          isFullyReceived: it.isFullyReceived,
          source: it.source,
          wipMaterialName: it.wipMaterialName ?? "",
          notes: it.notes ?? "",
        })));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { materialId: "", materialName: "", qtyOrdered: "", unit: "lb", qtyReceived: 0, qtyRemaining: "", isFullyReceived: false, source: "direct", wipMaterialName: "", notes: "" },
    ]);
  };

  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof ItemRow, value: string | boolean) => {
    setItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const validItems = items.filter((it) => it.materialName.trim() && parseFloat(it.qtyOrdered) > 0);
    if (validItems.length === 0) { setError("Add at least one valid item."); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchasing/purchase-orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          sentDate,
          estimatedDeliveryDate: estimatedDeliveryDate || null,
          actualDeliveryDate: actualDeliveryDate || null,
          forecastPeriodFrom: forecastPeriodFrom || null,
          forecastPeriodTo: forecastPeriodTo || null,
          notes: notes || null,
          items: validItems.map((it) => ({
            materialId: it.materialId || `manual-${Date.now()}`,
            materialName: it.materialName.trim(),
            qtyOrdered: parseFloat(it.qtyOrdered),
            unit: it.unit,
            qtyReceived: it.qtyReceived,
            qtyRemaining: parseFloat(it.qtyRemaining) || parseFloat(it.qtyOrdered) - it.qtyReceived,
            isFullyReceived: it.isFullyReceived,
            source: it.source,
            wipMaterialName: it.wipMaterialName || null,
            notes: it.notes || null,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to update PO");
        return;
      }
      router.push(`/dashboard/admin/purchasing/purchase-orders/${id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#D64D4D] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/dashboard/admin/purchasing/purchase-orders/${id}`} className="p-2 hover:bg-gray-100 rounded-md text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 font-garamond">Edit Purchase Order</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Status + Dates */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Status & Dates</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            {([
              { label: "Sent Date *", value: sentDate, setter: setSentDate, required: true },
              { label: "Est. Delivery", value: estimatedDeliveryDate, setter: setEstimatedDeliveryDate, required: false },
              { label: "Actual Delivery", value: actualDeliveryDate, setter: setActualDeliveryDate, required: false },
              { label: "Forecast From", value: forecastPeriodFrom, setter: setForecastPeriodFrom, required: false },
              { label: "Forecast To", value: forecastPeriodTo, setter: setForecastPeriodTo, required: false },
            ] as { label: string; value: string; setter: (v: string) => void; required: boolean }[]).map((f) => (
              <div key={f.label}>
                <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                <input type="date" value={f.value} onChange={(e) => f.setter(e.target.value)}
                  required={f.required}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30" />
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Notes</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30 resize-none" />
        </div>

        {/* Items */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Order Items</h2>
            <button type="button" onClick={addItem}
              className="flex items-center gap-1.5 text-xs text-[#D64D4D] hover:text-[#c04444] font-medium">
              <Plus className="w-3.5 h-3.5" /> Add item
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className={cn("border rounded-lg p-3", item.isFullyReceived ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-100")}>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-gray-500 mb-1">Material Name *</label>
                    <input type="text" value={item.materialName} onChange={(e) => updateItem(i, "materialName", e.target.value)}
                      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Qty Ordered *</label>
                    <input type="number" value={item.qtyOrdered} onChange={(e) => updateItem(i, "qtyOrdered", e.target.value)} min="0" step="0.01"
                      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Qty Received</label>
                    <input type="number" value={item.qtyReceived} onChange={(e) => updateItem(i, "qtyReceived", e.target.value)} min="0" step="0.01"
                      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Unit</label>
                    <select value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)}
                      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40">
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={item.isFullyReceived}
                        onChange={(e) => updateItem(i, "isFullyReceived", e.target.checked)}
                        className="w-3.5 h-3.5 accent-emerald-500" />
                      Fully received
                    </label>
                  </div>
                </div>
                {items.length > 1 && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => removeItem(i)}
                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/dashboard/admin/purchasing/purchase-orders/${id}`}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
            Cancel
          </Link>
          <button type="submit" disabled={submitting}
            className={cn("px-5 py-2 text-sm font-medium rounded-md text-white transition-colors",
              submitting ? "bg-gray-400 cursor-not-allowed" : "bg-[#D64D4D] hover:bg-[#c04444]")}>
            {submitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
