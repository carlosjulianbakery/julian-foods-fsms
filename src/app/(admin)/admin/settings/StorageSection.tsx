"use client";

import { useEffect, useState, useCallback } from "react";
import { HardDrive, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface StorageStats {
  total_files: number;
  supplier_docs_count: number;
  form_templates_count: number;
  receiving_coas_count: number;
  total_bytes: number;
  total_mb: number;
  total_gb_limit: number;
  percentage_used: number;
  checked_at: string;
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/Los_Angeles",
  });
}

export function StorageSection() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (bust = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/storage-usage${bust ? "?bust=1" : ""}`);
      if (!res.ok) throw new Error(await res.text());
      setStats(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load storage stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pct = stats?.percentage_used ?? 0;
  const barColor =
    pct > 80 ? "bg-red-500" :
    pct > 60 ? "bg-amber-500" :
    "bg-emerald-500";

  return (
    <div className="card">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <HardDrive className="w-4 h-4 text-gray-400" />
        <h2 className="font-semibold text-gray-900">Document Storage</h2>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
          title="Refresh storage stats"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="p-6 space-y-5">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && !stats && (
          <div className="text-sm text-gray-400 animate-pulse">Loading storage stats…</div>
        )}

        {stats && (
          <>
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {stats.total_mb < 1
                    ? `${(stats.total_bytes / 1024).toFixed(1)} KB`
                    : `${stats.total_mb.toFixed(1)} MB`} used of 500 MB
                </span>
                <span className={cn(
                  "text-sm font-semibold",
                  pct > 80 ? "text-red-600" : pct > 60 ? "text-amber-600" : "text-emerald-600"
                )}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", barColor)}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                Vercel Blob — Hobby Plan &middot; Last checked: {fmtTs(stats.checked_at)}
              </p>
            </div>

            {/* Alert banners */}
            {pct > 80 && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <span className="shrink-0">⚠</span>
                <span>Storage is above 80%. Upgrade to Vercel Pro soon to avoid upload failures.</span>
              </div>
            )}
            {pct > 60 && pct <= 80 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                <span className="shrink-0">⚠</span>
                <span>Storage is above 60%. Consider upgrading to Vercel Pro for 100 GB of storage.</span>
              </div>
            )}

            {/* File breakdown */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Supplier documents", value: stats.supplier_docs_count },
                { label: "Form templates", value: stats.form_templates_count },
                { label: "Receiving COAs", value: stats.receiving_coas_count },
                { label: "Total files", value: stats.total_files, bold: true },
              ].map(({ label, value, bold }) => (
                <div key={label} className="rounded-lg bg-gray-50 px-4 py-3 text-center">
                  <p className={cn("text-2xl font-bold tabular-nums", bold ? "text-gray-900" : "text-gray-700")}>
                    {value}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              Storage limit: 500 MB (Vercel Hobby Plan).{" "}
              Upgrade to Pro for 100 GB at $20/month.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
