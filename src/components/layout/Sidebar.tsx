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
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
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
  },
  {
    label: "Records",
    href: "/records",
    icon: FolderOpen,
    roles: ["OPERATOR", "SUPERVISOR", "ADMIN"],
  },
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

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "OPERATOR";

  const visible = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">Julian's Foods</p>
            <p className="text-xs text-gray-500">Food Safety System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visible.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <item.icon className={cn("w-4 h-4", active ? "text-brand-600" : "text-gray-400 group-hover:text-gray-600")} />
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto text-brand-500" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-200">
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-gray-900 truncate">{session?.user?.name}</p>
          <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
          <span className="mt-1 inline-block text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
            {role}
          </span>
        </div>
      </div>
    </aside>
  );
}
