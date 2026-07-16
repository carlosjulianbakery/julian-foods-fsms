"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderOpen, CheckCircle2, AlertCircle, Search, X,
  Lock, FileText, AlertTriangle, Plus, ChevronDown, Check,
  ShieldAlert, Thermometer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQty } from "@/lib/formatNumber";
import { DateInput } from "@/components/DateInput";

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

// ─── Checklist types ──────────────────────────────────────────────────────────

type CheckStatus = "pending" | "passed" | "failed" | "auto_satisfied";

interface CheckItem {
  id: string;
  group: "auto" | "manual" | "conditional";
  label: string;
  type: "auto" | "manual";
  status: CheckStatus;
  autoSatisfiedFrom?: string;
  failedNote: string;
  isQuarantineTrigger: boolean;
  isAutoQuarantine: boolean;
  helperText?: string;
}

const MANUAL_CHECK_DEFS = [
  { id: "M1", label: "All packaging intact — no tears, punctures, moisture damage, or tampering", isQuarantineTrigger: true, isAutoQuarantine: false },
  { id: "M2", label: "Original manufacturer seals intact on all containers", isQuarantineTrigger: true, isAutoQuarantine: false },
  { id: "M3", label: "No signs of pest activity — no rodents, insects, or pest damage", isQuarantineTrigger: true, isAutoQuarantine: true },
  { id: "M4", label: "No unusual or off odors detected", isQuarantineTrigger: true, isAutoQuarantine: false },
  { id: "M5", label: "No visible foreign objects or contamination", isQuarantineTrigger: true, isAutoQuarantine: true },
  { id: "M6", label: "Number of units/bags/boxes matches delivery note", isQuarantineTrigger: false, isAutoQuarantine: false },
] as const;

// ─── Receiving types ──────────────────────────────────────────────────────────

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
  isOrganic: boolean;
  isAllergen: boolean;
  allergens: string[] | null;
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

interface Supplier { id: string; name: string; }

interface SupplierMaterial {
  id: string;
  name: string;
  unit: string | null;
  category: string | null;
  coaRequired: boolean;
  isTemperatureSensitive: boolean;
  hasSpecialRisk: boolean;
  isOrganic: boolean;
  isAllergen: boolean;
  allergens: string[] | null;
}

interface LotEntry {
  lotId: string;
  lotNumber: string;
  qtyReceiving: string;
  expirationDate: string;
  errors: { lotNumber?: string; qty?: string };
}

interface ReceivingItemRow {
  rowId: string;
  isFromPO: boolean;
  poItemId?: string;
  materialId: string | null;
  materialName: string;
  unit: string;
  coaRequired: boolean;
  isTemperatureSensitive: boolean;
  hasSpecialRisk: boolean;
  isOrganic: boolean;
  isAllergen: boolean;
  allergens: string[] | null;
  isOtherMaterial: boolean;
  qtyOrdered?: number;
  qtyPrevReceived?: number;
  qtyRemaining?: number;
  lots: LotEntry[];
  temperatureOnArrival: string;
  coaReceived: boolean | null;
  notes: string;
  skipped: boolean;
  errors: Record<string, string>;
  materialSearch: string;
  showMaterialDropdown: boolean;
}

// ─── Checklist computation ────────────────────────────────────────────────────

