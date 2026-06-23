"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, AlertTriangle, Clock, ChevronRight,
  Package, ClipboardCheck, FileText, Layers,
  TrendingUp, Archive, Building2, ShieldAlert,
  Heart, CalendarCheck, Users2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SupervisorData {
  greeting_name: string;
  active_draft: {
    id: string; product_name: string; lot_number: string | null;
    started_at: string; last_saved_at: string | null;
  } | null;
  inventory_alerts: {
    low_stock: Array<{ id: string; material_name: string; lot_number: string; quantity_remaining: number; unit: string; min_quantity: number | null; min_unit: string | null }>;
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
                    {l.quantity_remaining} {l.unit} remaining
                    {l.min_quantity != null && ` (min: ${l.min_quantity} ${l.min_unit ?? l.unit})`}
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

// ─── Admin Dashboard layout ───────────────────────────────────────────────────

function AdminDashboard({ data }: { data: AdminData }) {
  return (
    <>
      <QuickStatsCard stats={data.quick_stats} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MyTasksCard />
        <TeamTasksCard />
      </div>
      {data.active_draft && <ActiveDraftCard draft={data.active_draft} />}
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
