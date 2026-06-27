"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Material {
  id: string;
  name: string;
  unit: string | null;
  category: string;
}

interface ItemRow {
  id?: string;
  materialId: string;
  materialName: string;
  isOtherMaterial: boolean;
  qtyOrdered: string;
  unit: string;
  qtyReceived: number;
  qtyRemaining: string;
  isFullyReceived: boolean;
  source: string;
  wipMaterialName: string;
  notes: string;
}

const STATUS_OPTIONS = ["sent", "partial", "received", "cancelled"];

// ─── Material Search Dropdown ─────────────────────────────────────────────────

interface MaterialSearchProps {
  materials: Material[];
  value: string;
  onSelect: (m: Material | null) => void;
  disabled?: boolean;
  loading?: boolean;
  warnUnlinked?: boolean;
}

function GroupHeader({ label }: { label: string }) {
  return <div className="px-3 py-1.5 text-[10px] font-semibold font-mono uppercase text-gray-400 sticky top-0 bg-gray-50 border-b border-gray-100">{label}</div>;
}

function MaterialOption({ m, onSelect }: { m: Material; onSelect: (m: Material) => void }) {
  return (
    <button type="button" onPointerDown={() => onSelect(m)}
      className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 hover:text-red-700 transition-colors">
      {m.name} <span className="text-gray-400 text-xs">({m.unit ?? "—"})</span>
    </button>
  );
}

