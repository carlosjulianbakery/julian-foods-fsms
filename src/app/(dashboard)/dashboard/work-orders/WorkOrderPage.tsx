"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { WorkOrderRecord } from "@/components/work-orders/WorkOrderRecord";
import type { WorkOrderEventRow } from "@/components/work-orders/WorkOrderParts";
import type { WoProblem } from "@/lib/work-orders";

type Values = Record<string, string | boolean | null>;
interface Loaded {
  record: Values; events: WorkOrderEventRow[]; names: Record<string, string>; task: { id: string; status: string; dueDate: string } | null; assigneeActive: boolean;
  can: { work: boolean; reassign: boolean; cancel: boolean }; viewer: { id: string; name: string }; today: string;
}
const BASE = "/dashboard/work-orders";

/** Loads one work order and sends every change through its route. After each write the record is reloaded, so what is shown is what is stored. */
export function WorkOrderPage({ id }: { id: string }) {
  const router = useRouter();
  const api = `/api/work-orders/${id}`;
  const [data, setData] = useState<Loaded | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [failure, setFailure] = useState<{ error?: string; problems?: WoProblem[] }>({});

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([fetch(api, { cache: "no-store" }), fetch("/api/work-orders/options", { cache: "no-store" })]);
      if (!r.ok || !o.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not load this work order.");
      setData(await r.json()); setUsers(((await o.json()) as { users: { id: string; name: string }[] }).users); setVersion((v) => v + 1);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not load this work order."); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  async function send(url: string, method: "PATCH" | "POST", body: Record<string, unknown>) {
    setBusy(true); setFailure({});
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, expectedUpdatedAt: data?.record.updatedAt }) });
      const out = (await res.json().catch(() => ({}))) as { error?: string; problems?: WoProblem[] };
      if (!res.ok) { setFailure({ error: out.error ?? "Could not save.", problems: out.problems }); if (res.status === 409) await load(); return; }
      // The task changed with the work order: let the dashboard and the sidebar badge catch up
      window.dispatchEvent(new CustomEvent("task-action"));
      await load();
      router.refresh();
    } catch { setFailure({ error: "Could not save. Check your connection." }); }
    finally { setBusy(false); }
  }

  const back = (
    <button type="button" onClick={() => router.push(BASE)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 min-h-[44px]">
      <ChevronLeft className="w-4 h-4" /> All work orders
    </button>
  );
  if (loadError) return <div className="max-w-3xl space-y-3">{back}<div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {loadError}</div></div>;
  if (!data) return <div className="max-w-3xl space-y-3">{back}<div className="card p-6 text-center text-sm text-gray-500">Loading…</div></div>;
  return (
    <div className="max-w-3xl space-y-3">
      {back}
      <WorkOrderRecord
        key={version} record={data.record} events={data.events} names={data.names} users={users} viewer={data.viewer} can={data.can} assigneeActive={data.assigneeActive} task={data.task}
        today={data.today} busy={busy} error={failure.error} problems={failure.problems}
        onStart={() => void send(`${api}/start`, "POST", {})}
        onSaveDraft={(changed) => void send(api, "PATCH", changed)}
        onComplete={(values) => void send(`${api}/complete`, "POST", values)}
        onReassign={(assigneeId) => void send(`${api}/assign`, "POST", { assigneeId })}
        onCancel={(reason) => void send(`${api}/cancel`, "POST", { reason })}
      />
    </div>
  );
}
