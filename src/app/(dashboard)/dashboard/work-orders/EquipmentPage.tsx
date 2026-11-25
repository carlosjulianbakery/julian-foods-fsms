"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { EquipmentEditor, type EquipmentItem } from "@/components/work-orders/EquipmentEditor";
import type { WoProblem } from "@/lib/work-orders";

/** The equipment / area list editor (supervisors and admins). */
export function EquipmentPage() {
  const router = useRouter();
  const [data, setData] = useState<{ facilities: string[]; items: EquipmentItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [failure, setFailure] = useState<{ error?: string; problems?: WoProblem[] }>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/work-orders/equipment", { cache: "no-store" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not load the list.");
      setData(await res.json());
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not load the list."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function send(url: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true); setFailure({});
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { error?: string; problems?: WoProblem[] };
      if (!res.ok) setFailure({ error: out.error ?? "Could not save.", problems: out.problems });
      await load();
      router.refresh();
    } catch { setFailure({ error: "Could not save. Check your connection." }); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <button type="button" onClick={() => router.push("/dashboard/work-orders")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 min-h-[44px]">
        <ChevronLeft className="w-4 h-4" /> All work orders
      </button>
      <h1 className="page-title">Equipment and area list</h1>
      <p className="page-subtitle">What people choose from when they open a work order. Each facility has its own list; “Other” is always available.</p>
      {loadError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {loadError}</div>}
      {!data && !loadError && <div className="card p-6 text-center text-sm text-gray-500">Loading…</div>}
      {data && (
        <EquipmentEditor
          facilities={data.facilities} items={data.items} busy={busy} error={failure.error} problems={failure.problems}
          onAdd={(facility, name) => void send("/api/work-orders/equipment", "POST", { facility, name })}
          onRename={(id, name) => void send(`/api/work-orders/equipment/${id}`, "PATCH", { name })}
          onRetire={(id, retired) => void send(`/api/work-orders/equipment/${id}`, "PATCH", { retired })}
        />
      )}
    </div>
  );
}