function MaterialSearch({ materials, value, onSelect, disabled, loading, warnUnlinked }: MaterialSearchProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (disabled) {
    return (
      <div className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm text-gray-400 bg-gray-50 cursor-not-allowed select-none">
        Loading supplier…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm text-gray-400 bg-gray-50">
        Loading materials…
      </div>
    );
  }

  const lower = query.trim().toLowerCase();
  const filtered = lower ? materials.filter((m) => m.name.toLowerCase().includes(lower)) : materials;
  const ingredients = filtered.filter((m) => m.category === "INGREDIENT");
  const packaging   = filtered.filter((m) => m.category === "PACKAGING");
  const otherMats   = filtered.filter((m) => m.category !== "INGREDIENT" && m.category !== "PACKAGING");

  function handleSelect(m: Material | null) {
    setQuery(m ? m.name : "Other / Not in list…");
    onSelect(m);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); onSelect(null); }}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Search materials…"
          autoComplete="off"
          className="w-full border border-gray-300 rounded px-2.5 py-1.5 pr-7 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40"
          style={{ fontSize: "16px" }}
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
      {warnUnlinked && (
        <p className="text-[11px] text-amber-600 mt-0.5">⚠ Not linked to this supplier in the Materials registry</p>
      )}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {ingredients.length > 0 && (<><GroupHeader label="Ingredients" />{ingredients.map((m) => <MaterialOption key={m.id} m={m} onSelect={handleSelect} />)}</>)}
          {packaging.length > 0 && (<><GroupHeader label="Packaging" />{packaging.map((m) => <MaterialOption key={m.id} m={m} onSelect={handleSelect} />)}</>)}
          {otherMats.length > 0 && (<><GroupHeader label="Other" />{otherMats.map((m) => <MaterialOption key={m.id} m={m} onSelect={handleSelect} />)}</>)}
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No materials found</div>}
          <div className="border-t border-gray-100">
            <button type="button" onPointerDown={() => handleSelect(null)}
              className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors italic">
              Other / Not in list…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EditPOPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [supplierMaterials, setSupplierMaterials] = useState<Material[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [poSupplierId, setPoSupplierId] = useState("");

  const [status, setStatus] = useState("sent");
  const [sentDate, setSentDate] = useState("");
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");
  const [actualDeliveryDate, setActualDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  // Fetch PO — also kicks off supplier materials fetch
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
        setNotes(po.notes ?? "");
        setItems(po.items.map((it: {
          id: string; materialId: string; materialName: string; qtyOrdered: number;
          unit: string; qtyReceived: number; qtyRemaining: number; isFullyReceived: boolean;
          source: string; wipMaterialName: string | null; notes: string | null;
        }) => ({
          id: it.id,
          materialId: it.materialId,
          materialName: it.materialName,
          isOtherMaterial: false,
          qtyOrdered: String(it.qtyOrdered),
          unit: it.unit,
          qtyReceived: it.qtyReceived,
          qtyRemaining: String(it.qtyRemaining),
          isFullyReceived: it.isFullyReceived,
          source: it.source,
          wipMaterialName: it.wipMaterialName ?? "",
          notes: it.notes ?? "",
        })));

        // Fetch supplier materials for filtering
        if (po.supplierId) {
          setPoSupplierId(po.supplierId);
          fetch(`/api/supplier-management/suppliers/${po.supplierId}/materials`)
            .then((r2) => r2.json())
            .then((mats: Material[]) => setSupplierMaterials(Array.isArray(mats) ? mats : []))
            .catch(() => {})
            .finally(() => setLoadingMaterials(false));
        } else {
          // No supplier linked (manual entry PO) — load all materials as fallback
          fetch("/api/supplier-management/materials?isActive=true")
            .then((r2) => r2.json())
            .then((mats: Material[]) => setSupplierMaterials(Array.isArray(mats) ? mats : []))
            .catch(() => {})
            .finally(() => setLoadingMaterials(false));
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  // ── Item helpers ──────────────────────────────────────────────────────────────

  function addItem() {
    setItems((prev) => [...prev, {
      materialId: "", materialName: "", isOtherMaterial: false,
      qtyOrdered: "", unit: "lb", qtyReceived: 0, qtyRemaining: "",
      isFullyReceived: false, source: "direct", wipMaterialName: "", notes: "",
    }]);
  }

  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }

  function updateItemMaterial(i: number, material: Material | null) {
    setItems((prev) => prev.map((row, idx) => {
      if (idx !== i) return row;
      if (!material) return { ...row, materialId: "", materialName: "", isOtherMaterial: true, unit: "" };
      return { ...row, materialId: material.id, materialName: material.name, isOtherMaterial: false, unit: material.unit ?? row.unit };
    }));
  }

  function updateItem<K extends keyof ItemRow>(i: number, field: K, value: ItemRow[K]) {
    setItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

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
          sentDate: sentDate ? new Date(`${sentDate}T12:00:00`).toISOString() : null,
          estimatedDeliveryDate: estimatedDeliveryDate ? new Date(`${estimatedDeliveryDate}T12:00:00`).toISOString() : null,
          actualDeliveryDate: actualDeliveryDate ? new Date(`${actualDeliveryDate}T12:00:00`).toISOString() : null,
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

  // ── Render ────────────────────────────────────────────────────────────────────

  const dateInputClass = "w-full border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30";
  const fieldInp = "w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40";
  const supplierMaterialIds = new Set(supplierMaterials.map((m) => m.id));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/dashboard/admin/purchasing/purchase-orders/${id}`} className="p-2 hover:bg-gray-100 rounded-md text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 font-garamond">Edit Purchase Order</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Status + Dates */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Status & Dates</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sent Date <span className="text-red-500">*</span></label>
                <DateInput value={sentDate} onChange={setSentDate} className={dateInputClass} required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Est. Delivery</label>
                <DateInput value={estimatedDeliveryDate} onChange={setEstimatedDeliveryDate} className={dateInputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Actual Delivery</label>
                <DateInput value={actualDeliveryDate} onChange={setActualDeliveryDate} className={dateInputClass} />
              </div>
            </div>
          </div>
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
            {items.map((item, i) => {
              const warnUnlinked = !loadingMaterials
                && supplierMaterials.length > 0
                && !!poSupplierId
                && !item.isOtherMaterial
                && !!item.materialId
                && !supplierMaterialIds.has(item.materialId);
              return (
                <div key={i} className={cn("border rounded-lg p-3", item.isFullyReceived ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-100")}>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Material <span className="text-red-500">*</span></label>
                      <MaterialSearch
                        materials={supplierMaterials}
                        value={item.isOtherMaterial ? "Other / Not in list…" : item.materialName}
                        onSelect={(m) => updateItemMaterial(i, m)}
                        disabled={loadingMaterials && !supplierMaterials.length}
                        loading={loadingMaterials && !supplierMaterials.length}
                        warnUnlinked={warnUnlinked}
                      />
                    </div>
                    {item.isOtherMaterial && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">Material name <span className="text-red-500">*</span></label>
                          <input type="text" value={item.materialName}
                            onChange={(e) => updateItem(i, "materialName", e.target.value)}
                            placeholder="e.g. Organic Oats"
                            className={fieldInp} style={{ fontSize: "16px" }} />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">Unit</label>
                          <input type="text" value={item.unit}
                            onChange={(e) => updateItem(i, "unit", e.target.value)}
                            placeholder="lb"
                            className={fieldInp} style={{ fontSize: "16px" }} />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Qty Ordered <span className="text-red-500">*</span></label>
                        <input type="number" value={item.qtyOrdered}
                          onChange={(e) => updateItem(i, "qtyOrdered", e.target.value)}
                          min="0" step="0.01" placeholder="0.00"
                          className={fieldInp} style={{ fontSize: "16px" }} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Qty Received</label>
                        <input type="number" value={item.qtyReceived}
                          onChange={(e) => updateItem(i, "qtyReceived", parseFloat(e.target.value) || 0)}
                          min="0" step="0.01"
                          className={fieldInp} style={{ fontSize: "16px" }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {!item.isOtherMaterial && (
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">Unit</label>
                          <input type="text" value={item.unit}
                            onChange={(e) => updateItem(i, "unit", e.target.value)}
                            placeholder="lb"
                            className={fieldInp} style={{ fontSize: "16px" }} />
                        </div>
                      )}
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={item.isFullyReceived}
                            onChange={(e) => updateItem(i, "isFullyReceived", e.target.checked)}
                            className="w-3.5 h-3.5 accent-emerald-500" />
                          Fully received
                        </label>
                      </div>
                    </div>
                  </div>
                  {items.length > 1 && (
                    <div className="flex justify-end mt-2">
                      <button type="button" onClick={() => removeItem(i)}
                        className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes — after items */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Notes</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30 resize-none" />
        </div>

        <div className="flex justify-end gap-3 pb-4">
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
