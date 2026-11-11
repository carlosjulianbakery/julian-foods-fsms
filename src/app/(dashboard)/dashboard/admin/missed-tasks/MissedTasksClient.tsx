"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface MissedRow {
  id: string;
  date: string;
  task: string;
  facility: string;
  owner: string;
  ownerMissed30: number;
  reason: string;
  markedAt: string;
  markedBy: string;
}

interface User {
  id: string;
  name: string;
}

interface Props {
  rows: MissedRow[];
  users: User[];
  ownerFilter: string;
  fromFilter: string;
  toFilter: string;
}

export function MissedTasksClient({ rows, users, ownerFilter, fromFilter, toFilter }: Props) {
  const router = useRouter();
  const [reopening, setReopening] = useState<string | null>(null);

  function applyFilters(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const owner = fd.get("owner") as string;
    const from = fd.get("from") as string;
    const to = fd.get("to") as string;
    if (owner) params.set("owner", owner);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/dashboard/admin/missed-tasks?${params.toString()}`);
  }

  async function handleReopen(id: string) {
    setReopening(id);
    try {
      const res = await fetch(`/api/task-instances/${id}/reopen`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error ?? "Failed to reopen");
      } else {
        router.refresh();
      }
    } catch {
      alert("Network error");
    } finally {
      setReopening(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 font-garamond">Missed Tasks</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">All tasks marked as missed</p>
      </div>

      {/* Filters */}
      <form onSubmit={applyFilters} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-gray-600">Owner</label>
          <select name="owner" defaultValue={ownerFilter} className="text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono bg-white min-w-[180px]">
            <option value="">All owners</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-gray-600">From</label>
          <input type="date" name="from" defaultValue={fromFilter} className="text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-gray-600">To</label>
          <input type="date" name="to" defaultValue={toFilter} className="text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono" />
        </div>
        <button type="submit" className="px-4 py-2 bg-brand-600 text-white text-sm font-mono font-semibold rounded-lg hover:bg-brand-700 transition-colors">
          Filter
        </button>
        {(ownerFilter || fromFilter || toFilter) && (
          <a href="/dashboard/admin/missed-tasks" className="px-4 py-2 text-sm font-mono text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 font-mono">No missed tasks found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Date</th>
                  <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Task</th>
                  <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Facility</th>
                  <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Owner</th>
                  <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Reason</th>
                  <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Marked at</th>
                  <th className="text-left px-4 py-3 font-mono font-semibold text-gray-700 text-xs">Marked by</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3 text-gray-900 font-garamond">{r.task}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 text-xs">{r.facility}</td>
                    <td className="px-4 py-3">
                      <span className={r.ownerMissed30 >= 3 ? "font-semibold text-amber-700" : "text-gray-700"}>
                        {r.owner}
                      </span>
                      {r.ownerMissed30 >= 3 && (
                        <span className="ml-1.5 text-[9px] font-mono font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          {r.ownerMissed30} in 30d
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={r.reason}>{r.reason || "—"}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 text-xs whitespace-nowrap">{r.markedAt}</td>
                    <td className="px-4 py-3 text-gray-600">{r.markedBy}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleReopen(r.id)}
                        disabled={reopening === r.id}
                        className="text-xs font-mono text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {reopening === r.id ? "…" : "Reopen"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
