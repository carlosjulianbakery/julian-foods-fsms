"use client";

import { signOut } from "next-auth/react";
import { Bell, LogOut } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { cn, getRoleColor } from "@/lib/utils";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const department = session?.user?.department;

  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    fetch("/api/tasks/summary")
      .then((r) => r.json())
      .then((d) => setOverdueCount(d.overdueCount ?? 0))
      .catch(() => {});
  }, []);

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {title && <h1 className="text-base font-semibold text-gray-900">{title}</h1>}
      </div>

      <div className="flex items-center gap-3">
        {/* User info */}
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-gray-900 leading-tight">
              {session?.user?.name}
            </p>
            {department && (
              <p className="text-[10px] text-gray-400 leading-tight">{department}</p>
            )}
          </div>
          {role && (
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
                getRoleColor(role)
              )}
            >
              {role}
            </span>
          )}
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* Notification bell */}
        <button
          className="relative p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title={overdueCount > 0 ? `${overdueCount} overdue task${overdueCount > 1 ? "s" : ""}` : "No overdue tasks"}
        >
          <Bell className="w-4 h-4" />
          {overdueCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>

        <div className="h-5 w-px bg-gray-200" />

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
