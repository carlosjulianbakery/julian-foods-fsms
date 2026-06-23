"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Settings,
  ChevronRight,
  ClipboardCheck,
  ScrollText,
  FileStack,
  FileText,
  BookMarked,
  Dna,
  Building2,
  Package,
  Bell,
  Settings2,
  ListChecks,
  Droplets,
  FlaskConical,
  Truck,
  Warehouse,
  ArrowLeftRight,
  ScanSearch,
  ClipboardList,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";


// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------
const generalNav = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Tasks",
    href: "/dashboard/tasks",
    icon: CalendarCheck,
    roles: ["SUPERVISOR", "ADMIN"],
    badge: true,
  },
];

const formsNav = [
  {
    label: "Pre-Op Inspection",
    href: "/dashboard/supervisor/pre-op",
    icon: ClipboardCheck,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Batch Sheet",
    href: "/dashboard/supervisor/batch-sheet",
    icon: ScrollText,
    roles: ["SUPERVISOR", "ADMIN"],
    exact: true,
  },
  {
    label: "Receiving",
    href: "/dashboard/supervisor/receiving",
    icon: Truck,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Daily Cleaning",
    href: "/dashboard/supervisor/cleaning/daily",
    icon: ListChecks,
    roles: ["SUPERVISOR", "ADMIN"],
    comingSoon: false,
  },
  {
    label: "Monthly Cleaning",
    href: "/dashboard/supervisor/cleaning/monthly",
    icon: CalendarCheck,
    roles: ["SUPERVISOR", "ADMIN"],
    comingSoon: false,
  },
];

const logsNav = [
  {
    label: "Pre-Op Inspection",
    href: "/dashboard/logs/pre-op",
    icon: ClipboardCheck,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Lot Traceability",
    href: "/dashboard/logs/lot-traceability",
    icon: BookMarked,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Allergen Log",
    href: "/dashboard/logs/allergen-changeover",
    icon: Dna,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Cleaning Log",
    href: "/dashboard/logs/cleaning",
    icon: Droplets,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Receiving Log",
    href: "/dashboard/logs/receiving",
    icon: Truck,
    roles: ["SUPERVISOR", "ADMIN"],
  },
];

const inventoryNav = [
  {
    label: "Current Stock",
    href: "/dashboard/inventory/current",
    icon: Warehouse,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Stock Alerts",
    href: "/dashboard/inventory/alerts",
    icon: AlertTriangle,
    roles: ["SUPERVISOR", "ADMIN"],
    badge: true,
  },
  {
    label: "Movement History",
    href: "/dashboard/inventory/movements",
    icon: ArrowLeftRight,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Lot Lookup",
    href: "/dashboard/inventory/lot-lookup",
    icon: ScanSearch,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Cycle Count",
    href: "/dashboard/inventory/cycle-count",
    icon: ClipboardList,
    roles: ["ADMIN"],
  },
  {
    label: "Initial Stock Entry",
    href: "/dashboard/admin/inventory/initial-stock-entry",
    icon: FileText,
    roles: ["ADMIN"],
  },
];

const adminNav = [
  {
    label: "Users",
    href: "/dashboard/admin/users",
    icon: Users,
    roles: ["ADMIN"],
  },
  {
    label: "Batch Sheet Templates",
    href: "/dashboard/admin/batch-sheet-templates",
    icon: FileStack,
    roles: ["ADMIN"],
  },
  {
    label: "Manage Tasks",
    href: "/dashboard/admin/tasks",
    icon: ListChecks,
    roles: ["ADMIN"],
  },
  {
    label: "Quarantine",
    href: "/dashboard/admin/quarantine",
    icon: ShieldAlert,
    roles: ["ADMIN"],
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    roles: ["ADMIN"],
  },
];

const supplierNav = [
  {
    label: "Suppliers",
    href: "/supplier-management/suppliers",
    icon: Building2,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Materials",
    href: "/supplier-management/materials",
    icon: Package,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Products",
    href: "/supplier-management/products",
    icon: FlaskConical,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Alerts",
    href: "/supplier-management/alerts",
    icon: Bell,
    roles: ["ADMIN"],
    badge: true,
  },
  {
    label: "Doc Requirements",
    href: "/supplier-management/document-requirements",
    icon: Settings2,
    roles: ["ADMIN"],
  },
];

