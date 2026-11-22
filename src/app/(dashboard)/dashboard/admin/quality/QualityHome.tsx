"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, ShieldCheck } from "lucide-react";
import { CapasList, IncidentsList, NewCapaForm, NewIncidentForm } from "@/components/quality/QualityLists";
import { ReviewsTab } from "@/components/quality/QualityReviews";
import type { QualityEventRow } from "@/components/quality/QualityParts";
import type { CapaRow, FieldProblem, IncidentRow, ReviewCounts, ReviewRow } from "@/lib/quality";

type Tab = "incidents" | "capas" | "reviews";
const NO_COUNTS: ReviewCounts = { openIncidents: 0, openCapas: 0, overdueCapas: 0, incidentsReceived: 0 };
const BASE = "/dashboard/admin/quality";

export function QualityHome({ initialTab, reviewerName = "", initialPeriod, taskId }: { initialTab: Tab; reviewerName?: string; initialPeriod?: string; taskId?: string }) {
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
  const [reviews, setReviews] = useState<{ reviews: ReviewRow[]; currentPeriod: string; currentCounts: ReviewCounts }>({ reviews: [], currentPeriod: "", currentCounts: NO_COUNTS });
  const [reviewPeriod, setReviewPeriod] = useState(initialPeriod ?? "");
  const [reviewEvents, setReviewEvents] = useState<QualityEventRow[] | undefined>(undefined);
  const [reviewFailure, setReviewFailure] = useState<{ error?: string; problems?: FieldProblem[] }>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [i, c, o, r] = await Promise.all([fetch("/api/quality/incidents"), fetch("/api/quality/capas"), fetch("/api/quality/options"), fetch("/api/quality/reviews")]);
      if (!i.ok || !c.ok || !o.ok || !r.ok) throw new Error((await i.json().catch(() => ({}))).error ?? "Could not load.");
      setIncidents(await i.json()); setCapas(await c.json()); setToday((await o.json()).today); setReviews(await r.json());
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

  // The history of the review being looked at
  const selectedReview = reviews.reviews.find((x) => x.period === (reviewPeriod || reviews.currentPeriod));
  useEffect(() => {
    if (!selectedReview) { setReviewEvents(undefined); return; }
    fetch(`/api/quality/reviews/${selectedReview.id}`).then((x) => (x.ok ? x.json() : null)).then((d) => setReviewEvents(d?.events)).catch(() => setReviewEvents(undefined));
  }, [selectedReview?.id, selectedReview?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveReview(url: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true); setReviewFailure({});
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { error?: string; problems?: FieldProblem[]; completedInstanceId?: string | null };
      if (!res.ok) { setReviewFailure({ error: out.error ?? "Could not save the review.", problems: out.problems }); if (res.status === 409) await load(); return; }
      if (out.completedInstanceId) window.dispatchEvent(new CustomEvent("task-action"));
      await load();
    } catch { setReviewFailure({ error: "Could not save the review." }); }
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
        {!creating && tab !== "reviews" && (
          <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> {tab === "incidents" ? "New incident" : "New CAPA"}
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "incidents"} className={tabClass("incidents")} onClick={() => choose("incidents")}>Incidents ({incidents.filter((r) => r.status !== "void").length})</button>
        <button type="button" role="tab" aria-selected={tab === "capas"} className={tabClass("capas")} onClick={() => choose("capas")}>CAPAs ({capas.filter((r) => r.status !== "void").length})</button>
        <button type="button" role="tab" aria-selected={tab === "reviews"} className={tabClass("reviews")} onClick={() => choose("reviews")}>Reviews ({reviews.reviews.length})</button>
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
        : tab === "capas" ? <CapasList rows={capas} today={today} onOpen={(r) => router.push(`${BASE}/capas/${r.id}`)} />
        : (
          <ReviewsTab
            key={reviews.reviews.map((x) => x.id + x.updatedAt).join("|")}
            reviews={reviews.reviews} today={today} currentPeriod={reviews.currentPeriod} currentCounts={reviews.currentCounts} reviewerName={reviewerName}
            initialPeriod={reviewPeriod || undefined} events={reviewEvents} busy={busy} error={reviewFailure.error} problems={reviewFailure.problems}
            onSelect={(period) => { setReviewPeriod(period); setReviewFailure({}); }}
            onCreate={(d) => void saveReview("/api/quality/reviews", "POST", { ...d, taskId })}
            onUpdate={(review, d) => void saveReview(`/api/quality/reviews/${review.id}`, "PATCH", { ...d, expectedUpdatedAt: review.updatedAt })}
          />
        )}
    </div>
  );
}
