"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { FolderOpen, Plus, Search, Tag, Calendar, User, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

const RECORD_TYPES = [
  "Temperature Log",
  "Sanitation Report",
  "Incident Report",
  "Supplier Audit",
  "HACCP Record",
  "Training Record",
  "Equipment Maintenance",
  "Corrective Action",
  "Other",
];

interface RecordItem {
  id: string;
  title: string;
  type: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  createdBy: { name: string };
}

export default function RecordsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const role = (session?.user as { role?: string })?.role ?? "";
  const isAdmin = role === "ADMIN";

  const [records, setRecords]           = useState<RecordItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<RecordItem | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [toast, setToast]               = useState<string | null>(null);

  const typeParam = searchParams.get("type") ?? "";
  const qParam    = searchParams.get("q") ?? "";

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeParam) params.set("type", typeParam);
    if (qParam)    params.set("q",    qParam);
    try {
      const res = await fetch(`/api/records?${params}`);
      if (res.ok) setRecords(await res.json());
    } finally {
      setLoading(false);
    }
  }, [typeParam, qParam]);

  useEffect(() => {
    if (status !== "loading") fetchRecords();
  }, [status, fetchRecords]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/records/${deleteTarget.id}`, { method: "DELETE" });
      if (r.ok) {
        setRecords((prev) => prev.filter((rec) => rec.id !== deleteTarget.id));
        setDeleteTarget(null);
        setToast("Record archived successfully.");
        setTimeout(() => setToast(null), 3500);
      } else {
        alert("Failed to archive record.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setDeleting(false); }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-md">
            <div className="flex items-start gap-3 px-6 pt-6 pb-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#D64D4D]" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Archive Record</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">The record will be hidden from all views.</p>
              </div>
            </div>
            <div className="px-6 pb-4">
              <p className="text-sm text-gray-700 mb-3">You are about to archive this record:</p>
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-1.5 text-sm font-mono">
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">Title</span><span className="text-gray-800 font-semibold">{deleteTarget.title}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">Type</span><span className="text-gray-800">{deleteTarget.type}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">By</span><span className="text-gray-800">{deleteTarget.createdBy.name}</span></div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D64D4D] hover:bg-[#c44] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {deleting ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Archiving…</> : <><Trash2 className="w-3.5 h-3.5" />Archive Record</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-mono px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />{toast}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Records</h1>
          <p className="page-subtitle">Food safety audit trail and documentation</p>
        </div>
        <Link href="/records/new" className="btn-primary">
          <Plus className="w-4 h-4" /> New Record
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <form
          method="GET"
          className="flex gap-2 flex-1 min-w-48"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const params = new URLSearchParams();
            const q = (fd.get("q") as string) ?? "";
            const type = (fd.get("type") as string) ?? "";
            if (q)    params.set("q",    q);
            if (type) params.set("type", type);
            router.push(`/records?${params}`);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input name="q" defaultValue={qParam} placeholder="Search records…" className="input pl-9" />
          </div>
          <select name="type" defaultValue={typeParam} className="input w-52">
            <option value="">All types</option>
            {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="submit" className="btn-secondary">Filter</button>
          {(qParam || typeParam) && (
            <Link href="/records" className="btn-secondary">Clear</Link>
          )}
        </form>
      </div>

      {loading ? (
        <div className="card p-12 flex items-center justify-center gap-2 text-gray-400 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
          Loading records…
        </div>
      ) : records.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <FolderOpen className="w-10 h-10 mb-3" />
          <p className="font-medium text-gray-600">No records found</p>
          <Link href="/records/new" className="btn-primary mt-4">
            <Plus className="w-4 h-4" /> Add Record
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {records.map((record) => (
            <div key={record.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group">
              {/* Clickable content area */}
              <Link href={`/records/${record.id}`} className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <FolderOpen className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900 truncate">{record.title}</p>
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                      {record.type}
                    </span>
                  </div>
                  {record.description && (
                    <p className="text-sm text-gray-500 truncate">{record.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {record.createdBy.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {formatDate(record.createdAt)}
                    </span>
                    {record.tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {record.tags.slice(0, 3).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </Link>

              {/* Admin-only trash icon */}
              {isAdmin && (
                <button
                  onClick={() => setDeleteTarget(record)}
                  title="Archive record"
                  className="shrink-0 p-1.5 text-gray-300 hover:text-[#D64D4D] transition-colors rounded hover:bg-red-50 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
