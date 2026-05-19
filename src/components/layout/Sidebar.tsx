"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarCheck,
  FolderOpen,
  Users,
  Settings,
  ChevronRight,
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
    roles: ["OPERATOR", "SUPERVISOR", "ADMIN"],
  },
  {
    label: "Forms",
    href: "/forms",
    icon: ClipboardList,
    roles: ["OPERATOR", "SUPERVISOR", "ADMIN"],
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: CalendarCheck,
    roles: ["OPERATOR", "SUPERVISOR", "ADMIN"],
    showTodayCount: true,
  },
  {
    label: "Records",
    href: "/records",
    icon: FolderOpen,
    roles: ["OPERATOR", "SUPERVISOR", "ADMIN"],
  },
];

const adminNav = [
  {
    label: "Users",
    href: "/admin/users",
    icon: Users,
    roles: ["SUPERVISOR", "ADMIN"],
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
    OPERATOR: "bg-blue-100 text-blue-700",
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
  const role = session?.user?.role ?? "OPERATOR";

  const [todayCount, setTodayCount] = useState<number | null>(null);

  useEffect(() => {
    if (role !== "OPERATOR") return;
    fetch("/api/tasks/summary")
      .then((r) => r.json())
      .then((d) => setTodayCount(d.todayCount ?? 0))
      .catch(() => {});
  }, [role]);

  const visibleGeneral = generalNav.filter((item) => item.roles.includes(role));
  const visibleAdmin   = adminNav.filter((item)   => item.roles.includes(role));

  function NavLink({ item }: { item: (typeof generalNav)[number] & { showTodayCount?: boolean } }) {
    const active =
      item.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(item.href);

    const showBadge =
      item.showTodayCount && role === "OPERATOR" &&
      todayCount != null && todayCount > 0;

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
        {/* Space Mono for nav labels */}
        <span className="flex-1 font-mono text-[13px]">{item.label}</span>
        {showBadge && (
          <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-brand-600 text-white text-xs font-mono font-semibold rounded">
            {todayCount}
          </span>
        )}
        {active && !showBadge && (
          <ChevronRight className="w-3 h-3 ml-auto text-brand-500" />
        )}
      </Link>
    );
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col min-h-screen">
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
