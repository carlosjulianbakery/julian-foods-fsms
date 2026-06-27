"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  status: string;
}

interface Material {
  id: string;
  name: string;
  unit: string | null;
  category: string;
}

interface ItemRow {
  materialId: string;
  materialName: string;
  isOtherMaterial: boolean;
  qtyOrdered: string;
  unit: string;
  source: string; // kept internally, not shown in UI
  wipMaterialName: string;
}

const OTHER_SUPPLIER_VALUE = "__other__";
const OTHER_MATERIAL_VALUE = "__other__";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split("T")[0];
}

function emptyItem(): ItemRow {
  return { materialId: "", materialName: "", isOtherMaterial: false, qtyOrdered: "", unit: "lb", source: "direct", wipMaterialName: "" };
}

// ─── Material Search Dropdown ────────────────────────────────────────────────

interface MaterialSearchProps {
  materials: Material[];
  value: string;           // display name in input
  onSelect: (m: Material | null) => void;
}

function MaterialSearch({ materials, value, onSelect }: MaterialSearchProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // sync when parent resets
  useEffect(() => { setQuery(value); }, [value]);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const lower = query.trim().toLowerCase();
  const filtered = lower
    ? materials.filter((m) => m.name.toLowerCase().includes(lower))
    : materials;

  // Group by category
  const ingredients = filtered.filter((m) => m.category === "INGREDIENT");
  const packaging   = filtered.filter((m) => m.category === "PACKAGING");
  const other       = filtered.filter((m) => m.category !== "INGREDIENT" && m.category !== "PACKAGING");

  function handleSelect(m: Material | null) {
    if (m) {
      setQuery(m.name);
      onSelect(m);
    } else {
      setQuery("Other / Not in list...");
      onSelect(null);
    }
    setOpen(false);
  }

  function handleInputChange(v: string) {
    setQuery(v);
    setOpen(true);
    // If user types, clear the selection
    onSelect(null);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => handleInputChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Search materials…"
          autoComplete="off"
          className="w-full border border-gray-300 rounded px-2.5 py-1.5 pr-7 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40"
          style={{ fontSize: "16px" }}
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {ingredients.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold font-mono uppercase text-gray-400 sticky top-0 bg-gray-50 border-b border-gray-100">Ingredients</div>
              {ingredients.map((m) => (
                <button key={m.id} type="button" onPointerDown={() => handleSelect(m)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 hover:text-brand-700 transition-colors">
                  {m.name} <span className="text-gray-400 text-xs">({m.unit ?? "—"})</span>
                </button>
              ))}
            </>
          )}
          {packaging.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold font-mono uppercase text-gray-400 sticky top-0 bg-gray-50 border-b border-gray-100">Packaging</div>
              {packaging.map((m) => (
                <button key={m.id} type="button" onPointerDown={() => handleSelect(m)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 hover:text-brand-700 transition-colors">
                  {m.name} <span className="text-gray-400 text-xs">({m.unit ?? "—"})</span>
                </button>
              ))}
            </>
          )}
          {other.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold font-mono uppercase text-gray-400 sticky top-0 bg-gray-50 border-b border-gray-100">Other</div>
              {other.map((m) => (
                <button key={m.id} type="button" onPointerDown={() => handleSelect(m)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 hover:text-brand-700 transition-colors">
                  {m.name} <span className="text-gray-400 text-xs">({m.unit ?? "—"})</span>
                </button>
              ))}
            </>
          )}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No materials found</div>
          )}
          {/* Other option */}
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

