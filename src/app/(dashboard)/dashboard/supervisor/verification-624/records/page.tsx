"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertCircle, Download, Gauge, Trash2, X } from "lucide-react";
import { Verification624Form } from "@/components/forms624/Verification624Form";
import { VerificationRecordsTable624, type VerificationListRow } from "@/components/forms624/VerificationRecordsTable624";
import { exportFormPdf } from "@/components/forms624/pdfExport624";
import { buildVerificationPdfHtml624, type VerificationPdfRecord } from "@/components/forms624/pdfBuilders624";
import { instructionsVerOf, periodLabel, progressOf, splitStored, viewOfSnapshot } from "@/lib/verification-624";

type FullRecord = VerificationPdfRecord & { id: string };

export default function Verification624RecordsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN";

  const [rows, setRows] = useState<VerificationListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<FullRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VerificationListRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/verification-624")
      .then((r) => r.json())
      .then((data: VerificationListRow[] | { error?: string }) => {
        if (!Array.isArray(data)) setError(data.error ?? "Could not load records.");
        else setRows(data);
      })
      .catch(() => setError("Could not load records."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (session?.user) load(); }, [session?.user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRecord(id: string): Promise<FullRecord | null> {
    const res = await fetch(`/api/verification-624/${id}`);
    if (!res.ok) { setError("Could not load that record."); return null; }
    return ((await res.json()) as { record: FullRecord }).record;
  }
  async function view(row: VerificationListRow) {
    if (row.status === "draft") { router.push("/dashboard/supervisor/verification-624"); return; }
    setOpen(await fetchRecord(row.id));
  }
  async function pdf(row: VerificationListRow) {
    const record = await fetchRecord(row.id);
    if (record) await exportFormPdf(buildVerificationPdfHtml624(record), `verification-624-${record.period}.pdf`);
  }
  async function remove(row: VerificationListRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/verification-624/${row.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) setError(data.error ?? "Delete failed.");
      else { if (data.warning) setError(data.warning); window.dispatchEvent(new CustomEvent("task-action")); load(); }
    } finally { setBusy(false); setConfirmDelete(null); }
  }

  const stored = open ? splitStored(open.items) : null;
  const snapshotView = stored ? viewOfSnapshot(stored.snapshots) : null;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-md flex items-center justify-center shrink-0"><Gauge className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="page-title leading-tight">Scales &amp; Thermometer Verification — 624 · Records</h1>
            <p className="page-subtitle">Each record is the log entry for its period</p>
          </div>
        </div>
        <button type="button" onClick={() => router.push("/dashboard/supervisor/verification-624")} className="btn-primary">Open current form</button>
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
      {loading ? <div className="card p-6 text-center text-sm text-gray-500">Loading…</div>
        : <VerificationRecordsTable624 rows={rows} isAdmin={isAdmin} onView={view} onPdf={pdf} onDelete={(r) => setConfirmDelete(r)} />}

      {open && snapshotView && (
        <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto p-4" onClick={() => setOpen(null)}>
          <div className="bg-gray-50 rounded-xl shadow-xl max-w-3xl mx-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-gray-900">{periodLabel(open.period)}</p>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1" onClick={() => void exportFormPdf(buildVerificationPdfHtml624(open), `verification-624-${open.period}.pdf`)}>
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <Verification624Form
              readOnly periodLabel={periodLabel(open.period)} instructionsVer={stored ? instructionsVerOf(stored) : undefined}
              date={stored?.header?.date ?? "—"} time={stored?.header?.time ?? "—"} initials={open.initials}
              equipment={snapshotView.equipment} values={snapshotView.values} progress={progressOf(snapshotView.equipment, snapshotView.values)}
            />
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-600" /> Delete this record?</p>
            <p className="text-sm text-gray-600">{periodLabel(confirmDelete.period)} will be deleted and its task reopened. This cannot be undone.</p>
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