// ---------------------------------------------------------------------------
// Role badge colours (sidebar bottom panel)
// ---------------------------------------------------------------------------
function roleBadgeClass(role: string) {
  const map: Record<string, string> = {
    SUPERVISOR: "bg-amber-100 text-amber-700",
    ADMIN:      "bg-brand-50  text-brand-700",
  };
  return map[role] ?? "bg-gray-100 text-gray-700";
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------
export function Sidebar() {
  const pathname  = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "SUPERVISOR";

  const [alertCount, setAlertCount] = useState(0);
  const [inventoryAlertCount, setInventoryAlertCount] = useState(0);
  const [taskBadgeCount, setTaskBadgeCount] = useState(0);
  const [taskBadgeHasOverdue, setTaskBadgeHasOverdue] = useState(false);

  useEffect(() => {
    if (role !== "ADMIN") return;
    fetch("/api/supplier-management/alerts")
      .then((r) => r.json())
      .then((data) => {
        const count =
          (data.expired?.length ?? 0) +
          (data.expiringSoon?.length ?? 0) +
          (data.missingDocs?.length ?? 0);
        setAlertCount(count);
      })
      .catch(() => {});
  }, [role]);

  useEffect(() => {
    fetch("/api/inventory/badge-count")
      .then((r) => r.json())
      .then((d: { total?: number }) => {
        setInventoryAlertCount(d.total ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/tasks/badge-count")
      .then((r) => r.json())
      .then((d) => {
        setTaskBadgeCount(d.count ?? 0);
        setTaskBadgeHasOverdue(d.hasOverdue ?? false);
      })
      .catch(() => {});
  }, []);

  const visibleGeneral   = generalNav.filter((item)   => item.roles.includes(role));
  const visibleForms     = formsNav.filter((item)     => item.roles.includes(role));
  const visibleLogs      = logsNav.filter((item)      => item.roles.includes(role));
  const visibleAdmin     = adminNav.filter((item)     => item.roles.includes(role));
  const visibleSupplier  = supplierNav.filter((item)  => item.roles.includes(role));
  const visibleInventory = inventoryNav.filter((item) => item.roles.includes(role));

  function NavLink({ item }: { item: (typeof generalNav)[number] & { exact?: boolean; badge?: boolean } }) {
    const active =
      item.href === "/dashboard" || item.exact
        ? pathname === item.href
        : pathname.startsWith(item.href);

    let badgeCount: number;
    let badgeColor: string;
    if (item.href === "/dashboard/tasks") {
      badgeCount = taskBadgeCount;
      badgeColor = taskBadgeHasOverdue ? "bg-[#D64D4D]" : "bg-amber-500";
    } else if (item.href === "/dashboard/inventory/alerts") {
      badgeCount = inventoryAlertCount;
      badgeColor = "bg-[#D64D4D]";
    } else {
      badgeCount = alertCount;
      badgeColor = "bg-[#D64D4D]";
    }

    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors group",
          active
            ? "bg-brand-50 text-brand-600"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        )}
      >
        <item.icon
          className={cn(
            "w-4 h-4 shrink-0",
            active ? "text-brand-600" : "text-gray-400 group-hover:text-gray-600"
          )}
        />
        <span className="flex-1 font-mono text-[13px]">{item.label}</span>
        {item.badge && badgeCount > 0 && (
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${badgeColor} text-white text-[10px] font-bold leading-none shrink-0`}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
        {active && !item.badge && <ChevronRight className="w-3 h-3 ml-auto text-brand-500" />}
        {active && item.badge && badgeCount === 0 && <ChevronRight className="w-3 h-3 ml-auto text-brand-500" />}
      </Link>
    );
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md overflow-hidden shrink-0">
            <Image src="/icon-192.png" alt="Julian Bakery" width={32} height={32} className="w-full h-full object-cover" priority />
          </div>
          <div>
            <p className="font-bold text-black text-sm leading-tight font-garamond">
              Julian Bakery
            </p>
            <p className="text-[10px] text-gray-500 font-mono">Food Safety Management</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        {visibleGeneral.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {visibleForms.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
                Forms
              </p>
            </div>
            {visibleForms.map((item) =>
              item.comingSoon ? (
                <div
                  key={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-300 cursor-default select-none"
                >
                  <item.icon className="w-4 h-4 shrink-0 text-gray-300" />
                  <span className="flex-1 font-mono text-[13px]">{item.label}</span>
                  <span className="text-[9px] font-mono font-semibold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                    SOON
                  </span>
                </div>
              ) : (
                <NavLink key={item.href} item={item} />
              )
            )}
          </>
        )}

        {visibleLogs.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
                Logs
              </p>
            </div>
            {visibleLogs.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </>
        )}

        {visibleInventory.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
                Inventory
              </p>
            </div>
            {visibleInventory.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </>
        )}

        {visibleSupplier.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
                Suppliers
              </p>
            </div>
            {visibleSupplier.map((item) => (
              <NavLink key={item.href} item={item as Parameters<typeof NavLink>[0]["item"]} />
            ))}
          </>
        )}

        {visibleAdmin.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
                Administration
              </p>
            </div>
            {visibleAdmin.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </>
        )}
      </nav>

      {/* User info */}
      <div className="px-3 py-4 border-t border-gray-200">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-900 truncate font-garamond">
              {session?.user?.name}
            </p>
            <span
              className={cn(
                "shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold",
                roleBadgeClass(role)
              )}
            >
              {role}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5 font-mono">
            {session?.user?.email}
          </p>
        </div>
      </div>
    </aside>
  );
}