export default function NewPOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  // Supplier state
  const [supplierSelect, setSupplierSelect] = useState(searchParams.get("supplierId") ?? "");
  const [freeTextSupplier, setFreeTextSupplier] = useState("");

  // Date state
  const [sentDate, setSentDate] = useState(today());
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");

  // Items
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);

  // Notes (moved to end)
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Fetch suppliers (all active, no status filter)
  useEffect(() => {
    fetch("/api/supplier-management/suppliers")
      .then((r) => r.json())
      .then((d: Supplier[] | { error: string }) => {
        const list = Array.isArray(d) ? d : [];
        setSuppliers(list.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, []);

  // Fetch materials
  useEffect(() => {
    fetch("/api/supplier-management/materials?isActive=true")
      .then((r) => r.json())
      .then((d: Material[]) => setMaterials(Array.isArray(d) ? d : []))
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
          isOtherMaterial: !it.materialId,
          qtyOrdered: String(it.qtyOrdered ?? ""),
          unit: it.unit ?? "lb",
          source: it.source ?? "direct",
          wipMaterialName: it.wipMaterialName ?? "",
        })));
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Item helpers ────────────────────────────────────────────────────────────

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  function updateItemMaterial(i: number, material: Material | null) {
    setItems((prev) => prev.map((row, idx) => {
      if (idx !== i) return row;
      if (material === null) {
        // "Other" selected
        return { ...row, materialId: "", materialName: "", isOtherMaterial: true, unit: "" };
      }
      return { ...row, materialId: material.id, materialName: material.name, isOtherMaterial: false, unit: material.unit ?? row.unit };
    }));
  }

  function updateItem<K extends keyof ItemRow>(i: number, field: K, value: ItemRow[K]) {
    setItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const isOtherSupplier = supplierSelect === OTHER_SUPPLIER_VALUE;
  const effectiveSupplierId = isOtherSupplier ? null : supplierSelect || null;
  const selectedSupplierObj = suppliers.find((s) => s.id === supplierSelect);
  const effectiveSupplierName = isOtherSupplier
    ? freeTextSupplier.trim()
    : selectedSupplierObj?.name ?? "";

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!supplierSelect) { setError("Please select a supplier."); return; }
    if (isOtherSupplier && !freeTextSupplier.trim()) { setError("Please enter the supplier name."); return; }

    const validItems = items.filter((it) => it.materialName.trim() && parseFloat(it.qtyOrdered) > 0);
    if (validItems.length === 0) { setError("Add at least one valid item."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/purchasing/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: effectiveSupplierId,
          supplierName: effectiveSupplierName,
          sentDate,
          estimatedDeliveryDate: estimatedDeliveryDate || null,
          notes: notes || null,
          items: validItems.map((it) => ({
            materialId: it.materialId || `manual-${Date.now()}`,
            materialName: it.materialName.trim(),
            qtyOrdered: parseFloat(it.qtyOrdered),
            unit: it.unit || "lb",
            source: it.source,
            wipMaterialName: it.wipMaterialName || null,
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

  // ── Render ──────────────────────────────────────────────────────────────────

  const inp = "border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D64D4D]/40";

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

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Supplier */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Supplier <span className="text-red-500">*</span></h2>
          <select
            value={supplierSelect}
            onChange={(e) => { setSupplierSelect(e.target.value); setFreeTextSupplier(""); }}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30"
            style={{ fontSize: "16px" }}
            required
          >
            <option value="">Select a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value={OTHER_SUPPLIER_VALUE}>Other / Not in list…</option>
          </select>
          {isOtherSupplier && (
            <input
              type="text"
              value={freeTextSupplier}
              onChange={(e) => setFreeTextSupplier(e.target.value)}
              placeholder="Enter supplier name as it appears on the PO"
              className="mt-3 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30"
              style={{ fontSize: "16px" }}
              required
            />
          )}
        </div>

        {/* Dates */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Dates</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sent Date <span className="text-red-500">*</span></label>
              <input type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30"
                style={{ fontSize: "16px" }} required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Est. Delivery</label>
              <input type="date" value={estimatedDeliveryDate} onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D64D4D]/30"
                style={{ fontSize: "16px" }} />
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Order Items <span className="text-red-500">*</span></h2>
            <button type="button" onClick={addItem}
              className="flex items-center gap-1.5 text-xs text-[#D64D4D] hover:text-[#c04444] font-medium">
              <Plus className="w-3.5 h-3.5" /> Add item
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <div className="space-y-2">
                  {/* Material dropdown */}
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Material <span className="text-red-500">*</span></label>
                    <MaterialSearch
                      materials={materials}
                      value={item.isOtherMaterial ? "Other / Not in list..." : item.materialName}
                      onSelect={(m) => updateItemMaterial(i, m)}
                    />
                  </div>
                  {/* If "Other", show free-text name + unit inputs */}
                  {item.isOtherMaterial && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Material name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={item.materialName}
                          onChange={(e) => updateItem(i, "materialName", e.target.value)}
                          placeholder="e.g. Organic Oats"
                          className={cn(inp, "w-full")}
                          style={{ fontSize: "16px" }}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Unit</label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(i, "unit", e.target.value)}
                          placeholder="lb"
                          className={cn(inp, "w-full")}
                          style={{ fontSize: "16px" }}
                        />
                      </div>
                    </div>
                  )}
                  {/* Qty + Unit row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Qty <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        value={item.qtyOrdered}
                        onChange={(e) => updateItem(i, "qtyOrdered", e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className={cn(inp, "w-full")}
                        style={{ fontSize: "16px" }}
                      />
                    </div>
                    {!item.isOtherMaterial && (
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">Unit</label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(i, "unit", e.target.value)}
                          placeholder="lb"
                          className={cn(inp, "w-full")}
                          style={{ fontSize: "16px" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {items.length > 1 && (
                  <div className="flex justify-end mt-2">
                    <button type="button" onClick={() => removeItem(i)}
                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Notes — last field */}
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

        <div className="flex justify-end gap-3 pb-4">
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
