"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  Clock, ClipboardList, Package, RefreshCw, Settings, X, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQty, formatQtyUnit, formatDelta } from "@/lib/formatNumber";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AlertLotDetail {
  id: string; lotNumber: string; quantityRemaining: number; unit: string;
  receivedDate: string; expirationDate: string | null; status: string;
}

interface AlertCard {
  materialId: string; materialName: string;
  category: "INGREDIENT" | "PACKAGING" | "OTHER";
  supplierName: string | null;
  alertTypes: string[]; severity: "critical" | "warning" | "upcoming";
  currentStock: number; currentStockUnit: string;
  minimumStockQuantity: number | null; minimumStockUnit: string | null;
  surplusOrShortfall: number | null;
  daysUntilStockout: number | null; dailyUsageRate: number | null; usageHistoryDays: number;
  lots: AlertLotDetail[];
  acknowledgment: { id: string; note: string | null; acknowledgedByName: string; acknowledgedAt: string; expiresAt: string | null } | null;
  // injected client-side from forecast
  upcomingProductions?: { date: string; productName: string; qtyNeeded: number; unit: string }[];
  totalNeeded14d?: number | null;
  productionShortfall?: number | null;
  nextProductionIsoDate?: string | null;
  // injected client-side from open POs
  onOrderQty?: number;
  onOrderUnit?: string;
  onOrderPOs?: { id: string; poNumber: string; qty: number }[];
}

interface NoMinimumMaterial {
  materialId: string; name: string; category: string; currentStock: number | null; unit: string | null;
}

interface AcknowledgedCard {
  id: string; materialId: string; materialName: string; alertType: string;
  note: string | null; acknowledgedByName: string; acknowledgedAt: string; expiresAt: string | null;
}

interface AlertsData {
  summary: { criticalCount: number; warningCount: number; upcomingCount: number; acknowledgedCount: number; noMinimumCount: number; lastChecked: string };
  noMinimumMaterials: NoMinimumMaterial[];
  critical: AlertCard[]; warning: AlertCard[]; upcoming: AlertCard[];
  acknowledged: AcknowledgedCard[];
}

interface ForecastIngredient {
  material_id: string; material_name: string; total_needed: number;
  standard_unit: string | null; in_stock_converted: number | null;
  surplus_or_shortfall: number | null;
  breakdown: { iso_date: string; day_label: string; product_name: string; total: number; unit: string }[];
}

// ─── Sort / Filter Types ────────────────────────────────────────────────────────

type SortOption = "most_urgent" | "supplier_az" | "category" | "shortfall" | "stockout" | "production_date" | "name_az";
type SevFilter = "critical" | "warning" | "upcoming";
type CatFilter = "INGREDIENT" | "PACKAGING" | "OTHER";

const SORT_LABELS: Record<SortOption, string> = {
  most_urgent: "Most Urgent",
  supplier_az: "Supplier A→Z",
  category: "Category",
  shortfall: "Shortfall Amount",
  stockout: "Days Until Stockout",
  production_date: "Next Production Date",
  name_az: "Material Name A→Z",
};

