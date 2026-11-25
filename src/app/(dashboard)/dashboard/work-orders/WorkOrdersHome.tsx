"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, Wrench } from "lucide-react";
import { WorkOrdersList } from "@/components/work-orders/WorkOrdersList";
import type { WorkOrderRow } from "@/lib/work-orders";

const BASE = "/dashboard/work-orders";
interface Loaded { workOrders: WorkOrderRow[]; today: string; viewer: { id: string; name: string; seesAll: boolean; canEditEquipment: boolean } }

/** The work order list. The server decides which work orders this person gets. */
export function WorkOrdersHome() {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/work-orders", { cache: "no-store" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not load the work orders.");
      setData(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the work orders."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-600 rounded-md flex items-center justify-center shrink-0"><Wrench className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="page-title leading-tight">Work Orders</h1>
            <p className="page-subtitle">{data && !data.viewer.seesAll ? "Maintenance work orders you requested or that are assigned to you." : "Maintenance requests for machinery, equipment and the facilities."}</p>
          </div>
        </div>
      </div>
      <Link href={`${BASE}/new`} data-new-work-order className="btn-primary w-full md:w-auto inline-flex items-center justify-center gap-2 text-base min-h-[48px] px-5">
        <Plus className="w-5 h-5" /> New Work Order
      </Link>
      {data?.viewer.canEditEquipment && <Link href={`${BASE}/equipment`} className="btn-secondary inline-flex items-center justify-center text-sm min-h-[44px] md:ml-2 w-full md:w-auto" data-equipment-link>Equipment and area list</Link>}
      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
      {!data && !error ? <div className="card p-6 text-center text-sm text-gray-500">Loading…</div>
        : data && <WorkOrdersList rows={data.workOrders} today={data.today} viewerId={data.viewer.id} onOpen={(r) => router.push(`${BASE}/${r.id}`)} />}
    </div>
  );
}
