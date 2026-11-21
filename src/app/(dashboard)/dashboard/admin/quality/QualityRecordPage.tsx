"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { CapaRecord, IncidentRecord, type QualityOptions } from "@/components/quality/QualityRecords";
import type { QualityEventRow } from "@/components/quality/QualityParts";
import type { FieldProblem } from "@/lib/quality";

type Values = Record<string, string | boolean | null>;
type Brief = { id: string; reference: string; status: string; dateReceived: string; description: string };
interface Loaded {
  record: Values; events: QualityEventRow[]; names: Record<string, string>;
  capa?: { id: string; reference: string; status: string; problem: string } | null; incidents?: Brief[]; linkable?: Brief[];
}
const BASE = "/dashboard/admin/quality";

/** Loads one incident or CAPA and sends every change through its route. After each write the record is reloaded, so the history shown is the stored one. */
export function QualityRecordPage({ kind, id }: { kind: "incidents" | "capas"; id: string }) {
  const router = useRouter();
  const api = `/api/quality/${kind}/${id}`;
  const [data, setData] = useState<Loaded | null>(null);
  const [options, setOptions] = useState<QualityOptions | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [failure, setFailure] = useState<{ error?: string; problems?: FieldProblem[] }>({});

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([fetch(api), fetch("/api/quality/options")]);
      if (!r.ok || !o.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load this record.");
      setData(await r.json()); setOptions(await o.json()); setVersion((v) => v + 1);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not load this record."); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  async function send(url: string, method: "PATCH" | "POST" | "DELETE", body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true); setFailure({});
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, expectedUpdatedAt: data?.record.updatedAt }) });
      const out = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; problems?: FieldProblem[] };
      if (!res.ok) { setFailure({ error: out.error ?? "Could not save.", problems: out.problems }); if (res.status === 409) await load(); return null; }
      await load();
      return out;
    } catch { setFailure({ error: "Could not save. Check your connection." }); return null; }
    finally { setBusy(false); }
  }

  const back = (
    <button type="button" onClick={() => router.push(`${BASE}?tab=${kind}`)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
      <ChevronLeft className="w-3 h-3" /> {kind === "incidents" ? "All incidents" : "All CAPAs"}
    </button>
  );
  if (loadError) return <div className="max-w-4xl space-y-3">{back}<div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {loadError}</div></div>;
  if (!data || !options) return <div className="max-w-4xl space-y-3">{back}<div className="card p-6 text-center text-sm text-gray-500">Loading…</div></div>;

  const common = {
    events: data.events, names: data.names, options, busy, error: failure.error, problems: failure.problems,
    onSave: (changed: Values) => void send(api, "PATCH", changed),
    onAction: (body: Record<string, unknown>) => void send(`${api}/status`, "POST", body),
  };
  return (
    <div className="max-w-4xl space-y-3">
      {back}
      {kind === "incidents" ? (
        <IncidentRecord
          key={version} {...common} record={data.record} capa={data.capa ?? null}
          onOpenCapa={() => void send(`${api}/capa`, "POST", {}).then((out) => { const capa = out?.capa as { id?: string } | undefined; if (capa?.id) router.push(`${BASE}/capas/${capa.id}`); })}
          onUnlink={(reason) => void send(`${api}/capa`, "DELETE", { reason })}
          onGoToCapa={(capaId) => router.push(`${BASE}/capas/${capaId}`)}
        />
      ) : (
        <CapaRecord
          key={version} {...common} record={data.record} incidents={data.incidents ?? []} linkable={data.linkable ?? []}
          onLink={(incidentId) => void send(`${api}/incidents`, "POST", { incidentId })}
          onUnlink={(incidentId, reason) => void send(`${api}/incidents`, "DELETE", { incidentId, reason })}
          onGoToIncident={(incidentId) => router.push(`${BASE}/incidents/${incidentId}`)}
        />
      )}
    </div>
  );
}
