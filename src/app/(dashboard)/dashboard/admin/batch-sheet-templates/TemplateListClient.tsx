"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Edit2, PowerOff, Power, Trash2 } from "lucide-react";

type Row = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  ingredientCount: number;
  packagingCount: number;
};

export function TemplateListClient({ templates }: { templates: Row[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function toggleActive(id: string, current: boolean) {
    setLoading(id);
    try {
      await fetch(`/api/batch-sheet-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function deleteTemplate(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    setLoading(id);
    try {
      await fetch(`/api/batch-sheet-templates/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  if (templates.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-gray-500 font-mono">No templates yet. Create your first one.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {["Template Name", "Description", "Ingredients", "Packaging", "Status", ""].map((h) => (
              <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {templates.map((t) => (
            <tr key={t.id} className={loading === t.id ? "opacity-50" : ""}>
              <td className="px-5 py-3.5 font-medium text-gray-900 whitespace-nowrap">{t.name}</td>
              <td className="px-5 py-3.5 text-gray-500 max-w-xs truncate">{t.description ?? "—"}</td>
              <td className="px-5 py-3.5 text-gray-500 text-center">{t.ingredientCount}</td>
              <td className="px-5 py-3.5 text-gray-500 text-center">{t.packagingCount}</td>
              <td className="px-5 py-3.5">
                <span className={`badge ${t.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {t.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-1">
                  <Link
                    href={`/dashboard/admin/batch-sheet-templates/${t.id}/edit`}
                    className="p-1.5 text-gray-400 hover:text-brand-600 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => toggleActive(t.id, t.isActive)}
                    disabled={loading === t.id}
                    className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors"
                    title={t.isActive ? "Deactivate" : "Activate"}
                  >
                    {t.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => deleteTemplate(t.id, t.name)}
                    disabled={loading === t.id}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
