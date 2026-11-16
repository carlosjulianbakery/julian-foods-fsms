"use client";

import { useState } from "react";
import { Download, Eye, Trash2, X, ChevronLeft, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Inspection624 } from "./types";

interface Props {
  inspections: Inspection624[];
  isAdmin: boolean;
  onView: (insp: Inspection624) => void;
  onDownload: (insp: Inspection624) => void;
  onDelete?: (insp: Inspection624) => void;
  downloadingId: string | null;
  deletingId: string | null;
}

function StatusBadge({ hasNotOk, overallOk }: { hasNotOk: boolean; overallOk: boolean }) {
  if (!hasNotOk && overallOk) {
    return <span className="badge bg-emerald-100 text-emerald-800">All OK</span>;
  }
  if (hasNotOk && overallOk) {
    return <span className="badge bg-amber-100 text-amber-700">Issues — Corrected</span>;
  }
  return <span className="badge bg-red-100 text-red-700">Has Issues</span>;
}

export function RecordsList624({
  inspections, isAdmin, onView, onDownload, onDelete,
  downloadingId, deletingId,
}: Props) {
  if (inspections.length === 0) {
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
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Conducted By</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Submitted</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">By</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {inspections.map((insp) => (
            <tr key={insp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="px-4 py-3 font-mono text-sm">{insp.date}</td>
              <td className="px-4 py-3 font-mono text-sm uppercase">{insp.conductedBy}</td>
              <td className="px-4 py-3">
                <StatusBadge hasNotOk={insp.hasNotOk} overallOk={insp.overallOk} />
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {new Date(insp.submittedAt).toLocaleString("en-US", {
                  timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit",
                  year: "2-digit", hour: "numeric", minute: "2-digit", hour12: true,
                })}
              </td>
              <td className="px-4 py-3 text-gray-600 text-sm">{insp.submittedBy.name}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onView(insp)}
                    className="text-gray-400 hover:text-gray-700 transition-colors"
                    title="View"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDownload(insp)}
                    disabled={downloadingId === insp.id}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-40 transition-colors"
                    title="Download PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  {isAdmin && onDelete && (
                    <button
                      onClick={() => onDelete(insp)}
                      disabled={deletingId === insp.id}
                      className="text-gray-300 hover:text-red-600 disabled:opacity-40 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
