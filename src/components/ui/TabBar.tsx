"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number | null;
  badgeVariant?: "red" | "amber" | "green" | "blue";
}

interface TabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tab: string) => void;
  className?: string;
}

export function TabBar({ tabs, activeTab, onChange, className }: TabBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 rounded-xl border border-[#E5DDD4] bg-[#F5F0EA]",
        "p-3 px-4",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const hasBadge = tab.badge != null && tab.badge !== "" && tab.badge !== 0;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              isActive
                ? "bg-[#C41E3A] text-white"
                : "border border-[#D1C9BC] bg-[#FAF8F4] text-[#6B6560] hover:border-[#C41E3A]/50 hover:text-[#C41E3A]"
            )}
          >
            {tab.label}
            {hasBadge && (
              <span
                className={cn(
                  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                  isActive
                    ? "bg-white text-[#C41E3A]"
                    : tab.badgeVariant === "amber"
                    ? "bg-amber-100 text-amber-700"
                    : tab.badgeVariant === "green"
                    ? "bg-emerald-100 text-emerald-700"
                    : tab.badgeVariant === "blue"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-[#C41E3A] text-white"
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
