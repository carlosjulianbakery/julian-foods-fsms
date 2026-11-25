"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { NewWorkOrderForm, type DuplicateRow, type NewWorkOrderValues, type WorkOrderOptions } from "@/components/work-orders/NewWorkOrderForm";
import type { WoProblem } from "@/lib/work-orders";

const BASE = "/dashboard/work-orders";

/** Opens a work order. The warning about open work orders for the same equipment is looked up as the equipment is chosen. */
export function NewWorkOrderPage() {
  const router = useRouter();
  const [options, setOptions] = useState<WorkOrderOptions | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [failure, setFailure] = useState<{ error?: string; problems?: WoProblem[] }>({});

  const lookUp = useCallback(async (facility: string, equipmentId: string, equipmentName: string) => {
    const q = new URLSearchParams({ facility, equipmentId, equipmentName });
    const res = await fetch(`/api/work-orders/options${facility ? `?${q}` : ""}`, { cache: "no-store" });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not load the form.");
    return (await res.json()) as WorkOrderOptions & { duplicates: DuplicateRow[] };
  }, []);
  useEffect(() => { lookUp("", "", "").then(setOptions).catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load the form.")); }, [lookUp]);

  async function create(values: NewWorkOrderValues) {
    setBusy(true); setFailure({});
    try {
      const res = await fetch("/api/work-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const out = (await res.json().catch(() => ({}))) as { id?: string; error?: string; problems?: WoProblem[] };
      if (!res.ok || !out.id) { setFailure({ error: out.error ?? "Could not open the work order.", problems: out.problems }); return; }
      window.dispatchEvent(new CustomEvent("task-action"));
      router.push(`${BASE}/${out.id}`);
      router.refresh();
    } catch { setFailure({ error: "Could not open the work order. Check your connection." }); }
    finally { setBusy(false); }
  }

  const back = (
    <button type="button" onClick={() => router.push(BASE)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 min-h-[44px]">
      <ChevronLeft className="w-4 h-4" /> All work orders
    </button>
  );
  return (
    <div className="max-w-2xl space-y-3">
      {back}
      <h1 className="page-title">New Work Order</h1>
      {loadError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {loadError}</div>}
      {!options && !loadError && <div className="card p-6 text-center text-sm text-gray-500">Loading…</div>}
      {options && (
        <NewWorkOrderForm
          options={options} duplicates={duplicates} busy={busy} error={failure.error} problems={failure.problems} onCreate={(v) => void create(v)} onCancel={() => router.push(BASE)}
          onEquipmentChange={(facility, equipmentId, equipmentName) => {
            if (!facility || (!equipmentId && !equipmentName.trim())) { setDuplicates([]); return; }
            lookUp(facility, equipmentId, equipmentName).then((o) => setDuplicates(o.duplicates)).catch(() => setDuplicates([]));
          }}
        />
      )}
    </div>
  );
}
