"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Building2, Download, Trash2, X } from "lucide-react";
import { FacilitiesChecklistForm624 } from "@/components/forms624/FacilitiesChecklistForm624";
import { FacilitiesRecordsTable624, type FacilitiesListRow } from "@/components/forms624/FacilitiesRecordsTable624";
import { CurrentFacilitiesNotice624, OpenCurrentFacilitiesButton624 } from "@/components/forms624/FacilitiesSubmittedNotice624";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import { buildFacilitiesPdfHtml624, type FacilitiesPdfRecord } from "@/components/forms624/pdfBuilders624";
import { getPacificToday } from "@/lib/pacific-time";
import { periodDates, periodLabel, progressOf, splitStored, viewOfSnapshot } from "@/lib/facilities-checklist-624";

type FullRecord = FacilitiesPdfRecord & { id: string };
const FORM = "/dashboard/supervisor/facilities-checklist-624";

export default function FacilitiesChecklist624RecordsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN";
  /** ?view=<record id>: the form route sends people here to see the record that closed a week. */
  const viewId = useSearchParams()?.get("view") ?? null;

  const [rows, setRows] = useState<FacilitiesListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<FullRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FacilitiesListRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/facilities-checklist-624")
      .then((r) => r.json())
      .then((data: FacilitiesListRow[] | { error?: string }) => {
        if (!Array.isArray(data)) setError(data.error ?? "Could not load records.");
        else setRows(data);
      })
      .catch(() => setError("Could not load records."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (session?.user) load(); }, [session?.user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRecord(id: string): Promise<FullRecord | null> {
    const res = await fetch(`/api/facilities-checklist-624/${id}`);
    if (!res.ok) { setError("Could not load that record."); return null; }
    return ((await res.json()) as { record: FullRecord }).record;
  }
  useEffect(() => {
    if (!session?.user || !viewId) return;
    void fetchRecord(viewId).then((r) => { if (r) setOpen(r); });
  }, [session?.user?.id, viewId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function view(row: FacilitiesListRow) {
    // A draft is continued in the form, for its own week
    if (row.status === "draft") { router.push(`${FORM}?period=${row.period}`); return; }
    setOpen(await fetchRecord(row.id));
  }
  async function pdf(row: FacilitiesListRow) {
    const record = await fetchRecord(row.id);
    if (record) await exportFormPdf(buildFacilitiesPdfHtml624(record), `facilities-checklist-624-${record.period}.pdf`);
  }
  async function remove(row: FacilitiesListRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/facilities-checklist-624/${row.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) setError(data.error ?? "Delete failed.");
      else { if (data.warning) setError(data.warning); window.dispatchEvent(new CustomEvent("task-action")); load(); }
    } finally { setBusy(false); setConfirmDelete(null); }
  }

  const stored = open ? splitStored(open.items) : null;
  const snapshotView = stored ? viewOfSnapshot(stored.snapshots) : null;
  const today = getPacificToday();

  return (
    <div className="max-w-5xl space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0"><Building2 className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="page-title leading-tight">Facilities Checklist — 624 · Records</h1>
            <p className="page-subtitle">Each record is the log entry for its week</p>
          </div>
        </div>
        {/* No button once the current week is submitted (the notice below says why) */}
        {!loading && <OpenCurrentFacilitiesButton624 rows={rows} today={today} onOpen={() => router.push(FORM)} />}
      </div>

      {!loading && <CurrentFacilitiesNotice624 rows={rows} today={today} onView={(row) => void view(row)} />}

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
      {loading ? <div className="card p-6 text-center text-sm text-gray-500">Loading…</div>
        : <FacilitiesRecordsTable624 rows={rows} isAdmin={isAdmin} onView={view} onPdf={pdf} onDelete={(r) => setConfirmDelete(r)} />}

      {open && snapshotView && (
        <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto p-4" onClick={() => setOpen(null)}>
          <div className="bg-gray-50 rounded-xl shadow-xl max-w-3xl mx-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-gray-900">{periodLabel(open.period)}</p>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1" onClick={() => void exportFormPdf(buildFacilitiesPdfHtml624(open), `facilities-checklist-624-${open.period}.pdf`)}>
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <FacilitiesChecklistForm624
              readOnly periodLabel={periodLabel(open.period)}
              date={stored?.header?.date ?? "—"} time={stored?.header?.time ?? "—"} initials={open.initials}
              items={snapshotView.items} values={snapshotView.values} progress={progressOf(snapshotView.items, snapshotView.values)}
            />
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-600" /> Delete this record?</p>
            <p className="text-sm text-gray-600">The {periodDates(confirmDelete.period)} checklist will be deleted and its task reopened. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" disabled={busy} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50" onClick={() => void remove(confirmDelete)}>
                {busy ? "Deleting…" : "Delete record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
