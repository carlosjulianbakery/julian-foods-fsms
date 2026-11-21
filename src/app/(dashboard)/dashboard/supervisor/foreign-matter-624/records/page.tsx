"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ScanSearch, Download, Trash2, X } from "lucide-react";
import { ForeignMatterForm624 } from "@/components/forms624/ForeignMatterForm624";
import { ForeignMatterRecordsTable624, type ForeignMatterListRow } from "@/components/forms624/ForeignMatterRecordsTable624";
import { CurrentForeignMatterNotice624, OpenCurrentForeignMatterButton624 } from "@/components/forms624/ForeignMatterSubmittedNotice624";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import { buildForeignMatterPdfHtml624, type ForeignMatterPdfRecord } from "@/components/forms624/pdfBuilders624";
import { getPacificToday } from "@/lib/pacific-time";
import { periodDates, progressOf, splitStored, viewOfSnapshot } from "@/lib/foreign-matter-624";

type FullRecord = ForeignMatterPdfRecord & { id: string };
const FORM = "/dashboard/supervisor/foreign-matter-624";

export default function ForeignMatter624RecordsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN";
  /** ?view=<record id>: the form route sends people here to see the record that closed a period. */
  const viewId = useSearchParams()?.get("view") ?? null;

  const [rows, setRows] = useState<ForeignMatterListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<FullRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ForeignMatterListRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/foreign-matter-624")
      .then((r) => r.json())
      .then((data: ForeignMatterListRow[] | { error?: string }) => {
        if (!Array.isArray(data)) setError(data.error ?? "Could not load records.");
        else setRows(data);
      })
      .catch(() => setError("Could not load records."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (session?.user) load(); }, [session?.user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRecord(id: string): Promise<FullRecord | null> {
    const res = await fetch(`/api/foreign-matter-624/${id}`);
    if (!res.ok) { setError("Could not load that record."); return null; }
    return ((await res.json()) as { record: FullRecord }).record;
  }
  useEffect(() => {
    if (!session?.user || !viewId) return;
    void fetchRecord(viewId).then((r) => { if (r) setOpen(r); });
  }, [session?.user?.id, viewId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function view(row: ForeignMatterListRow) {
    // A draft is continued in the form, for its own period
    if (row.status === "draft") { router.push(`${FORM}?period=${row.period}`); return; }
    setOpen(await fetchRecord(row.id));
  }
  async function pdf(row: ForeignMatterListRow) {
    const record = await fetchRecord(row.id);
    if (record) await exportFormPdf(buildForeignMatterPdfHtml624(record), `foreign-matter-624-${record.period}.pdf`);
  }
  async function remove(row: ForeignMatterListRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/foreign-matter-624/${row.id}`, { method: "DELETE" });
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
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0"><ScanSearch className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="page-title leading-tight">Foreign Matter Inspection — 624 · Records</h1>
            <p className="page-subtitle">Each record is the log entry for its period</p>
          </div>
        </div>
        {/* No button once the current period is submitted (the notice below says why) */}
        {!loading && <OpenCurrentForeignMatterButton624 rows={rows} today={today} onOpen={() => router.push(FORM)} />}
      </div>

      {!loading && <CurrentForeignMatterNotice624 rows={rows} today={today} onView={(row) => void view(row)} />}

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
      {loading ? <div className="card p-6 text-center text-sm text-gray-500">Loading…</div>
        : <ForeignMatterRecordsTable624 rows={rows} isAdmin={isAdmin} onView={view} onPdf={pdf} onDelete={(r) => setConfirmDelete(r)} />}

      {open && snapshotView && (
        <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto p-4" onClick={() => setOpen(null)}>
          <div className="bg-gray-50 rounded-xl shadow-xl max-w-3xl mx-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-gray-900">{periodDates(open.period)}</p>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1" onClick={() => void exportFormPdf(buildForeignMatterPdfHtml624(open), `foreign-matter-624-${open.period}.pdf`)}>
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <ForeignMatterForm624
              readOnly periodLabel={periodDates(open.period)}
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
            <p className="text-sm text-gray-600">The {periodDates(confirmDelete.period)} inspection will be deleted and its task reopened. This cannot be undone.</p>
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
