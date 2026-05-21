"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Edit2, Copy, Power, PowerOff, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  ingredientCount: number;
  packagingCount: number;
};

export function TemplateListClient({ templates }: { templates: Row[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function duplicateTemplate(id: string) {
    setLoading(id);
    try {
      const res = await fetch(`/api/batch-sheet-templates/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      router.push(`/dashboard/admin/batch-sheet-templates/${data.id}/edit`);
    } catch {
      alert("Failed to duplicate template");
    } finally {
      setLoading(null);
    }
  }

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

  if (templates.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-200 bg-white text-center">
        <Plus className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-500 font-mono">No templates yet.</p>
        <Link href="/dashboard/admin/batch-sheet-templates/new" className="btn-primary text-sm mt-1">
          Create your first template
        </Link>
      </div>
    );
  }

  // Group by category; null/empty → "Uncategorized" sorted last
  const order: string[] = [];
  const groups = new Map<string, Row[]>();
  for (const t of templates) {
    const key = t.category?.trim() || "Uncategorized";
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(t);
  }
  const sortedKeys = [
    ...order.filter((k) => k !== "Uncategorized"),
    ...order.filter((k) => k === "Uncategorized"),
  ];

  return (
    <div className="space-y-8">
      {sortedKeys.map((cat) => (
        <div key={cat}>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">{cat}</h2>
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-mono">{groups.get(cat)!.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.get(cat)!.map((t) => (
              <TemplateCard
                key={t.id}
                t={t}
                loading={loading === t.id}
                onDuplicate={() => duplicateTemplate(t.id)}
                onToggle={() => toggleActive(t.id, t.isActive)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateCard({
  t,
  loading,
  onDuplicate,
  onToggle,
}: {
  t: Row;
  loading: boolean;
  onDuplicate: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={cn("card bg-white shadow-sm p-5 flex flex-col gap-4", loading && "opacity-50 pointer-events-none")}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-gray-900 leading-snug">{t.name}</p>
        <span className={cn(
          "badge shrink-0 text-xs px-2 py-0.5 rounded-full font-medium",
          t.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500",
        )}>
          {t.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {t.description ? (
        <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">{t.description}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">No description</p>
      )}

      <p className="font-mono text-xs text-gray-400">
        {t.ingredientCount} ingredients &middot; {t.packagingCount} packaging
      </p>

      <div className="flex items-center gap-2 mt-auto">
        <Link
          href={`/dashboard/admin/batch-sheet-templates/${t.id}/edit`}
          className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Edit
        </Link>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={loading}
          className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
        >
          <Copy className="w-3.5 h-3.5" />
          Duplicate
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={loading}
          className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
          title={t.isActive ? "Deactivate" : "Activate"}
        >
          {t.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
          {t.isActive ? "Deactivate" : "Activate"}
        </button>
      </div>
    </div>
  );
}
