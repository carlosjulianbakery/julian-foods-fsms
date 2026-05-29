"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
  FileText,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ClipboardCheck,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SectionStatus = "PASS" | "FAIL" | "PASS_WITH_ISSUES";
type AtpResult     = "pass" | "warning" | "fail";

const SECTION_NAMES = [
  "Personnel & Hygiene",
  "Facility & Grounds",
  "Equipment & Utensils",
  "Sanitation Supplies",
  "Temperature & Storage",
] as const;

type SectionName = (typeof SECTION_NAMES)[number];

interface AtpAttempt {
  attempt_number: number;
  area_swabbed:   string;
  rlu_result:     number;
  result:         AtpResult;
  initials:       string;
  time_recorded:  string;
}

interface PreOpLogRow {
  id:              string;
  date:            string;
  supervisor_name: string;
  overall_status:  "PASS" | "FAIL" | "PASS_WITH_ISSUES";
  shift:           "AM" | "PM";
  section_statuses: Record<string, SectionStatus>;
  atp_area:        string | null;
  atp_rlu:         number | null;
  atp_result:      AtpResult | null;
  atp_attempts:    AtpAttempt[];
  submitted_at:    string;
}

type SortKey = "date" | "supervisor_name" | "overall_status" | "atp_result";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function OverallBadge({ status }: { status: "PASS" | "FAIL" | "PASS_WITH_ISSUES" }) {
  const cfg = {
    PASS:             { label: "✓ PASS",   cls: "bg-emerald-100 text-emerald-800" },
    FAIL:             { label: "✗ FAIL",   cls: "bg-red-100 text-red-700" },
    PASS_WITH_ISSUES: { label: "⚠ ISSUES", cls: "bg-amber-100 text-amber-700" },
  }[status];
  return <span className={cn("badge text-[10px] font-mono font-bold", cfg.cls)}>{cfg.label}</span>;
}

function SectionBadge({ status }: { status: SectionStatus }) {
  const cfg = {
    PASS:             { icon: CheckCircle2,  cls: "text-emerald-600" },
    FAIL:             { icon: XCircle,       cls: "text-[#D64D4D]"   },
    PASS_WITH_ISSUES: { icon: AlertTriangle, cls: "text-amber-500"   },
  }[status];
  const Icon = cfg.icon;
  return <Icon className={cn("w-4 h-4", cfg.cls)} />;
}

function AtpBadge({ result }: { result: AtpResult | null }) {
  if (!result) return <span className="text-gray-400 text-xs font-mono">—</span>;
  const cfg = {
    pass:    "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-700",
    fail:    "bg-red-100 text-red-700",
  }[result];
  const label = { pass: "PASS", warning: "WARNING", fail: "FAIL" }[result];
  return <span className={cn("badge text-[10px] font-mono font-bold", cfg)}>{label}</span>;
}

// ─── Sort header ───────────────────────────────────────────────────────────────

function SortTh({
  col, sortKey, sortDir, onSort, children,
}: {
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sortKey === col;
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-gray-800 transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {children}
        <Icon className={cn("w-3 h-3", active ? "text-[#D64D4D]" : "text-gray-300")} />
      </span>
    </th>
  );
}

// ─── Row detail modal ──────────────────────────────────────────────────────────

