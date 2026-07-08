"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, AlertTriangle, Clock, ChevronRight,
  Package, ClipboardCheck, FileText, Layers,
  TrendingUp, Archive, Building2, ShieldAlert,
  Heart, CalendarCheck, Users2, HardDrive,
  ScanLine, RefreshCw, ChevronDown, ChevronUp, X, Wrench, Download,
} from "lucide-react";
import { ProductionScheduleCard } from "@/components/dashboard/ProductionScheduleCard";
import { formatQty } from "@/lib/formatNumber";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SupervisorData {
  greeting_name: string;
  active_draft: {
    id: string; product_name: string; lot_number: string | null;
    started_at: string; last_saved_at: string | null;
  } | null;
  inventory_alerts: {
    low_stock: Array<{ id: string; material_name: string; lot_number: string | null; quantity_remaining: number; unit: string; min_quantity: number | null; min_unit: string | null }>;
    expiring_soon: Array<{ id: string; material_name: string; lot_number: string; days_until_expiry: number; expiration_date: string }>;
    expired: Array<{ id: string; material_name: string; lot_number: string; days_since_expiry: number; expiration_date: string }>;
  };
  recent_productions: Array<{ id: string; production_lot: string | null; product_name: string; production_date: string; status: string }>;
}

interface AdminData extends SupervisorData {
  quick_stats: {
    productions_this_week: number; active_inventory_lots: number;
    approved_suppliers: number; total_suppliers: number; open_alerts_count: number;
  };
  supplier_alerts: {
    expired: Array<{ supplier_id: string; supplier_name: string; document_name: string; days_ago: number; expired_at: string }>;
    expiring_soon: Array<{ supplier_id: string; supplier_name: string; document_name: string; days_until: number; expires_at: string }>;
    missing: Array<{ supplier_id: string; supplier_name: string }>;
  };
  open_quarantine_records: Array<{ id: string; record_number: string; material_name: string; supplier_name: string; created_at: string; action_taken: string }>;
  today_activity: {
    entries: Array<{
      timestamp: string;
      person_name: string | null;
      action_type: string;
      description: string;
      link_url: string;
    }>;
    total_count: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const STATUS_BADGE: Record<string, string> = {
  COMPLETE: "bg-emerald-100 text-emerald-700",
  PASS: "bg-emerald-100 text-emerald-700",
  PASS_WITH_ISSUES: "bg-amber-100 text-amber-700",
  FAIL: "bg-red-100 text-[#D64D4D]",
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETE: "PASS", PASS: "PASS", PASS_WITH_ISSUES: "PASS W/ ISSUES", FAIL: "FAIL",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-gray-100 animate-pulse rounded ${className ?? ""}`} />;
}

function CardSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  );
}

// ─── Card header ──────────────────────────────────────────────────────────────

function CardHdr({ icon: Icon, title, className }: { icon: React.ElementType; title: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 mb-4 ${className ?? ""}`}>
      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
      <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
    </div>
  );
}

// ─── Active Draft Card ────────────────────────────────────────────────────────

function ActiveDraftCard({ draft }: { draft: NonNullable<SupervisorData["active_draft"]> }) {
  const router = useRouter();
  return (
    <div className="card p-5 border-l-4 border-l-amber-400">
      <CardHdr icon={FileText} title="Batch Sheet In Progress" />
      <p className="text-base font-semibold text-gray-900 mb-1">{draft.product_name}</p>
      {draft.lot_number && (
        <p className="text-xs text-gray-500 font-mono mb-0.5">Lot: {draft.lot_number}</p>
      )}
      <p className="text-xs text-gray-400 mb-0.5">Started: {draft.started_at}</p>
      {draft.last_saved_at && (
        <p className="text-xs text-gray-400 mb-4">Last saved: {draft.last_saved_at}</p>
      )}
      <button
        onClick={() => router.push("/dashboard/supervisor/batch-sheet")}
        className="btn-primary w-full justify-center"
      >
        Continue Batch Sheet →
      </button>
    </div>
  );
}

// ─── Inventory Alerts Card ────────────────────────────────────────────────────