function computeChecks(
  items: ReceivingItemRow[],
  checkStates: Record<string, "pending" | "passed" | "failed">,
  checkNotes: Record<string, string>,
): CheckItem[] {
  const active = items.filter((it) => !it.skipped);
  if (active.length === 0) return [];

  const allHaveLot = active.every((it) => it.lots.every((l) => l.lotNumber.trim()));
  const allRegistered = active.every((it) => !it.isOtherMaterial && !!it.materialId);
  const allHaveQty = active.every((it) => {
    const total = it.lots.reduce((s, l) => s + (parseFloat(l.qtyReceiving) || 0), 0);
    return total > 0;
  });
  const hasOverDelivery = active.some((it) => {
    if (!it.isFromPO || it.qtyRemaining === undefined) return false;
    const total = it.lots.reduce((s, l) => s + (parseFloat(l.qtyReceiving) || 0), 0);
    return total > it.qtyRemaining + 0.01;
  });
  const hasAnyExpiry = active.some((it) => it.lots.some((l) => !!l.expirationDate));
  const hasExpired = active.some((it) => it.lots.filter((l) => l.expirationDate).some((l) => new Date(l.expirationDate) <= new Date()));
  const hasAnyTemp = active.some((it) => it.isTemperatureSensitive);
  const allTempRecorded = active.filter((it) => it.isTemperatureSensitive).every((it) => it.temperatureOnArrival.trim());
  const hasAnyOrganic = active.some((it) => it.isOrganic);
  const hasAnyAllergen = active.some((it) => it.isAllergen);

  const checks: CheckItem[] = [];

  checks.push({ id: "A1", group: "auto", label: "Lot number legible and recorded", type: "auto", status: allHaveLot ? "auto_satisfied" : "pending", autoSatisfiedFrom: "lot number field", failedNote: "", isQuarantineTrigger: false, isAutoQuarantine: false });
  checks.push({ id: "A2", group: "auto", label: "Product label matches what was ordered", type: "auto", status: allRegistered ? "auto_satisfied" : "pending", autoSatisfiedFrom: "material selection", failedNote: "", isQuarantineTrigger: false, isAutoQuarantine: false });
  checks.push({ id: "A3", group: "auto", label: "Quantity received matches delivery", type: "auto", status: allHaveQty && !hasOverDelivery ? "auto_satisfied" : "pending", autoSatisfiedFrom: "quantity field", failedNote: "", isQuarantineTrigger: false, isAutoQuarantine: false });

  if (hasAnyExpiry) {
    checks.push({ id: "A4", group: "auto", label: "Expiration date present and acceptable", type: "auto", status: hasExpired ? "failed" : "auto_satisfied", autoSatisfiedFrom: "expiration date field", failedNote: hasExpired ? "One or more items have an expired date." : "", isQuarantineTrigger: true, isAutoQuarantine: true });
  }
  if (hasAnyTemp) {
    checks.push({ id: "A5", group: "auto", label: "Temperature on arrival recorded", type: "auto", status: allTempRecorded ? "auto_satisfied" : "pending", autoSatisfiedFrom: "temperature field", failedNote: "", isQuarantineTrigger: false, isAutoQuarantine: false });
  }

  for (const def of MANUAL_CHECK_DEFS) {
    const st = checkStates[def.id] ?? "pending";
    checks.push({ ...def, group: "manual", type: "manual", status: st, failedNote: checkNotes[def.id] ?? "" });
  }

  if (hasAnyOrganic) {
    checks.push({ id: "C1", group: "conditional", label: "USDA Organic seal or certification number visible on label", type: "manual", status: checkStates["C1"] ?? "pending", failedNote: checkNotes["C1"] ?? "", isQuarantineTrigger: false, isAutoQuarantine: false, helperText: "Look for the USDA Organic seal or the certifier's name and certificate number." });
  }
  if (hasAnyAllergen) {
    const allergenNames = active
      .filter((it) => it.isAllergen && Array.isArray(it.allergens) && it.allergens.length > 0)
      .flatMap((it) => it.allergens as string[])
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");
    const allergenLabel = allergenNames
      ? `Allergen correctly declared on label — verify: ${allergenNames}`
      : "Allergen correctly declared on label — verify allergen declaration matches material specification";
    checks.push({ id: "C2", group: "conditional", label: allergenLabel, type: "manual", status: checkStates["C2"] ?? "pending", failedNote: checkNotes["C2"] ?? "", isQuarantineTrigger: true, isAutoQuarantine: false });
  }
  if (hasAnyTemp) {
    checks.push({ id: "C3", group: "conditional", label: "No evidence of previous freeze/thaw cycles (no ice crystals, clumping, or texture changes)", type: "manual", status: checkStates["C3"] ?? "pending", failedNote: checkNotes["C3"] ?? "", isQuarantineTrigger: true, isAutoQuarantine: false });
  }

  return checks;
}

// ─── Grouped material list ─────────────────────────────────────────────────────

const CATEGORY_ORDER = ["INGREDIENT", "PACKAGING", "OTHER"];
const CATEGORY_LABEL: Record<string, string> = { INGREDIENT: "INGREDIENTS", PACKAGING: "PACKAGING", OTHER: "OTHER" };

function groupMaterials(materials: SupplierMaterial[], search: string) {
  const q = search.toLowerCase();
  const filtered = q ? materials.filter((m) => m.name.toLowerCase().includes(q)) : materials;
  const groups: Record<string, SupplierMaterial[]> = {};
  for (const m of filtered) { const cat = m.category ?? "OTHER"; (groups[cat] ??= []).push(m); }
  return groups;
}

// ─── CheckRow ─────────────────────────────────────────────────────────────────

