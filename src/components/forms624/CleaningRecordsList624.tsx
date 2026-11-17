"use client";

import { Download, Eye, Trash2, FolderOpen } from "lucide-react";
import type { DailyClean624Record } from "./types";

interface Props {
  records: DailyClean624Record[];
  isAdmin: boolean;
  onView: (r: DailyClean624Record) => void;
  onDownload: (r: DailyClean624Record) => void;
  onDelete?: (r: DailyClean624Record) => void;
  downloadingId: string | null;
  deletingId: string | null;
}

function StatusBadge({ notDoneCount }: { notDoneCount: number }) {
  if (notDoneCount === 0) {
    return <span className="badge bg-emerald-100 text-emerald-800">All done</span>;
  }
  return <span className="badge bg-amber-100 text-amber-700">{notDoneCount} not done</span>;
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function CleaningRecordsList624({
  records, isAdmin, onView, onDownload, onDelete, downloadingId, deletingId,
}: Props) {
  if (records.length === 0) {
    return (
      <div className="card p-12 text-center space-y-3">
        <FolderOpen className="w-10 h-10 text-gray-300 mx-auto" />
        <p className="text-gray-500 text-sm">No records found for the selected filters.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Date</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden sm:table-cell">Time</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Name</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden lg:table-cell">Initials</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">Summary</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {records.map((r) => (
            <tr
              key={r.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
              onClick={() => onView(r)}
            >
              <td className="px-4 py-3 font-mono text-sm">{r.date}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500 hidden sm:table-cell">
                {formatTime12h(r.time)}
              </td>
              <td className="px-4 py-3 text-sm">{r.conductedBy}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500 hidden lg:table-cell uppercase">{r.initials}</td>
              <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                {r.doneCount} done &middot; {r.naCount} N/A &middot; {r.notDoneCount} not done
              </td>
              <td className="px-4 py-3">
                <StatusBadge notDoneCount={r.notDoneCount} />
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onView(r)}
                    className="text-gray-400 hover:text-gray-700 transition-colors"
                    title="View"
                  ><Eye className="w-4 h-4" /></button>
                  <button
                    onClick={() => onDownload(r)}
                    disabled={downloadingId === r.id}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-40 transition-colors"
                    title="Download PDF"
                  ><Download className="w-4 h-4" /></button>
                  {isAdmin && onDelete && (
                    <button
                      onClick={() => onDelete(r)}
                      disabled={deletingId === r.id}
                      className="text-gray-300 hover:text-red-600 disabled:opacity-40 transition-colors"
                      title="Delete"
                    ><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
