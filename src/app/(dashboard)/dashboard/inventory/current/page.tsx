"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateUtils";
import { aggregateInStandardUnit } from "@/lib/unitConversion";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface InventoryLot {
  id: string;
  materialId: string;
  materialName: string;
  supplierId: string | null;
  supplierName: string;
  brandId: string | null;
  brandName: string | null;
  lotNumber: string;
  quantityReceived: number;
  quantityRemaining: number;
  unit: string;
  receivedDate: string;
  expirationDate: string | null;
  status: string;
  isConditional: boolean;
  conditionalNotes: string | null;
  receivingRecordId: string | null;
  initialStockEntry: { enteredAt: string; enteredBy: { name: string } } | null;
  material: {
    minimumStockQuantity: number | null;
    minimumStockUnit: string | null;
    unit: string | null;
    category: "INGREDIENT" | "PACKAGING" | "OTHER";
  };
}

type ViewMode = "material" | "lot";
type SortDir = "asc" | "desc";
type SortCol =
  | "materialName"
  | "category"
  | "lotNumber"
  | "supplierName"
  | "quantityRemaining"
  | "unit"
  | "receivedDate"
  | "expirationDate"
  | "status";

// ─── Constants ──────────────────────────────────────────────────────────────────

const EXPIRING_DAYS = 60;
const STATUS_ORDER: Record<string, number> = {
  expired: 0, recalled: 1, quarantined: 2, depleted: 3,
  expiring_soon: 4, low_stock: 5, conditional: 6, active: 7,
};

const STATUS_CONFIG: Record<string, { label: string; dot: string; row: string; badge: string }> = {
  active:        { label: "Active",        dot: "bg-emerald-500", row: "",              badge: "bg-emerald-100 text-emerald-700" },
  low_stock:     { label: "Low Stock",     dot: "bg-amber-500",   row: "bg-amber-50",   badge: "bg-amber-100 text-amber-700" },
  expiring_soon: { label: "Expiring Soon", dot: "bg-amber-500",   row: "bg-amber-50",   badge: "bg-amber-100 text-amber-800" },
  conditional:   { label: "Conditional",   dot: "bg-blue-500",    row: "",              badge: "bg-blue-100 text-blue-700" },
  depleted:      { label: "Depleted",      dot: "bg-gray-400",    row: "bg-gray-50",    badge: "bg-gray-100 text-gray-500" },
  expired:       { label: "Expired",       dot: "bg-red-500",     row: "bg-red-50/50",  badge: "bg-red-100 text-red-600" },
  recalled:      { label: "Recalled",      dot: "bg-red-900",     row: "bg-red-50/50",  badge: "bg-red-900/20 text-red-900" },
  quarantined:   { label: "Quarantined",   dot: "bg-red-500",     row: "bg-red-50/50",  badge: "bg-red-100 text-red-700" },
};

const CATEGORY_LABELS: Record<string, string> = {
  INGREDIENT: "Ingredient",
  PACKAGING: "Packaging",
  OTHER: "Other",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null | undefined) => formatDate(d ?? null);

function getDisplayStatus(lot: InventoryLot): string {
  if (lot.status === "active" && lot.expirationDate) {
    const diffMs = new Date(lot.expirationDate).getTime() - Date.now();
    const days = Math.ceil(diffMs / 86400000);
    if (days > 0 && days <= EXPIRING_DAYS) return "expiring_soon";
  }
  return lot.status;
}

function worstStatus(statuses: string[]): string {
  let worst = "active";
  let worstScore = STATUS_ORDER["active"] ?? 99;
  for (const s of statuses) {
    const score = STATUS_ORDER[s] ?? 99;
    if (score < worstScore) { worst = s; worstScore = score; }
  }
  return worst;
}