function CheckRow({ check, onToggle, onNoteChange }: {
  check: CheckItem;
  onToggle: () => void;
  onNoteChange: (note: string) => void;
}) {
  const isAuto = check.type === "auto";
  const isPassed = check.status === "passed" || check.status === "auto_satisfied";
  const isFailed = check.status === "failed";
  const isPending = check.status === "pending";
  const isAutoSatisfied = check.status === "auto_satisfied";

  return (
    <div className={cn("rounded-lg transition-colors", isFailed && "bg-red-50 border border-red-200 p-3 -mx-1")}>
      <button
        type="button"
        disabled={isAuto}
        onPointerDown={(e) => e.preventDefault()}
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 text-left min-h-[44px] py-1.5",
          isAuto ? "cursor-default" : "cursor-pointer hover:opacity-80 active:opacity-60"
        )}>
        {/* Status dot */}
        <span className={cn(
          "w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-colors",
          isPassed ? "bg-emerald-500 border-emerald-500 text-white" :
          isFailed ? "bg-red-500 border-red-500 text-white" :
          "border-gray-300 bg-white"
        )}>
          {isPassed && <Check className="w-3 h-3" />}
          {isFailed && <X className="w-3 h-3" />}
          {isPending && isAuto && <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" />}
        </span>

        {/* Label */}
        <span className={cn(
          "flex-1 text-sm leading-snug",
          isPassed && "text-emerald-700",
          isFailed && "text-red-700 font-medium",
          isPending && "text-gray-600"
        )}>
          {check.label}
          {isAutoSatisfied && check.autoSatisfiedFrom && (
            <span className="text-xs text-emerald-500 ml-1.5 font-normal">· from {check.autoSatisfiedFrom}</span>
          )}
          {check.helperText && isPending && (
            <span className="block text-xs text-gray-400 mt-0.5">{check.helperText}</span>
          )}
        </span>

        {/* Auto tag */}
        {isAuto && (
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
            isPassed ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"
          )}>auto</span>
        )}
      </button>

      {/* Failed note */}
      {isFailed && (
        <div className="ml-8 mt-2 space-y-1.5">
          {check.isQuarantineTrigger && (
            <p className="text-xs text-amber-700 font-medium">⚠ This failure may require quarantine.</p>
          )}
          <textarea
            className="w-full px-3 py-2 text-sm border border-red-200 rounded-md focus:outline-none focus:ring-1 focus:ring-red-400 resize-none min-h-[56px] bg-white"
            style={{ fontSize: 16 }}
            placeholder="Describe the issue… (required)"
            value={check.failedNote}
            onChange={(e) => onNoteChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

// ─── ChecklistSection ─────────────────────────────────────────────────────────

function ChecklistSection({ checks, onToggle, onNoteChange }: {
  checks: CheckItem[];
  onToggle: (id: string) => void;
  onNoteChange: (id: string, note: string) => void;
}) {
  const total = checks.length;
  const passed = checks.filter((c) => c.status === "passed" || c.status === "auto_satisfied").length;
  const failed = checks.filter((c) => c.status === "failed").length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const allComplete = checks.every((c) => c.status !== "pending");
  const anyFailed = failed > 0;

  const autoChecks = checks.filter((c) => c.group === "auto");
  const manualChecks = checks.filter((c) => c.group === "manual");
  const conditionalChecks = checks.filter((c) => c.group === "conditional");

  return (
    <div className="card p-6 space-y-5">
      {/* Header + progress */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <h2 className={cn("font-semibold text-base",
            allComplete && !anyFailed ? "text-emerald-700" :
            anyFailed ? "text-red-600" :
            "text-gray-900"
          )}>
            {allComplete && !anyFailed
              ? "✓ Food Safety Checklist — All checks complete"
              : anyFailed
              ? `⚠ Checklist — ${failed} failed check${failed !== 1 ? "s" : ""}`
              : "Food Safety Receiving Checklist"}
          </h2>
          <span className="text-xs text-gray-500 shrink-0 ml-2">{passed} of {total}</span>
        </div>
        <p className="text-xs text-gray-400 mb-3">Complete all checks before accepting this delivery.</p>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500",
              anyFailed ? "bg-red-500" : "bg-emerald-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Auto checks */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Auto-Verified</p>
        <div className="divide-y divide-gray-100">
          {autoChecks.map((c) => (
            <CheckRow key={c.id} check={c} onToggle={() => {}} onNoteChange={() => {}} />
          ))}
        </div>
      </div>

      {/* Manual checks */}
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Physical Inspection</p>
        <div className="divide-y divide-gray-100">
          {manualChecks.map((c) => (
            <CheckRow key={c.id} check={c} onToggle={() => onToggle(c.id)} onNoteChange={(n) => onNoteChange(c.id, n)} />
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">Tap each item to mark as passed ✓. Tap again to mark as failed ✗. Tap once more to reset.</p>
      </div>

      {/* Conditional checks */}
      {conditionalChecks.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Additional Checks</p>
          <div className="divide-y divide-gray-100">
            {conditionalChecks.map((c) => (
              <CheckRow key={c.id} check={c} onToggle={() => onToggle(c.id)} onNoteChange={(n) => onNoteChange(c.id, n)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({
  item, poNumber, supplierId, supplierMaterials, noPoMode,
  onUpdate, onSkip, onRemove,
}: {
  item: ReceivingItemRow;
  poNumber: string | null;
  supplierId: string | null;
  supplierMaterials: SupplierMaterial[];
  noPoMode: boolean;
  onUpdate: (rowId: string, updates: Partial<ReceivingItemRow>) => void;
  onSkip: (rowId: string) => void;
  onRemove: (rowId: string) => void;
}) {
  const inp = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500";
  const inputStyle = { fontSize: 16 } as React.CSSProperties;

  const totalQty = item.lots.reduce((s, l) => s + (parseFloat(l.qtyReceiving) || 0), 0);
  const outstanding = item.qtyRemaining ?? 0;
  const showQtyContext = item.isFromPO && outstanding > 0;
  const isOver = showQtyContext && totalQty > outstanding + 0.01;
  const isPartial = showQtyContext && totalQty > 0 && totalQty < outstanding - 0.01;
  const isExact = showQtyContext && totalQty > 0 && Math.abs(totalQty - outstanding) <= 0.01;

  function updateLot(lotId: string, updates: Partial<LotEntry>) {
    onUpdate(item.rowId, {
      lots: item.lots.map((l) =>
        l.lotId === lotId ? { ...l, ...updates, errors: { ...l.errors, ...Object.fromEntries(Object.keys(updates).map((k) => [k, ""])) } } : l
      ),
    });
  }

  function addLot() {
    onUpdate(item.rowId, { lots: [...item.lots, newLotEntry()] });
  }

  function removeLot(lotId: string) {
    if (item.lots.length <= 1) return;
    onUpdate(item.rowId, { lots: item.lots.filter((l) => l.lotId !== lotId) });
  }

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

  const grouped = groupMaterials(supplierMaterials, item.materialSearch);
  const hasGroupedResults = Object.values(grouped).some((g) => g.length > 0);

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {item.isFromPO && poNumber && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">From PO #{poNumber}</span>
            )}
            {!item.isFromPO && poNumber && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500">Not on PO</span>
            )}
            {item.coaRequired && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700"><FileText className="w-3 h-3" />COA Required</span>
            )}
            {item.hasSpecialRisk && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700"><AlertTriangle className="w-3 h-3" />Special Risk</span>
            )}
            {item.isOrganic && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700">🌿 Organic</span>
            )}
            {item.isAllergen && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-600">⚠ Allergen</span>
            )}
            {item.isTemperatureSensitive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700"><Thermometer className="w-3 h-3" />Temp Sensitive</span>
            )}
          </div>

          {/* Material name */}
          {item.isFromPO ? (
            <p className="text-base font-semibold text-gray-900">{item.materialName}</p>
          ) : item.isOtherMaterial ? (
            <div className="space-y-2">
              <input type="text" style={inputStyle}
                className={cn(inp, "text-base font-semibold", item.errors.materialName ? "border-red-400" : "")}
                placeholder="Type material name…"
                value={item.materialName}
                onChange={(e) => onUpdate(item.rowId, { materialName: e.target.value })} />
              <button type="button"
                onClick={() => onUpdate(item.rowId, { isOtherMaterial: false, materialName: "", materialSearch: "", materialId: null })}
                className="text-xs text-gray-400 hover:text-gray-600 underline">← Back to list</button>
            </div>
          ) : (
            <div className="relative">
              {!supplierId ? (
                <div className={cn(inp, "text-sm text-gray-400 bg-gray-50 flex items-center cursor-not-allowed")}>Select a supplier first</div>
              ) : (
                <>
                  <input type="text" style={inputStyle}
                    className={cn(inp, "pr-8 text-base font-semibold", item.errors.materialName ? "border-red-400" : "")}
                    placeholder={supplierMaterials.length === 0 ? "No materials for this supplier" : "Search materials…"}
                    value={item.materialSearch}
                    disabled={supplierMaterials.length === 0}
                    onChange={(e) => onUpdate(item.rowId, { materialSearch: e.target.value, showMaterialDropdown: true, materialId: null, materialName: "", coaRequired: false, isTemperatureSensitive: false, hasSpecialRisk: false, isOrganic: false, isAllergen: false, allergens: null })}
                    onFocus={() => onUpdate(item.rowId, { showMaterialDropdown: true })}
                    onBlur={() => setTimeout(() => onUpdate(item.rowId, { showMaterialDropdown: false }), 200)} />
                  {item.materialId && (
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => onUpdate(item.rowId, { materialId: null, materialName: "", materialSearch: "", showMaterialDropdown: true })}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {item.showMaterialDropdown && (
                    <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto mt-1">
                      {hasGroupedResults ? (
                        CATEGORY_ORDER.filter((cat) => (grouped[cat]?.length ?? 0) > 0).map((cat) => (
                          <div key={cat}>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                              {CATEGORY_LABEL[cat] ?? cat}
                            </div>
                            {grouped[cat].map((m) => (
                              <button key={m.id} type="button"
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={() => onUpdate(item.rowId, {
                                  materialId: m.id, materialName: m.name, materialSearch: m.name,
                                  unit: m.unit ?? "lb", coaRequired: m.coaRequired,
                                  isTemperatureSensitive: m.isTemperatureSensitive, hasSpecialRisk: m.hasSpecialRisk,
                                  isOrganic: m.isOrganic, isAllergen: m.isAllergen, allergens: m.allergens,
                                  showMaterialDropdown: false, isOtherMaterial: false,
                                })}
                                className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 min-h-[44px] flex items-center justify-between gap-2">
                                <span>{m.name}</span>
                                {m.unit && <span className="text-xs text-gray-400 shrink-0">({m.unit})</span>}
                              </button>
                            ))}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-3 text-sm text-gray-400">No matches</div>
                      )}
                      <div className="border-t border-gray-200">
                        <button type="button"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => onUpdate(item.rowId, { isOtherMaterial: true, materialId: null, materialName: item.materialSearch, showMaterialDropdown: false })}
                          className="w-full text-left px-3 py-3 text-sm text-gray-500 hover:bg-gray-50 min-h-[44px] flex items-center gap-2">
                          <Plus className="w-3.5 h-3.5" />Other / Not in list…
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {item.errors.materialName && <p className="text-xs text-red-500 mt-1">{item.errors.materialName}</p>}

          {item.isFromPO && item.qtyOrdered !== undefined && (
            <p className="text-xs text-gray-500 mt-1">
              Ordered: {formatQty(item.qtyOrdered)} {item.unit}
              {(item.qtyPrevReceived ?? 0) > 0 && ` · Prev received: ${formatQty(item.qtyPrevReceived!)} ${item.unit}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-1">
          {item.isFromPO && (
            <button type="button" onClick={() => onSkip(item.rowId)}
              className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap">Not in delivery</button>
          )}
          {!item.isFromPO && (
            <button type="button" onClick={() => onRemove(item.rowId)} className="min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-700" />
            </button>
          )}
        </div>
      </div>

      {/* Unit selector (non-PO items only, applies to all lots) */}
      {!item.isFromPO && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 shrink-0">Unit</label>
          <select style={inputStyle} className={cn(inp, "text-sm w-28")} value={item.unit}
            onChange={(e) => onUpdate(item.rowId, { unit: e.target.value })}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}

      {/* Lots section */}
      <div className="space-y-2">
        {item.lots.map((lot, idx) => (
          <div key={lot.lotId} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3 space-y-3">
            {/* Lot header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {item.lots.length > 1 ? `Lot ${idx + 1}` : "Lot Details"}
              </span>
              {item.lots.length > 1 && (
                <button type="button" onClick={() => removeLot(lot.lotId)}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Lot # */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lot Number <span className="text-red-500">*</span></label>
              <input type="text" style={inputStyle}
                className={cn(inp, "text-sm font-mono", lot.errors.lotNumber ? "border-red-400" : "")}
                value={lot.lotNumber}
                onChange={(e) => updateLot(lot.lotId, { lotNumber: e.target.value.toUpperCase() })}
                placeholder="From delivery label" />
              {lot.errors.lotNumber && <p className="text-xs text-red-500 mt-1">{lot.errors.lotNumber}</p>}
            </div>

            {/* Qty + Unit */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Qty Receiving <span className="text-red-500">*</span></label>
                <input type="number" min="0" step="any" style={inputStyle}
                  className={cn(inp, "text-sm", lot.errors.qty ? "border-red-400" : "")}
                  value={lot.qtyReceiving}
                  onChange={(e) => updateLot(lot.lotId, { qtyReceiving: e.target.value })} />
                {lot.errors.qty && <p className="text-xs text-red-500 mt-1">{lot.errors.qty}</p>}
              </div>
              <div className={cn(inp, "w-20 text-sm bg-gray-50 text-gray-600 flex items-center min-h-[42px] mb-0 shrink-0")}>
                {item.unit}
              </div>
            </div>

            {/* Expiration Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date <span className="text-gray-400 font-normal">(optional)</span></label>
              <DateInput className={cn(inp, "text-sm")} value={lot.expirationDate}
                onChange={(iso) => updateLot(lot.lotId, { expirationDate: iso })} />
            </div>
          </div>
        ))}

        {/* Add another lot */}
        <button type="button" onClick={addLot}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-colors w-full justify-center">
          <Plus className="w-3.5 h-3.5" />Add another lot
        </button>

        {/* Running total (only when > 1 lot) */}
        {item.lots.length > 1 && totalQty > 0 && (
          <p className="text-xs text-gray-500 text-right">
            Total: {formatQty(totalQty)} {item.unit} ({item.lots.length} lots)
          </p>
        )}
      </div>

      {/* Qty validation banners (based on total across all lots) */}
      {showQtyContext && totalQty > 0 && (
        <>
          {isOver && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">⚠ Total across all lots ({formatQty(totalQty)} {item.unit}) exceeds outstanding PO qty of {formatQty(outstanding)} {item.unit}. Over-delivery will be noted.</div>}
          {isPartial && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">ℹ Partial delivery — {formatQty(outstanding - totalQty)} {item.unit} still outstanding. PO stays open.</div>}
          {isExact && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">✓ Covers outstanding PO quantity.</div>}
        </>
      )}

      {/* Temperature (temperature-sensitive materials only) */}
      {item.isTemperatureSensitive && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            <Thermometer className="w-3.5 h-3.5 text-sky-500" />
            Temperature on Arrival <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input type="number" step="0.1" style={inputStyle}
              className={cn(inp, "text-sm flex-1")}
              placeholder="e.g. 38"
              value={item.temperatureOnArrival}
              onChange={(e) => onUpdate(item.rowId, { temperatureOnArrival: e.target.value })} />
            <div className="flex items-center px-3 text-sm text-gray-500 border border-gray-300 rounded-md bg-gray-50">°F</div>
          </div>
        </div>
      )}

      {/* COA */}
      {item.coaRequired && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Was a COA received with this delivery?</label>
          <div className="flex gap-2">
            {[{ val: true, label: "Yes" }, { val: false, label: "No" }].map(({ val, label }) => (
              <button key={label} type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onUpdate(item.rowId, { coaReceived: val })}
                className={cn("px-5 py-2 rounded text-sm font-medium border transition-colors min-h-[44px]",
                  item.coaReceived === val
                    ? val ? "bg-emerald-500 text-white border-emerald-500" : "bg-red-500 text-white border-red-500"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                )}>{label}</button>
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

// ─── Factories ────────────────────────────────────────────────────────────────

let _rowCounter = 0;
let _lotCounter = 0;
function newRowId() { return `row-${++_rowCounter}`; }
function newLotEntry(qty = ""): LotEntry {
  return { lotId: `lot-${++_lotCounter}`, lotNumber: "", qtyReceiving: qty, expirationDate: "", errors: {} };
}

function makeItemRowFromPO(it: SearchedPOItem): ReceivingItemRow {
  return {
    rowId: newRowId(), isFromPO: true, poItemId: it.id,
    materialId: it.materialId, materialName: it.materialName, unit: it.unit,
    coaRequired: it.coaRequired, isTemperatureSensitive: it.isTemperatureSensitive,
    hasSpecialRisk: it.hasSpecialRisk, isOrganic: it.isOrganic, isAllergen: it.isAllergen, allergens: it.allergens,
    isOtherMaterial: false,
    qtyOrdered: it.qtyOrdered, qtyPrevReceived: it.qtyReceived, qtyRemaining: it.qtyRemaining,
    lots: [newLotEntry(String(it.qtyRemaining))],
    temperatureOnArrival: "",
    coaReceived: null, notes: "",
    skipped: false, errors: {}, materialSearch: it.materialName, showMaterialDropdown: false,
  };
}

function makeManualRow(): ReceivingItemRow {
  return {
    rowId: newRowId(), isFromPO: false,
    materialId: null, materialName: "", unit: "lb",
    coaRequired: false, isTemperatureSensitive: false, hasSpecialRisk: false,
    isOrganic: false, isAllergen: false, allergens: null,
    isOtherMaterial: false, lots: [newLotEntry()], temperatureOnArrival: "",
    coaReceived: null, notes: "",
    skipped: false, errors: {}, materialSearch: "", showMaterialDropdown: false,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  // Supplier (no-PO mode)
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [manualSupplierId, setManualSupplierId] = useState("");
  const [manualSupplierName, setManualSupplierName] = useState("");
  const [supplierMaterials, setSupplierMaterials] = useState<SupplierMaterial[]>([]);
  const [supplierMaterialsLoading, setSupplierMaterialsLoading] = useState(false);
  const [supplierChangedWarning, setSupplierChangedWarning] = useState(false);

  // Items
  const [items, setItems] = useState<ReceivingItemRow[]>([]);

  // Checklist state
  const [checkStates, setCheckStates] = useState<Record<string, "pending" | "passed" | "failed">>({});
  const [checkNotes, setCheckNotes] = useState<Record<string, string>>({});

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [poClosureData, setPoClosureData] = useState<{ poId: string; poNumber: string; supplierName: string; } | null>(null);
  const [closingPo, setClosingPo] = useState(false);

  const formUnlocked = selectedPO !== null || noPoDecision;
  const effectiveSupplierId = selectedPO?.supplierId ?? (noPoDecision ? manualSupplierId || null : null);

  // Derived checklist
  const appliedChecks = useMemo(
    () => computeChecks(items, checkStates, checkNotes),
    [items, checkStates, checkNotes]
  );

  const checksPassed = appliedChecks.filter((c) => c.status === "passed" || c.status === "auto_satisfied").length;
  const checksFailed = appliedChecks.filter((c) => c.status === "failed");
  const pendingManual = appliedChecks.filter((c) => c.type === "manual" && c.status === "pending");
  const failedQuarantine = checksFailed.filter((c) => c.isQuarantineTrigger);
  const quarantineTriggered = failedQuarantine.length > 0;

  // Load suppliers
  useEffect(() => {
    fetch("/api/supplier-management/suppliers/brief").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setSuppliers(d); }).catch(() => {});
  }, []);

  // Load supplier materials
  useEffect(() => {
    if (!effectiveSupplierId) { setSupplierMaterials([]); return; }
    setSupplierMaterialsLoading(true);
    fetch(`/api/supplier-management/suppliers/${effectiveSupplierId}/materials`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setSupplierMaterials(d); })
      .catch(() => setSupplierMaterials([]))
      .finally(() => setSupplierMaterialsLoading(false));
  }, [effectiveSupplierId]);

  // PO search debounce
  const handlePoSearchChange = useCallback((value: string) => {
    setPoSearch(value);
    setSelectedPO(null);
    setNoPoDecision(false);
    setNoResultsFor("");
    setItems([]);
    setCheckStates({});
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) { setPoResults([]); setShowPoDropdown(false); return; }
    searchTimer.current = setTimeout(async () => {
      setPoSearchLoading(true);
      try {
        const res = await fetch(`/api/purchasing/purchase-orders/search?q=${encodeURIComponent(value)}&status=sent,partial`);
        const data = await res.json();
        const results: SearchedPO[] = data.purchaseOrders ?? [];
        setPoResults(results);
        setShowPoDropdown(true);
        if (results.length === 0) setNoResultsFor(value); else setNoResultsFor("");
      } catch { setPoResults([]); setShowPoDropdown(false); }
      finally { setPoSearchLoading(false); }
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
    setCheckStates({});
    setCheckNotes({});
    setItems(po.items.filter((it) => !it.isFullyReceived).map(makeItemRowFromPO));
  }

  function handleClearPO() {
    setSelectedPO(null);
    setPoSearch("");
    setPoResults([]);
    setShowPoDropdown(false);
    setItems([]);
    setCheckStates({});
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
    setCheckStates({});
    setCheckNotes({});
    setFormError("");
  }

  function handleCancelNoPO() {
    setNoPoDecision(false);
    setShowNoPOForm(false);
    setNoPOReason("");
    setNoPOReasonOther("");
    setManualSupplierId("");
    setManualSupplierName("");
    setSupplierSearch("");
    setSupplierMaterials([]);
    setItems([]);
    setCheckStates({});
  }

  function handleSelectSupplier(sup: Supplier) {
    const hadSupplier = !!manualSupplierId && manualSupplierId !== sup.id;
    setManualSupplierId(sup.id);
    setManualSupplierName(sup.name);
    setSupplierSearch(sup.name);
    setShowSupplierDropdown(false);
    if (hadSupplier) {
      setItems((prev) => prev.map((it) =>
        it.isFromPO ? it : { ...it, materialId: null, materialName: "", materialSearch: "", isOtherMaterial: false, coaRequired: false, isTemperatureSensitive: false, hasSpecialRisk: false, isOrganic: false, isAllergen: false, allergens: null }
      ));
      setSupplierChangedWarning(true);
      setTimeout(() => setSupplierChangedWarning(false), 5000);
    }
  }

  function toggleCheck(id: string) {
    setCheckStates((prev) => {
      const cur = prev[id] ?? "pending";
      const next = cur === "pending" ? "passed" : cur === "passed" ? "failed" : "pending";
      return { ...prev, [id]: next };
    });
  }

  function setCheckNote(id: string, note: string) {
    setCheckNotes((prev) => ({ ...prev, [id]: note }));
  }

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

  function validate(): boolean {
    let valid = true;

    if (!formUnlocked) { setFormError("Please select a PO or choose to receive without a PO."); return false; }

    if (noPoDecision) {
      const reason = noPOReason === "other" ? noPOReasonOther.trim() : noPOReason;
      if (!reason) { setFormError("Please select a reason for receiving without a PO."); return false; }
    }

    const active = items.filter((it) => !it.skipped);
    if (active.length === 0) { setFormError("Please add at least one item to receive."); return false; }

    // Item validation
    const updatedItems = items.map((item) => {
      if (item.skipped) return item;
      const errors: Record<string, string> = {};
      if (!item.materialName.trim()) errors.materialName = "Material name is required";
      const updatedLots = item.lots.map((lot) => {
        const lotErrors: { lotNumber?: string; qty?: string } = {};
        if (!lot.lotNumber.trim()) lotErrors.lotNumber = "Lot number is required";
        const qty = parseFloat(lot.qtyReceiving);
        if (!lot.qtyReceiving || isNaN(qty) || qty <= 0) lotErrors.qty = "Enter a quantity greater than 0";
        if (Object.keys(lotErrors).length > 0) valid = false;
        return { ...lot, errors: lotErrors };
      });
      if (Object.keys(errors).length > 0) valid = false;
      return { ...item, errors, lots: updatedLots };
    });
    setItems(updatedItems);

    // Checklist validation
    if (appliedChecks.length > 0) {
      if (pendingManual.length > 0) {
        setFormError(`Complete all ${pendingManual.length} pending physical inspection check${pendingManual.length !== 1 ? "s" : ""} before submitting.`);
        return false;
      }
      const failedNoNote = checksFailed.filter((c) => !c.failedNote.trim());
      if (failedNoNote.length > 0) {
        setFormError("Add a note for each failed check before submitting.");
        return false;
      }
    }

    if (!valid) setFormError("Please fix the highlighted errors before submitting.");
    else setFormError("");
    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setFormError("");

    try {
      const noPOReasonFull = noPoDecision ? (noPOReason === "other" ? noPOReasonOther.trim() : noPOReason) : undefined;

      const checklistResults = appliedChecks.length > 0 ? {
        version: 2,
        checks: appliedChecks.map((c) => ({
          id: c.id, label: c.label, type: c.type,
          status: c.status, autoSatisfiedFrom: c.autoSatisfiedFrom ?? null,
          failedNote: c.failedNote || null, isQuarantineTrigger: c.isQuarantineTrigger,
        })),
        allPassed: checksFailed.length === 0,
        anyFailed: checksFailed.length > 0,
        quarantineTriggered,
        completedAt: new Date().toISOString(),
      } : undefined;

      const checklistQuarantine = quarantineTriggered ? {
        reason: failedQuarantine.map((c) => c.label).join("; "),
        notes: failedQuarantine.filter((c) => c.failedNote).map((c) => `${c.label}: ${c.failedNote}`).join("\n"),
        isRequired: failedQuarantine.some((c) => c.isAutoQuarantine),
      } : undefined;

      const payload = {
        date, timeReceived: time,
        poId: selectedPO?.id ?? undefined,
        poNumber: selectedPO?.poNumber ?? undefined,
        noPOReason: noPOReasonFull,
        supplierId: selectedPO?.supplierId ?? (noPoDecision ? manualSupplierId || undefined : undefined),
        supplierName: selectedPO?.supplierName ?? manualSupplierName.trim(),
        checklistResults,
        checklistQuarantine,
        items: items.filter((it) => !it.skipped).flatMap((it) =>
          it.lots.map((lot) => ({
            poItemId: it.poItemId,
            materialId: it.materialId ?? undefined,
            materialName: it.materialName.trim(),
            isUnregistered: !it.materialId,
            lotNumber: lot.lotNumber.trim().toUpperCase(),
            quantityReceived: parseFloat(lot.qtyReceiving),
            unit: it.unit,
            expirationDate: lot.expirationDate || undefined,
            coaRequired: it.coaRequired,
            coaReceived: it.coaRequired ? it.coaReceived : undefined,
            notes: it.notes.trim() || undefined,
            temperatureOnArrival: it.temperatureOnArrival || undefined,
          }))
        ),
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

  // ── Derived UI state ─────────────────────────────────────────────────────────

  const noPOReasonLabel = noPOReason === "other" ? noPOReasonOther : noPOReason;
  const filteredSuppliers = supplierSearch.trim()
    ? suppliers.filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
    : suppliers;

  const activeItemCount = items.filter((it) => !it.skipped).length;
  const checklistVisible = formUnlocked && activeItemCount > 0;

  // Submit button state
  const checklistBlocking = checklistVisible && pendingManual.length > 0;
  const submitLabel = submitting
    ? "Submitting…"
    : quarantineTriggered
    ? `Submit with Quarantine Record${activeItemCount !== 1 ? "s" : ""}`
    : `Submit Receiving Record${activeItemCount !== 1 ? "s" : ""}`;

  return (
    <div className="max-w-2xl space-y-6 pb-12">

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium max-w-sm">
          {toast}
        </div>
      )}

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

      <div className="page-header">
        <div>
          <h1 className="page-title">Receiving</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record incoming material deliveries</p>
        </div>
        <Link href="/dashboard/supervisor/receiving/records" className="btn-secondary flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />View Records
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Step 1: PO */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-base">Step 1 — Purchase Order</h2>

          {selectedPO && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-900 font-mono">PO #{selectedPO.poNumber} — {selectedPO.supplierName}</p>
                  {selectedPO.estimatedDeliveryDate && (
                    <p className="text-xs text-emerald-700">Est. delivery: {new Date(selectedPO.estimatedDeliveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  )}
                </div>
              </div>
              <button type="button" onClick={handleClearPO} className="text-xs text-gray-500 hover:text-gray-700 shrink-0 flex items-center gap-1 min-h-[44px]">
                <X className="w-3.5 h-3.5" />Clear
              </button>
            </div>
          )}

          {noPoDecision && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-amber-800">No PO — {noPOReasonLabel}</span>
              </div>
              <button type="button" onClick={handleCancelNoPO} className="text-xs text-gray-500 hover:text-gray-700 shrink-0 min-h-[44px]">Change</button>
            </div>
          )}

          {!selectedPO && !noPoDecision && (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                {poSearchLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />}
                <input ref={poInputRef} type="text" style={inputStyle}
                  className="w-full pl-10 pr-10 py-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Type PO number to search…" value={poSearch} autoComplete="off"
                  onChange={(e) => handlePoSearchChange(e.target.value)}
                  onFocus={() => { if (poResults.length > 0) setShowPoDropdown(true); }}
                  onBlur={() => setTimeout(() => setShowPoDropdown(false), 200)} />
              </div>
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
                            {po.supplierName} · {po.outstandingItemsCount} item{po.outstandingItemsCount !== 1 ? "s" : ""} outstanding
                            {po.estimatedDeliveryDate && ` · Est. ${new Date(po.estimatedDeliveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                          </p>
                        </div>
                        {po.status === "partial" && (
                          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">Partial</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {!poSearchLoading && noResultsFor && (
                <div className="mt-2 px-1 text-sm text-gray-500">
                  No open PO found for <span className="font-mono font-medium">"{noResultsFor}"</span>.{" "}
                  <button type="button" onClick={() => setShowNoPOForm(true)} className="text-[#D64D4D] hover:underline font-medium">Continue without PO →</button>
                </div>
              )}
            </div>
          )}

          {!selectedPO && !noPoDecision && !showNoPOForm && (
            <p className="text-xs text-gray-400">
              No PO for this delivery?{" "}
              <button type="button" onClick={() => setShowNoPOForm(true)} className="text-gray-500 hover:text-gray-700 underline">Receive without PO →</button>
            </p>
          )}

          {showNoPOForm && !noPoDecision && (
            <div className="border border-amber-200 rounded-lg bg-amber-50/50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Why is there no PO for this delivery?</p>
              <div className="space-y-2">
                {[
                  "Emergency/urgent order — PO not yet created in QuickBooks",
                  "PO will be created in QuickBooks after delivery",
                  "Supplier sent items not on any existing PO",
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

        {formUnlocked && (
          <>
            {/* Step 2: Delivery Info */}
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 text-base">Step 2 — Delivery Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Received <span className="text-red-500">*</span></label>
                  <DateInput className={inp} value={date} onChange={(iso) => setDate(iso)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Received <span className="text-red-500">*</span></label>
                  <input type="text" style={inputStyle} className={inp} value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 9:30 AM" />
                </div>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  Supplier {selectedPO && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                </label>
                {selectedPO ? (
                  <div className={cn(inp, "bg-gray-50 text-gray-700 flex items-center gap-2")}>
                    <span>{selectedPO.supplierName}</span>
                    <span className="ml-auto text-xs text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" />from PO</span>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input type="text" style={inputStyle}
                      className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="Search suppliers…" value={supplierSearch} autoComplete="off"
                      onChange={(e) => { setSupplierSearch(e.target.value); if (!e.target.value) { setManualSupplierId(""); setManualSupplierName(""); } setShowSupplierDropdown(true); }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)} />
                    {showSupplierDropdown && (
                      <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-200 rounded-md shadow-xl mt-1 max-h-56 overflow-y-auto">
                        {filteredSuppliers.length === 0 ? (
                          <div className="px-3 py-3 text-sm text-gray-400">No suppliers found</div>
                        ) : filteredSuppliers.map((s) => (
                          <button key={s.id} type="button"
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectSupplier(s)}
                            className={cn("w-full text-left px-3 py-3 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 min-h-[44px] flex items-center",
                              manualSupplierId === s.id && "bg-emerald-50 font-medium text-emerald-800"
                            )}>{s.name}</button>
                        ))}
                      </div>
                    )}
                    {supplierChangedWarning && (
                      <p className="text-xs text-amber-600 mt-1.5">Supplier changed — please re-select materials on existing items.</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Received By</label>
                <div className={cn(inp, "bg-gray-50 text-gray-500")}>{session?.user?.name ?? "—"}</div>
              </div>
            </div>

            {/* Step 3: Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 text-base">Step 3 — Items Received</h2>
                {activeItemCount > 0 && <span className="text-xs text-gray-400">{activeItemCount} item{activeItemCount !== 1 ? "s" : ""}</span>}
              </div>

              {supplierMaterialsLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
                  <div className="w-3 h-3 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                  Loading materials for this supplier…
                </div>
              )}

              {items.map((item) => (
                <ItemRow key={item.rowId} item={item} poNumber={selectedPO?.poNumber ?? null}
                  supplierId={effectiveSupplierId} supplierMaterials={supplierMaterials}
                  noPoMode={noPoDecision} onUpdate={updateItem} onSkip={skipItem} onRemove={removeItem} />
              ))}

              <button type="button" onClick={addManualItem}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors min-h-[52px]">
                <Plus className="w-4 h-4" />Add Item
              </button>
            </div>

            {/* Step 4: Checklist */}
            {checklistVisible && (
              <ChecklistSection checks={appliedChecks} onToggle={toggleCheck} onNoteChange={setCheckNote} />
            )}

            {/* Quarantine banner */}
            {quarantineTriggered && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                  <h3 className="font-semibold text-red-800">Quarantine Required</h3>
                </div>
                <p className="text-sm text-red-700">One or more failed checks require this delivery to be quarantined pending review.</p>
                <div className="space-y-1">
                  {failedQuarantine.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-sm text-red-700">
                      <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />{c.label}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-red-600">A quarantine record will be created automatically when you submit.</p>
              </div>
            )}

            {/* Form error */}
            {formError && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />{formError}
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={submitting || checklistBlocking}
              className={cn(
                "w-full py-3.5 text-base font-semibold disabled:opacity-60 flex items-center justify-center gap-2 min-h-[56px] rounded-lg transition-colors",
                quarantineTriggered
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "btn-primary"
              )}>
              {submitting
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting…</>
                : submitLabel}
            </button>
            {checklistBlocking && (
              <p className="text-center text-xs text-gray-500">
                Complete all {pendingManual.length} pending physical inspection check{pendingManual.length !== 1 ? "s" : ""} before submitting.
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}
