"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, X } from "lucide-react";

type Template = {
  id: string;
  title: string;
  category: string;
  priority: string;
  assignedTo: string[];
  recurrenceType: string;
  nextDue: string | null;
  isActive: boolean;
  taskType: string;
};

type Props = {
  templates: Template[];
  userMap: Record<string, string>;
};

function getCategoryBadge(cat: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    sanitation: { label: "Sanitation", className: "bg-blue-50 text-blue-700" },
    inspection: { label: "Inspection", className: "bg-purple-50 text-purple-700" },
    production: { label: "Production", className: "bg-amber-50 text-amber-700" },
    receiving_inventory: { label: "Receiving", className: "bg-cyan-50 text-cyan-700" },
    documentation_compliance: { label: "Documentation", className: "bg-indigo-50 text-indigo-700" },
    facility_maintenance: { label: "Maintenance", className: "bg-orange-50 text-orange-700" },
    administrative: { label: "Administrative", className: "bg-gray-100 text-gray-600" },
  };
  return map[cat] ?? { label: cat, className: "bg-gray-100 text-gray-600" };
}

function recurrenceLabel(type: string): string {
  const map: Record<string, string> = {
    one_time: "One-Time",
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Every 2 Weeks",
    monthly: "Monthly",
    every_2_months: "Every 2 Months",
    quarterly: "Quarterly",
    every_6_months: "Every 6 Months",
    annual: "Annual",
    custom: "Custom",
  };
  return map[type] ?? type;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-500",
    normal: "bg-gray-400",
    low: "bg-blue-500",
  };
  const labels: Record<string, string> = { high: "High", normal: "Normal", low: "Low" };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${colors[priority] ?? "bg-gray-400"}`} />
      <span className="text-gray-700">{labels[priority] ?? priority}</span>
    </span>
  );
}

type DeleteConflict = {
  id: string;
  completedCount: number;
  skippedCount: number;
};

export function TaskTemplatesClient({ templates: initialTemplates, userMap }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConflict, setDeleteConflict] = useState<DeleteConflict | null>(null);
  const [forceDeleteConfirm, setForceDeleteConfirm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered = templates.filter((t) => {
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterActive === "active" && !t.isActive) return false;
    if (filterActive === "inactive" && t.isActive) return false;
    return true;
  });

  const hasFilters = filterCategory || filterPriority || filterActive;

  async function toggleActive(t: Template) {
    setActionLoading(t.id);
    try {
      const res = await fetch(`/api/tasks/templates/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      if (!res.ok) throw new Error();
      setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, isActive: !t.isActive } : x));
    } catch {
      alert("Failed to update template.");
    } finally {
      setActionLoading(null);
    }
  }

  async function initiateDelete(id: string) {
    if (!confirm("Delete this task template?")) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/tasks/templates/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        const data = await res.json();
        setDeleteConflict({ id, completedCount: data.completedCount ?? 0, skippedCount: data.skippedCount ?? 0 });
        setDeleteTarget(id);
        setActionLoading(null);
        return;
      }
      if (!res.ok) throw new Error();
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      router.refresh();
    } catch {
      alert("Failed to delete template.");
    } finally {
      setActionLoading(null);
    }
  }

  async function deactivateFromConflict() {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget);
    try {
      const res = await fetch(`/api/tasks/templates/${deleteTarget}?deactivate=true`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTemplates((prev) => prev.map((t) => t.id === deleteTarget ? { ...t, isActive: false } : t));
      setDeleteConflict(null);
      setDeleteTarget(null);
    } catch {
      alert("Failed to deactivate template.");
    } finally {
      setActionLoading(null);
    }
  }

  async function forceDelete() {
    if (!deleteTarget || forceDeleteConfirm !== "DELETE") return;
    setActionLoading(deleteTarget);
    try {
      const res = await fetch(`/api/tasks/templates/${deleteTarget}?force=true`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget));
      setDeleteConflict(null);
      setDeleteTarget(null);
      setForceDeleteConfirm("");
    } catch {
      alert("Failed to delete template.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <select
            className="input text-sm py-1.5 w-auto"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            <option value="sanitation">Sanitation</option>
            <option value="inspection">Inspection</option>
            <option value="production">Production</option>
            <option value="receiving_inventory">Receiving</option>
            <option value="documentation_compliance">Documentation</option>
            <option value="facility_maintenance">Maintenance</option>
            <option value="administrative">Administrative</option>
          </select>
          <select
            className="input text-sm py-1.5 w-auto"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <select
            className="input text-sm py-1.5 w-auto"
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
          >
            <option value="">Active & Inactive</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          {hasFilters && (
            <button
              onClick={() => { setFilterCategory(""); setFilterPriority(""); setFilterActive(""); }}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear Filters
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} template{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400 italic">
            {templates.length === 0 ? "No task templates yet. Create your first task." : "No templates match the selected filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["Title", "Category", "Priority", "Assigned To", "Recurrence", "Next Due", "Active", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((t) => {
                  const cat = getCategoryBadge(t.category);
                  const loading = actionLoading === t.id;
                  const assignedNames = t.assignedTo.map((id) => userMap[id] ?? id).join(", ") || "—";
                  return (
                    <tr key={t.id} className={loading ? "opacity-50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[200px]">
                        <span className="truncate block">{t.title}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`badge ${cat.className}`}>{cat.label}</span>
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        <PriorityDot priority={t.priority} />
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs max-w-[160px]">
                        <span className="truncate block">{assignedNames}</span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap text-xs">
                        {recurrenceLabel(t.recurrenceType)}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap text-xs font-mono">
                        {formatDate(t.nextDue)}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          disabled={loading}
                          onClick={() => toggleActive(t)}
                          className={`badge cursor-pointer hover:opacity-80 transition-opacity ${
                            t.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {t.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/dashboard/admin/tasks/${t.id}/edit`}
                            className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            disabled={loading}
                            onClick={() => initiateDelete(t.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete conflict modal */}
      {deleteConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">This template has records</h2>
              <button onClick={() => { setDeleteConflict(null); setDeleteTarget(null); setForceDeleteConfirm(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              This template has {deleteConflict.completedCount} completed and {deleteConflict.skippedCount} skipped task records.
              Choose how to proceed:
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-800 mb-2">Option 1: Deactivate</p>
              <p className="text-xs text-amber-700 mb-3">Keep all records, just stop creating new occurrences.</p>
              <button
                onClick={deactivateFromConflict}
                disabled={actionLoading === deleteTarget}
                className="btn-secondary text-sm"
              >
                Deactivate Template
              </button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800 mb-2">Option 2: Delete All Records</p>
              <p className="text-xs text-red-700 mb-3">Permanently delete the template and all associated task records. This cannot be undone.</p>
              <p className="text-xs text-gray-600 mb-2">Type <span className="font-mono font-bold">DELETE</span> to confirm:</p>
              <input
                className="input text-sm mb-2"
                placeholder="Type DELETE"
                value={forceDeleteConfirm}
                onChange={(e) => setForceDeleteConfirm(e.target.value)}
              />
              <button
                onClick={forceDelete}
                disabled={forceDeleteConfirm !== "DELETE" || actionLoading === deleteTarget}
                className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete All Records
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
