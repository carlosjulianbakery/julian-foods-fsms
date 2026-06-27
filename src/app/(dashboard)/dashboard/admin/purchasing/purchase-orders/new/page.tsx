"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Supplier {
  id: string;
  name: string;
}

interface ItemRow {
  materialId: string;
  materialName: string;
  qtyOrdered: string;
  unit: string;
  source: string;
  wipMaterialName: string;
  notes: string;
}

const UNITS = ["lb", "oz", "kg", "g", "gal", "L", "ml", "fl oz", "units", "each", "case", "pallet"];

function today() {
  return new Date().toISOString().split("T")[0];
}

export default function NewPOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState(searchParams.get("supplierId") ?? "");
  const [sentDate, setSentDate] = useState(today());
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");
  const [forecastPeriodFrom, setForecastPeriodFrom] = useState(searchParams.get("forecastFrom") ?? "");
  const [forecastPeriodTo, setForecastPeriodTo] = useState(searchParams.get("forecastTo") ?? "");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([
    { materialId: "", materialName: "", qtyOrdered: "", unit: "lb", source: "direct", wipMaterialName: "", notes: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/supplier-management/suppliers?status=APPROVED")
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers ?? d ?? []))
      .catch(() => {});
  }, []);

  // Pre-fill items from query params (from Purchase List Log PO)
  useEffect(() => {
    const encoded = searchParams.get("items");
    if (!encoded) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(encoded));
      if (Array.isArray(parsed) && parsed.length > 0) {
        setItems(parsed.map((it: Partial<ItemRow>) => ({
          materialId: it.materialId ?? "",
          materialName: it.materialName ?? "",
          qtyOrdered: String(it.qtyOrdered ?? ""),
          unit: it.unit ?? "lb",
          source: it.source ?? "direct",
          wipMaterialName: it.wipMaterialName ?? "",
          notes: it.notes ?? "",
        })));
      }
    } catch {}
  }, []);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { materialId: "", materialName: "", qtyOrdered: "", unit: "lb", source: "direct", wipMaterialName: "", notes: "" },
    ]);
  };

  const removeItem = (i: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateItem = (i: number, field: keyof ItemRow, value: string) => {
    setItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!supplierId) { setError("Please select a supplier."); return; }
    const validItems = items.filter((it) => it.materialName.trim() && parseFloat(it.qtyOrdered) > 0);
    if (validItems.length === 0) { setError("Add at least one valid item."); return; }

    const selectedSupplier = suppliers.find((s) => s.id === supplierId);
    setSubmitting(true);
    try {
      const res = await fetch("/api/purchasing/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          supplierName: selectedSupplier?.name ?? "",
          sentDate,
          estimatedDeliveryDate: estimatedDeliveryDate || null,
          forecastPeriodFrom: forecastPeriodFrom || null,
          forecastPeriodTo: forecastPeriodTo || null,
          notes: notes || null,
          items: validItems.map((it) => ({
            materialId: it.materialId || `manual-${Date.now()}`,
            materialName: it.materialName.trim(),
            qtyOrdered: parseFloat(it.qtyOrdered),
            unit: it.unit,
            source: it.source,
            wipMaterialName: it.wipMaterialName || null,
            notes: it.notes || null,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to create PO");
        return;
      }
      const data = await res.json();
      router.push(`/dashboard/admin/purchasing/purchase-orders/${data.purchaseOrder.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/admin/purchasing/purchase-orders" className="p-2 hover:bg-gray-100 rounded-md text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-garamond">New Purchase Order</h1>
          <p className="text-sm text-gray-500">Create a PO to send to a supplier</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Supplier */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Supplier</h2>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30"
            required
          >
            <option value="">Select a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Dates */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Dates</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sent Date *</label>
              <input type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Est. Delivery</label>
              <input type="date" value={estimatedDeliveryDate} onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Forecast From</label>
              <input type="date" value={forecastPeriodFrom} onChange={(e) => setForecastPeriodFrom(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Forecast To</label>
              <input type="date" value={forecastPeriodTo} onChange={(e) => setForecastPeriodTo(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30" />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional notes…"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30 resize-none"
          />
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
              <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-gray-500 mb-1">Material Name *</label>
                    <input
                      type="text"
                      value={item.materialName}
                      onChange={(e) => updateItem(i, "materialName", e.target.value)}
                      placeholder="e.g. Organic Oats"
                      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Qty *</label>
                    <input
                      type="number"
                      value={item.qtyOrdered}
                      onChange={(e) => updateItem(i, "qtyOrdered", e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Unit</label>
                    <select
                      value={item.unit}
                      onChange={(e) => updateItem(i, "unit", e.target.value)}
                      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40"
                    >
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Source</label>
                    <select
                      value={item.source}
                      onChange={(e) => updateItem(i, "source", e.target.value)}
                      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40"
                    >
                      <option value="direct">Direct</option>
                      <option value="wip">WIP Ingredient</option>
                    </select>
                  </div>
                  {item.source === "wip" && (
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">WIP Product Name</label>
                      <input
                        type="text"
                        value={item.wipMaterialName}
                        onChange={(e) => updateItem(i, "wipMaterialName", e.target.value)}
                        placeholder="WIP product name"
                        className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40"
                      />
                    </div>
                  )}
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
          <Link href="/dashboard/admin/purchasing/purchase-orders"
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "px-5 py-2 text-sm font-medium rounded-md text-white transition-colors",
              submitting ? "bg-gray-400 cursor-not-allowed" : "bg-[#D64D4D] hover:bg-[#c04444]"
            )}
          >
            {submitting ? "Creating…" : "Create Purchase Order"}
          </button>
        </div>
      </form>
    </div>
  );
}