function RowModal({ row, onClose }: { row: PreOpLogRow; onClose: () => void }) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900 font-garamond">
              {fmt(row.date)} — {row.shift} Shift
            </h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {row.supervisor_name} · {new Date(row.submitted_at).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <OverallBadge status={row.overall_status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Section statuses */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 font-mono uppercase tracking-wider mb-2">
              Section Results
            </h3>
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
              {SECTION_NAMES.map((name) => {
                const s = (row.section_statuses[name] ?? "PASS") as SectionStatus;
                return (
                  <div key={name} className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm text-gray-700">{name}</span>
                    <SectionBadge status={s} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ATP Swab detail */}
          {row.atp_attempts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 font-mono uppercase tracking-wider mb-2">
                ATP Swab Test
              </h3>
              <div className="border border-gray-100 rounded-md overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-500">
                    {row.atp_attempts.length} attempt{row.atp_attempts.length !== 1 ? "s" : ""}
                  </span>
                  <AtpBadge result={row.atp_result} />
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/60 text-gray-400 font-mono uppercase text-[10px]">
                      <th className="text-left px-4 py-2">Area Swabbed</th>
                      <th className="text-center px-3 py-2">RLU</th>
                      <th className="text-center px-3 py-2">Result</th>
                      <th className="text-center px-3 py-2">Initials</th>
                      <th className="text-right px-4 py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {row.atp_attempts.map((a, i) => (
                      <tr
                        key={i}
                        className={cn(
                          a.result === "fail"    ? "bg-red-50/30 text-red-700" :
                          a.result === "warning" ? "bg-amber-50/30" :
                          "bg-emerald-50/30"
                        )}
                      >
                        <td className="px-4 py-2 text-gray-700">{a.area_swabbed}</td>
                        <td className="px-3 py-2 text-center font-mono text-gray-700">{a.rlu_result}</td>
                        <td className="px-3 py-2 text-center">
                          <AtpBadge result={a.result} />
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-gray-600">{a.initials}</td>
                        <td className="px-4 py-2 text-right font-mono text-gray-500">{a.time_recorded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {row.atp_attempts.length === 0 && (
            <p className="text-xs text-gray-400 font-mono">No ATP Swab data (legacy record).</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Pre-Op Log Page ───────────────────────────────────────────────────────────

export default function PreOpLogPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";

  const [allRows,      setAllRows]      = useState<PreOpLogRow[]>([]);
  const [supervisors,  setSupervisors]  = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [selected,     setSelected]     = useState<PreOpLogRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PreOpLogRow | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);

  // Filters
  const [fDateFrom,    setFDateFrom]    = useState("");
  const [fDateTo,      setFDateTo]      = useState("");
  const [fSupervisor,  setFSupervisor]  = useState("");
  const [fStatus,      setFStatus]      = useState("");
  const [fAtp,         setFAtp]         = useState("");

  // Sort & pagination
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page,    setPage]    = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (fDateFrom)   params.set("date_from",  fDateFrom);
    if (fDateTo)     params.set("date_to",    fDateTo);
    if (fSupervisor) params.set("supervisor", fSupervisor);
    if (fStatus)     params.set("status",     fStatus);
    if (fAtp)        params.set("atp_result", fAtp);
    try {
      const res  = await fetch(`/api/logs/pre-op?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllRows(data.rows ?? []);
      setSupervisors(data.supervisor_list ?? []);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [fDateFrom, fDateTo, fSupervisor, fStatus, fAtp]);

  useEffect(() => {
    if (status !== "loading" && (role === "SUPERVISOR" || role === "ADMIN")) {
      fetchData();
    }
  }, [status, role, fetchData]);

  const sorted = useMemo(() => {
    return [...allRows].sort((a, b) => {
      let av: string, bv: string;
      switch (sortKey) {
        case "date":            av = a.date;            bv = b.date;            break;
        case "supervisor_name": av = a.supervisor_name; bv = b.supervisor_name; break;
        case "overall_status":  av = a.overall_status;  bv = b.overall_status;  break;
        case "atp_result":      av = a.atp_result ?? ""; bv = b.atp_result ?? ""; break;
      }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [allRows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows   = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
    setPage(1);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/pre-op/${deleteTarget.id}`, { method: "DELETE" });
      if (r.ok) {
        setAllRows((prev) => prev.filter((row) => row.id !== deleteTarget.id));
        setDeleteTarget(null);
        setToast("Record deleted successfully.");
        setTimeout(() => setToast(null), 3500);
      } else {
        const err = await r.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete record.");
      }
    } catch { alert("An unexpected error occurred."); }
    finally { setDeleting(false); }
  }

  function clearFilters() {
    setFDateFrom(""); setFDateTo(""); setFSupervisor(""); setFStatus(""); setFAtp("");
  }

  // ── Export helpers ───────────────────────────────────────────────────────────

  function exportCSV() {
    const header = [
      "Date", "Supervisor", "Shift",
      ...SECTION_NAMES,
      "ATP Area Swabbed", "ATP RLU", "ATP Result", "Overall Status",
    ].join(",");

    const csvRows = sorted.map((r) => [
      r.date,
      `"${r.supervisor_name}"`,
      r.shift,
      ...SECTION_NAMES.map((n) => r.section_statuses[n] ?? ""),
      r.atp_area ? `"${r.atp_area}"` : "",
      r.atp_rlu ?? "",
      r.atp_result ?? "",
      r.overall_status,
    ].join(","));

    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `pre-op-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const now = new Date().toLocaleString("en-US");
    const sectionHeaders = SECTION_NAMES.map((n) => `<th style="padding:4px 6px;font-size:9px;color:#6B7280;text-align:center;font-family:monospace;white-space:nowrap">${n.replace(" & ", " &amp; ")}</th>`).join("");

    const tableRows = sorted.map((r) => {
      const sectionCells = SECTION_NAMES.map((n) => {
        const s = r.section_statuses[n] ?? "PASS";
        const c = s === "PASS" ? "#059669" : s === "FAIL" ? "#D64D4D" : "#D97706";
        const l = s === "PASS" ? "✓" : s === "FAIL" ? "✗" : "⚠";
        return `<td style="padding:4px 6px;text-align:center;font-weight:bold;color:${c};font-size:10px">${l}</td>`;
      }).join("");

      const atpColor = r.atp_result === "pass" ? "#059669" : r.atp_result === "warning" ? "#D97706" : r.atp_result === "fail" ? "#D64D4D" : "#9CA3AF";
      const atpLabel = r.atp_result ? r.atp_result.toUpperCase() : "—";
      const statusColor = r.overall_status === "PASS" ? "#059669" : r.overall_status === "FAIL" ? "#D64D4D" : "#D97706";
      const statusLabel = { PASS: "PASS", FAIL: "FAIL", PASS_WITH_ISSUES: "ISSUES" }[r.overall_status];

      return `<tr style="border-bottom:1px solid #F3F4F6">
        <td style="padding:4px 6px;font-size:10px;color:#374151;font-family:monospace;white-space:nowrap">${r.date}</td>
        <td style="padding:4px 6px;font-size:10px;color:#374151">${r.supervisor_name}</td>
        <td style="padding:4px 6px;font-size:10px;color:#6B7280;text-align:center">${r.shift}</td>
        ${sectionCells}
        <td style="padding:4px 6px;font-size:10px;color:#374151">${r.atp_area ?? "—"}</td>
        <td style="padding:4px 6px;font-size:10px;color:#374151;text-align:center">${r.atp_rlu ?? "—"}</td>
        <td style="padding:4px 6px;font-size:10px;font-weight:600;color:${atpColor};text-align:center">${atpLabel}</td>
        <td style="padding:4px 6px;font-size:10px;font-weight:700;color:${statusColor};text-align:center">${statusLabel}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Julian Bakery — Pre-Op Inspection Log</title>
<style>body{font-family:Georgia,serif;margin:24px;color:#111827}@media print{body{margin:12px}}</style>
</head><body>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;border-bottom:2px solid #D64D4D;padding-bottom:12px">
    <div style="width:36px;height:36px;background:#D64D4D;border-radius:8px;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    </div>
    <div>
      <div style="font-size:16px;font-weight:bold">Julian Bakery</div>
      <div style="font-size:10px;color:#6B7280;font-family:monospace">Pre-Op Inspection Log</div>
    </div>
    <div style="margin-left:auto;font-family:monospace;font-size:10px;color:#6B7280;text-align:right">
      Generated: ${now}<br/>Total: ${sorted.length} record${sorted.length !== 1 ? "s" : ""}
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:10px">
    <thead>
      <tr style="background:#F9FAFB;border-bottom:2px solid #E5E7EB">
        <th style="padding:4px 6px;font-size:9px;color:#6B7280;text-align:left;font-family:monospace">DATE</th>
        <th style="padding:4px 6px;font-size:9px;color:#6B7280;text-align:left;font-family:monospace">SUPERVISOR</th>
        <th style="padding:4px 6px;font-size:9px;color:#6B7280;text-align:center;font-family:monospace">SHIFT</th>
        ${sectionHeaders}
        <th style="padding:4px 6px;font-size:9px;color:#6B7280;text-align:left;font-family:monospace">ATP AREA</th>
        <th style="padding:4px 6px;font-size:9px;color:#6B7280;text-align:center;font-family:monospace">RLU</th>
        <th style="padding:4px 6px;font-size:9px;color:#6B7280;text-align:center;font-family:monospace">ATP</th>
        <th style="padding:4px 6px;font-size:9px;color:#6B7280;text-align:center;font-family:monospace">OVERALL</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div style="margin-top:24px;padding-top:8px;border-top:1px solid #E5E7EB;font-size:9px;color:#9CA3AF;font-family:monospace;text-align:center">
    All records auto-generated from submitted Pre-Op Inspection forms. · Julian Bakery Food Safety Management System
  </div>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // ── Role guard ────────────────────────────────────────────────────────────────

  if (status === "loading") return null;
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return (
      <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm">
        <AlertCircle className="w-4 h-4" /> Access restricted.
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const hasFilters = !!(fDateFrom || fDateTo || fSupervisor || fStatus || fAtp);

  return (
    <>
      {selected && <RowModal row={selected} onClose={() => setSelected(null)} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-md border border-gray-200 shadow-xl w-full max-w-md">
            <div className="flex items-start gap-3 px-6 pt-6 pb-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#D64D4D]" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Delete Pre-Op Inspection Record</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="px-6 pb-4">
              <p className="text-sm text-gray-700 mb-3">You are about to permanently delete this record:</p>
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-1.5 text-sm font-mono">
                <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Date</span><span className="text-gray-800 font-semibold">{deleteTarget.date}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Supervisor</span><span className="text-gray-800">{deleteTarget.supervisor_name}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Shift</span><span className="text-gray-800">{deleteTarget.shift}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-24 shrink-0">Status</span><span className="text-gray-800">{deleteTarget.overall_status}</span></div>
              </div>
              <p className="text-xs text-gray-500 mt-3">This will remove the record from all logs. Are you sure?</p>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D64D4D] hover:bg-[#c44] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {deleting ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</> : <><Trash2 className="w-3.5 h-3.5" />Delete Record</>}
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

      <div className="space-y-5">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-[#D64D4D]" />
              Pre-Op Inspection Log
            </h1>
            <p className="page-subtitle">Auto-generated from submitted inspection forms</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              disabled={sorted.length === 0}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              onClick={exportPDF}
              disabled={sorted.length === 0}
              className="btn-primary text-sm disabled:opacity-40"
            >
              <FileText className="w-4 h-4" /> Export PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="label text-xs">Date From</label>
              <DateInput className="input text-sm" value={fDateFrom} onChange={setFDateFrom} />
            </div>
            <div>
              <label className="label text-xs">Date To</label>
              <DateInput className="input text-sm" value={fDateTo} onChange={setFDateTo} />
            </div>
            <div>
              <label className="label text-xs">Supervisor</label>
              <select className="input text-sm" value={fSupervisor} onChange={(e) => setFSupervisor(e.target.value)}>
                <option value="">All supervisors</option>
                {supervisors.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Overall Status</label>
              <select className="input text-sm" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="PASS">Pass</option>
                <option value="PASS_WITH_ISSUES">Pass with Issues</option>
                <option value="FAIL">Fail</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">ATP Result</label>
              <select className="input text-sm" value={fAtp} onChange={(e) => setFAtp(e.target.value)}>
                <option value="">All</option>
                <option value="pass">Pass</option>
                <option value="warning">Warning</option>
                <option value="fail">Fail</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-400 font-mono">
              {sorted.length} record{sorted.length !== 1 ? "s" : ""} found
            </p>
            <div className="flex gap-2">
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs font-mono text-gray-500 hover:text-gray-800 transition-colors">
                  Clear filters
                </button>
              )}
              <button onClick={fetchData} className="btn-primary text-xs px-3 py-1.5">
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 font-mono text-sm py-8 justify-center">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#D64D4D] rounded-full animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-[#D64D4D] font-mono text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="card p-12 text-center">
            <ClipboardCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            {hasFilters ? (
              <p className="text-sm text-gray-500 font-mono">No Pre-Op records found for the selected filters.</p>
            ) : (
              <>
                <p className="text-sm text-gray-500 font-mono">No completed Pre-Op inspections found.</p>
                <p className="text-xs text-gray-400 font-mono mt-1">This log will populate automatically as forms are submitted.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <SortTh col="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Date</SortTh>
                    <SortTh col="supervisor_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Supervisor</SortTh>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">Shift</th>
                    {SECTION_NAMES.map((n) => (
                      <th key={n} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap" title={n}>
                        {n.split(" & ")[0].substring(0, 8)}
                      </th>
                    ))}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">ATP Area</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider">RLU</th>
                    <SortTh col="atp_result" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ATP</SortTh>
                    <SortTh col="overall_status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Overall</SortTh>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.map((row, i) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className={cn(
                        "cursor-pointer hover:bg-amber-50/30 transition-colors",
                        i % 2 === 1 ? "bg-amber-50/10" : ""
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-3 text-gray-700">{row.supervisor_name}</td>
                      <td className="px-4 py-3">
                        <span className="badge bg-gray-100 text-gray-600 text-[10px]">{row.shift}</span>
                      </td>
                      {SECTION_NAMES.map((n) => (
                        <td key={n} className="px-3 py-3 text-center">
                          <SectionBadge status={(row.section_statuses[n] ?? "PASS") as SectionStatus} />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[120px] truncate" title={row.atp_area ?? ""}>
                        {row.atp_area ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-gray-600 text-xs">
                        {row.atp_rlu != null ? row.atp_rlu : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <AtpBadge result={row.atp_result} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <OverallBadge status={row.overall_status} />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {role === "ADMIN" && (
                          <button onClick={() => setDeleteTarget(row)} title="Delete record" className="p-1.5 text-gray-300 hover:text-[#D64D4D] transition-colors rounded hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs font-mono text-gray-500">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} records
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                      if (i > 0 && (arr[i - 1] as number) + 1 < p) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…" ? (
                        <span key={`e${i}`} className="px-2 py-1 text-gray-300">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p as number)}
                          className={cn(
                            "px-2.5 py-1 rounded border transition-colors",
                            page === p
                              ? "bg-[#D64D4D] text-white border-[#D64D4D]"
                              : "border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
