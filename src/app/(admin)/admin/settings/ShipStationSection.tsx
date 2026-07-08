"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  shipmentsFetched: number;
  shipmentsNew: number;
  shipmentsVoided: number;
  itemsProcessed: number;
  itemsMatched: number;
  itemsUnmatched: number;
  dateRangeFrom: string;
  dateRangeTo: string;
  errorMessage: string | null;
  notes: string | null;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> Success
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> Error
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
      <RefreshCw className="w-3 h-3 animate-spin" /> Running
    </span>
  );
}

export function ShipStationSection() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [testRes, logsRes, unmatchedRes] = await Promise.all([
        fetch("/api/integrations/shipstation/test"),
        fetch("/api/integrations/shipstation/logs"),
        fetch("/api/integrations/shipstation/unmatched-count"),
      ]);

      if (testRes.ok) {
        const testData = await testRes.json() as { success: boolean };
        setConnectionOk(testData.success === true);
      } else {
        setConnectionOk(false);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json() as SyncLog[];
        setLogs(logsData);
      }

      if (unmatchedRes.ok) {
        const uData = await unmatchedRes.json() as { count: number };
        setUnmatchedCount(uData.count);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function triggerSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/integrations/shipstation/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 7 }),
      });
      const data = await res.json() as { status: string; shipmentsNew: number; errorMessage?: string };
      if (data.status === "success") {
        setSyncMsg(`✓ Sync complete — ${data.shipmentsNew} new shipments imported`);
      } else {
        setSyncMsg(`Error: ${data.errorMessage ?? "Unknown error"}`);
      }
      await loadData();
    } finally {
      setSyncing(false);
    }
  }

  const lastSuccess = logs.find((l) => l.status === "success");

  return (
    <div className="card">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <Plug className="w-4 h-4 text-gray-400" />
        <h2 className="font-semibold text-gray-900">Integrations — ShipStation</h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Connection status */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Connection Status</p>
            {loading ? (
              <p className="text-xs text-gray-400 mt-0.5">Checking…</p>
            ) : connectionOk === true ? (
              <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Connected to ShipStation API
              </p>
            ) : (
              <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Not connected — check API credentials in Vercel env
              </p>
            )}
          </div>
          <div className="text-right text-xs text-gray-500">
            <p className="font-medium">Last sync</p>
            <p>{lastSuccess ? fmtDate(lastSuccess.completedAt) : "Never"}</p>
          </div>
        </div>

        {/* Unmatched UPCs alert */}
        {unmatchedCount !== null && unmatchedCount > 0 && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <span className="font-semibold">{unmatchedCount} unmatched UPCs</span> — ShipStation items without a matching FSMS product presentation.
              Update product UPCs in Supplier Management → Products to resolve.
            </div>
          </div>
        )}

        {/* Manual sync */}
        <div className="flex items-center gap-3">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync Now (7 days)"}
          </button>
          {syncMsg && (
            <p className={cn("text-sm", syncMsg.startsWith("Error") ? "text-red-600" : "text-emerald-600")}>
              {syncMsg}
            </p>
          )}
        </div>

        {/* Sync log table */}
        {logs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-mono mb-2">Sync History</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {["Date", "Status", "New", "Voided", "Matched", "Unmatched", "Notes"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold font-mono uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.slice(0, 20).map((log) => (
                    <tr key={log.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(log.startedAt)}</td>
                      <td className="px-3 py-2"><StatusBadge status={log.status} /></td>
                      <td className="px-3 py-2 font-mono">{log.shipmentsNew}</td>
                      <td className="px-3 py-2 font-mono">{log.shipmentsVoided}</td>
                      <td className="px-3 py-2 font-mono text-emerald-600">{log.itemsMatched}</td>
                      <td className="px-3 py-2 font-mono text-amber-600">{log.itemsUnmatched}</td>
                      <td className="px-3 py-2 text-gray-500">{log.errorMessage ?? log.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && logs.length === 0 && (
          <p className="text-sm text-gray-400">No sync history yet. Run a sync to import ShipStation data.</p>
        )}
      </div>
    </div>
  );
}