function dotColor(status: string): string {
  return STATUS_CONFIG[status]?.dot ?? "bg-gray-400";
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status.toUpperCase(), badge: "bg-gray-100 text-gray-600" };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono", cfg.badge)}>
      {cfg.label.toUpperCase()}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const cls =
    category === "INGREDIENT" ? "bg-lime-100 text-lime-700" :
    category === "PACKAGING"  ? "bg-sky-100 text-sky-700"  :
                                "bg-gray-100 text-gray-600";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono", cls)}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol | null; sortDir: SortDir }) {
  if (sortCol !== col) {
    return <span className="text-gray-300 ml-0.5">↕</span>;
  }
  return <span className="text-[#D64D4D] ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

// ─── Adjust modal ──────────────────────────────────────────────────────────────

function AdjustModal({
  lot,
  onClose,
  onDone,
}: {
  lot: InventoryLot;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!qty) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/lots/${lot.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustmentQty: parseFloat(qty), notes }),
      });
      if (res.ok) { onDone(); onClose(); }
      else { const d = await res.json(); alert(d.error ?? "Failed to adjust."); }
    } finally { setBusy(false); }
  }

  const newQty = qty ? Math.max(0, lot.quantityRemaining + parseFloat(qty || "0")) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-900">Manual Adjustment</p>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div>
          <p className="text-sm text-gray-600">{lot.materialName}</p>
          <p className="text-xs font-mono text-gray-500 mt-0.5">Lot {lot.lotNumber}</p>
          <p className="text-xs text-gray-400 mt-0.5">Current: {lot.quantityRemaining} {lot.unit}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment (+ or −)</label>
          <input
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="e.g. -2.5"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#D64D4D]"
          />
          {newQty !== null && (
            <p className="text-xs text-gray-400 mt-1">
              New qty: {newQty.toFixed(3)} {lot.unit}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for adjustment…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none min-h-[60px]"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button
            onClick={apply}
            disabled={!qty || busy}
            className="flex-1 px-3 py-2 text-sm bg-[#D64D4D] text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lot actions (desktop: inline buttons / mobile: "…" menu) ─────────────────

function LotActions({
  lot,
  isAdmin,
  onAdjust,
}: {
  lot: InventoryLot;
  isAdmin: boolean;
  onAdjust: (lot: InventoryLot) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const historyHref = `/dashboard/inventory/movements?lot=${encodeURIComponent(lot.lotNumber)}`;
  const countHref   = `/dashboard/inventory/cycle-count?materialId=${lot.materialId}&lotId=${lot.id}`;

  return (
    <>
      {/* Desktop */}
      <div className="hidden sm:flex items-center gap-1.5">
        <Link
          href={countHref}
          className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#D64D4D] hover:text-[#D64D4D] transition-colors whitespace-nowrap"
        >
          Count
        </Link>
        <Link
          href={historyHref}
          className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#D64D4D] hover:text-[#D64D4D] transition-colors whitespace-nowrap"
        >
          History
        </Link>
        {isAdmin && (
          <button
            onClick={() => onAdjust(lot)}
            className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#D64D4D] hover:text-[#D64D4D] transition-colors whitespace-nowrap"
          >
            Adjust
          </button>
        )}
      </div>

      {/* Mobile: … menu */}
      <div className="sm:hidden relative" ref={ref}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:text-gray-700"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
            <Link
              href={countHref}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setMenuOpen(false)}
            >
              Cycle Count
            </Link>
            <Link
              href={historyHref}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setMenuOpen(false)}
            >
              View History
            </Link>
            {isAdmin && (
              <button
                onClick={() => { setMenuOpen(false); onAdjust(lot); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Adjust
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── By-Material grouped view ──────────────────────────────────────────────────

interface MaterialGroup {
  materialId: string;
  materialName: string;
  category: "INGREDIENT" | "PACKAGING" | "OTHER";
  worstDisplayStatus: string;
  lots: InventoryLot[];
  totalAgg: ReturnType<typeof aggregateInStandardUnit>;
  standardUnit: string | null;
  supplierNames: string[];
}

function buildMaterialGroups(lots: InventoryLot[]): MaterialGroup[] {
  const map = new Map<string, MaterialGroup>();

  for (const lot of lots) {
    const displayStatus = getDisplayStatus(lot);
    const existing = map.get(lot.materialId);
    if (!existing) {
      map.set(lot.materialId, {
        materialId:  lot.materialId,
        materialName: lot.materialName,
        category: lot.material.category,
        worstDisplayStatus: displayStatus,
        lots: [lot],
        totalAgg: { total: 0, possible: true, mismatches: [] },
        standardUnit: lot.material.unit,
        supplierNames: lot.supplierName ? [lot.supplierName] : [],
      });
    } else {
      existing.lots.push(lot);
      const score = STATUS_ORDER[displayStatus] ?? 99;
      if (score < (STATUS_ORDER[existing.worstDisplayStatus] ?? 99)) {
        existing.worstDisplayStatus = displayStatus;
      }
      if (lot.supplierName && !existing.supplierNames.includes(lot.supplierName)) {
        existing.supplierNames.push(lot.supplierName);
      }
    }
  }

  // Compute totals (active + low_stock + conditional only)
  Array.from(map.values()).forEach((group) => {
    const countable = group.lots.filter((l: InventoryLot) => ["active", "low_stock", "conditional"].includes(l.status));
    const targetUnit = group.standardUnit ?? (countable[0]?.unit ?? group.lots[0]?.unit ?? "");
    group.totalAgg = aggregateInStandardUnit(
      countable.map((l: InventoryLot) => ({ quantity: l.quantityRemaining, unit: l.unit })),
      targetUnit
    );
  });

  return Array.from(map.values()).sort((a, b) => a.materialName.localeCompare(b.materialName));
}

function MaterialGroupRow({
  group,
  expanded,
  onToggle,
  isAdmin,
  onAdjust,
}: {
  group: MaterialGroup;
  expanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onAdjust: (lot: InventoryLot) => void;
}) {
  const dot = dotColor(group.worstDisplayStatus);
  const standardUnit = group.standardUnit ?? group.lots[0]?.unit ?? "";
  const totalLots = group.lots.length;
  const activeLots = group.lots.filter((l) => ["active", "low_stock", "conditional"].includes(l.status)).length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-2">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-left transition-colors min-h-[52px]"
      >
        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{group.materialName}</span>
            <CategoryBadge category={group.category} />
            {group.worstDisplayStatus !== "active" && group.worstDisplayStatus !== "conditional" && (
              <StatusBadge status={group.worstDisplayStatus} />
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {group.supplierNames.length > 0 && (
              <span className="text-xs text-gray-400">{group.supplierNames.slice(0, 2).join(", ")}{group.supplierNames.length > 2 ? " +" + (group.supplierNames.length - 2) + " more" : ""}</span>
            )}
            <span className="text-xs text-gray-500">
              {group.totalAgg.possible
                ? `${group.totalAgg.total.toFixed(2)} ${standardUnit}`
                : `${activeLots} lot${activeLots !== 1 ? "s" : ""}`
              }
              {" · "}{totalLots} lot{totalLots !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-gray-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded lot rows */}
      {expanded && (
        <div className="border-t border-gray-200 divide-y divide-gray-100">
          {group.lots.map((lot) => {
            const ds = getDisplayStatus(lot);
            const rowBg = STATUS_CONFIG[ds]?.row ?? "";
            return (
              <div key={lot.id} className={cn("px-4 py-3", rowBg)}>
                {/* Desktop lot row */}
                <div className="hidden md:flex items-center gap-4">
                  <span className="font-mono text-xs text-gray-500 w-[110px] shrink-0">{lot.lotNumber}</span>
                  <span className="text-xs text-gray-500 w-[130px] shrink-0 truncate">{lot.supplierName || "—"}</span>
                  <span className={cn("text-sm font-semibold w-[90px] shrink-0", ds === "low_stock" ? "text-amber-600" : "text-gray-800")}>
                    {lot.quantityRemaining} <span className="text-xs font-normal text-gray-500">{lot.unit}</span>
                  </span>
                  <span className="text-xs text-gray-500 w-[90px] shrink-0">{fmtDate(lot.receivedDate)}</span>
                  <span className={cn("text-xs w-[100px] shrink-0", ds === "expiring_soon" ? "text-amber-600 font-medium" : "text-gray-500")}>
                    {lot.expirationDate ? fmtDate(lot.expirationDate) : "—"}
                  </span>
                  <div className="w-[90px] shrink-0"><StatusBadge status={ds} /></div>
                  <div className="ml-auto shrink-0">
                    <LotActions lot={lot} isAdmin={isAdmin} onAdjust={onAdjust} />
                  </div>
                </div>

                {/* Mobile lot card — stacked */}
                <div className="md:hidden space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-700 font-medium">{lot.lotNumber}</span>
                    <StatusBadge status={ds} />
                  </div>
                  {lot.supplierName && (
                    <p className="text-xs text-gray-500">Supplier: {lot.supplierName}</p>
                  )}
                  <p className={cn("text-xs font-semibold", ds === "low_stock" ? "text-amber-600" : "text-gray-800")}>
                    Qty: {lot.quantityRemaining} {lot.unit}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>Received: {fmtDate(lot.receivedDate)}</span>
                    {lot.expirationDate && (
                      <span className={ds === "expiring_soon" ? "text-amber-600" : ""}>
                        Exp: {fmtDate(lot.expirationDate)}
                      </span>
                    )}
                  </div>
                  <div className="pt-1">
                    <LotActions lot={lot} isAdmin={isAdmin} onAdjust={onAdjust} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Total row */}
          {group.lots.filter((l) => ["active", "low_stock", "conditional"].includes(l.status)).length > 1 && (
            <div className="px-4 py-2 bg-gray-50 flex items-center gap-2">
              <span className="text-[11px] font-mono text-gray-400 pl-[14px]">└─ TOTAL</span>
              {group.totalAgg.possible ? (
                <span className="text-[11px] font-semibold font-mono text-gray-700">
                  {group.totalAgg.total.toFixed(3)} {standardUnit}
                  <span className="text-gray-400 font-normal ml-1">(active lots, converted)</span>
                </span>
              ) : (
                <span className="text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Mixed units — cannot aggregate
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── By-Lot table view ─────────────────────────────────────────────────────────

const SORT_COLS: { key: SortCol; label: string; minW: string }[] = [
  { key: "materialName",    label: "Material",    minW: "min-w-[140px]" },
  { key: "category",        label: "Category",    minW: "min-w-[100px]" },
  { key: "lotNumber",       label: "Lot #",       minW: "min-w-[110px]" },
  { key: "supplierName",    label: "Supplier",    minW: "min-w-[130px]" },
  { key: "quantityRemaining", label: "Qty Remaining", minW: "min-w-[100px]" },
  { key: "unit",            label: "Unit",        minW: "min-w-[60px]" },
  { key: "receivedDate",    label: "Received",    minW: "min-w-[100px]" },
  { key: "expirationDate",  label: "Expiration",  minW: "min-w-[110px]" },
  { key: "status",          label: "Status",      minW: "min-w-[100px]" },
];

function sortLots(lots: InventoryLot[], col: SortCol, dir: SortDir): InventoryLot[] {
  return [...lots].sort((a, b) => {
    let cmp = 0;
    if (col === "materialName") cmp = a.materialName.localeCompare(b.materialName);
    else if (col === "category") cmp = a.material.category.localeCompare(b.material.category);
    else if (col === "lotNumber") cmp = a.lotNumber.localeCompare(b.lotNumber);
    else if (col === "supplierName") cmp = a.supplierName.localeCompare(b.supplierName);
    else if (col === "quantityRemaining") cmp = a.quantityRemaining - b.quantityRemaining;
    else if (col === "unit") cmp = a.unit.localeCompare(b.unit);
    else if (col === "receivedDate") cmp = a.receivedDate.localeCompare(b.receivedDate);
    else if (col === "expirationDate") {
      if (!a.expirationDate && !b.expirationDate) cmp = 0;
      else if (!a.expirationDate) cmp = 1;
      else if (!b.expirationDate) cmp = -1;
      else cmp = a.expirationDate.localeCompare(b.expirationDate);
    } else if (col === "status") {
      const sa = STATUS_ORDER[getDisplayStatus(a)] ?? 99;
      const sb = STATUS_ORDER[getDisplayStatus(b)] ?? 99;
      cmp = sa - sb;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function LotTable({
  lots,
  isAdmin,
  sortCol,
  sortDir,
  onSort,
  onAdjust,
}: {
  lots: InventoryLot[];
  isAdmin: boolean;
  sortCol: SortCol | null;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  onAdjust: (lot: InventoryLot) => void;
}) {
  const sorted = useMemo(
    () => sortCol ? sortLots(lots, sortCol, sortDir) : sortLots(lots, "materialName", "asc"),
    [lots, sortCol, sortDir]
  );

  return (
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="sticky top-0 z-10 bg-white border-b border-gray-200">
          <tr>
            {SORT_COLS.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 whitespace-nowrap",
                  col.minW
                )}
                onClick={() => onSort(col.key)}
              >
                {col.label}
                <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
              </th>
            ))}
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[100px]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={10} className="text-center py-10 text-sm text-gray-400">
                No lots match the current filters.
              </td>
            </tr>
          ) : sorted.map((lot) => {
            const ds = getDisplayStatus(lot);
            const rowBg = STATUS_CONFIG[ds]?.row ?? "";
            const isDepleted = lot.status === "depleted";
            return (
              <tr key={lot.id} className={cn("border-b border-gray-100 hover:bg-gray-50/50 transition-colors", rowBg)}>
                <td className="px-3 py-2.5 text-xs font-medium min-w-[140px]">
                  <span className={isDepleted ? "line-through text-gray-400" : ""}>{lot.materialName}</span>
                </td>
                <td className="px-3 py-2.5 min-w-[100px]">
                  <CategoryBadge category={lot.material.category} />
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-600 min-w-[110px]">{lot.lotNumber}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600 min-w-[130px]">{lot.supplierName || "—"}</td>
                <td className={cn("px-3 py-2.5 text-xs font-semibold min-w-[100px]", ds === "low_stock" ? "text-amber-600" : isDepleted ? "text-gray-400 line-through" : "text-gray-800")}>
                  {lot.quantityRemaining}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500 min-w-[60px]">{lot.unit}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500 min-w-[100px]">{fmtDate(lot.receivedDate)}</td>
                <td className={cn("px-3 py-2.5 text-xs min-w-[110px]", ds === "expiring_soon" ? "text-amber-600 font-medium" : "text-gray-500")}>
                  {lot.expirationDate ? fmtDate(lot.expirationDate) : "—"}
                </td>
                <td className="px-3 py-2.5 min-w-[100px]"><StatusBadge status={ds} /></td>
                <td className="px-3 py-2.5 min-w-[100px]">
                  <LotActions lot={lot} isAdmin={isAdmin} onAdjust={onAdjust} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS = [
  { key: "active",        label: "Active" },
  { key: "low_stock",     label: "Low Stock" },
  { key: "expiring_soon", label: "Expiring Soon" },
  { key: "expired",       label: "Expired" },
];

export default function CurrentStockPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("material");
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());
  const [showDepleted, setShowDepleted] = useState(false);

  const [adjustLot, setAdjustLot] = useState<InventoryLot | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchLots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/current");
      if (res.ok) {
        setLots(await res.json());
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLots(); }, [fetchLots]);

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filteredLots = useMemo(() => {
    const q = search.toLowerCase().trim();

    return lots.filter((lot) => {
      const ds = getDisplayStatus(lot);

      // Depleted toggle
      if (lot.status === "depleted" && !showDepleted) return false;

      // Status filter
      if (statusFilters.size > 0 && !statusFilters.has(ds)) return false;

      // Category filter
      if (categoryFilter && lot.material.category !== categoryFilter) return false;

      // Text search
      if (q) {
        const haystack = [
          lot.materialName,
          lot.lotNumber,
          lot.supplierName,
          lot.brandName ?? "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [lots, search, statusFilters, categoryFilter, showDepleted]);

  // ── Summary counts ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const materialIds = new Set(filteredLots.map((l) => l.materialId));
    const lowStock = filteredLots.filter((l) => l.status === "low_stock").length;
    const expiringSoon = filteredLots.filter((l) => getDisplayStatus(l) === "expiring_soon").length;
    return { materials: materialIds.size, lots: filteredLots.length, lowStock, expiringSoon };
  }, [filteredLots]);

  // ── Depleted count (for toggle label) ───────────────────────────────────────
  const depletedCount = useMemo(() => lots.filter((l) => l.status === "depleted").length, [lots]);

  // ── Column sort handler ──────────────────────────────────────────────────────
  function handleSort(col: SortCol) {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // ── Status filter toggle ─────────────────────────────────────────────────────
  function toggleStatusFilter(key: string) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Material group expansion ─────────────────────────────────────────────────
  function toggleMaterial(materialId: string) {
    setExpandedMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  }

  // ── Material groups ──────────────────────────────────────────────────────────
  const materialGroups = useMemo(() => buildMaterialGroups(filteredLots), [filteredLots]);

  // ── Active filter tag list ───────────────────────────────────────────────────
  const activeFilterTags: Array<{ label: string; onRemove: () => void }> = [
    ...Array.from(statusFilters).map((s) => ({
      label: STATUS_CONFIG[s]?.label ?? s,
      onRemove: () => toggleStatusFilter(s),
    })),
    ...(categoryFilter ? [{
      label: CATEGORY_LABELS[categoryFilter] ?? categoryFilter,
      onRemove: () => setCategoryFilter(null),
    }] : []),
  ];

  const hasFilters = statusFilters.size > 0 || !!categoryFilter || !!search;

  function clearAllFilters() {
    setSearch("");
    setStatusFilters(new Set());
    setCategoryFilter(null);
  }

  return (
    <div className="max-w-6xl space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-5 py-3 rounded-md shadow-lg text-sm font-medium max-w-sm">
          {toast}
        </div>
      )}

      {adjustLot && (
        <AdjustModal
          lot={adjustLot}
          onClose={() => setAdjustLot(null)}
          onDone={() => {
            fetchLots();
            setToast("Inventory adjusted.");
            setTimeout(() => setToast(null), 3000);
          }}
        />
      )}

      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Current Stock</h1>
          <p className="page-subtitle">All active inventory lots and their current quantities</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isAdmin && (
            <Link
              href="/dashboard/admin/inventory/initial-stock-entry"
              className="text-xs px-3 py-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Initial Stock Entry →
            </Link>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLots}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
            </button>
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Updated {relativeTime(lastUpdated)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="card p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by material, lot #, or supplier…"
            style={{ fontSize: "16px" }}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#D64D4D]"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter pills + view toggle */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Status filters */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-gray-400 font-medium mr-0.5">Status:</span>
            {STATUS_FILTER_OPTIONS.map(({ key, label }) => {
              const active = statusFilters.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleStatusFilter(key)}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition-colors",
                    active
                      ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                      : "border-gray-300 text-gray-600 hover:border-[#D64D4D] hover:text-[#D64D4D]"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Category filters */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-gray-400 font-medium mr-0.5">Category:</span>
            {["INGREDIENT", "PACKAGING", "OTHER"].map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(active ? null : cat)}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition-colors",
                    active
                      ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                      : "border-gray-300 text-gray-600 hover:border-[#D64D4D] hover:text-[#D64D4D]"
                  )}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>

          {/* View toggle — pushed to the right */}
          <div className="ml-auto flex items-center gap-0.5 border border-gray-300 rounded-md overflow-hidden">
            {(["material", "lot"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "text-xs px-3 py-1.5 transition-colors",
                  viewMode === m
                    ? "bg-[#D64D4D] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                {m === "material" ? "By Material" : "By Lot"}
              </button>
            ))}
          </div>
        </div>

        {/* Active filter tags */}
        {activeFilterTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {activeFilterTags.map((tag) => (
              <span
                key={tag.label}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-[#D64D4D]/10 text-[#D64D4D] rounded-full"
              >
                {tag.label}
                <button onClick={tag.onRemove} className="hover:text-red-700"><X className="w-3 h-3" /></button>
              </span>
            ))}
            <button onClick={clearAllFilters} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Clear all
            </button>
          </div>
        )}

        {/* Depleted toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDepleted}
              onChange={(e) => setShowDepleted(e.target.checked)}
              className="accent-[#D64D4D] w-3.5 h-3.5"
            />
            <span className="text-xs text-gray-500">
              Show depleted lots ({depletedCount})
            </span>
          </label>
        </div>
      </div>

      {/* Results summary */}
      {!loading && (
        <p className="text-xs text-gray-400 px-1">
          Showing{" "}
          <span className="text-gray-600 font-medium">{summary.materials}</span> material{summary.materials !== 1 ? "s" : ""}{" "}
          (<span className="text-gray-600 font-medium">{summary.lots}</span> lot{summary.lots !== 1 ? "s" : ""})
          {summary.lowStock > 0 && (
            <span className="text-amber-600"> · {summary.lowStock} low stock</span>
          )}
          {summary.expiringSoon > 0 && (
            <span className="text-amber-600"> · {summary.expiringSoon} expiring soon</span>
          )}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading inventory…</span>
        </div>
      )}

      {/* Empty state — no inventory at all */}
      {!loading && lots.length === 0 && (
        <div className="card px-6 py-12 text-center space-y-3">
          <p className="text-sm text-gray-500 font-medium">No inventory lots on record.</p>
          <p className="text-xs text-gray-400">Start by adding initial stock or recording a delivery.</p>
          <div className="flex justify-center gap-3 pt-2">
            {isAdmin && (
              <Link href="/dashboard/admin/inventory/initial-stock-entry" className="text-xs px-4 py-2 bg-[#D64D4D] text-white rounded-md hover:bg-red-700">
                Initial Stock Entry →
              </Link>
            )}
            <Link href="/dashboard/supervisor/receiving" className="text-xs px-4 py-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50">
              Receiving →
            </Link>
          </div>
        </div>
      )}

      {/* Empty state — filters exclude everything */}
      {!loading && lots.length > 0 && filteredLots.length === 0 && (
        <div className="card px-6 py-10 text-center space-y-2">
          <p className="text-sm text-gray-500">No inventory lots match your current filters.</p>
          <button onClick={clearAllFilters} className="text-xs text-[#D64D4D] hover:underline">
            Clear filters
          </button>
        </div>
      )}

      {/* By Material view */}
      {!loading && filteredLots.length > 0 && viewMode === "material" && (
        <div>
          {materialGroups.map((group) => (
            <MaterialGroupRow
              key={group.materialId}
              group={group}
              expanded={expandedMaterials.has(group.materialId)}
              onToggle={() => toggleMaterial(group.materialId)}
              isAdmin={isAdmin}
              onAdjust={setAdjustLot}
            />
          ))}
        </div>
      )}

      {/* By Lot view */}
      {!loading && filteredLots.length > 0 && viewMode === "lot" && (
        <div className="card overflow-hidden">
          <LotTable
            lots={filteredLots}
            isAdmin={isAdmin}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
            onAdjust={setAdjustLot}
          />
        </div>
      )}
    </div>
  );
}