// ─── Constants ──────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { label: "Critical", icon: XCircle, headerBg: "bg-red-100", headerText: "text-red-800", border: "border-red-200", dot: "bg-red-500", badge: "bg-red-100 text-red-700" },
  warning:  { label: "Warning",  icon: AlertTriangle, headerBg: "bg-amber-100", headerText: "text-amber-800", border: "border-amber-200", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" },
  upcoming: { label: "Upcoming", icon: Clock, headerBg: "bg-blue-100", headerText: "text-blue-800", border: "border-blue-200", dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700" },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  expired: "Expired",
  depleted: "Depleted",
  below_minimum: "Below Minimum",
  no_stock: "Never Received",
  expiring_soon: "Expiring ≤30 Days",
  expiring_60d: "Expiring Soon",
  projected_shortfall: "Projected Shortfall",
  production_this_week: "Production This Week",
};

const CATEGORY_LABELS: Record<string, string> = { INGREDIENT: "Ingredient", PACKAGING: "Packaging", OTHER: "Other" };
const CATEGORY_PLURAL: Record<string, string> = { INGREDIENT: "Ingredients", PACKAGING: "Packaging", OTHER: "Other" };

const UNITS_FOR_MINIMUM = ["lb", "oz", "kg", "g", "gal", "L", "ml", "fl oz", "units", "each", "case"];

const ALL_SEVERITIES: SevFilter[] = ["critical", "warning", "upcoming"];
const ALL_CATEGORIES: CatFilter[] = ["INGREDIENT", "PACKAGING", "OTHER"];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtQty(n: number | null, unit?: string | null) {
  return unit ? formatQtyUnit(n, unit) : formatQty(n ?? undefined);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " PT";
}

function stockoutLabel(days: number | null, currentStock: number): { text: string; cls: string } {
  if (currentStock <= 0) return { text: "Out of stock", cls: "text-red-600 font-semibold" };
  if (days === null) return { text: "No usage history", cls: "text-gray-400 italic" };
  if (days <= 1) return { text: "⚠ Stockout imminent", cls: "text-red-600 font-bold" };
  if (days <= 7) return { text: `< 1 week remaining`, cls: "text-red-600 font-semibold" };
  if (days <= 30) return { text: `~${days} days remaining`, cls: "text-amber-600" };
  if (days <= 60) return { text: `~${days} days remaining`, cls: "text-blue-600" };
  return { text: `~${days} days remaining`, cls: "text-gray-400" };
}

function sortFlatAlerts(cards: AlertCard[], sortBy: SortOption): AlertCard[] {
  const sev = { critical: 0, warning: 1, upcoming: 2 };
  const cat = { INGREDIENT: 0, PACKAGING: 1, OTHER: 2 };
  return [...cards].sort((a, b) => {
    switch (sortBy) {
      case "supplier_az": {
        const sa = a.supplierName ?? "￿";
        const sb = b.supplierName ?? "￿";
        if (sa !== sb) return sa.localeCompare(sb);
        return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
      }
      case "category": {
        const ca = cat[a.category] ?? 3;
        const cb = cat[b.category] ?? 3;
        if (ca !== cb) return ca - cb;
        return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
      }
      case "shortfall":
        return (a.surplusOrShortfall ?? 0) - (b.surplusOrShortfall ?? 0);
      case "stockout": {
        if (a.daysUntilStockout == null && b.daysUntilStockout == null) return 0;
        if (a.daysUntilStockout == null) return 1;
        if (b.daysUntilStockout == null) return -1;
        return a.daysUntilStockout - b.daysUntilStockout;
      }
      case "production_date": {
        const da = a.nextProductionIsoDate;
        const db = b.nextProductionIsoDate;
        if (da && !db) return -1;
        if (!da && db) return 1;
        if (da && db && da !== db) return da.localeCompare(db);
        if (a.daysUntilStockout == null && b.daysUntilStockout == null) return 0;
        if (a.daysUntilStockout == null) return 1;
        if (b.daysUntilStockout == null) return -1;
        return a.daysUntilStockout - b.daysUntilStockout;
      }
      case "name_az":
        return a.materialName.localeCompare(b.materialName);
      default:
        return 0;
    }
  });
}

function getGroupKey(card: AlertCard, sortBy: SortOption): string {
  if (sortBy === "supplier_az") return card.supplierName ?? "No Supplier";
  if (sortBy === "category") return card.category;
  return "";
}

function getGroupLabel(key: string, sortBy: SortOption): string {
  if (sortBy === "category") return CATEGORY_PLURAL[key] ?? key;
  return key;
}

// ─── Subcomponents ──────────────────────────────────────────────────────────────

function StatTile({ count, label, colorClass, icon }: { count: number; label: string; colorClass: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className={cn("text-2xl font-bold", colorClass)}>{count}</div>
      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 text-center leading-tight">
        {icon}
        {label}
      </div>
    </div>
  );
}

function AlertTypeBadge({ type }: { type: string }) {
  const label = ALERT_TYPE_LABELS[type] ?? type;
  const cls = type === "expired" || type === "depleted"
    ? "bg-red-100 text-red-700"
    : type === "below_minimum" || type === "no_stock" || type === "expiring_soon"
    ? "bg-amber-100 text-amber-700"
    : "bg-blue-100 text-blue-700";
  return <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap", cls)}>{label}</span>;
}

function SeverityBadge({ severity }: { severity: "critical" | "warning" | "upcoming" }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", cfg.badge)}>
      {severity === "critical" ? "● Critical" : severity === "warning" ? "● Warning" : "● Upcoming"}
    </span>
  );
}

function LotStatusDot({ status }: { status: string }) {
  const cls = status === "expired" ? "bg-red-500" : status === "depleted" ? "bg-gray-400" : status === "conditional" ? "bg-purple-400" : status === "low_stock" ? "bg-amber-400" : "bg-emerald-500";
  return <span className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", cls)} />;
}

// ─── Sort / Filter Controls ─────────────────────────────────────────────────────

interface ControlsBarProps {
  sortBy: SortOption;
  filterSevs: Set<SevFilter>;
  filterCats: Set<CatFilter>;
  buyerMode: boolean;
  onSortChange: (s: SortOption) => void;
  onToggleSev: (s: SevFilter) => void;
  onToggleCat: (c: CatFilter) => void;
  onToggleBuyerMode: () => void;
  onClearFilters: () => void;
}

