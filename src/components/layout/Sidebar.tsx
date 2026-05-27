"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarCheck,
  FolderOpen,
  Users,
  Settings,
  ChevronRight,
  ClipboardCheck,
  ScrollText,
  FileStack,
  BookMarked,
  Dna,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Brand heart icon — outline, white stroke (sits on red bg)
// ---------------------------------------------------------------------------
function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

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
    label: "Forms",
    href: "/forms",
    icon: ClipboardList,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: CalendarCheck,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    label: "Records",
    href: "/records",
    icon: FolderOpen,
    roles: ["SUPERVISOR", "ADMIN"],
  },
];

const supervisorNav = [
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
    label: "Batch Sheet Records",
    href: "/dashboard/supervisor/batch-sheet/records",
    icon: FolderOpen,
    roles: ["SUPERVISOR", "ADMIN"],
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
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
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


  const visibleGeneral    = generalNav.filter((item)    => item.roles.includes(role));
  const visibleSupervisor = supervisorNav.filter((item) => item.roles.includes(role));
  const visibleLogs       = logsNav.filter((item)       => item.roles.includes(role));
  const visibleAdmin      = adminNav.filter((item)      => item.roles.includes(role));

  function NavLink({ item }: { item: (typeof generalNav)[number] & { exact?: boolean } }) {
    const active =
      item.href === "/dashboard" || item.exact
        ? pathname === item.href
        : pathname.startsWith(item.href);

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
        {active && <ChevronRight className="w-3 h-3 ml-auto text-brand-500" />}
      </Link>
    );
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#D64D4D] rounded-md flex items-center justify-center shrink-0">
            <HeartIcon className="w-5 h-5" />
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
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleGeneral.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {visibleSupervisor.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
                Supervisor
              </p>
            </div>
            {visibleSupervisor.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
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