function InventoryAlertsCard({ alerts }: { alerts: SupervisorData["inventory_alerts"] }) {
  const MAX = 3;
  const { low_stock: ls, expiring_soon: es, expired: ex } = alerts;
  const hasAny = ls.length > 0 || es.length > 0 || ex.length > 0;

  if (!hasAny) {
    return (
      <div className="card p-5">
        <CardHdr icon={Package} title="Inventory Alerts" />
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <p className="text-sm">All inventory levels are within acceptable ranges.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <CardHdr icon={Package} title="Inventory Alerts" />
      <div className="space-y-4">
        {ls.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Low Stock</p>
            <div className="space-y-1">
              {ls.slice(0, MAX).map((l) => (
                <Link key={l.id} href="/dashboard/inventory/current"
                  className="flex items-start gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-amber-50 transition-colors">
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-700">
                    <span className="font-medium">{l.material_name}</span>
                    {" — "}
                    {formatQty(l.quantity_remaining)} {l.unit} remaining
                    {l.min_quantity != null && ` (min: ${formatQty(l.min_quantity)} ${l.min_unit ?? l.unit})`}
                  </span>
                </Link>
              ))}
              {ls.length > MAX && (
                <Link href="/dashboard/inventory/alerts" className="text-xs text-[#D64D4D] hover:underline pl-5">
                  +{ls.length - MAX} more
                </Link>
              )}
            </div>
          </div>
        )}
        {es.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Expiring Soon</p>
            <div className="space-y-1">
              {es.slice(0, MAX).map((l) => (
                <Link key={l.id} href="/dashboard/inventory/current"
                  className="flex items-start gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-amber-50 transition-colors">
                  <Clock className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-700">
                    <span className="font-medium">{l.material_name}</span>
                    {" — "}
                    {l.lot_number}
                    {" — expires in "}{l.days_until_expiry} day{l.days_until_expiry !== 1 ? "s" : ""}
                    {" ("}{l.expiration_date}{")"}
                  </span>
                </Link>
              ))}
              {es.length > MAX && (
                <Link href="/dashboard/inventory/alerts" className="text-xs text-[#D64D4D] hover:underline pl-5">
                  +{es.length - MAX} more
                </Link>
              )}
            </div>
          </div>
        )}
        {ex.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#D64D4D] uppercase tracking-wide mb-2">Expired</p>
            <div className="space-y-1">
              {ex.slice(0, MAX).map((l) => (
                <Link key={l.id} href="/dashboard/inventory/current"
                  className="flex items-start gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-red-50 transition-colors">
                  <AlertTriangle className="w-3 h-3 text-[#D64D4D] shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-700">
                    <span className="font-medium">{l.material_name}</span>
                    {" — "}
                    {l.lot_number}
                    {" — expired "}{l.days_since_expiry} day{l.days_since_expiry !== 1 ? "s" : ""} ago
                  </span>
                </Link>
              ))}
              {ex.length > MAX && (
                <Link href="/dashboard/inventory/alerts" className="text-xs text-[#D64D4D] hover:underline pl-5">
                  +{ex.length - MAX} more
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recent Productions Card ──────────────────────────────────────────────────

function RecentProductionsCard({ productions }: { productions: SupervisorData["recent_productions"] }) {
  return (
    <div className="card p-5">
      <CardHdr icon={Layers} title="Recent Productions" />
      {productions.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          No productions recorded yet. Submit your first batch sheet to see it here.
        </p>
      ) : (
        <>
          <div className="divide-y divide-gray-50">
            {productions.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/supervisor/batch-sheet/records`}
                className="flex items-center gap-3 py-2.5 -mx-5 px-5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {p.production_lot ?? p.product_name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{p.product_name} · {p.production_date}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[p.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-50">
            <Link href="/dashboard/supervisor/batch-sheet/records" className="text-xs text-[#D64D4D] hover:underline font-medium">
              View all →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Quick Stats (admin) ──────────────────────────────────────────────────────

function QuickStatsCard({ stats }: { stats: AdminData["quick_stats"] }) {
  const tiles = [
    {
      label: "Productions This Week",
      value: stats.productions_this_week,
      href: "/dashboard/supervisor/batch-sheet/records",
      icon: TrendingUp,
      color: "text-[#D64D4D]",
      bg: "bg-red-50",
    },
    {
      label: "Active Inventory Lots",
      value: stats.active_inventory_lots,
      href: "/dashboard/inventory/current",
      icon: Archive,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Approved Suppliers",
      value: stats.approved_suppliers,
      sub: `of ${stats.total_suppliers} total`,
      href: "/supplier-management/suppliers?status=APPROVED",
      icon: Building2,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Open Alerts",
      value: stats.open_alerts_count,
      href: "/dashboard/inventory/alerts",
      icon: ShieldAlert,
      color: stats.open_alerts_count > 0 ? "text-[#D64D4D]" : "text-gray-400",
      bg: stats.open_alerts_count > 0 ? "bg-red-50" : "bg-gray-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <Link key={t.label} href={t.href}
          className="card p-4 hover:shadow-md transition-shadow group">
          <div className="flex items-start justify-between mb-3">
            <div className={`w-8 h-8 ${t.bg} rounded-lg flex items-center justify-center`}>
              <t.icon className={`w-4 h-4 ${t.color}`} />
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" />
          </div>
          <p className={`text-2xl font-bold ${t.color}`}>{t.value}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">{t.label}</p>
          {t.sub && <p className="text-[10px] text-gray-400 mt-0.5">{t.sub}</p>}
        </Link>
      ))}
    </div>
  );
}

// ─── Supplier Alerts (admin) ──────────────────────────────────────────────────

function SupplierAlertsCard({ alerts }: { alerts: AdminData["supplier_alerts"] }) {
  const MAX = 3;
  const { expired: ex, expiring_soon: es, missing: ms } = alerts;
  const hasAny = ex.length > 0 || es.length > 0 || ms.length > 0;

  if (!hasAny) {
    return (
      <div className="card p-5">
        <CardHdr icon={Building2} title="Supplier Alerts" />
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <p className="text-sm">All supplier documentation is current.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <CardHdr icon={Building2} title="Supplier Alerts" />
      <div className="space-y-4">
        {ex.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#D64D4D] uppercase tracking-wide mb-2">Expired Documents</p>
            <div className="space-y-1">
              {ex.slice(0, MAX).map((d, i) => (
                <Link key={i} href={`/supplier-management/suppliers/${d.supplier_id}`}
                  className="flex items-start gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-red-50 transition-colors">
                  <AlertTriangle className="w-3 h-3 text-[#D64D4D] shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-700">
                    <span className="font-medium">{d.supplier_name}</span>
                    {" — "}{d.document_name}
                    {" — expired "}{d.days_ago} day{d.days_ago !== 1 ? "s" : ""} ago
                  </span>
                </Link>
              ))}
              {ex.length > MAX && (
                <Link href="/supplier-management/suppliers?status=EXPIRED" className="text-xs text-[#D64D4D] hover:underline pl-5">
                  +{ex.length - MAX} more
                </Link>
              )}
            </div>
          </div>
        )}
        {es.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Expiring Soon</p>
            <div className="space-y-1">
              {es.slice(0, MAX).map((d, i) => (
                <Link key={i} href={`/supplier-management/suppliers/${d.supplier_id}`}
                  className="flex items-start gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-amber-50 transition-colors">
                  <Clock className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-700">
                    <span className="font-medium">{d.supplier_name}</span>
                    {" — "}{d.document_name}
                    {" — expires in "}{d.days_until} day{d.days_until !== 1 ? "s" : ""}
                  </span>
                </Link>
              ))}
              {es.length > MAX && (
                <Link href="/supplier-management/suppliers?status=EXPIRING_SOON" className="text-xs text-[#D64D4D] hover:underline pl-5">
                  +{es.length - MAX} more
                </Link>
              )}
            </div>
          </div>
        )}
        {ms.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#D64D4D] uppercase tracking-wide mb-2">Missing Documents</p>
            <div className="space-y-1">
              {ms.slice(0, MAX).map((s, i) => (
                <Link key={i} href={`/supplier-management/suppliers/${s.supplier_id}`}
                  className="flex items-start gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-red-50 transition-colors">
                  <AlertTriangle className="w-3 h-3 text-[#D64D4D] shrink-0 mt-0.5" />
                  <span className="flex-1 text-gray-700">
                    <span className="font-medium">{s.supplier_name}</span>
                    {" — required documentation pending"}
                  </span>
                </Link>
              ))}
              {ms.length > MAX && (
                <Link href="/supplier-management/suppliers?status=PENDING" className="text-xs text-[#D64D4D] hover:underline pl-5">
                  +{ms.length - MAX} more
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Open Quarantine Records (admin) ─────────────────────────────────────────

function QuarantineCard({ records }: { records: AdminData["open_quarantine_records"] }) {
  if (records.length === 0) return null;
  return (
    <div className="card p-5 border-l-4 border-l-red-500">
      <CardHdr icon={ShieldAlert} title="Open Quarantine Records" />
      <div className="divide-y divide-gray-50">
        {records.map((q) => (
          <Link key={q.id} href="/dashboard/admin/quarantine"
            className="flex items-start gap-3 py-2.5 -mx-5 px-5 hover:bg-red-50 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400">{q.record_number}</span>
                <span className="text-sm font-medium text-gray-800 truncate">{q.material_name}</span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {q.supplier_name} · {q.created_at}
              </p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
          </Link>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-50">
        <Link href="/dashboard/admin/quarantine" className="text-xs text-[#D64D4D] hover:underline font-medium">
          View all quarantine records →
        </Link>
      </div>
    </div>
  );
}

// ─── Today's Activity (admin) ────────────────────────────────────────────────

function fmtActivityTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Los_Angeles",
  });
}

function TodayActivityCard({ activity }: { activity: AdminData["today_activity"] }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 10;
  const { entries, total_count } = activity;
  const shown = expanded ? entries : entries.slice(0, LIMIT);
  const remaining = total_count - LIMIT;

  return (
    <div className="card p-5">
      <CardHdr icon={ClipboardCheck} title="Today's Activity" />
      {total_count === 0 ? (
        <p className="text-sm text-gray-400 italic">No activity recorded today yet.</p>
      ) : (
        <>
          <div className="divide-y divide-gray-50 -mx-5">
            {shown.map((entry, i) => (
              <Link
                key={i}
                href={entry.link_url}
                className="flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-[11px] font-mono text-gray-400 shrink-0 pt-0.5 w-[62px] text-right">
                  {fmtActivityTime(entry.timestamp)}
                </span>
                <span className="text-xs text-gray-700 leading-snug flex-1 min-w-0">
                  {entry.description}
                </span>
              </Link>
            ))}
          </div>
          {!expanded && remaining > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-3 text-xs text-[#D64D4D] hover:underline font-medium"
            >
              +{remaining} more {remaining === 1 ? "activity" : "activities"} today
            </button>
          )}
          {expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-3 text-xs text-[#D64D4D] hover:underline font-medium"
            >
              Show less
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Welcome empty state ─────────────────────────────────────────────────────

function WelcomeCard() {
  return (
    <div className="card p-8 text-center">
      <Heart className="w-10 h-10 text-[#D64D4D] mx-auto mb-3" />
      <h2 className="font-bold text-gray-900 text-lg mb-1">
        Welcome to Julian Bakery Food Safety Management
      </h2>
      <p className="text-sm text-gray-500 mb-6">Start by completing today&apos;s forms.</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/dashboard/supervisor/pre-op" className="btn-primary">
          Start Pre-Op Inspection
        </Link>
        <Link href="/dashboard/supervisor/batch-sheet" className="btn-secondary">
          Start Batch Sheet
        </Link>
        <Link href="/supplier-management/suppliers" className="btn-secondary">
          View Supplier Management
        </Link>
      </div>
    </div>
  );
}

// ─── My Tasks Card ───────────────────────────────────────────────────────────

type MyTasksData = {
  overdue: Array<{ id: string; title: string; dueDate: string }>;
  today: Array<{ id: string; title: string; dueDate: string }>;
  upcoming: Array<{ id: string; title: string; dueDate: string }>;
};

function MyTasksCard() {
  const [data, setData] = useState<MyTasksData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/tasks/my-tasks")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function daysDiff(iso: string): number {
    const now = new Date();
    const due = new Date(iso);
    return Math.round((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "2-digit", day: "2-digit", year: "numeric",
    });
  }

  return (
    <div className="card p-5">
      <CardHdr icon={CalendarCheck} title="My Tasks" />
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      ) : !data ? (
        <p className="text-sm text-gray-400 italic">Unable to load tasks.</p>
      ) : (
        <div className="space-y-3">
          {data.overdue.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">Overdue</p>
              <div className="space-y-1">
                {data.overdue.slice(0, 3).map((t) => (
                  <Link key={t.id} href="/dashboard/tasks"
                    className="flex items-center gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-red-50 transition-colors">
                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                    <span className="flex-1 text-gray-700 truncate font-medium">{t.title}</span>
                    <span className="text-red-500 shrink-0">{daysDiff(t.dueDate)} day{daysDiff(t.dueDate) !== 1 ? "s" : ""} overdue</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {data.today.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Today</p>
              <div className="space-y-1">
                {data.today.slice(0, 3).map((t) => (
                  <Link key={t.id} href="/dashboard/tasks"
                    className="flex items-center gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-amber-50 transition-colors">
                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="flex-1 text-gray-700 truncate font-medium">{t.title}</span>
                    <span className="text-amber-600 shrink-0">due today</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {data.overdue.length === 0 && data.today.length === 0 && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              No tasks due today.
            </div>
          )}
          {data.upcoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Upcoming</p>
              <div className="space-y-1">
                {data.upcoming.slice(0, 2).map((t) => (
                  <Link key={t.id} href="/dashboard/tasks"
                    className="flex items-center gap-2 text-xs py-1.5 px-2 -mx-2 rounded hover:bg-gray-50 transition-colors">
                    <span className="flex-1 text-gray-600 truncate">{t.title}</span>
                    <span className="text-gray-400 shrink-0 font-mono">{fmtDate(t.dueDate)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="pt-2 border-t border-gray-50">
            <Link href="/dashboard/tasks" className="text-xs text-[#D64D4D] hover:underline font-medium">
              View All My Tasks →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Team Tasks Card (admin) ──────────────────────────────────────────────────

type TeamTasksData = {
  overdue: number;
  today: number;
  this_week: number;
  by_assignee: Array<{ userId: string; name: string; overdue: number; today: number }>;
};

function TeamTasksCard() {
  const [data, setData] = useState<TeamTasksData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/tasks/overview")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="card p-5">
      <CardHdr icon={Users2} title="Team Tasks" />
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      ) : !data ? (
        <p className="text-sm text-gray-400 italic">Unable to load team tasks.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Overdue", value: data.overdue, color: data.overdue > 0 ? "text-red-600 bg-red-50" : "text-gray-500 bg-gray-50" },
              { label: "Due Today", value: data.today, color: data.today > 0 ? "text-amber-600 bg-amber-50" : "text-gray-500 bg-gray-50" },
              { label: "This Week", value: data.this_week, color: "text-gray-600 bg-gray-50" },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg p-2.5 text-center ${s.color}`}>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-[10px] font-mono mt-0.5 opacity-80">{s.label}</p>
              </div>
            ))}
          </div>
          {data.by_assignee.length > 0 && (
            <div className="space-y-1">
              {data.by_assignee.filter((a) => a.overdue > 0 || a.today > 0).map((a) => (
                <div key={a.userId} className="flex items-center gap-2 text-xs py-1">
                  <span className="flex-1 text-gray-700 truncate font-medium">{a.name}</span>
                  {a.overdue > 0 && (
                    <span className="badge bg-red-50 text-red-600">{a.overdue} overdue</span>
                  )}
                  {a.today > 0 && (
                    <span className="badge bg-amber-50 text-amber-600">{a.today} today</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="pt-1 border-t border-gray-50">
            <Link href="/dashboard/tasks" className="text-xs text-[#D64D4D] hover:underline font-medium">
              View All Tasks →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Supervisor Dashboard layout ──────────────────────────────────────────────

function SupervisorDashboard({ data }: { data: SupervisorData }) {
  const isEmpty =
    data.recent_productions.length === 0 &&
    data.inventory_alerts.low_stock.length === 0 &&
    data.inventory_alerts.expiring_soon.length === 0 &&
    data.inventory_alerts.expired.length === 0;

  return (
    <>
      {data.active_draft && <ActiveDraftCard draft={data.active_draft} />}
      <MyTasksCard />
      <ProductionScheduleCard />
      {isEmpty ? (
        <WelcomeCard />
      ) : (
        <>
          <InventoryAlertsCard alerts={data.inventory_alerts} />
          <RecentProductionsCard productions={data.recent_productions} />
        </>
      )}
    </>
  );
}

// ─── Storage tile (admin only, shown only when > 60% used) ───────────────────

function StorageDashboardTile() {
  const [pct, setPct] = useState<number | null>(null);
  const [totalMb, setTotalMb] = useState<number>(0);

  useEffect(() => {
    fetch("/api/admin/storage-usage")
      .then((r) => r.json())
      .then((d) => { setPct(d.percentage_used ?? 0); setTotalMb(d.total_mb ?? 0); })
      .catch(() => {});
  }, []);

  // Only render when above 60%
  if (pct === null || pct <= 60) return null;

  const color = pct > 80 ? "text-red-600" : "text-amber-600";
  const bg    = pct > 80 ? "bg-red-50"    : "bg-amber-50";
  const barColor = pct > 80 ? "bg-red-500" : "bg-amber-500";

  return (
    <Link href="/admin/settings"
      className="card p-4 hover:shadow-md transition-shadow group flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
          <HardDrive className={`w-4 h-4 ${color}`} />
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{totalMb < 1 ? "<1" : totalMb.toFixed(0)} <span className="text-sm font-normal">MB</span></p>
      <p className="text-xs text-gray-500 leading-tight">Document Storage</p>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="text-[10px] text-gray-400">{pct.toFixed(0)}% of 500 MB</p>
    </Link>
  );
}

// ─── Inventory Audit Card (admin only) ───────────────────────────────────────

type BatchSheetContribution = {
  submission_id: string; production_lot: string | null; production_date: string | null;
  template_name: string | null; batch_qty_used: number; batch_unit: string;
  converted_qty: number; lot_unit: string; movement_recorded: number | null;
  is_correct: boolean; difference: number;
};
type CorrectionHistoryEntry = {
  movement_id: string; movement_type: string; quantity: number; unit: string;
  reference_number: string; performed_at: string; performed_by_name: string | null;
};
type DiscrepancyDetailSummary = {
  total_expected: number; total_actually_deducted: number; total_corrections_applied: number;
  net_position_after_corrections: number; current_quantity_remaining: number;
  correct_quantity_remaining: number; would_go_negative: boolean;
};
type AuditDiscrepancy = {
  inventoryLotId: string; materialName: string; lotNumber: string; unit: string;
  expectedTotalDeduction: number; actualBatchSheetDeduction: number; discrepancy: number;
  currentQtyRemaining: number; projectedQtyRemaining: number;
  submissionsAffected: number; direction: "over_deducted" | "under_deducted";
  batch_sheet_contributions: BatchSheetContribution[];
  correction_history: CorrectionHistoryEntry[];
  summary: DiscrepancyDetailSummary;
  recommendation: string;
};
type AuditSummary = {
  generatedAt: string;
  submissionsAnalyzed: number;
  lotsChecked: number;
  discrepancies: AuditDiscrepancy[];
  correctedLots: Array<{
    inventoryLotId: string; materialName: string; lotNumber: string; unit: string;
    originalWrongDeduction: number; correctDeduction: number;
    totalCorrectionsApplied: number; currentQtyRemaining: number;
  }>;
  nfcNoStock: Array<{ materialName: string; expectedQty: number; note: string }>;
  summary: {
    clean: boolean;
    discrepanciesFound: number;
    correctedLotsCount: number;
    nfcGapsFound: number;
    nfcNoStockCount: number;
    nfcExcludedCount: number;
    orphanedMovementsFound: number;
  };
};

const AUDIT_CACHE_KEY = "inventory_audit_result";
const AUDIT_CACHE_TS_KEY = "inventory_audit_ts";
const AUDIT_CACHE_TTL_MS = 5 * 60 * 1000;

function fmtDatePT(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", timeZone: "America/Los_Angeles",
  });
}

function fmtTimePT(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Los_Angeles",
  });
}

function exportAuditPDF(result: AuditSummary, adminName: string) {
  const s = result.summary;
  const dateTag = new Date(result.generatedAt).toISOString().slice(0, 10);

  const discrepancyHtml = result.discrepancies.map((d) => {
    const contribRows = d.batch_sheet_contributions.map((c) => {
      const statusIcon = c.is_correct ? "✓" : c.movement_recorded === null ? "○" : "✗";
      const statusColor = c.is_correct ? "#059669" : c.movement_recorded === null ? "#6B7280" : "#D64D4D";
      const statusLabel = c.is_correct ? "Correct"
        : c.movement_recorded === null ? `Missing — expected ${formatQty(c.converted_qty)} ${c.lot_unit}, no movement found`
        : `Wrong — off by ${formatQty(Math.abs(c.difference))} ${c.lot_unit} (recorded ${formatQty(c.movement_recorded)}, expected ${formatQty(c.converted_qty)})`;
      const convStr = c.batch_unit !== c.lot_unit
        ? `${formatQty(c.batch_qty_used)} ${c.batch_unit} → ${formatQty(c.converted_qty)} ${c.lot_unit}`
        : `${formatQty(c.batch_qty_used)} ${c.batch_unit}`;
      return `<tr style="border-bottom:1px solid #F3F4F6">
        <td style="padding:5px 8px;font-size:10px;font-family:monospace">${c.production_lot ?? "—"}</td>
        <td style="padding:5px 8px;font-size:10px">${fmtDatePT(c.production_date)}</td>
        <td style="padding:5px 8px;font-size:10px">${c.template_name ?? "—"}</td>
        <td style="padding:5px 8px;font-size:10px">${convStr}</td>
        <td style="padding:5px 8px;font-size:10px">${c.movement_recorded !== null ? `${formatQty(c.movement_recorded)} ${c.lot_unit}` : "—"}</td>
        <td style="padding:5px 8px;font-size:10px;font-weight:600;color:${statusColor}">${statusIcon} ${statusLabel}</td>
      </tr>`;
    }).join("");

    const corrRows = d.correction_history.length === 0
      ? `<tr><td colspan="4" style="padding:6px 8px;font-size:10px;color:#6B7280;font-style:italic">No corrections previously applied</td></tr>`
      : d.correction_history.map((c) => {
          const sign = c.movement_type === "in_correction" ? "+" : "−";
          return `<tr style="border-bottom:1px solid #F3F4F6">
            <td style="padding:5px 8px;font-size:10px;font-family:monospace">${c.reference_number}</td>
            <td style="padding:5px 8px;font-size:10px">${fmtDatePT(c.performed_at)}</td>
            <td style="padding:5px 8px;font-size:10px;font-weight:600;color:${c.movement_type==="in_correction"?"#059669":"#D64D4D"}">${sign}${formatQty(Math.abs(c.quantity))} ${c.unit}</td>
            <td style="padding:5px 8px;font-size:10px">${c.performed_by_name ?? "—"}</td>
          </tr>`;
        }).join("");

    const sm = d.summary;
    const dirLabel = d.direction === "over_deducted" ? "OVER-DEDUCTED" : "UNDER-DEDUCTED";
    const dirColor = d.direction === "over_deducted" ? "#D64D4D" : "#D97706";

    return `
<div style="page-break-before:always;padding:0 0 24px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div>
      <h2 style="font-size:14px;font-weight:bold;margin:0">${d.materialName}</h2>
      <p style="font-size:11px;color:#6B7280;font-family:monospace;margin:2px 0">Lot # ${d.lotNumber}</p>
    </div>
    <span style="font-size:10px;font-weight:bold;padding:3px 8px;border-radius:4px;background:${d.direction==="over_deducted"?"#FEE2E2":"#FEF3C7"};color:${dirColor}">${dirLabel}</span>
  </div>

  <h3 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#6B7280;letter-spacing:0.05em;margin:12px 0 6px">Batch Sheet Contributions</h3>
  <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:4px;overflow:hidden">
    <thead><tr style="background:#F9FAFB">
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Production Lot</th>
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Date</th>
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Template</th>
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Qty Used</th>
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Movement Recorded</th>
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Status</th>
    </tr></thead>
    <tbody>${contribRows}</tbody>
  </table>

  <h3 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#6B7280;letter-spacing:0.05em;margin:16px 0 6px">Previous Corrections</h3>
  <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB">
    <thead><tr style="background:#F9FAFB">
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Reference</th>
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Date</th>
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Amount</th>
      <th style="padding:5px 8px;font-size:10px;font-family:monospace;text-align:left;color:#6B7280;border-bottom:1px solid #E5E7EB">Applied By</th>
    </tr></thead>
    <tbody>${corrRows}</tbody>
  </table>

  <h3 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#6B7280;letter-spacing:0.05em;margin:16px 0 6px">Summary</h3>
  <table style="width:100%;border-collapse:collapse">
    ${[
      ["Total expected deduction", `${formatQty(sm.total_expected)} ${d.unit}`],
      ["Total actually deducted (batch sheets)", `${formatQty(sm.total_actually_deducted)} ${d.unit}`],
      ["Total audit corrections applied", `${formatQty(Math.abs(sm.total_corrections_applied))} ${d.unit}`],
      ["Net position after corrections", `${formatQty(Math.abs(sm.net_position_after_corrections))} ${d.unit} ${d.direction==="over_deducted"?"over-deducted":"under-deducted"}`],
      ["Current quantity remaining", `${formatQty(sm.current_quantity_remaining)} ${d.unit}`],
      ["Correct quantity remaining after fix", `${formatQty(sm.correct_quantity_remaining)} ${d.unit}`],
    ].map(([label, value]) => `<tr>
      <td style="padding:3px 8px 3px 0;font-size:10px;color:#6B7280;white-space:nowrap">${label}</td>
      <td style="padding:3px 0 3px 8px;font-size:10px;font-weight:600">${value}</td>
    </tr>`).join("")}
  </table>

  <h3 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#6B7280;letter-spacing:0.05em;margin:16px 0 6px">Recommended Action</h3>
  <p style="font-size:11px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:4px;padding:8px 12px;margin:0">${d.recommendation}</p>
</div>`;
  }).join("");

  const correctedTableRows = result.correctedLots.map((lot) => `
    <tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:5px 8px;font-size:10px">${lot.materialName}</td>
      <td style="padding:5px 8px;font-size:10px;font-family:monospace">${lot.lotNumber}</td>
      <td style="padding:5px 8px;font-size:10px">${formatQty(lot.totalCorrectionsApplied)} ${lot.unit}</td>
      <td style="padding:5px 8px;font-size:10px">${formatQty(lot.currentQtyRemaining)} ${lot.unit}</td>
      <td style="padding:5px 8px;font-size:10px;color:#059669;font-weight:600">Corrected</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Inventory Audit Report — ${dateTag}</title>
<style>
  body{font-family:Georgia,serif;margin:32px;color:#111827;font-size:12px}
  h1{font-size:20px;margin:0 0 4px}
  h2{font-size:14px;margin:0 0 4px}
  h3{font-size:11px;margin:12px 0 6px;text-transform:uppercase;color:#6B7280;letter-spacing:0.05em;font-family:monospace}
  table{width:100%;border-collapse:collapse}
  th{background:#F9FAFB;font-family:monospace;font-size:10px;color:#6B7280;text-transform:uppercase;padding:5px 8px;text-align:left;border-bottom:1px solid #E5E7EB}
  .footer{position:fixed;bottom:16px;left:32px;right:32px;font-size:9px;color:#9CA3AF;display:flex;justify-content:space-between;border-top:1px solid #E5E7EB;padding-top:6px}
  @media print{body{margin:20px}.footer{position:fixed}}
</style></head>
<body>
<div style="border-bottom:2px solid #111827;padding-bottom:16px;margin-bottom:20px">
  <p style="font-family:monospace;font-size:10px;color:#6B7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.08em">Julian Bakery · Food Safety Management System</p>
  <h1 style="font-family:Georgia,serif">Inventory Audit Report</h1>
  <p style="font-size:11px;color:#6B7280;margin:4px 0 0">Generated: ${fmtTimePT(result.generatedAt)} Pacific&nbsp;&nbsp;·&nbsp;&nbsp;By: ${adminName}</p>
</div>

<h3>Audit Summary</h3>
<table style="border:1px solid #E5E7EB;border-radius:4px;margin-bottom:8px">
  <tbody>
    ${[
      ["Submissions analyzed", result.submissionsAnalyzed],
      ["Lots checked", result.lotsChecked],
      ["Discrepancies found", s.discrepanciesFound],
      ["Corrected lots (historical)", s.correctedLotsCount],
      ["NFC gaps excluded", s.nfcExcludedCount],
      ["Status", s.clean ? "✓ CLEAN" : "✗ ISSUES FOUND"],
    ].map(([label, value]) => `<tr style="border-bottom:1px solid #F3F4F6">
      <td style="padding:5px 10px;font-size:11px;color:#6B7280;width:220px">${label}</td>
      <td style="padding:5px 10px;font-size:11px;font-weight:600">${value}</td>
    </tr>`).join("")}
  </tbody>
</table>

${result.discrepancies.length === 0
  ? '<p style="font-size:11px;color:#059669;font-weight:600">No discrepancies found. All lots are accurate.</p>'
  : discrepancyHtml}

${result.correctedLots.length > 0 ? `
<div style="page-break-before:always">
  <h2 style="margin-bottom:12px">Historically Corrected Lots</h2>
  <table style="border:1px solid #E5E7EB">
    <thead><tr>
      <th>Material</th><th>Lot #</th><th>Correction Applied</th><th>Current Qty</th><th>Status</th>
    </tr></thead>
    <tbody>${correctedTableRows}</tbody>
  </table>
  <p style="font-size:10px;color:#6B7280;margin-top:12px;font-style:italic">
    These lots had discrepancies in previous audit runs that have been corrected. They are shown here for reference and are not currently flagged.
  </p>
</div>` : ""}

<div class="footer">
  <span>Julian Bakery FSMS — Inventory Audit Report — ${fmtDatePT(result.generatedAt)}</span>
  <span>Confidential — Internal Use Only</span>
</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ─── Finished Goods card ──────────────────────────────────────────────────────

function FinishedGoodsCard() {
  const [summary, setSummary] = useState<{
    totalOnHand: number;
    totalShipped: number;
    skuCount: number;
    lastSync: { completedAt: string | null } | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/finished-goods/summary")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setSummary(d); })
      .catch(() => {});
  }, []);

  if (!summary) return null;

  const lastSyncDate = summary.lastSync?.completedAt
    ? new Date(summary.lastSync.completedAt).toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "numeric", day: "numeric", year: "2-digit",
      })
    : null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900 text-sm">Finished Goods</h3>
        </div>
        <Link
          href="/dashboard/admin/finished-goods"
          className="text-xs text-brand-600 hover:underline font-mono"
        >
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-wide">On Hand</p>
          <p className="text-xl font-bold text-gray-900">{summary.totalOnHand.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-wide">Shipped</p>
          <p className="text-xl font-bold text-gray-700">{summary.totalShipped.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-wide">SKUs</p>
          <p className="text-xl font-bold text-gray-700">{summary.skuCount}</p>
        </div>
      </div>
      {lastSyncDate && (
        <p className="text-xs text-gray-400 mt-3">Last ShipStation sync: {lastSyncDate}</p>
      )}
      {!lastSyncDate && (
        <p className="text-xs text-amber-500 mt-3">No ShipStation sync yet — configure in Settings</p>
      )}
    </div>
  );
}

function InventoryAuditCard() {
  const [result, setResult] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctedOpen, setCorrectedOpen] = useState(false);
  const [nfcNoStockOpen, setNfcNoStockOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<"rerun" | "correct" | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [corrected, setCorrected] = useState(false);
  const [expandedLotId, setExpandedLotId] = useState<string | null>(null);

  function getCached(): AuditSummary | null {
    try {
      const ts = sessionStorage.getItem(AUDIT_CACHE_TS_KEY);
      if (!ts) return null;
      if (Date.now() - Number(ts) > AUDIT_CACHE_TTL_MS) return null;
      const raw = sessionStorage.getItem(AUDIT_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setCache(data: AuditSummary) {
    try {
      sessionStorage.setItem(AUDIT_CACHE_KEY, JSON.stringify(data));
      sessionStorage.setItem(AUDIT_CACHE_TS_KEY, String(Date.now()));
    } catch {}
  }

  async function runAudit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory-audit");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AuditSummary = await res.json();
      setCache(data);
      setResult(data);
      setCorrected(false);
    } catch (e) {
      setError("Failed to run audit. Please try again.");
    } finally {
      setLoading(false);
      setConfirmModal(null);
    }
  }

  async function runCorrections() {
    setCorrecting(true);
    try {
      const res = await fetch("/api/admin/inventory-audit", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCorrected(true);
      // Re-run GET to refresh result
      const res2 = await fetch("/api/admin/inventory-audit");
      if (res2.ok) {
        const data: AuditSummary = await res2.json();
        setCache(data);
        setResult(data);
      }
    } catch {
      setError("Failed to apply corrections. Please try again.");
    } finally {
      setCorrecting(false);
      setConfirmModal(null);
    }
  }

  function handleRunClick() {
    const cached = getCached();
    if (cached) {
      // Already have fresh results — offer to re-run or just show cached
      setResult(cached);
    } else {
      runAudit();
    }
  }

  function handleRerunClick() {
    const ts = sessionStorage.getItem(AUDIT_CACHE_TS_KEY);
    if (ts && Date.now() - Number(ts) < AUDIT_CACHE_TTL_MS) {
      setConfirmModal("rerun");
    } else {
      runAudit();
    }
  }

  const s = result?.summary;
  const isClean = s?.clean ?? false;

  return (
    <>
      {/* Confirmation modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-base">
                {confirmModal === "rerun" ? "Re-run Inventory Audit?" : "Apply Inventory Corrections?"}
              </h3>
              <button onClick={() => setConfirmModal(null)} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            {confirmModal === "rerun" ? (
              <p className="text-sm text-gray-600 mb-5">
                An audit was run less than 5 minutes ago. Re-running will replace the cached results.
              </p>
            ) : (
              <p className="text-sm text-gray-600 mb-5">
                This will apply <span className="font-semibold">{s?.discrepanciesFound ?? 0} correction{(s?.discrepanciesFound ?? 0) !== 1 ? "s" : ""}</span> to inventory lot quantities. This action cannot be undone via the audit tool.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => confirmModal === "rerun" ? runAudit() : runCorrections()}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-[#D64D4D] hover:bg-[#c04040] rounded-lg transition-colors">
                {confirmModal === "rerun" ? "Re-run Audit" : "Apply Corrections"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-gray-400 shrink-0" />
            <h2 className="font-semibold text-gray-900 text-sm">Inventory Audit</h2>
            {result && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isClean ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-[#D64D4D]"}`}>
                {isClean ? "CLEAN" : `${s?.discrepanciesFound} ISSUE${(s?.discrepanciesFound ?? 0) !== 1 ? "S" : ""}`}
              </span>
            )}
          </div>
          {result && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportAuditPDF(result, "Admin")}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
                <Download className="w-3 h-3" />
                Export
              </button>
              <button onClick={handleRerunClick}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
                <RefreshCw className="w-3 h-3" />
                Re-run
              </button>
            </div>
          )}
        </div>

        {/* Default — no result yet */}
        {!result && !loading && !error && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <p className="text-sm text-gray-500 flex-1">
              Compare batch sheet records against actual inventory movements to detect discrepancies and verify NFC packaging compliance.
            </p>
            <button onClick={handleRunClick}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#D64D4D] hover:bg-[#c04040] rounded-lg transition-colors min-h-[44px]">
              <ScanLine className="w-4 h-4" />
              Run Audit
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-3 py-4 text-gray-500">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-[#D64D4D]" />
            <span className="text-sm">Running audit…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center gap-3 text-sm text-[#D64D4D]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Result — clean */}
        {result && !loading && isClean && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">All inventory records are accurate.</p>
            </div>

            {/* Stat pills */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Submissions analyzed", value: result.submissionsAnalyzed },
                { label: "Lots checked", value: result.lotsChecked },
                { label: "Previously corrected", value: s?.correctedLotsCount ?? 0 },
                { label: "NFC resolved", value: s?.nfcExcludedCount ?? 0 },
              ].map((p) => (
                <div key={p.label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-base font-bold text-gray-900">{p.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{p.label}</p>
                </div>
              ))}
            </div>

            {/* NFC no-stock amber note */}
            {(s?.nfcNoStockCount ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <button onClick={() => setNfcNoStockOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-xs font-semibold text-amber-800">
                      {s!.nfcNoStockCount} NFC material{s!.nfcNoStockCount !== 1 ? "s" : ""} had no active lot to deduct from
                    </span>
                  </div>
                  {nfcNoStockOpen ? <ChevronUp className="w-3 h-3 text-amber-600 shrink-0" /> : <ChevronDown className="w-3 h-3 text-amber-600 shrink-0" />}
                </button>
                {nfcNoStockOpen && result.nfcNoStock.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-amber-200 pt-2">
                    {result.nfcNoStock.map((n, i) => (
                      <p key={i} className="text-xs text-amber-700">
                        <span className="font-medium">{n.materialName}</span>
                        {" — "}{formatQty(n.expectedQty)} expected · {n.note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Corrected lots — always collapsed */}
            {(s?.correctedLotsCount ?? 0) > 0 && (
              <div className="border border-gray-100 rounded-lg">
                <button onClick={() => setCorrectedOpen((v) => !v)}
                  className="flex items-center justify-between w-full px-3 py-2.5 text-left gap-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs font-medium text-gray-600">
                      {s!.correctedLotsCount} previously corrected lot{s!.correctedLotsCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {correctedOpen ? <ChevronUp className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />}
                </button>
                {correctedOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {result.correctedLots.map((lot) => (
                      <div key={lot.inventoryLotId} className="px-3 py-2.5">
                        <p className="text-xs font-medium text-gray-800">{lot.materialName}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{lot.lotNumber}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Deduction corrected to {formatQty(lot.correctDeduction)} {lot.unit}
                          {" · "}Remaining: {formatQty(lot.currentQtyRemaining)} {lot.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              Last run: {new Date(result.generatedAt).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                hour12: true, timeZone: "America/Los_Angeles",
              })}
            </p>
          </div>
        )}

        {/* Result — issues */}
        {result && !loading && !isClean && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#D64D4D]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">
                {s!.discrepanciesFound} discrepanc{s!.discrepanciesFound !== 1 ? "ies" : "y"} found across {result.submissionsAnalyzed} submissions.
              </p>
            </div>

            {/* Discrepancy rows */}
            <div className="border border-red-100 rounded-lg divide-y divide-red-50 overflow-hidden">
              {result.discrepancies.map((d) => {
                const isExpanded = expandedLotId === d.inventoryLotId;
                return (
                  <div key={d.inventoryLotId} className="bg-red-50/40">
                    {/* Summary row */}
                    <div className="px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{d.materialName}</p>
                          <p className="text-[11px] text-gray-400 font-mono">{d.lotNumber}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${d.direction === "over_deducted" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {d.direction === "over_deducted" ? "OVER" : "UNDER"}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[11px] text-gray-600 space-y-0.5">
                        <p>Expected: <span className="font-medium">{formatQty(d.expectedTotalDeduction)} {d.unit}</span> · Actual: <span className="font-medium">{formatQty(d.actualBatchSheetDeduction)} {d.unit}</span></p>
                        <p>Gap: <span className="font-semibold text-[#D64D4D]">{formatQty(Math.abs(d.discrepancy))} {d.unit}</span> · Affects {d.submissionsAffected} batch sheet{d.submissionsAffected !== 1 ? "s" : ""}</p>
                        <p>Projected remaining after fix: <span className="font-medium">{formatQty(d.projectedQtyRemaining)} {d.unit}</span></p>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => setExpandedLotId(isExpanded ? null : d.inventoryLotId)}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                          {isExpanded ? <>Hide detail <ChevronUp className="w-3 h-3" /></> : <>View detail <ChevronDown className="w-3 h-3" /></>}
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="bg-gray-50 border-t border-gray-100 px-3 py-3 space-y-4">

                        {/* Batch sheet contributions */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Batch sheet contributions</p>
                          <div className="space-y-2">
                            {d.batch_sheet_contributions.map((c, i) => {
                              const statusIcon = c.is_correct ? "✓" : c.movement_recorded === null ? "○" : "✗";
                              const statusColor = c.is_correct ? "text-emerald-600" : c.movement_recorded === null ? "text-gray-400" : "text-[#D64D4D]";
                              const convStr = c.batch_unit !== c.lot_unit
                                ? `${formatQty(c.batch_qty_used)} ${c.batch_unit} → ${formatQty(c.converted_qty)} ${c.lot_unit}`
                                : `${formatQty(c.batch_qty_used)} ${c.batch_unit}`;
                              const statusDetail = c.is_correct
                                ? "Correct"
                                : c.movement_recorded === null
                                ? "Missing — no movement found"
                                : `Wrong — over-deducted by ${formatQty(Math.abs(c.difference))} ${c.lot_unit}`;
                              return (
                                <div key={i} className="bg-white rounded border border-gray-100 px-2.5 py-2 text-[11px]">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="font-mono font-medium text-gray-800">{c.production_lot ?? "—"} <span className="font-normal text-gray-400">({fmtDatePT(c.production_date)})</span></p>
                                      <p className="text-gray-500 mt-0.5">Used: {convStr}</p>
                                      <p className="text-gray-500">Movement recorded: {c.movement_recorded !== null ? `${formatQty(c.movement_recorded)} ${c.lot_unit}` : "none"}</p>
                                    </div>
                                    <span className={`shrink-0 font-semibold ${statusColor}`}>{statusIcon}</span>
                                  </div>
                                  <p className={`mt-1 font-medium ${statusColor}`}>{statusDetail}</p>
                                </div>
                              );
                            })}
                            {d.batch_sheet_contributions.length === 0 && (
                              <p className="text-[11px] text-gray-400 italic">No batch sheet contributions found.</p>
                            )}
                          </div>
                        </div>

                        {/* Correction history */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Previous corrections applied</p>
                          {d.correction_history.length === 0 ? (
                            <p className="text-[11px] text-gray-400 italic">No corrections previously applied</p>
                          ) : (
                            <div className="space-y-1.5">
                              {d.correction_history.map((c, i) => {
                                const sign = c.movement_type === "in_correction" ? "+" : "−";
                                const amtColor = c.movement_type === "in_correction" ? "text-emerald-600" : "text-[#D64D4D]";
                                return (
                                  <div key={i} className="flex items-center gap-2 text-[11px] text-gray-600">
                                    <span className="font-mono text-gray-400">{c.reference_number}</span>
                                    <span className="text-gray-300">·</span>
                                    <span className="text-gray-400">{fmtDatePT(c.performed_at)}</span>
                                    <span className="text-gray-300">·</span>
                                    <span className={`font-semibold ${amtColor}`}>{sign}{formatQty(Math.abs(c.quantity))} {c.unit}</span>
                                    {c.performed_by_name && <><span className="text-gray-300">·</span><span className="text-gray-400">{c.performed_by_name}</span></>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Summary */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Summary</p>
                          <div className="space-y-1 text-[11px]">
                            {[
                              ["Total expected deduction", `${formatQty(d.summary.total_expected)} ${d.unit}`],
                              ["Total actually deducted", `${formatQty(d.summary.total_actually_deducted)} ${d.unit}`],
                              ["Total audit corrections applied", `${formatQty(Math.abs(d.summary.total_corrections_applied))} ${d.unit}`],
                              ["Net position after corrections", `${formatQty(Math.abs(d.summary.net_position_after_corrections))} ${d.unit} ${d.direction === "over_deducted" ? "over" : "under"}`],
                              ["Current quantity remaining", `${formatQty(d.summary.current_quantity_remaining)} ${d.unit}`],
                              ["Correct qty remaining after fix", `${formatQty(d.summary.correct_quantity_remaining)} ${d.unit}`],
                            ].map(([label, value]) => (
                              <div key={label} className="flex items-baseline justify-between gap-4">
                                <span className="text-gray-500">{label}</span>
                                <span className="font-medium text-gray-800 shrink-0">{value}</span>
                              </div>
                            ))}
                            {d.summary.would_go_negative && (
                              <p className="mt-1 text-[10px] text-amber-600 font-semibold">⚠ Correction would result in negative stock</p>
                            )}
                          </div>
                        </div>

                        {/* Recommendation */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Recommended action</p>
                          <p className="text-[11px] text-gray-700 bg-white border border-gray-100 rounded px-2.5 py-2">{d.recommendation}</p>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Apply corrections CTA */}
            {!corrected && (
              <button
                onClick={() => setConfirmModal("correct")}
                disabled={correcting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#D64D4D] hover:bg-[#c04040] disabled:opacity-50 rounded-lg transition-colors min-h-[44px]">
                {correcting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />Applying…</>
                ) : (
                  <><Wrench className="w-4 h-4" />Run Corrections →</>
                )}
              </button>
            )}
            {corrected && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Corrections applied. Re-run the audit to confirm.
              </div>
            )}

            {/* NFC no-stock amber note */}
            {(s?.nfcNoStockCount ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <button onClick={() => setNfcNoStockOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-xs font-semibold text-amber-800">
                      {s!.nfcNoStockCount} NFC material{s!.nfcNoStockCount !== 1 ? "s" : ""} had no active lot (not auto-correctable)
                    </span>
                  </div>
                  {nfcNoStockOpen ? <ChevronUp className="w-3 h-3 text-amber-600 shrink-0" /> : <ChevronDown className="w-3 h-3 text-amber-600 shrink-0" />}
                </button>
                {nfcNoStockOpen && result.nfcNoStock.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-amber-200 pt-2">
                    {result.nfcNoStock.map((n, i) => (
                      <p key={i} className="text-xs text-amber-700">
                        <span className="font-medium">{n.materialName}</span>
                        {" — "}{formatQty(n.expectedQty)} expected · {n.note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Corrected lots — always collapsed */}
            {(s?.correctedLotsCount ?? 0) > 0 && (
              <div className="border border-gray-100 rounded-lg">
                <button onClick={() => setCorrectedOpen((v) => !v)}
                  className="flex items-center justify-between w-full px-3 py-2.5 text-left gap-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs font-medium text-gray-600">
                      {s!.correctedLotsCount} previously corrected lot{s!.correctedLotsCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {correctedOpen ? <ChevronUp className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />}
                </button>
                {correctedOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {result.correctedLots.map((lot) => (
                      <div key={lot.inventoryLotId} className="px-3 py-2.5">
                        <p className="text-xs font-medium text-gray-800">{lot.materialName}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{lot.lotNumber}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Deduction corrected to {formatQty(lot.correctDeduction)} {lot.unit}
                          {" · "}Remaining: {formatQty(lot.currentQtyRemaining)} {lot.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              Last run: {new Date(result.generatedAt).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                hour12: true, timeZone: "America/Los_Angeles",
              })}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Admin Dashboard layout ───────────────────────────────────────────────────

function AdminDashboard({ data }: { data: AdminData }) {
  return (
    <>
      <QuickStatsCard stats={data.quick_stats} />
      <StorageDashboardTile />
      <InventoryAuditCard />
      <FinishedGoodsCard />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MyTasksCard />
        <TeamTasksCard />
      </div>
      {data.active_draft && <ActiveDraftCard draft={data.active_draft} />}
      <ProductionScheduleCard />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <TodayActivityCard activity={data.today_activity} />
        </div>
        <div className="lg:col-span-2">
          <SupplierAlertsCard alerts={data.supplier_alerts} />
        </div>
      </div>
      <InventoryAlertsCard alerts={data.inventory_alerts} />
      <RecentProductionsCard productions={data.recent_productions} />
      <QuarantineCard records={data.open_quarantine_records} />
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function DashboardClient({ role, firstName }: { role: string; firstName: string }) {
  const [data, setData] = useState<SupervisorData | AdminData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const endpoint = role === "ADMIN" ? "/api/dashboard/admin" : "/api/dashboard/supervisor";

  useEffect(() => {
    fetch(endpoint)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [endpoint]);

  const greetLabel = greeting();
  const dayLabel = todayLabel();

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title mb-0">
            {greetLabel}, {data?.greeting_name ?? firstName} 👋
          </h1>
          <p className="page-subtitle">{dayLabel}</p>
        </div>
        <Heart className="w-7 h-7 text-[#D64D4D] opacity-20 shrink-0 mt-1" />
      </div>

      {loading && (
        <div className="space-y-4">
          {role === "ADMIN" && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0,1,2,3].map((i) => <CardSkeleton key={i} />)}
            </div>
          )}
          <CardSkeleton />
          {role === "ADMIN" && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3"><CardSkeleton /></div>
              <div className="lg:col-span-2"><CardSkeleton /></div>
            </div>
          )}
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {!loading && error && (
        <div className="card p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Unable to load dashboard data. Please refresh.</p>
        </div>
      )}

      {!loading && !error && data && (
        role === "ADMIN"
          ? <AdminDashboard data={data as AdminData} />
          : <SupervisorDashboard data={data as SupervisorData} />
      )}
    </div>
  );
}
