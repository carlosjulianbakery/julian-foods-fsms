"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderOpen, CheckCircle2, AlertCircle, XCircle, Search, X,
  Lock, FileText, AlertTriangle, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQty, formatQtyUnit } from "@/lib/formatNumber";

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS: readonly string[] = ["lb", "oz", "kg", "g", "gal", "L", "ml", "fl oz", "units", "each", "case", "pallet"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentTimeStr() {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${m} ${ampm}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchedPOItem {
  id: string;
  materialId: string | null;
  materialName: string;
  qtyOrdered: number;
  qtyReceived: number;
  qtyRemaining: number;
  unit: string;
  isFullyReceived: boolean;
  coaRequired: boolean;
  isTemperatureSensitive: boolean;
  hasSpecialRisk: boolean;
}

interface SearchedPO {
  id: string;
  poNumber: string;
  supplierId: string | null;
  supplierName: string;
  status: string;
  estimatedDeliveryDate: string | null;
  outstandingItemsCount: number;
  items: SearchedPOItem[];
}

interface Material {
  id: string;
  name: string;
  unit: string | null;
  coaRequired: boolean;
  isTemperatureSensitive: boolean;
  hasSpecialRisk: boolean;
}

interface ReceivingItemRow {
  rowId: string;
  isFromPO: boolean;
  poItemId?: string;
  // Material
  materialId: string | null;
  materialName: string;
  unit: string;
  coaRequired: boolean;
  isTemperatureSensitive: boolean;
  hasSpecialRisk: boolean;
  // PO context (if from PO)
  qtyOrdered?: number;
  qtyPrevReceived?: number;
  qtyRemaining?: number;
  // Supervisor inputs
  qtyReceiving: string;
  lotNumber: string;
  expirationDate: string;
  decision: "accepted" | "accepted_with_conditions" | "rejected" | "";
  quarantineReason: string;
  quarantineAction: string;
  quarantineLocation: string;
  adminNotified: boolean;
  coaReceived: boolean | null;
  notes: string;
  // State
  skipped: boolean;
  errors: Record<string, string>;
  // For manual items: material search
  materialSearch: string;
  showMaterialDropdown: boolean;
}

// ─── ItemRow component ────────────────────────────────────────────────────────

function ItemRow({
  item,
  poNumber,
  materials,
  onUpdate,
  onSkip,
  onRemove,
}: {
  item: ReceivingItemRow;
  poNumber: string | null;
  materials: Material[];
  onUpdate: (rowId: string, updates: Partial<ReceivingItemRow>) => void;
  onSkip: (rowId: string) => void;
  onRemove: (rowId: string) => void;
}) {
  const inp = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";
  const inputStyle = { fontSize: 16 } as React.CSSProperties;

  const qtyNum = parseFloat(item.qtyReceiving) || 0;
  const outstanding = item.qtyRemaining ?? 0;
  const showQtyContext = item.isFromPO && outstanding > 0;
  const isOver = showQtyContext && qtyNum > outstanding + 0.01;
  const isPartial = showQtyContext && qtyNum > 0 && qtyNum < outstanding - 0.01;
  const isExact = showQtyContext && qtyNum > 0 && Math.abs(qtyNum - outstanding) <= 0.01;

  if (item.skipped) {
    return (
      <div className="card p-4 flex items-center justify-between opacity-60 bg-gray-50">
        <div>
          <span className="text-sm font-medium text-gray-600">{item.materialName}</span>
          <span className="text-xs text-gray-400 ml-2">— not in this delivery (skipped)</span>
        </div>
        <button type="button" onClick={() => onUpdate(item.rowId, { skipped: false })}
          className="text-xs text-[#D64D4D] hover:underline shrink-0 ml-4">Undo</button>
      </div>
    );
  }

  const filteredMaterials = item.materialSearch.trim()
    ? materials.filter((m) => m.name.toLowerCase().includes(item.materialSearch.toLowerCase()))
    : materials.slice(0, 8);

  return (
    <div className="card p-5 space-y-4">
      {/* Row header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {item.isFromPO && poNumber && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">
                From PO #{poNumber}
              </span>
            )}
            {!item.isFromPO && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600">
                Extra item
              </span>
            )}
            {item.coaRequired && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700">
                <FileText className="w-3 h-3" />COA Required
              </span>
            )}
            {item.hasSpecialRisk && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700">
                <AlertTriangle className="w-3 h-3" />Special Risk
              </span>
            )}
          </div>

          {/* Material name — editable for manual items */}
          {item.isFromPO ? (
            <p className="text-base font-semibold text-gray-900">{item.materialName}</p>
          ) : (
            <div className="relative">
              <input
                type="text"
                style={inputStyle}
                className={cn(inp, "pr-8 text-base font-semibold")}
                placeholder="Search or type material name…"
                value={item.materialSearch}
                onChange={(e) => onUpdate(item.rowId, { materialSearch: e.target.value, materialName: e.target.value, showMaterialDropdown: true, materialId: null, coaRequired: false, isTemperatureSensitive: false, hasSpecialRisk: false })}
                onFocus={() => onUpdate(item.rowId, { showMaterialDropdown: true })}
                onBlur={() => setTimeout(() => onUpdate(item.rowId, { showMaterialDropdown: false }), 200)}
              />
              {item.showMaterialDropdown && filteredMaterials.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                  {filteredMaterials.map((m) => (
                    <button key={m.id} type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => onUpdate(item.rowId, {
                        materialId: m.id,
                        materialName: m.name,
                        materialSearch: m.name,
                        unit: m.unit ?? "units",
                        coaRequired: m.coaRequired,
                        isTemperatureSensitive: m.isTemperatureSensitive,
                        hasSpecialRisk: m.hasSpecialRisk,
                        showMaterialDropdown: false,
                      })}
                      className="w-full text-left px-3 py-3 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 min-h-[44px] flex items-center">
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PO context */}
          {item.isFromPO && item.qtyOrdered !== undefined && (
            <p className="text-xs text-gray-500 mt-1">
              Ordered: {formatQty(item.qtyOrdered)} {item.unit}
              {(item.qtyPrevReceived ?? 0) > 0 && ` · Prev received: ${formatQty(item.qtyPrevReceived!)} ${item.unit}`}
              {` · Outstanding: `}
              <span className="font-medium text-gray-700">{formatQty(outstanding)} {item.unit}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-1">
          {item.isFromPO && (
            <button type="button" onClick={() => onSkip(item.rowId)}
              className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap">
              Not in delivery
            </button>
          )}
          {!item.isFromPO && (
            <button type="button" onClick={() => onRemove(item.rowId)} className="min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-700" />
            </button>
          )}
        </div>
      </div>

      {/* Qty + Unit */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Qty Receiving <span className="text-red-500">*</span></label>
          <input type="number" min="0" step="any" style={inputStyle}
            className={cn(inp, "text-sm", item.errors.qty ? "border-red-400" : "")}
            value={item.qtyReceiving}
            onChange={(e) => onUpdate(item.rowId, { qtyReceiving: e.target.value })} />
          {item.errors.qty && <p className="text-xs text-red-500 mt-1">{item.errors.qty}</p>}
        </div>
        <div className="w-28">
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
          {item.isFromPO ? (
            <div className={cn(inp, "text-sm bg-gray-50 text-gray-600 flex items-center min-h-[42px]")}>{item.unit}</div>
          ) : (
            <select style={inputStyle} className={cn(inp, "text-sm")} value={item.unit}
              onChange={(e) => onUpdate(item.rowId, { unit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Qty validation */}
      {showQtyContext && qtyNum > 0 && (
        <>
          {isOver && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              ⚠ {formatQty(qtyNum)} {item.unit} exceeds the outstanding PO quantity of {formatQty(outstanding)} {item.unit}. Over-delivery will be noted.
            </div>
          )}
          {isPartial && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              ℹ Partial delivery — {formatQty(outstanding - qtyNum)} {item.unit} still outstanding. PO will remain open.
            </div>
          )}
          {isExact && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
              ✓ Matches outstanding PO quantity exactly.
            </div>
          )}
        </>
      )}

      {/* Lot Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lot Number <span className="text-red-500">*</span></label>
        <input type="text" style={inputStyle}
          className={cn(inp, "text-sm font-mono", item.errors.lotNumber ? "border-red-400" : "")}
          value={item.lotNumber}
          onChange={(e) => onUpdate(item.rowId, { lotNumber: e.target.value.toUpperCase() })}
          placeholder="Enter lot # from delivery label" />
        {item.errors.lotNumber && <p className="text-xs text-red-500 mt-1">{item.errors.lotNumber}</p>}
      </div>

      {/* Expiration Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date <span className="text-gray-400 font-normal">(optional)</span></label>
        <input type="date" style={inputStyle} className={cn(inp, "text-sm")}
          value={item.expirationDate}
          onChange={(e) => onUpdate(item.rowId, { expirationDate: e.target.value })} />
      </div>

      {/* Condition */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Condition <span className="text-red-500">*</span></label>
        <select style={inputStyle}
          className={cn(inp, "text-sm", item.errors.decision ? "border-red-400" : "")}
          value={item.decision}
          onChange={(e) => onUpdate(item.rowId, { decision: e.target.value as ReceivingItemRow["decision"] })}>
          <option value="">Select condition…</option>
          <option value="accepted">✓ Good — Accept into inventory</option>
          <option value="accepted_with_conditions">⚠ Conditional — Accept with conditions</option>
          <option value="rejected">✗ Rejected — Do not accept</option>
        </select>
        {item.errors.decision && <p className="text-xs text-red-500 mt-1">{item.errors.decision}</p>}
      </div>

      {/* Quarantine details (conditional / rejected) */}
      {(item.decision === "accepted_with_conditions" || item.decision === "rejected") && (
        <div className="space-y-3 border-l-2 border-amber-300 pl-4 pt-1">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            {item.decision === "rejected" ? "Rejection details" : "Conditional acceptance details"}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
            <input type="text" style={inputStyle}
              className={cn(inp, "text-sm", item.errors.quarantineReason ? "border-red-400" : "")}
              value={item.quarantineReason}
              onChange={(e) => onUpdate(item.rowId, { quarantineReason: e.target.value })}
              placeholder="Describe the issue…" />
            {item.errors.quarantineReason && <p className="text-xs text-red-500 mt-1">{item.errors.quarantineReason}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action Taken <span className="text-red-500">*</span></label>
            <input type="text" style={inputStyle}
              className={cn(inp, "text-sm", item.errors.quarantineAction ? "border-red-400" : "")}
              value={item.quarantineAction}
              onChange={(e) => onUpdate(item.rowId, { quarantineAction: e.target.value })}
              placeholder="Describe action taken…" />
            {item.errors.quarantineAction && <p className="text-xs text-red-500 mt-1">{item.errors.quarantineAction}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quarantine Location <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" style={inputStyle} className={cn(inp, "text-sm")}
              value={item.quarantineLocation}
              onChange={(e) => onUpdate(item.rowId, { quarantineLocation: e.target.value })}
              placeholder="e.g. Dry Storage Room B" />
          </div>
        </div>
      )}

      {/* COA question */}
      {item.coaRequired && (item.decision === "accepted" || item.decision === "accepted_with_conditions") && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Was a COA received with this delivery?</label>
          <div className="flex gap-2">
            {[
              { val: true, label: "Yes" },
              { val: false, label: "No" },
            ].map(({ val, label }) => (
              <button key={label} type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onUpdate(item.rowId, { coaReceived: val })}
                className={cn(
                  "px-5 py-2 rounded text-sm font-medium border transition-colors min-h-[44px]",
                  item.coaReceived === val
                    ? val ? "bg-emerald-500 text-white border-emerald-500" : "bg-red-500 text-white border-red-500"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                )}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
        <textarea style={inputStyle} className={cn(inp, "text-sm min-h-[56px] resize-none")}
          value={item.notes}
          onChange={(e) => onUpdate(item.rowId, { notes: e.target.value })}
          placeholder="Any observations about this item…" />
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

let _rowCounter = 0;
function newRowId() { return `row-${++_rowCounter}`; }

function makeItemRowFromPO(it: SearchedPOItem): ReceivingItemRow {
  return {
    rowId: newRowId(),
    isFromPO: true,
    poItemId: it.id,
    materialId: it.materialId,
    materialName: it.materialName,
    unit: it.unit,
    coaRequired: it.coaRequired,
    isTemperatureSensitive: it.isTemperatureSensitive,
    hasSpecialRisk: it.hasSpecialRisk,
    qtyOrdered: it.qtyOrdered,
    qtyPrevReceived: it.qtyReceived,
    qtyRemaining: it.qtyRemaining,
    qtyReceiving: String(it.qtyRemaining),
    lotNumber: "",
    expirationDate: "",
    decision: "",
    quarantineReason: "",
    quarantineAction: "",
    quarantineLocation: "",
    adminNotified: false,
    coaReceived: null,
    notes: "",
    skipped: false,
    errors: {},
    materialSearch: it.materialName,
    showMaterialDropdown: false,
  };
}

function makeManualRow(): ReceivingItemRow {
  return {
    rowId: newRowId(),
    isFromPO: false,
    materialId: null,
    materialName: "",
    unit: "lb",
    coaRequired: false,
    isTemperatureSensitive: false,
    hasSpecialRisk: false,
    qtyReceiving: "",
    lotNumber: "",
    expirationDate: "",
    decision: "",
    quarantineReason: "",
    quarantineAction: "",
    quarantineLocation: "",
    adminNotified: false,
    coaReceived: null,
    notes: "",
    skipped: false,
    errors: {},
    materialSearch: "",
    showMaterialDropdown: false,
  };
}

export default function ReceivingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const inp = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";
  const inputStyle = { fontSize: 16 } as React.CSSProperties;

  // PO search
  const [poSearch, setPoSearch] = useState("");
  const [poResults, setPoResults] = useState<SearchedPO[]>([]);
  const [poSearchLoading, setPoSearchLoading] = useState(false);
  const [showPoDropdown, setShowPoDropdown] = useState(false);
  const [selectedPO, setSelectedPO] = useState<SearchedPO | null>(null);
  const [noResultsFor, setNoResultsFor] = useState("");
  const poInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // No-PO flow
  const [noPoDecision, setNoPoDecision] = useState(false);
  const [showNoPOForm, setShowNoPOForm] = useState(false);
  const [noPOReason, setNoPOReason] = useState("");
  const [noPOReasonOther, setNoPOReasonOther] = useState("");

  // Delivery info
  const [date, setDate] = useState(todayStr);
  const [time, setTime] = useState(currentTimeStr);

  // Supplier (no-PO case — manual entry)
  const [manualSupplierName, setManualSupplierName] = useState("");

  // Materials list (for manual item search)
  const [materials, setMaterials] = useState<Material[]>([]);

  // Items
  const [items, setItems] = useState<ReceivingItemRow[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [poClosureData, setPoClosureData] = useState<{
    poId: string; poNumber: string; supplierName: string;
  } | null>(null);
  const [closingPo, setClosingPo] = useState(false);

  const formUnlocked = selectedPO !== null || noPoDecision;

  // Fetch materials for manual item search
  useEffect(() => {
    fetch("/api/supplier-management/materials?isActive=true")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setMaterials(d);
      })
      .catch(() => {});
  }, []);

  // PO search debounce
  const handlePoSearchChange = useCallback((value: string) => {
    setPoSearch(value);
    setSelectedPO(null);
    setNoPoDecision(false);
    setNoResultsFor("");
    setItems([]);

    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) {
      setPoResults([]);
      setShowPoDropdown(false);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      setPoSearchLoading(true);
      try {
        const res = await fetch(`/api/purchasing/purchase-orders/search?q=${encodeURIComponent(value)}&status=sent,partial`);
        const data = await res.json();
        const results: SearchedPO[] = data.purchaseOrders ?? [];
        setPoResults(results);
        setShowPoDropdown(true);
        if (results.length === 0) setNoResultsFor(value);
        else setNoResultsFor("");
      } catch {
        setPoResults([]);
        setShowPoDropdown(false);
      } finally {
        setPoSearchLoading(false);
      }
    }, 300);
  }, []);

  function handleSelectPO(po: SearchedPO) {
    setSelectedPO(po);
    setPoSearch(po.poNumber);
    setShowPoDropdown(false);
    setNoPoDecision(false);
    setNoPOReason("");
    setNoPOReasonOther("");
    setNoResultsFor("");
    setFormError("");
    setItems(po.items.filter((it) => !it.isFullyReceived).map(makeItemRowFromPO));
  }

  function handleClearPO() {
    setSelectedPO(null);
    setPoSearch("");
    setPoResults([]);
    setShowPoDropdown(false);
    setItems([]);
    setFormError("");
    setTimeout(() => poInputRef.current?.focus(), 50);
  }

  function handleConfirmNoPO() {
    const reason = noPOReason === "other" ? noPOReasonOther.trim() : noPOReason;
    if (!reason) return;
    setNoPoDecision(true);
    setShowNoPOForm(false);
    setSelectedPO(null);
    setItems([makeManualRow()]);
    setFormError("");
  }

  function handleCancelNoPO() {
    setNoPoDecision(false);
    setShowNoPOForm(false);
    setNoPOReason("");
    setNoPOReasonOther("");
    setItems([]);
  }

  // Item helpers
  function updateItem(rowId: string, updates: Partial<ReceivingItemRow>) {
    setItems((prev) => prev.map((it) =>
      it.rowId === rowId
        ? { ...it, ...updates, errors: { ...it.errors, ...Object.fromEntries(Object.keys(updates).map((k) => [k, ""])) } }
        : it
    ));
  }

  function skipItem(rowId: string) {
    setItems((prev) => prev.map((it) => it.rowId === rowId ? { ...it, skipped: true } : it));
  }

  function removeItem(rowId: string) {
    setItems((prev) => prev.filter((it) => it.rowId !== rowId));
  }

  function addManualItem() {
    setItems((prev) => [...prev, makeManualRow()]);
  }

  // Validation
  function validate(): boolean {
    let valid = true;

    if (!formUnlocked) {
      setFormError("Please select a PO or choose to receive without a PO.");
      return false;
    }

    if (noPoDecision) {
      const reason = noPOReason === "other" ? noPOReasonOther.trim() : noPOReason;
      if (!reason) {
        setFormError("Please select a reason for receiving without a PO.");
        return false;
      }
    }

    const active = items.filter((it) => !it.skipped);
    if (active.length === 0) {
      setFormError("Please add at least one item to receive.");
      return false;
    }

    const updatedItems = items.map((item) => {
      if (item.skipped) return item;
      const errors: Record<string, string> = {};

      if (!item.materialName.trim()) errors.materialName = "Material name is required";
      if (!item.lotNumber.trim()) errors.lotNumber = "Lot number is required";
      const qty = parseFloat(item.qtyReceiving);
      if (!item.qtyReceiving || isNaN(qty) || qty <= 0) errors.qty = "Enter a quantity greater than 0";
      if (!item.decision) errors.decision = "Please select a condition";
      if (item.decision === "accepted_with_conditions" || item.decision === "rejected") {
        if (!item.quarantineReason.trim()) errors.quarantineReason = "Reason is required";
        if (!item.quarantineAction.trim()) errors.quarantineAction = "Action taken is required";
      }

      if (Object.keys(errors).length > 0) valid = false;
      return { ...item, errors };
    });

    setItems(updatedItems);
    if (!valid) setFormError("Please fix the highlighted errors before submitting.");
    else setFormError("");
    return valid;
  }

  // Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setFormError("");

    try {
      const noPOReasonFull = noPoDecision
        ? (noPOReason === "other" ? noPOReasonOther.trim() : noPOReason)
        : undefined;

      const payload = {
        date,
        timeReceived: time,
        poId: selectedPO?.id ?? undefined,
        poNumber: selectedPO?.poNumber ?? undefined,
        noPOReason: noPOReasonFull,
        supplierId: selectedPO?.supplierId ?? undefined,
        supplierName: selectedPO?.supplierName ?? manualSupplierName.trim(),
        items: items
          .filter((it) => !it.skipped)
          .map((it) => ({
            poItemId: it.poItemId,
            materialId: it.materialId ?? undefined,
            materialName: it.materialName.trim(),
            isUnregistered: !it.materialId,
            lotNumber: it.lotNumber.trim().toUpperCase(),
            quantityReceived: parseFloat(it.qtyReceiving),
            unit: it.unit,
            expirationDate: it.expirationDate || undefined,
            decision: it.decision,
            coaRequired: it.coaRequired,
            coaReceived: it.coaRequired ? it.coaReceived : undefined,
            notes: it.notes.trim() || undefined,
            quarantine:
              it.decision === "accepted_with_conditions" || it.decision === "rejected"
                ? {
                    quarantineReason: it.quarantineReason,
                    actionTaken: it.quarantineAction,
                    quarantineLocation: it.quarantineLocation || undefined,
                    adminNotified: it.adminNotified,
                  }
                : undefined,
          })),
      };

      const res = await fetch("/api/receiving/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error ?? "Failed to submit. Please try again.");
        return;
      }

      const data = await res.json();
      const count = data.count ?? 1;
      setToast(`${count} receiving record${count !== 1 ? "s" : ""} submitted successfully.`);

      if (data.poFullyReceived && data.poId && data.poNumber) {
        setPoClosureData({ poId: data.poId, poNumber: data.poNumber, supplierName: selectedPO?.supplierName ?? "" });
      } else {
        setTimeout(() => router.push("/dashboard/supervisor/receiving/records"), 2500);
      }
    } catch {
      setFormError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePoClose(shouldClose: boolean) {
    if (!poClosureData) return;
    if (shouldClose) {
      setClosingPo(true);
      try {
        await fetch(`/api/purchasing/purchase-orders/${poClosureData.poId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "received", actualDeliveryDate: new Date().toISOString() }),
        });
      } catch { /* non-blocking */ }
      finally { setClosingPo(false); }
    }
    setPoClosureData(null);
    router.push("/dashboard/supervisor/receiving/records");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const noPOReasonLabel = noPOReason === "other" ? noPOReasonOther : noPOReason;

  return (
    <div className="max-w-2xl space-y-6 pb-12">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium max-w-sm">
          {toast}
        </div>
      )}

      {/* PO Closure Modal */}
      {poClosureData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <h3 className="font-semibold text-gray-900">All items on PO #{poClosureData.poNumber} have been received.</h3>
            </div>
            <p className="text-sm text-gray-600 mb-5">Mark PO #{poClosureData.poNumber} as closed?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => handlePoClose(false)}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 min-h-[44px]">
                No — Leave Open
              </button>
              <button type="button" onClick={() => handlePoClose(true)} disabled={closingPo}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg min-h-[44px]">
                {closingPo ? "Closing…" : "Yes — Close PO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Receiving</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record incoming material deliveries</p>
        </div>
        <Link href="/dashboard/supervisor/receiving/records" className="btn-secondary flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          View Records
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Step 1: PO Number ─────────────────────────────────────────────── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-base">Step 1 — Purchase Order</h2>

          {/* Selected PO badge */}
          {selectedPO && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-900 font-mono">
                    PO #{selectedPO.poNumber} — {selectedPO.supplierName}
                  </p>
                  {selectedPO.estimatedDeliveryDate && (
                    <p className="text-xs text-emerald-700">
                      Est. delivery: {new Date(selectedPO.estimatedDeliveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
              </div>
              <button type="button" onClick={handleClearPO}
                className="text-xs text-gray-500 hover:text-gray-700 shrink-0 flex items-center gap-1 min-h-[44px]">
                <X className="w-3.5 h-3.5" />Clear
              </button>
            </div>
          )}

          {/* No-PO badge */}
          {noPoDecision && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-amber-800">No PO — {noPOReasonLabel}</span>
              </div>
              <button type="button" onClick={handleCancelNoPO}
                className="text-xs text-gray-500 hover:text-gray-700 shrink-0 min-h-[44px]">Change</button>
            </div>
          )}

          {/* Search input — hidden when PO selected or no-PO decided */}
          {!selectedPO && !noPoDecision && (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                {poSearchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
                )}
                <input
                  ref={poInputRef}
                  type="text"
                  style={inputStyle}
                  className="w-full pl-10 pr-10 py-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Type PO number to search…"
                  value={poSearch}
                  autoComplete="off"
                  onChange={(e) => handlePoSearchChange(e.target.value)}
                  onFocus={() => { if (poResults.length > 0) setShowPoDropdown(true); }}
                  onBlur={() => setTimeout(() => setShowPoDropdown(false), 200)}
                />
              </div>

              {/* Results dropdown */}
              {showPoDropdown && poResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-200 rounded-md shadow-xl mt-1 overflow-hidden">
                  {poResults.map((po) => (
                    <button key={po.id} type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectPO(po)}
                      className="w-full text-left px-4 py-3.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 min-h-[56px] transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold font-mono text-gray-900">{po.poNumber}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {po.supplierName}
                            {" · "}
                            {po.outstandingItemsCount} item{po.outstandingItemsCount !== 1 ? "s" : ""} outstanding
                            {po.estimatedDeliveryDate && ` · Est. ${new Date(po.estimatedDeliveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                          </p>
                        </div>
                        {po.status === "partial" && (
                          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">
                            Partial
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No results found */}
              {!poSearchLoading && noResultsFor && (
                <div className="mt-2 px-1 text-sm text-gray-500">
                  No open PO found for <span className="font-mono font-medium">"{noResultsFor}"</span>.{" "}
                  <button type="button" onClick={() => setShowNoPOForm(true)}
                    className="text-[#D64D4D] hover:underline font-medium">Continue without PO →</button>
                </div>
              )}
            </div>
          )}

          {/* "No PO" escape link */}
          {!selectedPO && !noPoDecision && !showNoPOForm && (
            <p className="text-xs text-gray-400">
              No PO for this delivery?{" "}
              <button type="button" onClick={() => setShowNoPOForm(true)}
                className="text-gray-500 hover:text-gray-700 underline">Receive without PO →</button>
            </p>
          )}

          {/* No-PO reason form */}
          {showNoPOForm && !noPoDecision && (
            <div className="border border-amber-200 rounded-lg bg-amber-50/50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Why is there no PO for this delivery?</p>
              <div className="space-y-2">
                {[
                  "Emergency/urgent order — PO not yet created in QuickBooks",
                  "PO will be created in QuickBooks after delivery",
                  "Supplier sent extra items not on any existing PO",
                  "Sample or trial delivery",
                ].map((reason) => (
                  <label key={reason} className="flex items-start gap-2.5 cursor-pointer min-h-[44px]">
                    <input type="radio" name="noPOReason" value={reason}
                      checked={noPOReason === reason}
                      onChange={() => setNoPOReason(reason)}
                      className="mt-0.5 w-4 h-4 accent-[#D64D4D] shrink-0" />
                    <span className="text-sm text-gray-700">{reason}</span>
                  </label>
                ))}
                <label className="flex items-start gap-2.5 cursor-pointer min-h-[44px]">
                  <input type="radio" name="noPOReason" value="other"
                    checked={noPOReason === "other"}
                    onChange={() => setNoPOReason("other")}
                    className="mt-0.5 w-4 h-4 accent-[#D64D4D] shrink-0" />
                  <span className="text-sm text-gray-700">Other — explain below</span>
                </label>
                {noPOReason === "other" && (
                  <input type="text" style={inputStyle}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 ml-6"
                    value={noPOReasonOther}
                    onChange={(e) => setNoPOReasonOther(e.target.value)}
                    placeholder="Explain why there is no PO…" />
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowNoPOForm(false); setNoPOReason(""); setNoPOReasonOther(""); }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 min-h-[44px]">Cancel</button>
                <button type="button" onClick={handleConfirmNoPO}
                  disabled={!noPOReason || (noPOReason === "other" && !noPOReasonOther.trim())}
                  className="px-5 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors min-h-[44px]">
                  Confirm — Proceed without PO
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Steps 2–4: shown only once PO decision is made ──────────────── */}
        {formUnlocked && (
          <>
            {/* Step 2: Delivery Info */}
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 text-base">Step 2 — Delivery Information</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Received <span className="text-red-500">*</span></label>
                  <input type="date" style={inputStyle} className={inp}
                    value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Received <span className="text-red-500">*</span></label>
                  <input type="text" style={inputStyle} className={inp}
                    value={time} onChange={(e) => setTime(e.target.value)}
                    placeholder="e.g. 9:30 AM" />
                </div>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  Supplier
                  {selectedPO && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                </label>
                {selectedPO ? (
                  <div className={cn(inp, "bg-gray-50 text-gray-700 flex items-center gap-2")}>
                    <span>{selectedPO.supplierName}</span>
                    <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" />from PO
                    </span>
                  </div>
                ) : (
                  <input type="text" style={inputStyle} className={inp}
                    value={manualSupplierName}
                    onChange={(e) => setManualSupplierName(e.target.value)}
                    placeholder="Supplier name" />
                )}
              </div>

              {/* Received By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Received By</label>
                <div className={cn(inp, "bg-gray-50 text-gray-500")}>{session?.user?.name ?? "—"}</div>
              </div>
            </div>

            {/* Step 3: Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 text-base">
                  Step 3 — Items Received
                </h2>
                {items.filter((it) => !it.skipped).length > 0 && (
                  <span className="text-xs text-gray-400">
                    {items.filter((it) => !it.skipped).length} item{items.filter((it) => !it.skipped).length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {items.map((item) => (
                <ItemRow
                  key={item.rowId}
                  item={item}
                  poNumber={selectedPO?.poNumber ?? null}
                  materials={materials}
                  onUpdate={updateItem}
                  onSkip={skipItem}
                  onRemove={removeItem}
                />
              ))}

              {/* Add extra item */}
              <button type="button" onClick={addManualItem}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors min-h-[52px]">
                <Plus className="w-4 h-4" />
                {selectedPO ? "Add item not on this PO" : "Add another item"}
              </button>
            </div>

            {/* Form error */}
            {formError && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full btn-primary py-3.5 text-base font-semibold disabled:opacity-60 flex items-center justify-center gap-2 min-h-[56px]"
            >
              {submitting ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting…</>
              ) : (
                `Submit Receiving Record${items.filter((it) => !it.skipped).length !== 1 ? "s" : ""}`
              )}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