function ControlsBar({
  sortBy, filterSevs, filterCats, buyerMode,
  onSortChange, onToggleSev, onToggleCat, onToggleBuyerMode, onClearFilters,
}: ControlsBarProps) {
  const allSevSelected = ALL_SEVERITIES.every((s) => filterSevs.has(s));
  const allCatSelected = ALL_CATEGORIES.every((c) => filterCats.has(c));
  const hasActiveFilter = !allSevSelected || !allCatSelected;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3 shadow-sm">
      {/* Row 1: Sort + Buyer Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
          >
            {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
              <option key={opt} value={opt}>{SORT_LABELS[opt]}</option>
            ))}
          </select>
        </div>

        <button
          onClick={onToggleBuyerMode}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
            buyerMode
              ? "bg-teal-600 text-white border-teal-600 hover:bg-teal-700"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          )}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          Buyer Mode
          {buyerMode && " ✓"}
        </button>
      </div>

      {/* Row 2: Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Filter:</span>

        {/* Severity pills */}
        {ALL_SEVERITIES.map((sev) => {
          const active = filterSevs.has(sev);
          const colorOn = sev === "critical" ? "bg-red-100 text-red-700 border-red-300" : sev === "warning" ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-blue-100 text-blue-700 border-blue-300";
          return (
            <button key={sev} onClick={() => onToggleSev(sev)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors capitalize",
                active ? colorOn : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
              )}>
              {sev === "critical" ? "Critical" : sev === "warning" ? "Warning" : "Upcoming"}
            </button>
          );
        })}

        <span className="text-gray-200 text-xs">|</span>

        {/* Category pills */}
        {ALL_CATEGORIES.map((cat) => {
          const active = filterCats.has(cat);
          return (
            <button key={cat} onClick={() => onToggleCat(cat)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                active ? "bg-gray-200 text-gray-700 border-gray-300" : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
              )}>
              {CATEGORY_PLURAL[cat]}
            </button>
          );
        })}

        {hasActiveFilter && (
          <button onClick={onClearFilters}
            className="text-xs text-brand-600 hover:underline ml-1">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Group Header ───────────────────────────────────────────────────────────────

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{count}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ─── Acknowledge Panel ──────────────────────────────────────────────────────────

interface AckPanelProps {
  materialId: string; alertType: string; onConfirm: (note: string, days: number) => Promise<void>; onCancel: () => void;
}
function AcknowledgePanel({ materialId: _materialId, alertType: _alertType, onConfirm, onCancel }: AckPanelProps) {
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [saving, setSaving] = useState(false);
  return (
    <div className="mt-3 border-t border-gray-200 pt-3 bg-gray-50 rounded-b-xl p-4">
      <div className="text-sm font-medium text-gray-700 mb-2">Acknowledge this alert</div>
      <textarea
        value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Ordered 50 lb, arriving Monday 6/29"
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-gray-500">Auto-expires in:</span>
        {[1, 3, 7].map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className={cn("text-xs px-2 py-1 rounded-md border transition-colors", days === d ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50")}>
            {d} day{d > 1 ? "s" : ""}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={async () => { setSaving(true); await onConfirm(note, days); setSaving(false); }}
          disabled={saving}
          className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50">
          {saving ? "Saving…" : "Confirm"}
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs px-4 py-1.5">Cancel</button>
      </div>
    </div>
  );
}

// ─── Set Minimum Panel ──────────────────────────────────────────────────────────

interface SetMinPanelProps {
  materialId: string; currentMin: number | null; currentUnit: string | null;
  onSave: (qty: number, unit: string) => Promise<void>; onCancel: () => void;
}
function SetMinimumPanel({ materialId: _materialId, currentMin, currentUnit, onSave, onCancel }: SetMinPanelProps) {
  const [qty, setQty] = useState(currentMin?.toString() ?? "");
  const [unit, setUnit] = useState(currentUnit ?? "lb");
  const [saving, setSaving] = useState(false);
  const valid = qty.trim() !== "" && !isNaN(parseFloat(qty)) && parseFloat(qty) >= 0;
  return (
    <div className="flex items-end gap-2 mt-2">
      <div className="flex-1">
        <label className="block text-xs text-gray-500 mb-1">Minimum quantity</label>
        <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Unit</label>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500">
          {UNITS_FOR_MINIMUM.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <button onClick={async () => { if (!valid) return; setSaving(true); await onSave(parseFloat(qty), unit); setSaving(false); }}
        disabled={!valid || saving}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={onCancel} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
    </div>
  );
}

// ─── Alert Card ─────────────────────────────────────────────────────────────────

interface AlertCardProps {
  card: AlertCard;
  isAdmin: boolean;
  buyerMode?: boolean;
  showSeverityBadge?: boolean;
  onAcknowledge: (materialId: string, alertType: string, note: string, days: number) => Promise<void>;
  onSetMinimum: (materialId: string, qty: number, unit: string) => Promise<void>;
}

function AlertCardView({ card, isAdmin, buyerMode = false, showSeverityBadge = false, onAcknowledge, onSetMinimum }: AlertCardProps) {
  const [lotsOpen, setLotsOpen] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [minOpen, setMinOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[card.severity];
  const Icon = cfg.icon;

  const surplusColor = card.surplusOrShortfall != null && card.surplusOrShortfall < 0 ? "text-red-600" : "text-emerald-600";
  const surplusText = formatDelta(card.surplusOrShortfall, card.currentStockUnit);

  const { text: stockoutText, cls: stockoutCls } = stockoutLabel(card.daysUntilStockout, card.currentStock);
  const hasProductions = !buyerMode && card.upcomingProductions && card.upcomingProductions.length > 0;

  return (
    <div className={cn("rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col", cfg.border)}>
      {/* Header */}
      <div className={cn("flex items-start justify-between gap-3 px-4 py-3", cfg.headerBg)}>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Icon className={cn("w-4 h-4 flex-shrink-0", cfg.headerText)} />
          <span className={cn("font-semibold text-sm", cfg.headerText)}>{card.materialName}</span>
          <span className="text-[10px] bg-white/60 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
            {CATEGORY_LABELS[card.category] ?? card.category}
          </span>
          {showSeverityBadge && <SeverityBadge severity={card.severity} />}
          {card.alertTypes.map((t) => <AlertTypeBadge key={t} type={t} />)}
          {card.onOrderQty != null && card.onOrderQty > 0 && (
            <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              📦 {formatQtyUnit(card.onOrderQty, card.onOrderUnit)} on order
            </span>
          )}
        </div>
        <button onClick={() => setAckOpen((o) => !o)}
          className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap bg-white/60 hover:bg-white/90 px-2 py-1 rounded-md transition-colors flex-shrink-0">
          {ackOpen ? "Cancel" : "Acknowledge"}
        </button>
      </div>

      {/* Supplier name (shown in buyer mode or flat list) */}
      {card.supplierName && buyerMode && (
        <div className="px-4 pt-2 text-xs text-gray-500">
          Supplier: <span className="font-medium text-gray-700">{card.supplierName}</span>
        </div>
      )}

      {/* Stock info */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-b border-gray-100">
        <div>
          <div className="text-gray-400 mb-0.5">Current Stock</div>
          <div className={cn("font-semibold text-sm", card.currentStock <= 0 ? "text-red-600" : card.surplusOrShortfall != null && card.surplusOrShortfall < 0 ? "text-amber-600" : "text-gray-900")}>
            {fmtQty(card.currentStock, card.currentStockUnit)}
            {card.lots.length > 0 && <span className="font-normal text-gray-400 text-[10px] ml-1">({card.lots.length} lot{card.lots.length !== 1 ? "s" : ""})</span>}
          </div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">Minimum Required</div>
          <div className="font-medium text-gray-700">
            {card.minimumStockQuantity != null
              ? fmtQty(card.minimumStockQuantity, card.minimumStockUnit ?? card.currentStockUnit)
              : <span className="text-gray-400 italic">Not set</span>}
          </div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">Surplus / Shortfall</div>
          <div className={cn("font-semibold", buyerMode && card.surplusOrShortfall != null && card.surplusOrShortfall < 0 ? "text-red-600 text-sm" : surplusColor)}>{surplusText}</div>
        </div>
        <div>
          <div className="text-gray-400 mb-0.5">Days Until Stockout</div>
          <div className={cn("text-sm", stockoutCls)}>{stockoutText}</div>
        </div>
      </div>

      {/* Production context — hidden in buyer mode */}
      {hasProductions && (
        <div className="px-4 py-3 border-b border-gray-100 bg-blue-50/40">
          <div className="text-xs font-medium text-gray-600 mb-1.5">Used in upcoming productions (next 14 days):</div>
          <div className="space-y-0.5">
            {card.upcomingProductions!.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-gray-700">
                <span>{p.date} — {p.productName}</span>
                <span className="font-medium text-gray-600 ml-2">needs {fmtQty(p.qtyNeeded, p.unit)}</span>
              </div>
            ))}
          </div>
          {card.totalNeeded14d != null && (
            <div className="mt-2 pt-2 border-t border-blue-100 flex items-center justify-between text-xs">
              <span className="text-gray-500">Total needed (next 14 days):</span>
              <span className="font-semibold text-gray-700">{fmtQty(card.totalNeeded14d, card.currentStockUnit)}</span>
            </div>
          )}
          {card.productionShortfall != null && card.totalNeeded14d != null && (
            <div className={cn("mt-1 text-xs font-medium", card.productionShortfall <= 0 ? "text-emerald-600" : "text-red-600")}>
              {card.productionShortfall <= 0
                ? `✓ Sufficient for scheduled productions`
                : `✗ Shortfall of ${fmtQty(Math.abs(card.productionShortfall), card.currentStockUnit)} for scheduled productions`}
            </div>
          )}
        </div>
      )}

      {/* Lot details — hidden in buyer mode */}
      {!buyerMode && (
        <div className="px-4 py-2 border-b border-gray-100">
          <button onClick={() => setLotsOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            {lotsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {lotsOpen ? "Hide lots" : `View lots (${card.lots.length})`}
          </button>
          {lotsOpen && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left pb-1 pr-3 font-medium">Lot #</th>
                    <th className="text-right pb-1 pr-3 font-medium">Qty Remaining</th>
                    <th className="text-left pb-1 pr-3 font-medium">Received</th>
                    <th className="text-left pb-1 pr-3 font-medium">Expiration</th>
                    <th className="text-left pb-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {card.lots.map((lot) => (
                    <tr key={lot.id} className="border-t border-gray-50">
                      <td className="py-1 pr-3 font-mono text-gray-700">{lot.lotNumber}</td>
                      <td className="py-1 pr-3 text-right font-mono">{fmtQty(lot.quantityRemaining, lot.unit)}</td>
                      <td className="py-1 pr-3 text-gray-500">{fmtDate(lot.receivedDate)}</td>
                      <td className="py-1 pr-3 text-gray-500">{fmtDate(lot.expirationDate)}</td>
                      <td className="py-1">
                        <div className="flex items-center gap-1">
                          <LotStatusDot status={lot.status} />
                          <span className="capitalize text-gray-600">{lot.status.replace("_", " ")}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 mt-auto">
        <Link href={`/dashboard/supervisor/receiving?material=${card.materialId}`}
          className="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-md transition-colors">
          <Package className="w-3 h-3" />
          Receive Stock
        </Link>
        {!buyerMode && (
          <>
            <Link href={`/dashboard/inventory/current?material=${card.materialId}`}
              className="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-md transition-colors">
              View in Stock
            </Link>
            {isAdmin && (
              <>
                <Link href={`/dashboard/admin/planning/ingredient-forecast?material=${encodeURIComponent(card.materialName)}`}
                  className="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-md transition-colors">
                  View Forecast
                </Link>
                <button onClick={() => setMinOpen((o) => !o)}
                  className="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-md transition-colors">
                  <Settings className="w-3 h-3" />
                  Adjust Minimum
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Adjust minimum inline */}
      {minOpen && isAdmin && !buyerMode && (
        <div className="px-4 pb-3">
          <SetMinimumPanel
            materialId={card.materialId}
            currentMin={card.minimumStockQuantity}
            currentUnit={card.minimumStockUnit}
            onSave={async (qty, unit) => { await onSetMinimum(card.materialId, qty, unit); setMinOpen(false); }}
            onCancel={() => setMinOpen(false)}
          />
        </div>
      )}

      {/* Acknowledge panel */}
      {ackOpen && (
        <AcknowledgePanel
          materialId={card.materialId}
          alertType={card.alertTypes[0] ?? "alert"}
          onConfirm={async (note, days) => {
            await onAcknowledge(card.materialId, card.alertTypes[0] ?? "alert", note, days);
            setAckOpen(false);
          }}
          onCancel={() => setAckOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Alert Category Section (grouped view) ──────────────────────────────────────

interface AlertCategoryProps {
  severity: "critical" | "warning" | "upcoming";
  cards: AlertCard[];
  isAdmin: boolean;
  buyerMode: boolean;
  onAcknowledge: (materialId: string, alertType: string, note: string, days: number) => Promise<void>;
  onSetMinimum: (materialId: string, qty: number, unit: string) => Promise<void>;
  defaultOpen?: boolean;
}

function AlertCategorySection({ severity, cards, isAdmin, buyerMode, onAcknowledge, onSetMinimum, defaultOpen = true }: AlertCategoryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = SEVERITY_CONFIG[severity];
  const Icon = cfg.icon;

  return (
    <div className={cn("rounded-xl border overflow-hidden", cfg.border)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn("w-full flex items-center justify-between px-4 py-3", cfg.headerBg, cfg.headerText, "hover:opacity-90 transition-opacity")}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="font-semibold text-sm">{cfg.label}</span>
          {cards.length > 0 ? (
            <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white", cfg.dot)}>
              {cards.length}
            </span>
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="p-3 bg-gray-50/50">
          {cards.length === 0 ? (
            <div className="text-xs text-gray-400 py-3 text-center flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              No {cfg.label.toLowerCase()} alerts — all clear.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {cards.map((card) => (
                <AlertCardView key={card.materialId} card={card} isAdmin={isAdmin} buyerMode={buyerMode} onAcknowledge={onAcknowledge} onSetMinimum={onSetMinimum} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Flat Alert List (non-default sort) ─────────────────────────────────────────

interface FlatAlertListProps {
  cards: AlertCard[];
  sortBy: SortOption;
  isAdmin: boolean;
  buyerMode: boolean;
  onAcknowledge: (materialId: string, alertType: string, note: string, days: number) => Promise<void>;
  onSetMinimum: (materialId: string, qty: number, unit: string) => Promise<void>;
}

function FlatAlertList({ cards, sortBy, isAdmin, buyerMode, onAcknowledge, onSetMinimum }: FlatAlertListProps) {
  const sorted = sortFlatAlerts(cards, sortBy);
  const useGroups = sortBy === "supplier_az" || sortBy === "category";

  if (!useGroups) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {sorted.map((card) => (
          <AlertCardView key={card.materialId} card={card} isAdmin={isAdmin} buyerMode={buyerMode} showSeverityBadge onAcknowledge={onAcknowledge} onSetMinimum={onSetMinimum} />
        ))}
      </div>
    );
  }

  // Build groups
  const groups: { key: string; label: string; items: AlertCard[] }[] = [];
  for (const card of sorted) {
    const key = getGroupKey(card, sortBy);
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.items.push(card);
    } else {
      groups.push({ key, label: getGroupLabel(key, sortBy), items: [card] });
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <GroupHeader label={group.label} count={group.items.length} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-2">
            {group.items.map((card) => (
              <AlertCardView key={card.materialId} card={card} isAdmin={isAdmin} buyerMode={buyerMode} showSeverityBadge onAcknowledge={onAcknowledge} onSetMinimum={onSetMinimum} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── No Minimum Warning ─────────────────────────────────────────────────────────

interface NoMinimumWarningProps {
  materials: NoMinimumMaterial[];
  isAdmin: boolean;
  onSetMinimum: (materialId: string, qty: number, unit: string) => Promise<void>;
}
function NoMinimumWarning({ materials, isAdmin, onSetMinimum }: NoMinimumWarningProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (materials.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100/50 transition-colors">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">
            {materials.length} material{materials.length !== 1 ? "s have" : " has"} no minimum stock level configured
          </span>
          <span className="text-xs text-amber-600 hidden sm:inline">— invisible to this alert system</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
      </button>

      {open && (
        <div className="border-t border-amber-200">
          {materials.map((mat) => (
            <div key={mat.materialId} className="px-4 py-2.5 border-b border-amber-100 last:border-0 bg-white/40">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="text-sm font-medium text-gray-800">{mat.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{CATEGORY_LABELS[mat.category] ?? mat.category}</span>
                  {mat.currentStock != null && (
                    <span className="ml-2 text-xs text-gray-500">{fmtQty(mat.currentStock, mat.unit ?? undefined)}</span>
                  )}
                </div>
                {isAdmin && editingId !== mat.materialId && (
                  <button onClick={() => setEditingId(mat.materialId)}
                    className="text-xs text-brand-600 hover:underline whitespace-nowrap">
                    Set Minimum →
                  </button>
                )}
              </div>
              {isAdmin && editingId === mat.materialId && (
                <SetMinimumPanel
                  materialId={mat.materialId}
                  currentMin={null}
                  currentUnit={mat.unit}
                  onSave={async (qty, unit) => { await onSetMinimum(mat.materialId, qty, unit); setEditingId(null); }}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function StockAlertsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [data, setData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [forecastIngredients, setForecastIngredients] = useState<ForecastIngredient[]>([]);
  const [openPOItems, setOpenPOItems] = useState<{ materialId: string; poId: string; poNumber: string; qtyRemaining: number; unit: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const minuteRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sort / Filter / Buyer Mode state ───────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortOption>("most_urgent");
  const [filterSevs, setFilterSevs] = useState<Set<SevFilter>>(new Set(ALL_SEVERITIES));
  const [filterCats, setFilterCats] = useState<Set<CatFilter>>(new Set(ALL_CATEGORIES));
  const [buyerMode, setBuyerMode] = useState(false);

  function handleToggleSev(sev: SevFilter) {
    setFilterSevs((prev) => {
      const next = new Set(prev);
      next.has(sev) ? next.delete(sev) : next.add(sev);
      return next.size === 0 ? new Set(ALL_SEVERITIES) : next;
    });
  }

  function handleToggleCat(cat: CatFilter) {
    setFilterCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next.size === 0 ? new Set(ALL_CATEGORIES) : next;
    });
  }

  function handleClearFilters() {
    setFilterSevs(new Set(ALL_SEVERITIES));
    setFilterCats(new Set(ALL_CATEGORIES));
  }

  function handleToggleBuyerMode() {
    setBuyerMode((on) => {
      if (!on) {
        setSortBy("supplier_az");
        setFilterCats(new Set<CatFilter>(["INGREDIENT", "PACKAGING"]));
      } else {
        setSortBy("most_urgent");
        setFilterCats(new Set(ALL_CATEGORIES));
      }
      return !on;
    });
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAlerts = useCallback(async (bust = false) => {
    try {
      const url = `/api/inventory/alerts${bust ? "?bust=1" : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json() as AlertsData;
        setData(d);
        setLastRefreshed(new Date());
        setMinutesAgo(0);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const fetchForecast = useCallback(async () => {
    try {
      const today = new Date();
      const dateFrom = today.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
      const dateTo = new Date(today.getTime() + 14 * 86400000).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
      const res = await fetch(`/api/planning/ingredient-forecast?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`);
      if (res.ok) {
        const d = await res.json();
        setForecastIngredients(Array.isArray(d.ingredients) ? d.ingredients : []);
      }
    } catch { /* forecast is optional */ }
  }, []);

  const fetchOpenPOs = useCallback(async () => {
    try {
      const res = await fetch("/api/purchasing/purchase-orders/open");
      if (res.ok) {
        const d = await res.json();
        const items: { materialId: string; poId: string; poNumber: string; qtyRemaining: number; unit: string }[] = [];
        for (const po of (d.purchaseOrders ?? [])) {
          for (const item of (po.items ?? [])) {
            if (!item.isFullyReceived) {
              items.push({ materialId: item.materialId, poId: po.id, poNumber: po.poNumber, qtyRemaining: item.qtyRemaining, unit: item.unit });
            }
          }
        }
        setOpenPOItems(items);
      }
    } catch { /* optional */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAlerts();
    fetchForecast();
    fetchOpenPOs();
    intervalRef.current = setInterval(() => fetchAlerts(), 60000);
    minuteRef.current = setInterval(() => setMinutesAgo((m) => m + 1), 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (minuteRef.current) clearInterval(minuteRef.current);
    };
  }, [fetchAlerts, fetchForecast]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }
  }, [toast]);

  // ── Forecast merge ─────────────────────────────────────────────────────────

  const mergeWithForecast = useCallback((cards: AlertCard[]): AlertCard[] => {
    if (forecastIngredients.length === 0) return cards;
    return cards.map((card) => {
      const ing = forecastIngredients.find((f) => f.material_id === card.materialId);
      if (!ing) return card;
      const upcomingProductions = ing.breakdown
        .map((b) => ({ date: b.day_label, productName: b.product_name, qtyNeeded: b.total, unit: b.unit }))
        .filter((p) => p.qtyNeeded > 0);
      const totalNeeded14d = ing.total_needed;
      const productionShortfall = totalNeeded14d > 0 && card.currentStock != null ? totalNeeded14d - card.currentStock : null;
      const nextProductionIsoDate = ing.breakdown
        .filter((b) => b.total > 0)
        .map((b) => b.iso_date)
        .sort()[0] ?? null;
      return { ...card, upcomingProductions, totalNeeded14d, productionShortfall, nextProductionIsoDate };
    });
  }, [forecastIngredients]);

  const elevatedCritical = useCallback((critical: AlertCard[], warning: AlertCard[]): [AlertCard[], AlertCard[]] => {
    if (forecastIngredients.length === 0) return [critical, warning];
    const today = new Date();
    const monday = new Date(today);
    const day = today.getDay();
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    const thisWeekIds = new Set(
      forecastIngredients
        .filter((ing) => ing.breakdown.some((b) => { const d = new Date(b.iso_date); return d >= monday && d <= thursday; }))
        .map((ing) => ing.material_id)
    );
    const nowCritical = [...critical];
    const nowWarning: AlertCard[] = [];
    for (const card of warning) {
      if (card.alertTypes.includes("below_minimum") && thisWeekIds.has(card.materialId)) {
        nowCritical.push({ ...card, severity: "critical", alertTypes: [...card.alertTypes, "production_this_week"] });
      } else {
        nowWarning.push(card);
      }
    }
    return [nowCritical, nowWarning];
  }, [forecastIngredients]);

  const projectedShortfallUpcoming = useCallback((existing: AlertCard[]): AlertCard[] => {
    if (!data || forecastIngredients.length === 0) return existing;
    const assignedIds = new Set([
      ...(data.critical ?? []).map((c) => c.materialId),
      ...(data.warning ?? []).map((c) => c.materialId),
      ...existing.map((c) => c.materialId),
    ]);
    const extra: AlertCard[] = [];
    for (const ing of forecastIngredients) {
      if (assignedIds.has(ing.material_id)) continue;
      if (ing.surplus_or_shortfall == null || ing.surplus_or_shortfall >= 0) continue;
      extra.push({
        materialId: ing.material_id, materialName: ing.material_name,
        category: "INGREDIENT", supplierName: null,
        alertTypes: ["projected_shortfall"], severity: "upcoming",
        currentStock: ing.in_stock_converted ?? 0, currentStockUnit: ing.standard_unit ?? "",
        minimumStockQuantity: null, minimumStockUnit: null,
        surplusOrShortfall: ing.surplus_or_shortfall,
        daysUntilStockout: null, dailyUsageRate: null, usageHistoryDays: 90,
        lots: [], acknowledgment: null,
        upcomingProductions: ing.breakdown.map((b) => ({ date: b.day_label, productName: b.product_name, qtyNeeded: b.total, unit: b.unit })),
        totalNeeded14d: ing.total_needed,
        productionShortfall: ing.surplus_or_shortfall != null ? -ing.surplus_or_shortfall : null,
        nextProductionIsoDate: ing.breakdown.filter((b) => b.total > 0).map((b) => b.iso_date).sort()[0] ?? null,
      });
    }
    return [...existing, ...extra];
  }, [data, forecastIngredients]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleAcknowledge = useCallback(async (materialId: string, alertType: string, note: string, days: number) => {
    try {
      const res = await fetch("/api/inventory/alerts/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId, alertType, note, expiresInDays: days }),
      });
      if (res.ok) { setToast("Alert acknowledged"); await fetchAlerts(true); }
      else setToast("Failed to acknowledge");
    } catch { setToast("Failed to acknowledge"); }
  }, [fetchAlerts]);

  const handleReopen = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/inventory/alerts/acknowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) { setToast("Alert re-opened"); await fetchAlerts(true); }
    } catch { /* */ }
  }, [fetchAlerts]);

  const handleSetMinimum = useCallback(async (materialId: string, qty: number, unit: string) => {
    try {
      const res = await fetch("/api/inventory/alerts/set-minimum", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId, minimumStockQuantity: qty, minimumStockUnit: unit }),
      });
      if (res.ok) { setToast("Minimum stock level saved"); await fetchAlerts(true); }
      else setToast("Failed to save minimum");
    } catch { setToast("Failed to save minimum"); }
  }, [fetchAlerts]);

  const handleManualRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchAlerts(true), fetchForecast()]);
  }, [fetchAlerts, fetchForecast]);

  const mergeWithPOs = useCallback((cards: AlertCard[]): AlertCard[] => {
    if (openPOItems.length === 0) return cards;
    return cards.map((card) => {
      const matching = openPOItems.filter((p) => p.materialId === card.materialId);
      if (matching.length === 0) return card;
      const onOrderQty = matching.reduce((s, p) => s + p.qtyRemaining, 0);
      const onOrderUnit = matching[0].unit;
      const onOrderPOs = matching.map((p) => ({ id: p.poId, poNumber: p.poNumber, qty: p.qtyRemaining }));
      return { ...card, onOrderQty, onOrderUnit, onOrderPOs };
    });
  }, [openPOItems]);

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="max-w-6xl">
        <div className="page-header mb-6">
          <div>
            <h1 className="page-title">Stock Alerts</h1>
            <p className="text-sm text-gray-500 mt-0.5">Inventory levels, expiring lots, and production requirements</p>
          </div>
        </div>
        <div className="text-sm text-gray-400 py-12 text-center">Loading alerts…</div>
      </div>
    );
  }

  // ── Build display lists ────────────────────────────────────────────────────

  const rawCritical = mergeWithPOs(mergeWithForecast(data?.critical ?? []));
  const rawWarning = mergeWithPOs(mergeWithForecast(data?.warning ?? []));
  const [displayCritical, displayWarning] = elevatedCritical(rawCritical, rawWarning);
  const rawUpcoming = mergeWithPOs(mergeWithForecast(data?.upcoming ?? []));
  const displayUpcoming = projectedShortfallUpcoming(rawUpcoming);

  // Apply filters
  function applyFilters(cards: AlertCard[], sev: "critical" | "warning" | "upcoming"): AlertCard[] {
    if (!filterSevs.has(sev)) return [];
    return cards.filter((c) => filterCats.has(c.category));
  }

  const filteredCritical = applyFilters(displayCritical, "critical");
  const filteredWarning = applyFilters(displayWarning, "warning");
  const filteredUpcoming = applyFilters(displayUpcoming, "upcoming");

  const totalFiltered = filteredCritical.length + filteredWarning.length + filteredUpcoming.length;
  const totalAll = displayCritical.length + displayWarning.length + displayUpcoming.length;
  const isFiltered = totalFiltered !== totalAll;

  const allHealthy = totalAll === 0 && (data?.noMinimumMaterials?.length ?? 0) === 0;
  const summary = data?.summary;

  const nowPT = new Date().toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
  });

  const allFlatAlerts = [...filteredCritical, ...filteredWarning, ...filteredUpcoming];

  return (
    <div className="max-w-6xl space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {toast}
          <button onClick={() => setToast(null)}><X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" /></button>
        </div>
      )}

      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Inventory levels, expiring lots, and production requirements</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Last checked: {minutesAgo === 0 ? "just now" : `${minutesAgo} min ago`}
            </span>
          )}
          <button onClick={handleManualRefresh} disabled={loading}
            className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary tiles — 5 columns from sm+ */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <StatTile count={displayCritical.length} label="Critical" colorClass={displayCritical.length > 0 ? "text-red-600" : "text-emerald-600"} icon={<XCircle className="w-3 h-3" />} />
        <StatTile count={displayWarning.length} label="Warnings" colorClass={displayWarning.length > 0 ? "text-amber-600" : "text-emerald-600"} icon={<AlertTriangle className="w-3 h-3" />} />
        <StatTile count={displayUpcoming.length} label="Upcoming" colorClass={displayUpcoming.length > 0 ? "text-blue-600" : "text-emerald-600"} icon={<Clock className="w-3 h-3" />} />
        <StatTile count={summary?.acknowledgedCount ?? 0} label="Acknowledged" colorClass="text-gray-500" icon={<CheckCircle2 className="w-3 h-3" />} />
        <StatTile count={summary?.noMinimumCount ?? 0} label="No Minimum" colorClass={summary?.noMinimumCount ? "text-amber-600" : "text-emerald-600"} icon={<Settings className="w-3 h-3" />} />
      </div>

      <p className="text-xs text-gray-400 -mt-2">
        As of {nowPT} Pacific · Auto-refreshing every 60 seconds
      </p>

      {/* Sort / Filter controls */}
      {!allHealthy && (
        <ControlsBar
          sortBy={sortBy} filterSevs={filterSevs} filterCats={filterCats} buyerMode={buyerMode}
          onSortChange={setSortBy} onToggleSev={handleToggleSev} onToggleCat={handleToggleCat}
          onToggleBuyerMode={handleToggleBuyerMode} onClearFilters={handleClearFilters}
        />
      )}

      {/* No minimum warning */}
      <NoMinimumWarning materials={data?.noMinimumMaterials ?? []} isAdmin={isAdmin} onSetMinimum={handleSetMinimum} />

      {/* Results count */}
      {!allHealthy && totalAll > 0 && (
        <p className="text-xs text-gray-500">
          {isFiltered
            ? <>Showing <strong>{totalFiltered}</strong> of {totalAll} alerts</>
            : <>Showing <strong>{totalFiltered}</strong> alert{totalFiltered !== 1 ? "s" : ""}</>}
          {" "}(<span className="text-red-600">{filteredCritical.length} critical</span>
          {", "}<span className="text-amber-600">{filteredWarning.length} warning</span>
          {", "}<span className="text-blue-600">{filteredUpcoming.length} upcoming</span>)
          {sortBy !== "most_urgent" && (
            <span className="text-gray-400 ml-2">· Sorted by {SORT_LABELS[sortBy]}. Severity badges indicate urgency.</span>
          )}
        </p>
      )}

      {/* Empty / healthy state */}
      {allHealthy && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <div className="font-semibold text-emerald-800">All inventory levels are healthy</div>
          <div className="text-sm text-emerald-600 mt-1">No stock alerts at this time.</div>
        </div>
      )}

      {/* No results after filtering */}
      {!allHealthy && totalFiltered === 0 && totalAll > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-8 text-center">
          <div className="text-sm text-gray-500">No alerts match the current filters.</div>
          <button onClick={handleClearFilters} className="text-xs text-brand-600 hover:underline mt-2">Clear filters</button>
        </div>
      )}

      {/* Alert content */}
      {!allHealthy && totalFiltered > 0 && (
        sortBy === "most_urgent" ? (
          // Grouped category view
          <>
            <AlertCategorySection severity="critical" cards={filteredCritical} isAdmin={isAdmin} buyerMode={buyerMode} onAcknowledge={handleAcknowledge} onSetMinimum={handleSetMinimum} defaultOpen />
            <AlertCategorySection severity="warning" cards={filteredWarning} isAdmin={isAdmin} buyerMode={buyerMode} onAcknowledge={handleAcknowledge} onSetMinimum={handleSetMinimum} defaultOpen />
            <AlertCategorySection severity="upcoming" cards={filteredUpcoming} isAdmin={isAdmin} buyerMode={buyerMode} onAcknowledge={handleAcknowledge} onSetMinimum={handleSetMinimum} defaultOpen />
          </>
        ) : (
          // Flat sorted list
          <FlatAlertList
            cards={allFlatAlerts} sortBy={sortBy} isAdmin={isAdmin} buyerMode={buyerMode}
            onAcknowledge={handleAcknowledge} onSetMinimum={handleSetMinimum}
          />
        )
      )}

      {/* Acknowledged section */}
      {(data?.acknowledged?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <button onClick={() => setShowAcknowledged((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-gray-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-semibold text-sm">Acknowledged ({data?.acknowledged?.length ?? 0})</span>
            </div>
            {showAcknowledged ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAcknowledged && (
            <div className="divide-y divide-gray-100">
              {(data?.acknowledged ?? []).map((ack) => (
                <div key={ack.id} className="px-4 py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-500">{ack.materialName}</span>
                      <AlertTypeBadge type={ack.alertType} />
                    </div>
                    {ack.note && <p className="text-xs text-gray-500 mt-0.5 italic">{ack.note}</p>}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Acknowledged by {ack.acknowledgedByName} on {fmtDateTime(ack.acknowledgedAt)}
                      {ack.expiresAt && ` · Expires ${fmtDateTime(ack.expiresAt)}`}
                    </p>
                  </div>
                  <button onClick={() => handleReopen(ack.id)}
                    className="text-xs text-brand-600 hover:underline whitespace-nowrap flex-shrink-0">
                    Re-open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
