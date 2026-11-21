"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, ShieldCheck } from "lucide-react";
import { CapasList, IncidentsList, NewCapaForm, NewIncidentForm } from "@/components/quality/QualityLists";
import type { CapaRow, FieldProblem, IncidentRow } from "@/lib/quality";

type Tab = "incidents" | "capas";
const BASE = "/dashboard/admin/quality";

export function QualityHome({ initialTab }: { initialTab: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [capas, setCapas] = useState<CapaRow[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<{ error?: string; problems?: FieldProblem[] }>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [i, c, o] = await Promise.all([fetch("/api/quality/incidents"), fetch("/api/quality/capas"), fetch("/api/quality/options")]);
      if (!i.ok || !c.ok || !o.ok) throw new Error((await i.json().catch(() => ({}))).error ?? "Could not load.");
      setIncidents(await i.json()); setCapas(await c.json()); setToday((await o.json()).today);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function choose(t: Tab) { setTab(t); setCreating(false); setCreateError({}); router.replace(`${BASE}?tab=${t}`); }

  async function create(url: string, kind: "incidents" | "capas", data: Record<string, unknown>) {
    setBusy(true); setCreateError({});
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; problems?: FieldProblem[] };
      if (!res.ok || !body.id) { setCreateError({ error: body.error ?? "Could not create.", problems: body.problems }); return; }
      router.push(`${BASE}/${kind}/${body.id}`);
    } catch { setCreateError({ error: "Could not create." }); }
    finally { setBusy(false); }
  }

  const tabClass = (t: Tab) => `px-4 py-2 text-sm font-medium border-b-2 ${tab === t ? "border-[#C41E3A] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`;

  return (
    <div className="max-w-6xl space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="page-title leading-tight">Quality</h1>
            <p className="page-subtitle">Customer incidents and corrective and preventive actions. Each list is the log.</p>
          </div>
        </div>
        {!creating && (
          <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> {tab === "incidents" ? "New incident" : "New CAPA"}
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "incidents"} className={tabClass("incidents")} onClick={() => choose("incidents")}>Incidents ({incidents.filter((r) => r.status !== "void").length})</button>
        <button type="button" role="tab" aria-selected={tab === "capas"} className={tabClass("capas")} onClick={() => choose("capas")}>CAPAs ({capas.filter((r) => r.status !== "void").length})</button>
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}

      {creating && tab === "incidents" && (
        <NewIncidentForm today={today} busy={busy} error={createError.error} problems={createError.problems} onCancel={() => setCreating(false)} onCreate={(d) => void create("/api/quality/incidents", "incidents", d)} />
      )}
      {creating && tab === "capas" && (
        <NewCapaForm busy={busy} error={createError.error} problems={createError.problems} onCancel={() => setCreating(false)} onCreate={(d) => void create("/api/quality/capas", "capas", d)} />
      )}

      {loading ? <div className="card p-6 text-center text-sm text-gray-500">Loading…</div>
        : tab === "incidents" ? <IncidentsList rows={incidents} onOpen={(r) => router.push(`${BASE}/incidents/${r.id}`)} />
        : <CapasList rows={capas} today={today} onOpen={(r) => router.push(`${BASE}/capas/${r.id}`)} />}
    </div>
  );
}
